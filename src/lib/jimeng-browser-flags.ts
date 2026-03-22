/** 是否启用 Playwright 提交 /mweb/v1/aigc_draft/generate（绕过 shark） */
export function isJimengBrowserGenerateEnvEnabled(): boolean {
  const v = process.env.JIMENG_BROWSER_GENERATE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** 无头模式；设为 0 / false / no 则弹出 Chromium 窗口便于调试 */
export function isJimengBrowserHeadless(): boolean {
  const v = process.env.JIMENG_BROWSER_HEADLESS?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return true;
}
