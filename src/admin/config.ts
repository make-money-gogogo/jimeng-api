import path from 'path';

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parsePositiveInt(value: string | undefined, defaultValue: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return defaultValue;
  return Math.floor(n);
}

export const adminConfig = {
  username: (process.env.ADMIN_USERNAME || '').trim(),
  password: (process.env.ADMIN_PASSWORD || '').trim(),
  sessionSecret: (process.env.ADMIN_SESSION_SECRET || '').trim(),
  sessionTtlHours: parsePositiveInt(process.env.ADMIN_SESSION_TTL_HOURS, 12),
  cookieSecure: parseBoolean(process.env.ADMIN_COOKIE_SECURE, false),
  dbPath: (process.env.ADMIN_DB_PATH || '').trim() || path.join(path.resolve(), 'tmp', 'admin.sqlite'),
  retentionDays: parsePositiveInt(process.env.ADMIN_TASK_RETENTION_DAYS, 30),
};

export function isAdminAuthConfigured(): boolean {
  return !!(adminConfig.username && adminConfig.password);
}

export function isAdminTrackingEnabled(): boolean {
  return isAdminAuthConfigured() || parseBoolean(process.env.ADMIN_TRACK_TASKS, false);
}

