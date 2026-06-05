import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

export const ENV_NAMES = {
  apiKey: ["IMAGE_API_KEY", "OPENAI_API_KEY"],
  apiKeyEnv: ["IMAGE_API_KEY_ENV", "OPENAI_API_KEY_ENV"],
  authHeader: ["IMAGE_API_AUTH_HEADER", "OPENAI_AUTH_HEADER"],
  authScheme: ["IMAGE_API_AUTH_SCHEME", "OPENAI_AUTH_SCHEME"],
  baseUrl: ["IMAGE_API_BASE_URL", "OPENAI_BASE_URL"],
  editPath: ["IMAGE_API_EDIT_PATH", "OPENAI_IMAGE_EDIT_PATH"],
  editsUrl: ["IMAGE_API_EDITS_URL", "OPENAI_IMAGE_EDITS_URL"],
  extraHeaders: ["IMAGE_API_EXTRA_HEADERS", "OPENAI_EXTRA_HEADERS"],
  generationPath: ["IMAGE_API_GENERATION_PATH", "OPENAI_IMAGE_PATH"],
  generationsUrl: ["IMAGE_API_GENERATIONS_URL", "OPENAI_IMAGE_GENERATIONS_URL"],
  model: ["IMAGE_API_MODEL", "OPENAI_IMAGE_MODEL"],
};

export async function loadEnvFiles(files, { mutateProcessEnv = false } = {}) {
  const env = {};

  for (const file of files) {
    const filePath = path.resolve(file);
    if (!existsSync(filePath)) {
      continue;
    }

    Object.assign(env, parseEnv(await readFile(filePath, "utf8")));
  }

  if (mutateProcessEnv) {
    for (const [key, value] of Object.entries(env)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }

  return env;
}

export function parseEnv(contents) {
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

export function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function resolveApiKey(env) {
  const apiKeyEnv = readEnv(env, ENV_NAMES.apiKeyEnv);
  if (apiKeyEnv && env[apiKeyEnv]) {
    return env[apiKeyEnv];
  }

  return readEnv(env, ENV_NAMES.apiKey);
}

export function buildHeaders(env, apiKey, { contentType = "application/json" } = {}) {
  const authHeader = readEnv(env, ENV_NAMES.authHeader, "Authorization");
  const authScheme = readEnv(env, ENV_NAMES.authScheme, "Bearer", { allowEmpty: true });
  const headers = {
    ...readExtraHeaders(env),
    [authHeader]: authScheme ? `${authScheme} ${apiKey}` : apiKey,
  };

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return headers;
}

export function readExtraHeaders(env) {
  const rawHeaders = readEnv(env, ENV_NAMES.extraHeaders);
  if (!rawHeaders || rawHeaders === "{}") {
    return {};
  }

  try {
    const headers = JSON.parse(rawHeaders);
    if (!headers || Array.isArray(headers) || typeof headers !== "object") {
      fail('IMAGE_API_EXTRA_HEADERS must be a JSON object, for example: {"X-Provider":"example"}');
    }

    return headers;
  } catch (error) {
    fail(
      `IMAGE_API_EXTRA_HEADERS must be valid JSON. Use double quotes, for example: {"X-Provider":"example"}. ${error.message}`
    );
  }
}

export function readEnv(env, names, fallbackValue, { allowEmpty = false } = {}) {
  for (const name of names) {
    if (env[name] !== undefined && (allowEmpty || env[name] !== "")) {
      return env[name];
    }
  }

  return fallbackValue;
}

export function joinUrl(baseUrl, pathname) {
  return `${baseUrl.replace(/\/+$/g, "")}/${pathname.replace(/^\/+/g, "")}`;
}

export function baseUrlFromApiUrl(apiUrl, fallbackBaseUrl) {
  try {
    const url = new URL(apiUrl);
    if (url.pathname.includes("/v1/")) {
      url.pathname = url.pathname.slice(0, url.pathname.indexOf("/v1/") + 3);
    } else {
      url.pathname = "/v1";
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/g, "");
  } catch {
    return fallbackBaseUrl;
  }
}

export function parseJson(rawBody) {
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

export function getRequestId(headers) {
  const candidates = [
    "x-request-id",
    "request-id",
    "cf-ray",
  ];

  for (const name of candidates) {
    const value = headers.get(name);
    if (value) {
      return value;
    }
  }

  return "";
}

export function truncate(text, maxLength = 1000) {
  if (!text) {
    return "";
  }

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export function readValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    fail(`Missing value for ${flag}`);
  }

  return value;
}

export function readPositiveInteger(value, flag) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number <= 0) {
    fail(`${flag} must be a positive integer.`);
  }

  return number;
}

export function readNumber(value, flag) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) {
    fail(`${flag} must be a number.`);
  }

  return number;
}

export async function readPromptFile(filePath) {
  if (!existsSync(filePath)) {
    fail(`Prompt file does not exist: ${filePath}`);
  }

  const contents = await readFile(filePath, "utf8").catch((error) => {
    fail(`Could not read prompt file ${filePath}: ${error.message}`);
  });

  return contents.trim();
}

export function makeFilename(prompt, extension, { fallback = "image", prefix = "" } = {}) {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || fallback;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const pieces = [stamp];

  if (prefix) {
    pieces.push(prefix);
  }

  pieces.push(slug);
  return `${pieces.join("-")}.${extension}`;
}

function fail(message) {
  throw new Error(message);
}
