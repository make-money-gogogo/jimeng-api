import crypto from 'crypto';
import _ from 'lodash';
import { startOfDay, startOfWeek } from 'date-fns';

import Request from '@/lib/request/Request.ts';
import Response from '@/lib/response/Response.ts';
import Exception from '@/lib/exceptions/Exception.ts';
import EX from '@/lib/consts/exceptions.ts';
import HTTP_STATUS_CODES from '@/lib/http-status-codes.ts';

import { adminConfig, isAdminAuthConfigured } from '@/admin/config.ts';
import taskStore from '@/admin/task-store.ts';
import {
  createAdminSessionCookie,
  clearAdminSessionCookie,
  verifyAdminSessionFromCookieHeader,
} from '@/admin/session.ts';
import { recordTaskStatusSnapshot } from '@/admin/task-tracker.ts';
import { queryImageGenerationStatus, type ImageJobKind } from '@/api/controllers/images.ts';
import { queryVideoGenerationStatus } from '@/api/controllers/videos.ts';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function parseTimeInput(raw: unknown): number | null {
  if (_.isNumber(raw) && Number.isFinite(raw)) return raw;
  if (!_.isString(raw)) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function resolveTimeRange(query: any): { startAt: number; endAt: number; period: string } {
  const now = Date.now();
  const period = String(query.period || '').toLowerCase() || 'day';
  if (period === 'custom') {
    const customStart = parseTimeInput(query.start);
    const customEnd = parseTimeInput(query.end);
    if (customStart && customEnd) {
      return {
        startAt: Math.min(customStart, customEnd),
        endAt: Math.max(customStart, customEnd),
        period,
      };
    }
  }
  if (period === 'week') {
    return {
      startAt: startOfWeek(new Date(), { weekStartsOn: 1 }).getTime(),
      endAt: now,
      period,
    };
  }
  return {
    startAt: startOfDay(new Date()).getTime(),
    endAt: now,
    period: 'day',
  };
}

function unauthorizedResponse() {
  return new Response(
    {
      error: 'Unauthorized',
      message: '请先登录管理后台',
    },
    { statusCode: HTTP_STATUS_CODES.UNAUTHORIZED }
  );
}

function ensureAdminConfiguredOrThrow() {
  if (isAdminAuthConfigured()) return;
  throw new Exception(EX.SYSTEM_ERROR, '未配置 ADMIN_USERNAME/ADMIN_PASSWORD，Admin 页面不可用').setHTTPStatusCode(
    HTTP_STATUS_CODES.SERVICE_UNAVAILABLE
  );
}

function requireAdminSessionOrResponse(request: Request): { username: string } | Response {
  ensureAdminConfiguredOrThrow();
  const session = verifyAdminSessionFromCookieHeader(request.headers.cookie);
  if (!session) return unauthorizedResponse();
  return session;
}

function getTaskTypeLabel(task: { taskType: string; jobKind?: string | null }): string {
  if (task.taskType === 'image') {
    if (task.jobKind === 'text2img') return '文生图';
    if (task.jobKind === 'text2img_multi') return '文生多图';
    if (task.jobKind === 'img2img') return '图生图';
    return '图片任务';
  }
  if (task.taskType === 'video') {
    if (task.jobKind === 'text2video') return '文生视频';
    if (task.jobKind === 'img2video_single') return '图生视频(单图)';
    if (task.jobKind === 'img2video_first_last') return '图生视频(首尾帧)';
    if (task.jobKind === 'omni_reference') return '全能参考视频';
    return '视频任务';
  }
  return '未知类型';
}

function getTaskMetaFields(task: { requestMeta?: Record<string, any> | null }): {
  model: string;
  ratio: string;
  prompt: string;
} {
  const meta = task.requestMeta || {};
  const model = typeof meta.model === 'string' ? meta.model : '-';
  const ratio = typeof meta.ratio === 'string' ? meta.ratio : '-';
  const prompt = typeof meta.prompt === 'string' ? meta.prompt : '';
  return { model, ratio, prompt };
}

function renderAdminHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Jimeng Admin</title>
  <style>
    :root {
      --bg: #f1efe8;
      --card: #f9f7f1;
      --ink: #1f2522;
      --muted: #5c6964;
      --accent: #2a7f62;
      --accent-2: #b85e3e;
      --line: #d7d2c3;
      --ok: #218864;
      --err: #b23a2f;
      --warn: #99670a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 90% 20%, rgba(184,94,62,0.10), transparent 45%),
        radial-gradient(circle at 10% 10%, rgba(42,127,98,0.12), transparent 40%),
        var(--bg);
      font-family: "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif;
      min-height: 100vh;
    }
    .wrap {
      max-width: 1180px;
      margin: 0 auto;
      padding: 28px 18px 36px;
    }
    .top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    h1 {
      margin: 0;
      font-size: 28px;
      letter-spacing: 0.3px;
    }
    .muted { color: var(--muted); font-size: 14px; }
    .card {
      background: linear-gradient(180deg, rgba(255,255,255,0.75), rgba(255,255,255,0.4));
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 16px;
      box-shadow: 0 8px 30px rgba(31, 37, 34, 0.06);
    }
    .login {
      max-width: 420px;
      margin: 10vh auto 0;
      animation: fadeIn 0.35s ease-out;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 14px;
    }
    .stat {
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px dashed var(--line);
      background: rgba(255, 255, 255, 0.6);
    }
    .stat .k { font-size: 22px; font-weight: 700; }
    .stat .t { font-size: 12px; color: var(--muted); }
    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    input, select, button {
      border: 1px solid #bfc8c4;
      border-radius: 8px;
      background: #fff;
      color: var(--ink);
      font-size: 14px;
      padding: 8px 10px;
    }
    button {
      cursor: pointer;
      transition: transform 0.12s ease, box-shadow 0.12s ease;
    }
    button:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(42, 127, 98, 0.18);
    }
    .btn-primary {
      border-color: var(--accent);
      color: #fff;
      background: var(--accent);
    }
    .btn-ghost {
      border-color: var(--accent-2);
      color: var(--accent-2);
      background: #fff7f2;
    }
    .hidden { display: none !important; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      text-align: left;
      padding: 10px 8px;
      vertical-align: top;
    }
    th { color: var(--muted); font-weight: 600; }
    .status {
      display: inline-block;
      border-radius: 999px;
      padding: 2px 9px;
      font-size: 12px;
      line-height: 18px;
      border: 1px solid transparent;
    }
    .s-queued { background: #ece8da; border-color: #ddd4b6; color: #65571a; }
    .s-processing { background: #e6f1ee; border-color: #b9d7ce; color: #1b6c54; }
    .s-succeeded { background: #e9f6ef; border-color: #bde4cc; color: #1f7c5d; }
    .s-failed { background: #fdeceb; border-color: #f0c3bf; color: #9e3329; }
    .pager {
      margin-top: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .preview-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 10px;
      margin-top: 8px;
    }
    .preview-grid img, .preview-grid video {
      width: 100%;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: #fff;
    }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .truncate {
      max-width: 320px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .modal-mask {
      position: fixed;
      inset: 0;
      background: rgba(10, 16, 13, 0.45);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
      z-index: 99;
    }
    .modal {
      width: min(900px, 100%);
      max-height: 82vh;
      overflow: auto;
      background: #fff;
      border-radius: 12px;
      border: 1px solid var(--line);
      padding: 14px;
    }
    .kv {
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: 8px;
      margin-bottom: 8px;
    }
    .kv > div:nth-child(odd) { color: var(--muted); }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 960px) {
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .wrap { padding: 18px 10px 26px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div id="login-card" class="card login">
      <h1>Admin Login</h1>
      <p class="muted">用于服务初步鉴权与任务管理。</p>
      <form id="login-form">
        <div class="controls">
          <input id="username" placeholder="用户名" autocomplete="username" required>
          <input id="password" type="password" placeholder="密码" autocomplete="current-password" required>
          <button class="btn-primary" type="submit">登录</button>
        </div>
      </form>
      <div id="login-msg" class="muted"></div>
    </div>

    <div id="app" class="hidden">
      <div class="top">
        <div>
          <h1>Task Admin</h1>
          <div class="muted" id="who"></div>
        </div>
        <button id="logout" class="btn-ghost">退出登录</button>
      </div>

      <div class="grid">
        <div class="stat"><div class="k" id="st-total">0</div><div class="t">总任务</div></div>
        <div class="stat"><div class="k" id="st-ok">0</div><div class="t">成功</div></div>
        <div class="stat"><div class="k" id="st-fail">0</div><div class="t">失败</div></div>
        <div class="stat"><div class="k" id="st-run">0</div><div class="t">排队/处理中</div></div>
      </div>

      <div class="card">
        <div class="controls">
          <select id="period">
            <option value="day">今天</option>
            <option value="week">本周</option>
            <option value="custom">自定义</option>
          </select>
          <input id="start" type="datetime-local" class="hidden">
          <input id="end" type="datetime-local" class="hidden">
          <select id="taskType">
            <option value="">全部类型</option>
            <option value="image">图片</option>
            <option value="video">视频</option>
          </select>
          <select id="status">
            <option value="">全部状态</option>
            <option value="queued">queued</option>
            <option value="processing">processing</option>
            <option value="succeeded">succeeded</option>
            <option value="failed">failed</option>
          </select>
          <button id="reload" class="btn-primary">刷新</button>
        </div>

        <div style="overflow:auto;">
          <table>
            <thead>
              <tr>
                <th>任务ID</th>
                <th>任务类型</th>
                <th>模型</th>
                <th>比例</th>
                <th>状态</th>
                <th>结果数</th>
                <th>创建时间</th>
                <th>更新时间</th>
                <th>失败码</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="tbody"></tbody>
          </table>
        </div>

        <div class="pager">
          <div class="muted" id="pager-info">-</div>
          <div class="controls" style="margin:0;">
            <button id="prev">上一页</button>
            <button id="next">下一页</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <div><strong>任务结果预览</strong></div>
        <div id="preview-meta" class="muted" style="margin-top:4px;">请选择任务查看结果</div>
        <div id="preview" class="preview-grid"></div>
      </div>

      <div id="detail-mask" class="modal-mask">
        <div class="modal">
          <div class="top" style="margin-bottom:10px;">
            <strong>任务详情</strong>
            <button id="detail-close">关闭</button>
          </div>
          <div id="detail-basic"></div>
          <pre id="detail-json" class="mono" style="white-space:pre-wrap;background:#f7f8f7;border:1px solid var(--line);padding:10px;border-radius:8px;"></pre>
        </div>
      </div>
    </div>
  </div>

  <script>
    const state = { page: 1, pageSize: 20, total: 0 };

    function formatTs(ts) {
      if (!ts) return '-';
      const d = new Date(ts);
      return d.toLocaleString();
    }

    function statusClass(s) {
      if (s === 'succeeded') return 's-succeeded';
      if (s === 'failed') return 's-failed';
      if (s === 'processing') return 's-processing';
      return 's-queued';
    }

    function esc(value) {
      return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    }

    async function api(path, options = {}) {
      const res = await fetch(path, {
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        ...options,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || ('HTTP ' + res.status));
      return data;
    }

    function buildRangeParams() {
      const period = document.getElementById('period').value;
      const params = new URLSearchParams();
      params.set('period', period);
      if (period === 'custom') {
        const s = document.getElementById('start').value;
        const e = document.getElementById('end').value;
        if (s) params.set('start', new Date(s).toISOString());
        if (e) params.set('end', new Date(e).toISOString());
      }
      return params;
    }

    async function loadStats() {
      const params = buildRangeParams();
      const data = await api('/admin-api/stats?' + params.toString());
      document.getElementById('st-total').textContent = String(data.stats.total || 0);
      document.getElementById('st-ok').textContent = String(data.stats.succeeded || 0);
      document.getElementById('st-fail').textContent = String(data.stats.failed || 0);
      document.getElementById('st-run').textContent = String((data.stats.queued || 0) + (data.stats.processing || 0));
    }

    async function loadTasks() {
      const params = buildRangeParams();
      params.set('page', String(state.page));
      params.set('pageSize', String(state.pageSize));
      const type = document.getElementById('taskType').value;
      const status = document.getElementById('status').value;
      if (type) params.set('type', type);
      if (status) params.set('status', status);

      const data = await api('/admin-api/tasks?' + params.toString());
      state.total = data.total || 0;
      const tbody = document.getElementById('tbody');
      tbody.innerHTML = '';
      for (const item of data.items || []) {
        const tr = document.createElement('tr');
        tr.innerHTML = \`
          <td><code>\${esc(item.taskId)}</code></td>
          <td>\${esc(item.taskTypeLabel || item.taskType || '-')}</td>
          <td>\${esc(item.model || '-')}</td>
          <td>\${esc(item.ratio || '-')}</td>
          <td><span class="status \${statusClass(item.status)}">\${esc(item.status)}</span></td>
          <td>\${item.itemCount || 0}</td>
          <td>\${formatTs(item.createdAt)}</td>
          <td>\${formatTs(item.updatedAt)}</td>
          <td>\${esc(item.failCode || '-')}</td>
          <td>
            <button data-action="refresh" data-id="\${item.taskId}">刷新状态</button>
            <button data-action="detail" data-id="\${item.taskId}">查看详情</button>
            <button data-action="view" data-id="\${item.taskId}">查看结果</button>
          </td>
        \`;
        tbody.appendChild(tr);
      }
      const start = state.total === 0 ? 0 : ((state.page - 1) * state.pageSize + 1);
      const end = Math.min(state.page * state.pageSize, state.total);
      document.getElementById('pager-info').textContent = \`第 \${state.page} 页 · \${start}-\${end} / \${state.total}\`;
    }

    async function refreshAll() {
      await Promise.all([loadStats(), loadTasks()]);
    }

    async function checkLogin() {
      try {
        const me = await api('/admin-api/me');
        document.getElementById('who').textContent = '当前用户: ' + me.username;
        document.getElementById('login-card').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        await refreshAll();
      } catch {
        document.getElementById('login-card').classList.remove('hidden');
        document.getElementById('app').classList.add('hidden');
      }
    }

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      try {
        await api('/admin-api/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });
        document.getElementById('login-msg').textContent = '';
        await checkLogin();
      } catch (err) {
        document.getElementById('login-msg').textContent = err.message || '登录失败';
      }
    });

    document.getElementById('logout').addEventListener('click', async () => {
      await api('/admin-api/logout', { method: 'POST', body: '{}' });
      document.getElementById('preview').innerHTML = '';
      document.getElementById('preview-meta').textContent = '请选择任务查看结果';
      await checkLogin();
    });

    document.getElementById('reload').addEventListener('click', async () => {
      state.page = 1;
      await refreshAll();
    });
    document.getElementById('prev').addEventListener('click', async () => {
      if (state.page <= 1) return;
      state.page -= 1;
      await loadTasks();
    });
    document.getElementById('next').addEventListener('click', async () => {
      if (state.page * state.pageSize >= state.total) return;
      state.page += 1;
      await loadTasks();
    });

    document.getElementById('period').addEventListener('change', () => {
      const custom = document.getElementById('period').value === 'custom';
      document.getElementById('start').classList.toggle('hidden', !custom);
      document.getElementById('end').classList.toggle('hidden', !custom);
    });

    document.getElementById('tbody').addEventListener('click', async (e) => {
      const target = e.target;
      if (!target || !target.dataset) return;
      const id = target.dataset.id;
      if (!id) return;
      const action = target.dataset.action;
      if (action === 'refresh') {
        await api('/admin-api/tasks/' + encodeURIComponent(id) + '/refresh', { method: 'POST', body: '{}' });
        await refreshAll();
        return;
      }
      if (action === 'view') {
        const data = await api('/admin-api/tasks/' + encodeURIComponent(id));
        const preview = document.getElementById('preview');
        preview.innerHTML = '';
        document.getElementById('preview-meta').textContent =
          '任务: ' + data.task.taskId + ' · ' + (data.task.taskTypeLabel || data.task.taskType) + ' · ' + data.task.status;
        const urls = data.task.resultUrls || [];
        if (urls.length === 0) {
          preview.innerHTML = '<div class="muted">暂无结果</div>';
          return;
        }
        for (const url of urls) {
          const lower = String(url).toLowerCase();
          if (lower.includes('.mp4') || data.task.taskType === 'video') {
            const v = document.createElement('video');
            v.controls = true;
            v.src = url;
            preview.appendChild(v);
          } else {
            const img = document.createElement('img');
            img.src = url;
            img.loading = 'lazy';
            preview.appendChild(img);
          }
        }
      }
      if (action === 'detail') {
        const data = await api('/admin-api/tasks/' + encodeURIComponent(id));
        const task = data.task || {};
        const basic = document.getElementById('detail-basic');
        basic.innerHTML = \`
          <div class="kv"><div>任务ID</div><div class="mono">\${esc(task.taskId || '-')}</div></div>
          <div class="kv"><div>任务类型</div><div>\${esc(task.taskTypeLabel || task.taskType || '-')}</div></div>
          <div class="kv"><div>状态</div><div>\${esc(task.status || '-')}</div></div>
          <div class="kv"><div>模型</div><div>\${esc(task.model || '-')}</div></div>
          <div class="kv"><div>比例</div><div>\${esc(task.ratio || '-')}</div></div>
          <div class="kv"><div>提示词</div><div>\${esc(task.prompt || '-')}</div></div>
        \`;
        document.getElementById('detail-json').textContent = JSON.stringify(task.requestMeta || {}, null, 2);
        document.getElementById('detail-mask').style.display = 'flex';
      }
    });

    document.getElementById('detail-close').addEventListener('click', () => {
      document.getElementById('detail-mask').style.display = 'none';
    });
    document.getElementById('detail-mask').addEventListener('click', (e) => {
      if (e.target && e.target.id === 'detail-mask') {
        document.getElementById('detail-mask').style.display = 'none';
      }
    });

    checkLogin();
  </script>
</body>
</html>`;
}

export default {
  get: {
    '/admin': async () => new Response(renderAdminHtml(), { type: 'text/html; charset=utf-8' }),
    '/admin/': async () => new Response(renderAdminHtml(), { type: 'text/html; charset=utf-8' }),
    '/admin-api/me': async (request: Request) => {
      const auth = requireAdminSessionOrResponse(request);
      if (auth instanceof Response) return auth;
      return { ok: true, username: auth.username };
    },
    '/admin-api/stats': async (request: Request) => {
      const auth = requireAdminSessionOrResponse(request);
      if (auth instanceof Response) return auth;
      const { startAt, endAt, period } = resolveTimeRange(request.query);
      return {
        ok: true,
        period,
        startAt,
        endAt,
        stats: taskStore.getStats(startAt, endAt),
      };
    },
    '/admin-api/tasks': async (request: Request) => {
      const auth = requireAdminSessionOrResponse(request);
      if (auth instanceof Response) return auth;

      const { startAt, endAt, period } = resolveTimeRange(request.query);
      const status = String(request.query.status || '').trim();
      const type = String(request.query.type || '').trim();
      const page = Math.max(1, Number(request.query.page) || 1);
      const pageSize = Math.min(200, Math.max(1, Number(request.query.pageSize) || 20));
      const offset = (page - 1) * pageSize;

      const result = taskStore.listTasks({
        startAt,
        endAt,
        status: ['queued', 'processing', 'succeeded', 'failed'].includes(status) ? (status as any) : '',
        taskType: ['image', 'video'].includes(type) ? (type as any) : '',
        limit: pageSize,
        offset,
      });

      return {
        ok: true,
        period,
        startAt,
        endAt,
        page,
        pageSize,
        total: result.total,
        items: result.items.map((item) => ({
          ...item,
          taskTypeLabel: getTaskTypeLabel(item),
          ...getTaskMetaFields(item),
          token: undefined,
        })),
      };
    },
    '/admin-api/tasks/:id': async (request: Request) => {
      const auth = requireAdminSessionOrResponse(request);
      if (auth instanceof Response) return auth;
      const id = request.params.id;
      const task = taskStore.getTaskByTaskId(id);
      if (!task) {
        return new Response({ message: '任务不存在' }, { statusCode: HTTP_STATUS_CODES.NOT_FOUND });
      }
      return {
        ok: true,
        task: {
          ...task,
          taskTypeLabel: getTaskTypeLabel(task),
          ...getTaskMetaFields(task),
          token: undefined,
        },
      };
    },
  },
  post: {
    '/admin-api/login': async (request: Request) => {
      ensureAdminConfiguredOrThrow();
      request.validate('body.username', _.isString).validate('body.password', _.isString);
      const { username, password } = request.body;
      const userOk = safeEqual(String(username), adminConfig.username);
      const passOk = safeEqual(String(password), adminConfig.password);
      if (!(userOk && passOk)) {
        return new Response(
          { ok: false, message: '账号或密码错误' },
          { statusCode: HTTP_STATUS_CODES.UNAUTHORIZED }
        );
      }
      return new Response(
        { ok: true, username: adminConfig.username },
        {
          headers: {
            'Set-Cookie': createAdminSessionCookie(adminConfig.username),
          },
        }
      );
    },
    '/admin-api/logout': async () =>
      new Response(
        { ok: true },
        {
          headers: {
            'Set-Cookie': clearAdminSessionCookie(),
          },
        }
      ),
    '/admin-api/tasks/:id/refresh': async (request: Request) => {
      const auth = requireAdminSessionOrResponse(request);
      if (auth instanceof Response) return auth;
      const taskId = request.params.id;
      const task = taskStore.getTaskByTaskId(taskId);
      if (!task) {
        return new Response({ message: '任务不存在' }, { statusCode: HTTP_STATUS_CODES.NOT_FOUND });
      }

      if (task.taskType === 'image') {
        if (!task.jobKind) {
          return new Response(
            { message: '图片任务缺少 job_kind，无法刷新' },
            { statusCode: HTTP_STATUS_CODES.BAD_REQUEST }
          );
        }
        const statusPayload = await queryImageGenerationStatus(task.taskId, task.token, task.jobKind as ImageJobKind);
        recordTaskStatusSnapshot({
          taskId: task.taskId,
          taskType: 'image',
          token: task.token,
          jobKind: task.jobKind,
          statusPayload,
        });
      } else {
        const statusPayload = await queryVideoGenerationStatus(task.taskId, task.token);
        recordTaskStatusSnapshot({
          taskId: task.taskId,
          taskType: 'video',
          token: task.token,
          statusPayload,
        });
      }

      const updated = taskStore.getTaskByTaskId(taskId);
      return {
        ok: true,
        task: updated
          ? {
              ...updated,
              taskTypeLabel: getTaskTypeLabel(updated),
              ...getTaskMetaFields(updated),
              token: undefined,
            }
          : null,
      };
    },
  },
};
