import fs from 'fs-extra';
import path from 'path';

import Database from 'better-sqlite3';

import { adminConfig } from '@/admin/config.ts';

export type AdminTaskType = 'image' | 'video';
export type AdminTaskStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

export type AdminTaskRecord = {
  taskId: string;
  taskType: AdminTaskType;
  jobKind: string | null;
  requestMeta: Record<string, any> | null;
  status: AdminTaskStatus;
  upstreamStatus: number | null;
  upstreamStatusName: string | null;
  failCode: string | null;
  itemCount: number;
  resultUrls: string[];
  token: string;
  createdAt: number;
  updatedAt: number;
  lastCheckedAt: number | null;
};

export type AdminTaskListFilters = {
  startAt: number;
  endAt: number;
  status?: AdminTaskStatus | '';
  taskType?: AdminTaskType | '';
  limit: number;
  offset: number;
};

type AdminTaskDbRow = {
  task_id: string;
  task_type: AdminTaskType;
  job_kind: string | null;
  request_meta: string | null;
  status: AdminTaskStatus;
  upstream_status: number | null;
  upstream_status_name: string | null;
  fail_code: string | null;
  item_count: number;
  result_urls: string;
  token: string;
  created_at: number;
  updated_at: number;
  last_checked_at: number | null;
};

type UpsertTaskInput = {
  taskId: string;
  taskType: AdminTaskType;
  token: string;
  jobKind?: string | null;
  requestMeta?: Record<string, any> | null;
  status?: AdminTaskStatus;
  upstreamStatus?: number | null;
  upstreamStatusName?: string | null;
  failCode?: string | null;
  itemCount?: number;
  resultUrls?: string[];
  markChecked?: boolean;
};

function parseJsonObject(value: string | null | undefined): Record<string, any> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, any>;
  } catch {
    return null;
  }
}

function parseResultUrls(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v) => typeof v === 'string');
  } catch {
    return [];
  }
}

function toRecord(row: AdminTaskDbRow): AdminTaskRecord {
  return {
    taskId: row.task_id,
    taskType: row.task_type,
    jobKind: row.job_kind,
    requestMeta: parseJsonObject(row.request_meta),
    status: row.status,
    upstreamStatus: row.upstream_status,
    upstreamStatusName: row.upstream_status_name,
    failCode: row.fail_code,
    itemCount: row.item_count,
    resultUrls: parseResultUrls(row.result_urls),
    token: row.token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastCheckedAt: row.last_checked_at,
  };
}

class AdminTaskStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    fs.ensureDirSync(path.dirname(dbPath));
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.initSchema();
    this.cleanupOldTasks(adminConfig.retentionDays);
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS admin_tasks (
        task_id TEXT PRIMARY KEY,
        task_type TEXT NOT NULL,
        job_kind TEXT,
        request_meta TEXT,
        status TEXT NOT NULL,
        upstream_status INTEGER,
        upstream_status_name TEXT,
        fail_code TEXT,
        item_count INTEGER NOT NULL DEFAULT 0,
        result_urls TEXT NOT NULL DEFAULT '[]',
        token TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_checked_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_admin_tasks_created_at ON admin_tasks(created_at);
      CREATE INDEX IF NOT EXISTS idx_admin_tasks_status_created_at ON admin_tasks(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_admin_tasks_type_created_at ON admin_tasks(task_type, created_at);
    `);
    this.ensureColumn('admin_tasks', 'request_meta', 'TEXT');
  }

  private ensureColumn(table: string, column: string, ddl: string) {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    const hasColumn = rows.some((row) => row.name === column);
    if (!hasColumn) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }

  private normalizeUrls(urls: string[] | undefined): string[] {
    if (!urls) return [];
    const uniq = new Set<string>();
    for (const url of urls) {
      if (!url || typeof url !== 'string') continue;
      uniq.add(url.trim());
    }
    return [...uniq].filter(Boolean);
  }

  upsertTask(input: UpsertTaskInput) {
    const now = Date.now();
    const status = input.status || 'queued';
    const resultUrls = this.normalizeUrls(input.resultUrls);
    const resultUrlsJson = JSON.stringify(resultUrls);
    const requestMetaJson = input.requestMeta ? JSON.stringify(input.requestMeta) : null;

    this.db
      .prepare(`
        INSERT INTO admin_tasks (
          task_id, task_type, job_kind, request_meta, status, upstream_status, upstream_status_name,
          fail_code, item_count, result_urls, token, created_at, updated_at, last_checked_at
        ) VALUES (
          @taskId, @taskType, @jobKind, @requestMeta, @status, @upstreamStatus, @upstreamStatusName,
          @failCode, @itemCount, @resultUrls, @token, @createdAt, @updatedAt, @lastCheckedAt
        )
        ON CONFLICT(task_id) DO UPDATE SET
          task_type=excluded.task_type,
          job_kind=COALESCE(excluded.job_kind, admin_tasks.job_kind),
          request_meta=COALESCE(excluded.request_meta, admin_tasks.request_meta),
          status=excluded.status,
          upstream_status=excluded.upstream_status,
          upstream_status_name=excluded.upstream_status_name,
          fail_code=excluded.fail_code,
          item_count=excluded.item_count,
          result_urls=excluded.result_urls,
          token=excluded.token,
          updated_at=excluded.updated_at,
          last_checked_at=COALESCE(excluded.last_checked_at, admin_tasks.last_checked_at)
      `)
      .run({
        taskId: input.taskId,
        taskType: input.taskType,
        jobKind: input.jobKind ?? null,
        requestMeta: requestMetaJson,
        status,
        upstreamStatus: input.upstreamStatus ?? null,
        upstreamStatusName: input.upstreamStatusName ?? null,
        failCode: input.failCode ?? null,
        itemCount: input.itemCount ?? 0,
        resultUrls: resultUrlsJson,
        token: input.token,
        createdAt: now,
        updatedAt: now,
        lastCheckedAt: input.markChecked ? now : null,
      });
  }

  getTaskByTaskId(taskId: string): AdminTaskRecord | null {
    const row = this.db.prepare('SELECT * FROM admin_tasks WHERE task_id = ?').get(taskId) as AdminTaskDbRow | undefined;
    if (!row) return null;
    return toRecord(row);
  }

  listTasks(filters: AdminTaskListFilters): { total: number; items: AdminTaskRecord[] } {
    const where: string[] = ['created_at >= ?', 'created_at <= ?'];
    const params: Array<number | string> = [filters.startAt, filters.endAt];
    if (filters.status) {
      where.push('status = ?');
      params.push(filters.status);
    }
    if (filters.taskType) {
      where.push('task_type = ?');
      params.push(filters.taskType);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS total FROM admin_tasks ${whereSql}`)
      .get(...params) as { total: number };

    const items = this.db
      .prepare(`
        SELECT *
        FROM admin_tasks
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, filters.limit, filters.offset) as AdminTaskDbRow[];

    return {
      total: totalRow?.total || 0,
      items: items.map(toRecord),
    };
  }

  getStats(startAt: number, endAt: number): {
    total: number;
    queued: number;
    processing: number;
    succeeded: number;
    failed: number;
  } {
    const rows = this.db
      .prepare(`
        SELECT status, COUNT(*) AS count
        FROM admin_tasks
        WHERE created_at >= ? AND created_at <= ?
        GROUP BY status
      `)
      .all(startAt, endAt) as Array<{ status: AdminTaskStatus; count: number }>;

    const result = {
      total: 0,
      queued: 0,
      processing: 0,
      succeeded: 0,
      failed: 0,
    };

    for (const row of rows) {
      result.total += row.count;
      if (row.status === 'queued') result.queued = row.count;
      if (row.status === 'processing') result.processing = row.count;
      if (row.status === 'succeeded') result.succeeded = row.count;
      if (row.status === 'failed') result.failed = row.count;
    }

    return result;
  }

  cleanupOldTasks(retentionDays: number) {
    if (!retentionDays || retentionDays <= 0) return;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    this.db.prepare('DELETE FROM admin_tasks WHERE created_at < ?').run(cutoff);
  }
}

export default new AdminTaskStore(adminConfig.dbPath);
