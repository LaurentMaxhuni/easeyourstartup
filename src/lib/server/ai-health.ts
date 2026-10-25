import "server-only";

import { z } from "zod";
import {
  getStructuredAiTimeoutMs,
  getOpenAIProviderSetups,
  publicProviderError,
  requestStructuredAiJsonFrom,
  type AiTask,
} from "@/lib/server/campaign-generator";

export const AI_TASKS: AiTask[] = [
  "brandTextModel",
  "brandVisionModel",
  "strategyModel",
  "copyModel",
  "designPlannerModel",
  "criticModel",
];

export type AiProviderCheck = {
  task: AiTask;
  position: number;
  provider: string;
  model: string;
  modelListed: boolean | null;
  ok: boolean;
  latencyMs: number;
  error?: string;
};

export type AiHealthReport = {
  checks: AiProviderCheck[];
  errors: string[];
  warnings: string[];
};

const OPENAI_API_URL = "https://api.openai.com/v1";
const pingSchema = z.object({ ok: z.boolean() });

async function listedModels(baseURL: string | undefined, apiKey: string) {
  try {
    const response = await fetch(`${(baseURL ?? OPENAI_API_URL).replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { data?: Array<{ id?: unknown }> };
    return new Set((data.data ?? []).map((model) => String(model.id)));
  } catch {
    return null;
  }
}

// Sends one tiny real request to every configured provider for every AI task,
// each provider on its own, so a broken model cannot hide behind failover.
export async function checkAiProviders(tasks: AiTask[] = AI_TASKS): Promise<AiHealthReport> {
  const checks: AiProviderCheck[] = [];
  const modelLists = new Map<string, Promise<Set<string> | null>>();

  for (const task of tasks) {
    const setups = getOpenAIProviderSetups(task, {
      timeoutMs: (config) => getStructuredAiTimeoutMs(task, process.env, config),
      maxRetries: 0,
    });
    for (const [position, setup] of setups.entries()) {
      const apiKey = setup.client.apiKey ?? "";
      const listKey = `${setup.client.baseURL}|${apiKey}`;
      if (!modelLists.has(listKey)) modelLists.set(listKey, listedModels(setup.client.baseURL, apiKey));
      const models = await modelLists.get(listKey)!;
      // OpenRouter's router ids are not listed models.
      const modelListed = models && !/^openrouter\//.test(setup.model) ? models.has(setup.model) : null;
      const startedAt = Date.now();
      try {
        await requestStructuredAiJsonFrom({ ...setup, fallbackModels: [] }, {
          messages: [
            { role: "system", content: 'Return the JSON object {"ok": true} and nothing else.' },
            { role: "user", content: "Health check." },
          ],
          schema: pingSchema,
          schemaName: "health_check",
          maxCompletionTokens: 2_000,
          singleAttempt: true,
          onAttemptModel: () => undefined,
        });
        checks.push({ task, position, provider: setup.providerName, model: setup.model, modelListed, ok: true, latencyMs: Date.now() - startedAt });
      } catch (error) {
        checks.push({
          task, position, provider: setup.providerName, model: setup.model, modelListed, ok: false,
          latencyMs: Date.now() - startedAt, error: publicProviderError(error),
        });
      }
    }
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  for (const task of tasks) {
    const taskChecks = checks.filter((check) => check.task === task);
    if (taskChecks.length === 0) {
      errors.push(`${task}: no AI provider is configured.`);
      continue;
    }
    if (!taskChecks.some((check) => check.ok)) errors.push(`${task}: every provider failed, so this step cannot run.`);
    else if (!taskChecks[0].ok) warnings.push(`${task}: the first provider (${taskChecks[0].provider} ${taskChecks[0].model}) fails, so every request waits for failover.`);
    if (taskChecks.length === 1) warnings.push(`${task}: only one provider is configured, so there is nothing to fail over to.`);
  }
  for (const check of checks) {
    if (check.modelListed === false) warnings.push(`${check.provider} does not list the model "${check.model}" (${check.task}). Check the model name.`);
    if (/^(?:openrouter\/free|.+:free)$/i.test(check.model) && check.provider === "openrouter") {
      warnings.push(`${check.task}: ${check.model} is a free model with a small daily quota; do not rely on it in production.`);
    }
  }
  return { checks, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
