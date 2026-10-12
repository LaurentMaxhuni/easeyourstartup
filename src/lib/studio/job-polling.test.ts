import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForCompletedJob } from "./job-polling";

describe("waitForCompletedJob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("waits for Retry-After before retrying a transient gateway response", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "We couldn't verify your session." }), {
        status: 503,
        headers: { "Retry-After": "7" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { id: "job-1", status: "completed", progress: 100, result: { ok: true } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = waitForCompletedJob("job-1", undefined, 60_000);
    await vi.advanceTimersByTimeAsync(7_000);

    await expect(result).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("backs off unchanged jobs and checks sooner when progress advances", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { id: "job-1", status: "generating", progress: 35 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { id: "job-1", status: "generating", progress: 35 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { id: "job-1", status: "generating", progress: 75 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { id: "job-1", status: "completed", progress: 100, result: { ok: true } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = waitForCompletedJob("job-1", undefined, 90_000);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(5_000);
    await expect(result).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("notices completion within ten seconds even after unchanged progress", async () => {
    vi.useFakeTimers();
    let completed = false;
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      job: { id: "job-1", status: completed ? "completed" : "generating", progress: completed ? 100 : 35, result: { ok: true } },
    })));
    vi.stubGlobal("fetch", fetchMock);
    const result = waitForCompletedJob("job-1", undefined, 90_000);
    const onComplete = vi.fn();
    void result.then(onComplete);
    await vi.advanceTimersByTimeAsync(32_000);
    completed = true;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onComplete).toHaveBeenCalledWith({ ok: true });
    await expect(result).resolves.toEqual({ ok: true });
  });

  it("stops after the configured duration with an accurate resumable error", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      job: { id: "job-1", status: "generating", progress: 35 },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = waitForCompletedJob("job-1", undefined, 20_000);
    const assertion = expect(result).rejects.toMatchObject({
      retryable: true,
      message: "Status checks stopped after 20 seconds. The job may still be running. Check its status again to resume without starting it over.",
    });
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
  });

  it("stops polling on an expired session but leaves the job resumable", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Sign in required." }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(waitForCompletedJob("job-1", undefined, 60_000)).rejects.toMatchObject({
      retryable: true,
      message: "Sign in required.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
