import process from "node:process";
import { ENV_NAMES, loadEnvFiles, readEnv, resolveApiKey } from "./common.js";

const DEFAULT_BASE_URL = "https://your-image-api.example.com/v1";
const DEFAULT_MODEL = "image-model";

async function main() {
  const env = await loadEnvFiles([".env", ".env.active"]);
  const apiKeyEnv = readEnv(env, ENV_NAMES.apiKeyEnv);
  const apiKeySource = apiKeyEnv && env[apiKeyEnv] ? apiKeyEnv : env.OPENAI_API_KEY && !env.IMAGE_API_KEY ? "OPENAI_API_KEY" : "IMAGE_API_KEY";
  const apiKey = resolveApiKey(env);
  const baseUrl = readEnv(env, ENV_NAMES.baseUrl, DEFAULT_BASE_URL);
  const generationPath = readEnv(env, ENV_NAMES.generationPath, "/images/generations");
  const generationUrl = readEnv(env, ENV_NAMES.generationsUrl);
  const model = readEnv(env, ENV_NAMES.model, DEFAULT_MODEL);
  const apiUrl =
    generationUrl ||
    `${baseUrl.replace(/\/+$/g, "")}/${generationPath.replace(/^\/+/g, "")}`;

  console.log("Image API configuration:");
  print("IMAGE_PROVIDER", env.IMAGE_PROVIDER || "(not set)");
  print("IMAGE_API_BASE_URL", baseUrl);
  print("IMAGE_API_GENERATIONS_URL", generationUrl || "(derived)");
  print("Resolved request URL", apiUrl);
  print("IMAGE_API_MODEL", model);
  print("API key source", apiKeySource);
  print("API key", maskSecret(apiKey));
  print("IMAGE_API_AUTH_HEADER", readEnv(env, ENV_NAMES.authHeader, "Authorization"));
  print("IMAGE_API_AUTH_SCHEME", readEnv(env, ENV_NAMES.authScheme, "Bearer", { allowEmpty: true }));
  print("IMAGE_API_EXTRA_HEADERS", readEnv(env, ENV_NAMES.extraHeaders, "(not set)"));

  console.log("\nChecks:");
  check(Boolean(apiKey), "API key is present", "API key is missing.");
  check(!isPlaceholder(apiKey), "API key does not look like the placeholder", "API key still looks like a placeholder.");
  check(Boolean(baseUrl), "Base URL is present", "Base URL is missing.");
}

function maskSecret(value) {
  if (!value) {
    return "(missing)";
  }

  if (value.length <= 8) {
    return `${"*".repeat(value.length)} (${value.length} chars)`;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)} (${value.length} chars)`;
}

function isPlaceholder(value) {
  return !value || value.includes("your-") || value.includes("sk-your") || value.includes("example");
}

function print(label, value) {
  console.log(`${label}: ${value}`);
}

function check(condition, okMessage, failMessage) {
  console.log(`${condition ? "OK" : "WARN"} ${condition ? okMessage : failMessage}`);
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});
