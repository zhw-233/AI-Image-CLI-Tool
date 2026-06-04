import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

async function main() {
  const env = await loadEnvFiles([".env", ".env.active"]);
  const apiKey = resolveApiKey(env);
  if (!apiKey) {
    fail("Missing API key. Run: node src/doctor.js");
  }

  const baseUrl = env.OPENAI_BASE_URL || DEFAULT_BASE_URL;
  const url = `${baseUrl.replace(/\/+$/g, "")}/models`;
  const response = await fetch(url, {
    headers: buildHeaders(env, apiKey),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body?.error?.message ?? JSON.stringify(body) ?? response.statusText;
    fail(`Models request failed (${response.status}): ${detail}`);
  }

  const ids = Array.isArray(body?.data) ? body.data.map((model) => model.id).filter(Boolean) : [];
  const imageLike = ids.filter((id) => /image|gpt-image|dall|flux|sd|stable/i.test(id));

  console.log(`Models endpoint: ${url}`);
  console.log(`Total models: ${ids.length}`);
  console.log("\nLikely image models:");
  for (const id of imageLike.length ? imageLike : ["(none found)"]) {
    console.log(`- ${id}`);
  }

  if (!imageLike.length) {
    console.log("\nFirst models returned:");
    for (const id of ids.slice(0, 30)) {
      console.log(`- ${id}`);
    }
  }
}

async function loadEnvFiles(files) {
  const env = {};

  for (const file of files) {
    const filePath = path.resolve(file);
    if (!existsSync(filePath)) {
      continue;
    }

    Object.assign(env, parseEnv(await readFile(filePath, "utf8")));
  }

  return env;
}

function parseEnv(contents) {
  const parsed = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    parsed[key] = stripQuotes(valueParts.join("="));
  }

  return parsed;
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function resolveApiKey(env) {
  const apiKeyEnv = env.OPENAI_API_KEY_ENV;
  if (apiKeyEnv && env[apiKeyEnv]) {
    return env[apiKeyEnv];
  }

  return env.OPENAI_API_KEY;
}

function buildHeaders(env, apiKey) {
  const authHeader = env.OPENAI_AUTH_HEADER || "Authorization";
  const authScheme = env.OPENAI_AUTH_SCHEME ?? "Bearer";
  const authValue = authScheme ? `${authScheme} ${apiKey}` : apiKey;

  return {
    [authHeader]: authValue,
    "Content-Type": "application/json",
  };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

main().catch((error) => fail(error.stack ?? error.message));
