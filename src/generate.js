import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { recordProviderFailure, recordProviderSuccess, runProviderGuard } from "./provider-guard.js";

const DEFAULTS = {
  baseUrl: "https://api.openai.com/v1",
  imagePath: "/images/generations",
  model: "gpt-image-2",
  size: "1024x1024",
  quality: "auto",
  background: "auto",
  outputFormat: "png",
  outputDir: "outputs",
};
let stepIndex = 0;
const startedAt = Date.now();

async function main() {
  step("Loading environment files", ".env, .env.active");
  await loadEnvFiles([".env", ".env.active"]);

  step("Parsing command line arguments");
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    printHelp();
    return;
  }

  const prompt = await resolvePrompt(cli, "Please provide a prompt. Example: npm run generate -- \"A watercolor fox in a library\"");
  if (!prompt) {
    fail("Prompt file is empty after trimming.");
  }

  const options = {
    apiUrl: cli.apiUrl ?? process.env.OPENAI_IMAGE_GENERATIONS_URL,
    baseUrl: cli.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULTS.baseUrl,
    imagePath: process.env.OPENAI_IMAGE_PATH ?? DEFAULTS.imagePath,
    model: cli.model ?? process.env.OPENAI_IMAGE_MODEL ?? DEFAULTS.model,
    size: cli.size ?? process.env.IMAGE_SIZE ?? DEFAULTS.size,
    quality: cli.quality ?? process.env.IMAGE_QUALITY ?? DEFAULTS.quality,
    background: cli.background ?? process.env.IMAGE_BACKGROUND ?? DEFAULTS.background,
    outputFormat: cli.format ?? process.env.IMAGE_OUTPUT_FORMAT ?? DEFAULTS.outputFormat,
    outputDir: cli.outputDir ?? DEFAULTS.outputDir,
  };

  const apiUrl = options.apiUrl ?? joinUrl(options.baseUrl, options.imagePath);
  const providerBaseUrl = baseUrlFromApiUrl(apiUrl, options.baseUrl);
  const payload = buildPayload(prompt, options);
  step("Prepared request", `model=${payload.model}, url=${apiUrl}`);

  if (cli.dryRun) {
    step("Dry-run enabled", "printing request without calling the API");
    console.log(JSON.stringify({ url: apiUrl, payload }, null, 2));
    return;
  }

  step("Resolving API key");
  const apiKey = resolveApiKey();
  if (!apiKey) {
    fail("Missing API key. Set OPENAI_API_KEY, or set OPENAI_API_KEY_ENV to the name of another key variable.");
  }

  const headers = buildHeaders(apiKey);
  await runProviderGuard({
    apiKey,
    baseUrl: providerBaseUrl,
    env: process.env,
    fail,
    force: cli.force,
    headers,
    model: payload.model,
    noPreflight: cli.noPreflight,
    operation: "image generation",
    step,
  });

  let response;
  let rawBody;

  try {
    step("Sending image generation request", "no local timeout");
    response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    step("Received API response headers", `status=${response.status}`);
    const requestId = getRequestId(response.headers);
    if (requestId) {
      step("Provider request id", requestId);
    }

    step("Reading response body");
    rawBody = await response.text();
  } catch (error) {
    throw error;
  }

  step("Parsing response body", `${rawBody.length} bytes`);
  const body = parseResponseBody(rawBody);
  if (!response.ok) {
    const detail = body?.error?.message ?? (truncate(rawBody) || response.statusText);
    await recordProviderFailure({
      baseUrl: providerBaseUrl,
      detail,
      env: process.env,
      model: payload.model,
      status: response.status,
      step,
    });
    fail(`OpenAI API request failed (${response.status}): ${detail}`);
  }

  await recordProviderSuccess({
    baseUrl: providerBaseUrl,
    env: process.env,
    model: payload.model,
    step,
  });

  step("Reading image data from response");
  if (!body) {
    fail(`API response was not JSON. Raw response: ${truncate(rawBody)}`);
  }

  const imageBase64 = body?.data?.[0]?.b64_json;
  if (!imageBase64) {
    fail(`No image data returned. Response: ${JSON.stringify(body, null, 2)}`);
  }

  step("Saving image file", `outputDir=${options.outputDir}`);
  await mkdir(options.outputDir, { recursive: true });
  const filename = makeFilename(prompt, options.outputFormat);
  const outputPath = path.join(options.outputDir, filename);
  await writeFile(outputPath, Buffer.from(imageBase64, "base64"));

  step("Done", outputPath);
  console.log(`Saved image to ${outputPath}`);
}

function buildPayload(prompt, options) {
  const payload = {
    model: options.model,
    prompt,
    size: options.size,
    quality: options.quality,
    background: options.background,
    output_format: options.outputFormat,
  };

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== "auto" && value !== "")
  );
}

function parseArgs(args) {
  const parsed = {
    dryRun: false,
    help: false,
    promptFile: "",
    promptParts: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--force") {
      parsed.force = true;
    } else if (arg === "--no-preflight") {
      parsed.noPreflight = true;
    } else if (arg === "--api-url") {
      parsed.apiUrl = readValue(args, ++index, arg);
    } else if (arg === "--base-url") {
      parsed.baseUrl = readValue(args, ++index, arg);
    } else if (arg === "--prompt-file") {
      parsed.promptFile = readValue(args, ++index, arg);
    } else if (arg === "--model") {
      parsed.model = readValue(args, ++index, arg);
    } else if (arg === "--size") {
      parsed.size = readValue(args, ++index, arg);
    } else if (arg === "--quality") {
      parsed.quality = readValue(args, ++index, arg);
    } else if (arg === "--background") {
      parsed.background = readValue(args, ++index, arg);
    } else if (arg === "--format") {
      parsed.format = readValue(args, ++index, arg);
    } else if (arg === "--output-dir") {
      parsed.outputDir = readValue(args, ++index, arg);
    } else if (arg.startsWith("--")) {
      fail(`Unknown option: ${arg}`);
    } else {
      parsed.promptParts.push(arg);
    }
  }

  parsed.prompt = parsed.promptParts.join(" ");
  delete parsed.promptParts;
  return parsed;
}

async function resolvePrompt(cli, missingMessage) {
  const inlinePrompt = cli.prompt?.trim();
  if (inlinePrompt && cli.promptFile) {
    fail("Use either an inline prompt or --prompt-file <path>, not both.");
  }

  if (cli.promptFile) {
    step("Loading prompt file", cli.promptFile);
    return readPromptFile(cli.promptFile);
  }

  if (!inlinePrompt) {
    fail(missingMessage);
  }

  return inlinePrompt;
}

async function readPromptFile(filePath) {
  if (!existsSync(filePath)) {
    fail(`Prompt file does not exist: ${filePath}`);
  }

  const contents = await readFile(filePath, "utf8").catch((error) => {
    fail(`Could not read prompt file ${filePath}: ${error.message}`);
  });

  return contents.trim();
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    fail(`Missing value for ${flag}`);
  }

  return value;
}

async function loadEnvFiles(files) {
  const fileEnv = {};

  for (const file of files) {
    const envPath = path.resolve(file);
    if (!existsSync(envPath)) {
      continue;
    }

    const contents = await readFile(envPath, "utf8").catch((error) => {
      fail(`Could not read ${file}: ${error.message}`);
    });

    Object.assign(fileEnv, parseEnv(contents));
  }

  for (const [key, value] of Object.entries(fileEnv)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
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

function resolveApiKey() {
  const apiKeyEnv = process.env.OPENAI_API_KEY_ENV;
  if (apiKeyEnv && process.env[apiKeyEnv]) {
    return process.env[apiKeyEnv];
  }

  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }

  return undefined;
}

function buildHeaders(apiKey) {
  const authHeader = process.env.OPENAI_AUTH_HEADER || "Authorization";
  const authScheme = process.env.OPENAI_AUTH_SCHEME ?? "Bearer";
  const authValue = authScheme ? `${authScheme} ${apiKey}` : apiKey;

  return {
    ...readExtraHeaders(),
    [authHeader]: authValue,
    "Content-Type": "application/json",
  };
}

function readExtraHeaders() {
  const rawHeaders = process.env.OPENAI_EXTRA_HEADERS;
  if (!rawHeaders || rawHeaders === "{}") {
    return {};
  }

  try {
    const headers = JSON.parse(rawHeaders);
    if (!headers || Array.isArray(headers) || typeof headers !== "object") {
      fail("OPENAI_EXTRA_HEADERS must be a JSON object, for example: {\"X-Provider\":\"example\"}");
    }

    return headers;
  } catch (error) {
    fail(
      `OPENAI_EXTRA_HEADERS must be valid JSON. Use double quotes, for example: {"X-Provider":"example"}. ${error.message}`
    );
  }
}

function joinUrl(baseUrl, pathname) {
  return `${baseUrl.replace(/\/+$/g, "")}/${pathname.replace(/^\/+/g, "")}`;
}

function baseUrlFromApiUrl(apiUrl, fallbackBaseUrl) {
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

function parseResponseBody(rawBody) {
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

function getRequestId(headers) {
  const candidates = [
    "x-request-id",
    "request-id",
    "openai-request-id",
    "x-openai-request-id",
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

function truncate(text, maxLength = 1000) {
  if (!text) {
    return "";
  }

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
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

function makeFilename(prompt, extension) {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "image";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  return `${stamp}-${slug}.${extension}`;
}

function printHelp() {
  console.log(`
Usage:
  npm run generate -- "A precise prompt"

Options:
  --base-url <url>        OpenAI-compatible base URL. Defaults to OPENAI_BASE_URL.
  --api-url <url>         Full image generation endpoint URL. Overrides base URL.
  --prompt-file <path>    Read the prompt from a UTF-8 text file.
  --model <name>          Image model. Defaults to OPENAI_IMAGE_MODEL or gpt-image-2.
  --size <size>           Example: 1024x1024, 1024x1536, 1536x1024.
  --quality <quality>     Example: auto, low, medium, high.
  --background <value>    Example: auto, transparent, opaque.
  --format <format>       Example: png, jpeg, webp.
  --output-dir <path>     Defaults to outputs.
  --dry-run               Print the request payload without calling the API.
  --force                 Ignore provider guard cooldown and preflight failures.
  --no-preflight          Skip the safe GET /models check before image generation.
  --help                  Show this help.
`);
}

function step(message, detail) {
  stepIndex += 1;
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const suffix = detail ? ` - ${detail}` : "";
  console.error(`[${stepIndex}] ${message}${suffix} (${elapsed}s)`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

main().catch((error) => fail(error.stack ?? error.message));
