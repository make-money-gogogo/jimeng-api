import logger from '@/lib/logger.ts';
import taskStore, { AdminTaskStatus, AdminTaskType } from '@/admin/task-store.ts';
import { isAdminTrackingEnabled } from '@/admin/config.ts';

type SubmissionInput = {
  taskId: string;
  taskType: AdminTaskType;
  token: string;
  jobKind?: string;
  requestMeta?: Record<string, any> | null;
};

type SnapshotInput = {
  taskId: string;
  taskType: AdminTaskType;
  token: string;
  jobKind?: string;
  statusPayload: any;
};

function normalizeStatus(value: unknown): AdminTaskStatus {
  if (value === 'succeeded') return 'succeeded';
  if (value === 'failed') return 'failed';
  if (value === 'processing') return 'processing';
  return 'queued';
}

function extractUrls(payload: any): string[] {
  const urls = new Set<string>();
  const rawUrls = Array.isArray(payload?.urls) ? payload.urls : [];
  for (const url of rawUrls) {
    if (typeof url === 'string' && url) urls.add(url);
  }
  const dataUrls = Array.isArray(payload?.data) ? payload.data.map((item: any) => item?.url) : [];
  for (const url of dataUrls) {
    if (typeof url === 'string' && url) urls.add(url);
  }
  if (typeof payload?.url === 'string' && payload.url) {
    urls.add(payload.url);
  }
  return [...urls];
}

export function recordTaskSubmission(input: SubmissionInput) {
  if (!isAdminTrackingEnabled()) return;
  try {
    taskStore.upsertTask({
      taskId: input.taskId,
      taskType: input.taskType,
      token: input.token,
      jobKind: input.jobKind || null,
      requestMeta: input.requestMeta || null,
      status: 'queued',
      itemCount: 0,
      resultUrls: [],
      markChecked: false,
    });
  } catch (error: any) {
    logger.warn(`[admin] 记录任务提交失败: ${error?.message || error}`);
  }
}

export function recordTaskStatusSnapshot(input: SnapshotInput) {
  if (!isAdminTrackingEnabled()) return;
  try {
    const status = normalizeStatus(input.statusPayload?.status);
    const urls = extractUrls(input.statusPayload);
    const itemCount = Number.isFinite(Number(input.statusPayload?.item_count))
      ? Number(input.statusPayload.item_count)
      : urls.length;
    taskStore.upsertTask({
      taskId: input.taskId,
      taskType: input.taskType,
      token: input.token,
      jobKind: input.jobKind || null,
      status,
      upstreamStatus: Number.isFinite(Number(input.statusPayload?.upstream_status))
        ? Number(input.statusPayload.upstream_status)
        : null,
      upstreamStatusName: input.statusPayload?.upstream_status_name || null,
      failCode: input.statusPayload?.fail_code || null,
      itemCount,
      resultUrls: urls,
      markChecked: true,
    });
  } catch (error: any) {
    logger.warn(`[admin] 记录任务状态失败: ${error?.message || error}`);
  }
}
