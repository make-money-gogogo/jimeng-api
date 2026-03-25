import type { Browser, BrowserContext, Page } from "playwright-core";

import { isJimengBrowserHeadless } from "@/lib/jimeng-browser-flags.ts";
import logger from "@/lib/logger.ts";
import util from "@/lib/util.ts";

const SESSION_IDLE_MS = 10 * 60 * 1000;
const BDMS_READY_MS = 30000;
const BLOCKED_RESOURCE_TYPES = new Set(["image", "font", "stylesheet", "media"]);

type SessionEntry = {
  context: BrowserContext;
  page: Page;
  lastUsed: number;
  idleTimer?: ReturnType<typeof setTimeout>;
};

function buildJimengCookies(sessionId: string, webId: string, userId: string) {
  const sidGuard = `${sessionId}%7C${util.unixTimestamp()}%7C5184000%7CMon%2C+03-Feb-2025+08%3A17%3A09+GMT`;
  return [
    { name: "_tea_web_id", value: webId, domain: ".jianying.com", path: "/" },
    { name: "is_staff_user", value: "false", domain: ".jianying.com", path: "/" },
    { name: "uid_tt", value: userId, domain: ".jianying.com", path: "/" },
    { name: "uid_tt_ss", value: userId, domain: ".jianying.com", path: "/" },
    { name: "sid_tt", value: sessionId, domain: ".jianying.com", path: "/" },
    { name: "sessionid", value: sessionId, domain: ".jianying.com", path: "/" },
    { name: "sessionid_ss", value: sessionId, domain: ".jianying.com", path: "/" },
    { name: "sid_guard", value: sidGuard, domain: ".jianying.com", path: "/" },
  ];
}

class JimengBrowserService {
  private browser: Browser | null = null;
  private readonly sessions = new Map<string, SessionEntry>();

  private resolveSingleProcessMode(): boolean {
    const raw = process.env.JIMENG_BROWSER_SINGLE_PROCESS?.trim().toLowerCase();
    // "1/true" 曾用于开启 single-process，但在云环境 headless-shell 上崩溃概率很高；
    // 仅保留 "force" 作为显式开关，避免误配导致 Chromium 反复断连。
    if (!raw) return false;
    if (raw === "force") return true;
    if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") {
      logger.warn("[shark-browser] 检测到 JIMENG_BROWSER_SINGLE_PROCESS=1/true，已忽略（不稳定）。如确需启用请设为 force");
      return false;
    }
    return false;
  }

  /** Chromium 已崩溃/断开时，引用仍非空会导致 newContext 报 “browser has been closed” */
  private dropDeadBrowserAndSessions() {
    this.browser = null;
    for (const [, entry] of this.sessions) {
      if (entry.idleTimer) clearTimeout(entry.idleTimer);
    }
    this.sessions.clear();
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser) {
      if (this.browser.isConnected()) return this.browser;
      logger.warn("[shark-browser] Chromium 已断开，将重新启动");
      this.dropDeadBrowserAndSessions();
    }
    const { chromium } = await import("playwright-core");
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() || undefined;
    const headless = isJimengBrowserHeadless();
    logger.info(
      headless
        ? "[shark-browser] 正在启动 Chromium（无头模式，无窗口）…"
        : "[shark-browser] 正在启动 Chromium（有头模式，将弹出窗口）…"
    );
    // 默认不用 --single-process：在云环境 headless-shell 下也容易整进程崩溃并触发 disconnected
    const dockerTight = this.resolveSingleProcessMode();
    const launchArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      ...(dockerTight ? ["--no-zygote", "--single-process"] as const : []),
    ];
    this.browser = await chromium.launch({
      headless,
      executablePath: executablePath || undefined,
      args: launchArgs,
    });
    this.browser.on("disconnected", () => {
      logger.warn("[shark-browser] Chromium disconnected，已清空会话缓存");
      this.dropDeadBrowserAndSessions();
    });
    logger.info("[shark-browser] Chromium 已启动");
    return this.browser;
  }

  private scheduleIdleClose(sessionKey: string, entry: SessionEntry) {
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(() => {
      void this.closeSession(sessionKey);
    }, SESSION_IDLE_MS);
  }

  async closeSession(sessionKey: string) {
    const entry = this.sessions.get(sessionKey);
    if (!entry) return;
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    try {
      await entry.context.close();
    } catch {
      // ignore
    }
    this.sessions.delete(sessionKey);
    logger.info(`[shark-browser] 会话已关闭 (${sessionKey.substring(0, 8)}…)`);
  }

  private async createFreshContext(sessionId: string, webId: string, userId: string) {
    const browser = await this.ensureBrowser();
    let context: BrowserContext;
    try {
      context = await browser.newContext();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("closed") || msg.includes("Target page")) {
        logger.warn("[shark-browser] newContext 失败（浏览器已死），正在重建 Chromium");
        this.dropDeadBrowserAndSessions();
        const b2 = await this.ensureBrowser();
        context = await b2.newContext();
      } else {
        throw err;
      }
    }

    return context;
  }

  private async getOrCreateSession(sessionKey: string, sessionId: string, webId: string, userId: string) {
    const existing = this.sessions.get(sessionKey);
    if (existing) {
      const br = existing.context.browser();
      const alive = Boolean(br?.isConnected()) && !existing.page.isClosed();
      if (alive) {
        existing.lastUsed = Date.now();
        this.scheduleIdleClose(sessionKey, existing);
        return existing;
      }
      if (existing.idleTimer) clearTimeout(existing.idleTimer);
      this.sessions.delete(sessionKey);
      try {
        await existing.context.close();
      } catch {
        // ignore
      }
      logger.warn("[shark-browser] 缓存会话已失效，重新创建");
    }

    const context = await this.createFreshContext(sessionId, webId, userId);

    await context.addCookies(buildJimengCookies(sessionId, webId, userId));

    await context.route("**/*", route => {
      const req = route.request();
      const type = req.resourceType();
      if (BLOCKED_RESOURCE_TYPES.has(type)) return route.abort();
      return route.continue();
    });

    const page = await context.newPage();
    logger.info(`[shark-browser] 打开 jimeng.jianying.com (session ${sessionKey.substring(0, 8)}…)`);
    await page.goto("https://jimeng.jianying.com", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    try {
      await page.waitForFunction(
        () =>
          Boolean(
            (window as unknown as { bdms?: { init?: unknown } }).bdms?.init
            || (window as unknown as { byted_acrawler?: unknown }).byted_acrawler
          ),
        { timeout: BDMS_READY_MS }
      );
      logger.info("[shark-browser] bdms / 反爬脚本已就绪");
    } catch {
      logger.warn("[shark-browser] 等待 bdms 超时，仍尝试发起 fetch");
    }

    const entry: SessionEntry = {
      context,
      page,
      lastUsed: Date.now(),
    };
    this.scheduleIdleClose(sessionKey, entry);
    this.sessions.set(sessionKey, entry);
    logger.info(`[shark-browser] 浏览器会话已创建 (${sessionKey.substring(0, 8)}…)`);
    return entry;
  }

  /**
   * 在真实页面上下文中 fetch，由站点脚本注入 msToken / a_bogus 等，绕过 shark。
   */
  async fetchJimengGenerate(opts: {
    sessionKey: string;
    sessionId: string;
    webId: string;
    userId: string;
    url: string;
    refererUrl?: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<unknown> {
    const { sessionKey, sessionId, webId, userId, url, refererUrl, headers, body } = opts;
    const evalArg = { url, headers, body: body ?? null };

    const runEvaluate = (pg: Page) =>
      pg.evaluate(
        async ({ url: u, headers: h, body: b }) => {
          const resp = await fetch(u, {
            method: "POST",
            headers: h,
            body: b,
            credentials: "include",
          });
          const text = await resp.text();
          let parsed: unknown;
          try {
            parsed = JSON.parse(text) as unknown;
          } catch {
            parsed = { _parseError: true, _httpStatus: resp.status, _textPreview: text.slice(0, 500) };
          }
          return { _ok: resp.ok, _status: resp.status, _body: parsed };
        },
        evalArg
      );

    let { page } = await this.getOrCreateSession(sessionKey, sessionId, webId, userId);
    // 在与 axios 一致的页面上下文中发起 fetch，避免首页 referer 触发权限分支（ret=3018）。
    if (refererUrl) {
      const current = page.url();
      if (!current.startsWith(refererUrl)) {
        await page.goto(refererUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
      }
    }
    logger.info(`[shark-browser] fetch POST ${url.substring(0, 96)}…`);

    let result: unknown;
    try {
      result = await runEvaluate(page);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const dead =
        /closed|Target page|Session closed|Execution context was destroyed/i.test(msg);
      if (!dead) throw err;
      logger.warn("[shark-browser] page/context 已失效，丢弃会话并重试一次 evaluate");
      await this.closeSession(sessionKey);
      if (this.browser && !this.browser.isConnected()) this.dropDeadBrowserAndSessions();
      ({ page } = await this.getOrCreateSession(sessionKey, sessionId, webId, userId));
      result = await runEvaluate(page);
    }

    const wrap = result as { _ok: boolean; _status: number; _body: unknown };
    if (!wrap._ok) {
      throw new Error(`[shark-browser] HTTP ${wrap._status}: ${JSON.stringify(wrap._body).slice(0, 400)}`);
    }
    return wrap._body;
  }

  async closeAll() {
    for (const key of [...this.sessions.keys()]) {
      await this.closeSession(key);
    }
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // ignore
      }
      this.browser = null;
      logger.info("[shark-browser] Chromium 已关闭");
    }
  }
}

export const jimengBrowserService = new JimengBrowserService();

export async function shutdownJimengBrowser() {
  await jimengBrowserService.closeAll();
}
