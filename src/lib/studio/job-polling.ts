export type DurableJob = {
  id: string;
  status: "queued" | "scanning" | "analyzing" | "generating" | "rendering" | "completed" | "failed";
  progress: number;
  result?: unknown;
  error_message?: string | null;
};

const JOB_STATUS_REQUEST_TIMEOUT_MS = 15_000;
const JOB_STATUS_POLL_INTERVAL_MS = 5_000;
const JOB_STATUS_MAX_POLL_INTERVAL_MS = 10_000;
const JOB_STATUS_RETRY_DELAY_MS = 5_000;
const JOB_STATUS_MAX_RETRY_DELAY_MS = 60_000;
// Website scans finish in seconds, so their status is checked more often.
export const SCAN_JOB_POLLING = { pollIntervalMs: 1_000, maxPollIntervalMs: 2_000 } as const;
const RETRYABLE_JOB_STATUS_CODES = new Set([429, 502, 503, 504]);

class DurableJobPollingError extends Error {
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

function pause(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function retryAfterMs(response: Response) {
  const value = response.headers.get("retry-after");
  if (!value) return 0;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

// Polls until the job completes or fails. There is deliberately no client-side
// deadline: workers fail jobs after their retries, undeliverable jobs are
// dead-lettered as failed, and stale generations are failed by the server, so
// every job reaches a terminal status. Pass a signal to stop polling early.
export async function waitForCompletedJob(
  jobId: string,
  onUpdate?: (job: DurableJob) => void,
  {
    pollIntervalMs = JOB_STATUS_POLL_INTERVAL_MS,
    maxPollIntervalMs = JOB_STATUS_MAX_POLL_INTERVAL_MS,
    signal,
  }: { pollIntervalMs?: number; maxPollIntervalMs?: number; signal?: AbortSignal } = {},
) {
  let firstAttempt = true;
  let retryDelayMs = JOB_STATUS_RETRY_DELAY_MS;
  let nextPollDelayMs = pollIntervalMs;
  let lastJobStatus: DurableJob["status"] | undefined;
  let lastJobProgress: number | undefined;
  let unchangedPollCount = 0;

  for (;;) {
    if (!firstAttempt) await pause(nextPollDelayMs, signal);
    firstAttempt = false;
    signal?.throwIfAborted();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), JOB_STATUS_REQUEST_TIMEOUT_MS);
    const abortRequest = () => controller.abort();
    signal?.addEventListener("abort", abortRequest, { once: true });
    let response: Response;
    let data: { job?: DurableJob; error?: string };
    try {
      response = await fetch(`/api/jobs/${jobId}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      data = (await response.json()) as { job?: DurableJob; error?: string };
    } catch {
      signal?.throwIfAborted();
      nextPollDelayMs = retryDelayMs;
      retryDelayMs = Math.min(retryDelayMs * 2, JOB_STATUS_MAX_RETRY_DELAY_MS);
      continue;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortRequest);
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
      pollIntervalMs * 2 ** unchangedPollCount,
      maxPollIntervalMs,
    );
  }
}
