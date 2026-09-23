import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
if (existsSync(resolve(root, ".env.local"))) process.loadEnvFile(resolve(root, ".env.local"));
if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));

const errors = [];
const present = (name) => Boolean(process.env[name]?.trim());
const requireValues = (names) => {
  for (const name of names) if (!present(name)) errors.push(`${name} is required.`);
};

const deployment = process.env.DEPLOYMENT_ENVIRONMENT?.trim().toLowerCase();
if (deployment !== "staging" && deployment !== "production") {
  errors.push("DEPLOYMENT_ENVIRONMENT must be staging or production.");
}
if (process.env.EASEYOURSTARTUP_TEST_MODE?.trim().toLowerCase() === "true") {
  errors.push("EASEYOURSTARTUP_TEST_MODE must be false in staging and production.");
}

requireValues([
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPPORT_EMAIL",
  "DATABASE_URL",
  "NEON_AUTH_BASE_URL",
  "NEXT_PUBLIC_NEON_AUTH_URL",
  "NEON_AUTH_COOKIE_SECRET",
  "BROWSERLESS_API_URL",
  "BROWSERLESS_API_KEY",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "PADDLE_ENVIRONMENT",
  "PADDLE_API_KEY",
  "PADDLE_WEBHOOK_SECRET",
  "PADDLE_PRO_PRICE_ID",
  "PADDLE_FOUNDING_PRICE_ID",
  "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
  "NEXT_PUBLIC_PADDLE_ENVIRONMENT",
]);

try {
  const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    errors.push("NEXT_PUBLIC_APP_URL must be an HTTPS origin without a path, query, or credentials.");
  }
} catch {
  errors.push("NEXT_PUBLIC_APP_URL must be a valid HTTPS origin.");
}

if (present("NEXT_PUBLIC_SUPPORT_EMAIL") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.NEXT_PUBLIC_SUPPORT_EMAIL.trim())) {
  errors.push("NEXT_PUBLIC_SUPPORT_EMAIL must be a monitored email address.");
}

const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET ?? "";
if (present("NEON_AUTH_COOKIE_SECRET") && Buffer.byteLength(cookieSecret, "utf8") < 32) {
  errors.push("NEON_AUTH_COOKIE_SECRET must contain at least 32 bytes.");
}
if (process.env.AI_GENERATION_ENABLED?.trim().toLowerCase() !== "true") {
  errors.push("AI_GENERATION_ENABLED must be true before paid generation is enabled.");
}
if (!["OPENAI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY"].some(present)) {
  errors.push("Configure one AI provider key: OPENAI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY.");
}

try {
  const browserlessUrl = new URL(process.env.BROWSERLESS_API_URL ?? "");
  if (browserlessUrl.protocol !== "https:") errors.push("BROWSERLESS_API_URL must use HTTPS.");
} catch {
  errors.push("BROWSERLESS_API_URL must be a valid HTTPS URL.");
}

try {
  const storageUrl = new URL(process.env.S3_ENDPOINT ?? "");
  if (storageUrl.protocol !== "https:") errors.push("S3_ENDPOINT must use HTTPS for staging and production.");
} catch {
  errors.push("S3_ENDPOINT must be a valid HTTPS URL.");
}

const paddleEnvironment = process.env.PADDLE_ENVIRONMENT?.trim().toLowerCase();
const publicPaddleEnvironment = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT?.trim().toLowerCase();
if (paddleEnvironment && !["sandbox", "production"].includes(paddleEnvironment)) {
  errors.push("PADDLE_ENVIRONMENT must be sandbox or production.");
}
if (paddleEnvironment && publicPaddleEnvironment && paddleEnvironment !== publicPaddleEnvironment) {
  errors.push("PADDLE_ENVIRONMENT and NEXT_PUBLIC_PADDLE_ENVIRONMENT must match.");
}
if (deployment === "staging" && paddleEnvironment && paddleEnvironment !== "sandbox") {
  errors.push("Staging must use Paddle sandbox credentials and prices.");
}
if (deployment === "production" && paddleEnvironment && paddleEnvironment !== "production") {
  errors.push("Production must use live Paddle credentials and prices.");
}
if (present("PADDLE_PRO_PRICE_ID") && present("PADDLE_FOUNDING_PRICE_ID") && process.env.PADDLE_PRO_PRICE_ID === process.env.PADDLE_FOUNDING_PRICE_ID) {
  errors.push("PADDLE_PRO_PRICE_ID and PADDLE_FOUNDING_PRICE_ID must be different prices.");
}

if (errors.length) {
  console.error("Launch configuration is incomplete:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Launch configuration passed for ${deployment}.`);
}
