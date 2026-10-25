# Design Studio language and vision providers

`src/lib/server/design-studio/providers.ts` supplies server-only JSON generation
and text streaming. These models reason about designs and inspect supplied images;
they do not generate images. The existing campaign-generation provider settings
remain separate. A legacy `OPENAI_MODEL` value does not configure Design Studio.

## Server configuration

`DESIGN_AI_PROVIDERS_JSON` is the authoritative registry when nonempty, including
the literal `[]` which intentionally disables all providers. It contains no keys:
`apiKeyEnv` names a separate server environment variable. All URLs, model IDs,
capabilities, and keys stay on the server. `NEXT_PUBLIC_` key names, URL credentials,
query strings, fragments, HTTP URLs, unknown settings, and duplicate provider or
model IDs are rejected. Redirects are rejected during inference requests.

This is the full registry shape. A question mark marks an optional field; numbers
in comments give accepted bounds and defaults. Required capabilities are explicit
because availability and quotas depend on the account and can change.

```ts
type DesignTask = "brief" | "direction" | "plan" | "composition" | "critique" | "edit" | "copy";
type Registry = {
  id: string;                    // /^[a-z][a-z0-9_-]{0,39}$/; unique
  protocol: "openai" | "gemini" | "cloudflare";
  baseUrl: string;               // HTTPS base endpoint, max 500 characters
  apiKeyEnv: string;             // server environment variable name
  enabled?: boolean;            // default true
  timeoutMs?: number;            // 100–180000; default 45000
  maxRetries?: number;           // 0–3; default 1
  retryBaseMs?: number;          // 1–10000; default 500
  requestsPerMinute?: number;    // 1–100000; no local limit if omitted
  models: {                     // 1–30 models, in fallback order
    id: string;                 // exact account model ID, max 180 characters
    tasks: DesignTask[];        // 1–7 tasks
    vision: boolean;
    structuredOutput: boolean;  // permits use for JSON tasks
    streaming: boolean;
    contextTokens: number;      // 128–10000000
    maxOutputTokens: number;    // 1–131072, at most contextTokens
    freeTier?: boolean;         // default false; operator verified
    requestsPerMinute?: number; // 1–100000; no local limit if omitted
    structuredMode?: "json_schema" | "json_object" | "prompt";
    tokenParameter?: "max_tokens" | "max_completion_tokens";
    parameters?: {             // omitted parameters are never sent
      temperature?: number;    // 0–2; check the model's narrower constraints
      topP?: number;           // 0–1
      seed?: number;           // integer 0–2147483647; model must support it
      reasoningEffort?: "none" | "low" | "medium" | "high"; // openai protocol only
    };
  }[];
}[];                            // at most 30 providers
```

`structuredMode` defaults to `json_object` for provider ID `zai`, otherwise
`json_schema`. Use `prompt` where a model can follow a schema but has no native
JSON format parameter; it still gets local Zod validation. OpenAI-style JSON Schema
requests use `strict:false`, accommodating optional properties. The schema uses
Zod's input representation so defaulted fields can be omitted and then hydrated
locally. `tokenParameter` defaults to `max_tokens`. Parameter support is
model-specific; configure only options verified against the selected model.

For OpenAI-compatible endpoints, `parameters.reasoningEffort` maps to
`reasoning_effort` and is omitted unless explicitly configured. Native Gemini and
Workers AI registries reject this setting; their reasoning controls are different
protocol features. Groq documents `low`, `medium`, and `high` for GPT-OSS 20B/120B,
with `medium` as the default. `none` is supported by some other compatible models
and is not a supported GPT-OSS choice. Verify the selected model's accepted values
before configuring it. For a verified GPT-OSS model, a parameter block such as
`"parameters":{"reasoningEffort":"low"}` can reduce reasoning effort and leave
more of a bounded completion budget available for design JSON. It does not raise
account token-per-minute limits or guarantee that a particular output fits.

### Six-provider registry example

The following complete JSON is a configuration template. Every entry is disabled
and uses an illustrative model ID and capability limits. Replace each ID and its
limits/capabilities with values verified in your account before enabling it.
Keeping entries disabled prevents a copied example from initiating billable work.
Cloudflare also needs the actual account ID in its URL. No model or free tier is
assumed to exist merely because a provider supports the protocol.

```json
[
  {
    "id": "hetzner", "protocol": "openai", "enabled": false,
    "baseUrl": "https://inference.hetzner.com/api/v1", "apiKeyEnv": "HETZNER_API_KEY",
    "timeoutMs": 45000, "maxRetries": 1, "requestsPerMinute": 8,
    "models": [{ "id": "replace-with-verified-hetzner-model", "tasks": ["brief", "direction", "plan", "composition", "edit", "copy"], "vision": false, "structuredOutput": true, "structuredMode": "prompt", "streaming": false, "contextTokens": 32000, "maxOutputTokens": 8000, "freeTier": false }]
  },
  {
    "id": "zai", "protocol": "openai", "enabled": false,
    "baseUrl": "https://api.z.ai/api/paas/v4", "apiKeyEnv": "ZAI_API_KEY",
    "models": [{ "id": "replace-with-verified-zai-model", "tasks": ["brief", "direction", "plan", "composition", "edit", "copy"], "vision": false, "structuredOutput": true, "structuredMode": "json_object", "streaming": false, "contextTokens": 32000, "maxOutputTokens": 8000, "parameters": { "temperature": 0.6 } }]
  },
  {
    "id": "gemini", "protocol": "gemini", "enabled": false,
    "baseUrl": "https://generativelanguage.googleapis.com/v1beta", "apiKeyEnv": "GEMINI_API_KEY",
    "models": [{ "id": "replace-with-verified-gemini-vision-model", "tasks": ["critique"], "vision": true, "structuredOutput": true, "streaming": false, "contextTokens": 32000, "maxOutputTokens": 5000 }]
  },
  {
    "id": "groq", "protocol": "openai", "enabled": false,
    "baseUrl": "https://api.groq.com/openai/v1", "apiKeyEnv": "GROQ_API_KEY",
    "models": [{ "id": "replace-with-verified-groq-model", "tasks": ["brief", "direction", "plan", "composition", "edit", "copy"], "vision": false, "structuredOutput": true, "structuredMode": "json_schema", "streaming": false, "contextTokens": 32000, "maxOutputTokens": 8000, "requestsPerMinute": 8 }]
  },
  {
    "id": "cloudflare", "protocol": "cloudflare", "enabled": false,
    "baseUrl": "https://api.cloudflare.com/client/v4/accounts/replace-account-id/ai/run", "apiKeyEnv": "CLOUDFLARE_API_TOKEN",
    "models": [{ "id": "@cf/replace/verified-model", "tasks": ["brief", "plan", "copy"], "vision": false, "structuredOutput": true, "streaming": false, "contextTokens": 32000, "maxOutputTokens": 5000 }]
  },
  {
    "id": "openrouter", "protocol": "openai", "enabled": false,
    "baseUrl": "https://openrouter.ai/api/v1", "apiKeyEnv": "OPENROUTER_API_KEY",
    "models": [{ "id": "replace/verified-model", "tasks": ["brief", "direction", "plan", "composition", "edit", "copy"], "vision": false, "structuredOutput": true, "streaming": false, "contextTokens": 32000, "maxOutputTokens": 8000, "freeTier": false }]
  }
]
```

Optional OpenAI or another compatible host uses the same `openai` protocol. For
OpenAI, use `id:"openai"`, `baseUrl:"https://api.openai.com/v1"`, and
`apiKeyEnv:"OPENAI_API_KEY"`; supply the account's explicit model definitions.
For reasoning models requiring it, set `tokenParameter:"max_completion_tokens"`.

### Shorthand configuration

If the registry is unset or blank, each `DESIGN_AI_<PREFIX>_MODELS_JSON` variable
registers the corresponding provider using the exact model array shape above.
An API key alone never activates a provider. `DESIGN_AI_<PREFIX>_BASE_URL`
optionally overrides the default endpoint. Use the full registry for provider-wide
rate limits, retries, custom key variable names, or custom ordering.

| Prefix | ID / protocol | Secret variable | Default base URL |
| --- | --- | --- | --- |
| `HETZNER` | `hetzner` / `openai` | `HETZNER_API_KEY` | `https://inference.hetzner.com/api/v1` |
| `ZAI` | `zai` / `openai` | `ZAI_API_KEY` | `https://api.z.ai/api/paas/v4` |
| `GEMINI` | `gemini` / `gemini` | `GEMINI_API_KEY` | `https://generativelanguage.googleapis.com/v1beta` |
| `GROQ` | `groq` / `openai` | `GROQ_API_KEY` | `https://api.groq.com/openai/v1` |
| `CLOUDFLARE` | `cloudflare` / `cloudflare` | `CLOUDFLARE_API_TOKEN` | `https://api.cloudflare.com/client/v4/accounts/<CLOUDFLARE_ACCOUNT_ID>/ai/run` |
| `OPENROUTER` | `openrouter` / `openai` | `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1` |
| `OPENAI` | `openai` / `openai` | `OPENAI_API_KEY` | `https://api.openai.com/v1` |

For example, set `DESIGN_AI_GROQ_MODELS_JSON` to an explicit model array and
`GROQ_API_KEY` to its secret. Query the provider's account model list first. A model
listed in an old campaign configuration can return HTTP 404 while a newly named
model exists; replacing the ID still requires checking its capabilities and quota.

## Routing, resilience, and budgets

Routing filters by task, structured-output permission, context capacity, and
required vision or streaming support. `preferredProvider` ranks that provider's
compatible models first. For tasks without an image, text-only models rank ahead
of vision models. `DESIGN_AI_PREFER_FREE` defaults to true and prioritizes explicitly configured models marked
`freeTier:true` within those groups; otherwise order is retained. Free quota is
never inferred. `AI_GENERATION_ENABLED=false` pauses all generation and retries.

`hasDesignProviders()` and `hasDesignVisionModel(preferredProvider?)` report
configured capability, not live account health. Vision availability requires
`vision`, `structuredOutput`, and the `critique` task. Missing credentials or
capabilities produce explicit failures and never substitute demo results.

Transient network/timeouts and HTTP 408, 425, 429, 500, 502, 503, 504 can trigger
bounded retry or fallback. Object requests retry with exponential delays; HTTP 429
falls back immediately. `Retry-After` seconds or HTTP dates cool the provider
(default 60 seconds for 429, maximum 24 hours). Delays over five seconds fall back
instead of sleeping. Authentication failures never retry and cool for 60 seconds.
Errors expose provider/model IDs, stable error codes, and actual HTTP status only;
response bodies, keys, environment names, endpoint URLs, prompts, and model text
are excluded. Schema repair gets at most one attempt across the entire call and
uses bounded actual issue paths/codes plus the previous JSON as untrusted data.

Provider and model request limits use a sliding process-local one-minute window.
Retries and repairs consume slots. Cooldowns and aggregate telemetry also live in
the process; horizontally scaled deployments need a shared limiter for account
quotas. Durable workspace/job budgets remain the application authority.

| Control | Default | Hard bound |
| --- | --- | --- |
| `maxOutputTokens` option | 6000, clamped to model maximum | 16384 per request |
| `maxTotalTokens` / `DESIGN_AI_MAX_CALL_TOKENS` | 65536 | 131072 per call |
| `maxAttempts` / `DESIGN_AI_MAX_ATTEMPTS` | 8 HTTP attempts including retries | 12 |
| Prompt including schema | — | 192 KiB |
| Inline image data URL | PNG/JPEG/WebP | 8 MiB encoded |
| Provider response or SSE | — | 1 MiB |

Input budgeting conservatively reserves one token per UTF-8 text byte plus
message overhead and 8192 tokens for an image. Image tokenization varies by model;
this is not a provider tokenizer. Actual usage is used when returned. Missing
usage is charged conservatively using input estimate and reserved output.
`onUsage` fires for every completed response, including malformed/invalid objects,
and must be counted once; the returned usage aggregates these same responses.
Callback failure stops completed work without retry. Transport failures can have
unknown billing; attempt limits bound exposure but provider billing is definitive.

## Protocol and streaming details

OpenAI-compatible adapters use Bearer authentication and `/chat/completions`.
Gemini uses native `models/<id>:generateContent`, `x-goog-api-key`, `inlineData`
image parts, and `generationConfig.responseJsonSchema`. Workers AI calls the
model run endpoint, unwraps `result.response`, and sends the raw JSON Schema.
Native Workers AI vision uses `prompt` plus an image byte array. For models using
a different multimodal shape, configure the provider's OpenAI-compatible endpoint
instead. Model-specific license acceptance remains an operator setup step.

`streamDesignText()` separately yields untrusted `{type:"delta",text}` events
then `{type:"usage",usage}`. It supports OpenAI-style SSE, Gemini native SSE, and
Workers AI response chunks. Fallback is allowed before a delta is emitted;
interruption after partial output is an error and never concatenates a different
model's continuation. Persisted objects must use `generateDesignObject()` and
local schema validation. Groq structured output and Workers AI JSON Mode currently
do not support streaming together; raw text streaming requests no JSON format.

`getDesignProviderSettings()` returns only enabled/configuration flags,
provider IDs/protocols, capabilities, configured/cooldown status, and aggregate
request/token/error-code/HTTP-status telemetry. It contains no endpoint or secret
configuration. Serve even this view through an authenticated operational endpoint.

## Official references and verification

Protocol references checked during implementation on 2026-10-25:

- [Hetzner Inference API](https://docs.hetzner.com/general/company-and-policy/experiments/inference/): OpenAI-compatible API; the service is explicitly experimental without a production availability guarantee.
- [Z.AI Chat Completion](https://docs.z.ai/api-reference/llm/chat-completion): Bearer authorization, JSON object format, text and image request shapes.
- [Gemini Generate Content](https://ai.google.dev/api/generate-content) and [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output): native content, streaming, and schema shapes.
- [Groq API reference](https://console.groq.com/docs/api-reference) and [structured outputs](https://console.groq.com/docs/structured-outputs): compatibility and model-dependent JSON format limits.
- [Groq reasoning](https://console.groq.com/docs/reasoning): model-specific reasoning effort values and GPT-OSS defaults.
- [Workers AI run API](https://developers.cloudflare.com/api/resources/ai/methods/run/), [JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/), and [vision input](https://developers.cloudflare.com/workers-ai/models/llama-3.2-11b-vision-instruct/): native model payloads and streaming limitations.
- [OpenRouter API](https://openrouter.ai/developers): compatible completions, model routing, and streaming.
- [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create): optional compatible provider protocol.

Run `pnpm exec vitest run src/lib/server/design-studio/providers.test.ts` for
mock-HTTP adapter coverage. This verifies protocol, routing, validation, budget,
generation parameter, cancellation, and redaction behavior. It does not establish
live provider access, current free quota, or visual quality. Successful unit tests
must not be described as successful live generation.
