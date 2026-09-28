export type DurableJob = {
  id: string;
  status: "queued" | "scanning" | "analyzing" | "generating" | "rendering" | "completed" | "failed";
  progress: number;
  result?: unknown;
  error_message?: string | null;
};

export const CAMPAIGN_JOB_MAX_POLL_DURATION_MS = 60 * 60 * 1_000;
const JOB_STATUS_REQUEST_TIMEOUT_MS = 15_000;
const JOB_STATUS_POLL_INTERVAL_MS = 15_000;
const JOB_STATUS_MAX_POLL_INTERVAL_MS = 60_000;
const JOB_STATUS_RETRY_DELAY_MS = 5_000;
const JOB_STATUS_MAX_RETRY_DELAY_MS = 60_000;
const RETRYABLE_JOB_STATUS_CODES = new Set([429, 502, 503, 504]);

export class DurableJobPollingError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "DurableJobPollingError";
  }
}

export function isRetryableJobPollingError(error: unknown): error is DurableJobPollingError {
  return error instanceof DurableJobPollingError && error.retryable;
}

export function jobError(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error.length > 0 ? error : fallback;
}

function pause(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response) {
  const value = response.headers.get("retry-after");
  if (!value) return 0;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function durationLabel(durationMs: number) {
  if (durationMs < 60_000) {
    const seconds = Math.max(1, Math.ceil(durationMs / 1_000));
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  const minutes = Math.max(1, Math.ceil(durationMs / 60_000));
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export async function waitForCompletedJob(
  jobId: string,
  onUpdate?: (job: DurableJob) => void,
  maxDurationMs = 3 * 60 * 1_000,
) {
  const deadline = Date.now() + maxDurationMs;
  let firstAttempt = true;
  let retryDelayMs = JOB_STATUS_RETRY_DELAY_MS;
  let nextPollDelayMs = JOB_STATUS_POLL_INTERVAL_MS;
  let lastJobStatus: DurableJob["status"] | undefined;
  let lastJobProgress: number | undefined;
  let unchangedPollCount = 0;

  while (Date.now() < deadline) {
    if (!firstAttempt) {
      await pause(Math.min(nextPollDelayMs, Math.max(0, deadline - Date.now())));
    }
    firstAttempt = false;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(JOB_STATUS_REQUEST_TIMEOUT_MS, remainingMs),
    );
    let response: Response;
    let data: { job?: DurableJob; error?: string };
    try {
      response = await fetch(`/api/jobs/${jobId}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      data = (await response.json()) as { job?: DurableJob; error?: string };
    } catch {
      clearTimeout(timeout);
      if (Date.now() >= deadline) break;
      nextPollDelayMs = retryDelayMs;
      retryDelayMs = Math.min(retryDelayMs * 2, JOB_STATUS_MAX_RETRY_DELAY_MS);
      continue;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const message = jobError(data, "Job status could not be loaded. Your campaign may still be running.");
      if (RETRYABLE_JOB_STATUS_CODES.has(response.status)) {
        nextPollDelayMs = Math.max(retryDelayMs, retryAfterMs(response));
        retryDelayMs = Math.min(retryDelayMs * 2, JOB_STATUS_MAX_RETRY_DELAY_MS);
        continue;
      }
      throw new DurableJobPollingError(message, true);
    }

    retryDelayMs = JOB_STATUS_RETRY_DELAY_MS;
    const job = data.job;
    if (!job) {
      throw new DurableJobPollingError(
        "Job status did not include a record. Your campaign may still be running. Check again to resume safely.",
        true,
      );
    }
    onUpdate?.(job);
    if (job.status === "completed") return job.result;
    if (job.status === "failed") {
      throw new DurableJobPollingError(
        job.error_message || "The background job failed. Try again.",
        false,
      );
    }

    if (job.status === lastJobStatus && job.progress === lastJobProgress) {
      unchangedPollCount += 1;
    } else {
      unchangedPollCount = 0;
      lastJobStatus = job.status;
      lastJobProgress = job.progress;
    }
    nextPollDelayMs = Math.min(
      JOB_STATUS_POLL_INTERVAL_MS * 2 ** unchangedPollCount,
      JOB_STATUS_MAX_POLL_INTERVAL_MS,
    );
  }

  throw new DurableJobPollingError(
    `Status checks stopped after ${durationLabel(maxDurationMs)}. The job may still be running. Check its status again to resume without starting it over.`,
    true,
  );
}
