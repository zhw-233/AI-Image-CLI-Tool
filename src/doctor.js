import process from "node:process";
import { loadEnvFiles, resolveApiKey } from "./common.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

async function main() {
  const env = await loadEnvFiles([".env", ".env.active"]);
  const apiKeySource = env.OPENAI_API_KEY_ENV && env[env.OPENAI_API_KEY_ENV] ? env.OPENAI_API_KEY_ENV : "OPENAI_API_KEY";
  const apiKey = resolveApiKey(env);
  const baseUrl = env.OPENAI_BASE_URL || DEFAULT_BASE_URL;
  const apiUrl =
    env.OPENAI_IMAGE_GENERATIONS_URL ||
    `${baseUrl.replace(/\/+$/g, "")}/${(env.OPENAI_IMAGE_PATH || "/images/generations").replace(/^\/+/g, "")}`;

  console.log("Image API configuration:");
  print("IMAGE_PROVIDER", env.IMAGE_PROVIDER || "(not set)");
  print("OPENAI_BASE_URL", baseUrl);
  print("OPENAI_IMAGE_GENERATIONS_URL", env.OPENAI_IMAGE_GENERATIONS_URL || "(derived)");
  print("Resolved request URL", apiUrl);
  print("OPENAI_IMAGE_MODEL", env.OPENAI_IMAGE_MODEL || "gpt-image-2");
  print("API key source", apiKeySource);
  print("API key", maskSecret(apiKey));
  print("OPENAI_AUTH_HEADER", env.OPENAI_AUTH_HEADER || "Authorization");
  print("OPENAI_AUTH_SCHEME", env.OPENAI_AUTH_SCHEME ?? "Bearer");
  print("OPENAI_EXTRA_HEADERS", env.OPENAI_EXTRA_HEADERS || "(not set)");

  console.log("\nChecks:");
  check(Boolean(apiKey), "API key is present", "API key is missing.");
  check(!isPlaceholder(apiKey), "API key does not look like the placeholder", "API key still looks like a placeholder.");
  check(Boolean(baseUrl), "Base URL is present", "Base URL is missing.");
  check(
    !(baseUrl.includes("api.openai.com") && apiKeySource !== "OPENAI_API_KEY"),
    "Official OpenAI URL is not paired with a third-party key variable",
    "Official OpenAI URL appears to be paired with a third-party key variable."
  );
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
