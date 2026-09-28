const startedAt = Date.now();
(async () => {
  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.NVIDIA_NIM_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-3.5-lightning-30b-a3b",
        messages: [{ role: "user", content: 'Return exactly {"ok":true}.' }],
        max_tokens: 32,
        temperature: 0,
        stream: false,
        reasoning_budget: 0,
        response_format: { type: "json_object" }
      }),
      signal: AbortSignal.timeout(60000)
    });
    let validJson = false;
    if (response.ok) {
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      try { validJson = JSON.parse(content).ok === true; } catch {}
    } else {
      await response.body?.cancel();
    }
    process.stdout.write(JSON.stringify({
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      hasValidJson: validJson
    }) + "\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({
      status: error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "network_error",
      elapsedMs: Date.now() - startedAt,
      errorName: error?.name ?? "Error"
    }) + "\n");
  }
})();