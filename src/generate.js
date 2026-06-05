import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";
import {
  baseUrlFromApiUrl,
  buildHeaders,
  ENV_NAMES,
  joinUrl,
  loadEnvFiles,
  makeFilename,
  parseJson,
  readEnv,
  readPromptFile,
  readValue,
  resolveApiKey,
  truncate,
} from "./common.js";

const DEFAULTS = {
  baseUrl: "https://your-image-api.example.com/v1",
  imagePath: "/images/generations",
  model: "image-model",
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
  await loadEnvFiles([".env", ".env.active"], { mutateProcessEnv: true });

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
    apiUrl: cli.apiUrl ?? readEnv(process.env, ENV_NAMES.generationsUrl),
    baseUrl: cli.baseUrl ?? readEnv(process.env, ENV_NAMES.baseUrl, DEFAULTS.baseUrl),
    imagePath: readEnv(process.env, ENV_NAMES.generationPath, DEFAULTS.imagePath),
    model: cli.model ?? readEnv(process.env, ENV_NAMES.model, DEFAULTS.model),
    size: cli.size ?? process.env.IMAGE_SIZE ?? DEFAULTS.size,
    quality: cli.quality ?? process.env.IMAGE_QUALITY ?? DEFAULTS.quality,
    background: cli.background ?? process.env.IMAGE_BACKGROUND ?? DEFAULTS.background,
    outputFormat: cli.format ?? process.env.IMAGE_OUTPUT_FORMAT ?? DEFAULTS.outputFormat,
    outputDir: cli.outputDir ?? DEFAULTS.outputDir,
  };

  const apiUrl = options.apiUrl ?? joinUrl(options.baseUrl, options.imagePath);
  const payload = buildPayload(prompt, options);
  step("Prepared request", `model=${payload.model}, url=${apiUrl}`);

  if (cli.dryRun) {
    step("Dry-run enabled", "printing request without calling the API");
    console.log(JSON.stringify({ url: apiUrl, payload }, null, 2));
    return;
  }

  step("Resolving API key");
  const apiKey = resolveApiKey(process.env);
  if (!apiKey) {
    fail("Missing API key. Set IMAGE_API_KEY, or set IMAGE_API_KEY_ENV to the name of another key variable.");
  }

  const headers = buildHeaders(process.env, apiKey);
  step("Sending image generation request", "real external request");
  const response = await fetch(apiUrl, {
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
  const rawBody = await response.text();

  step("Parsing response body", `${rawBody.length} bytes`);
  const body = parseJson(rawBody);
  if (!response.ok) {
    const detail = body?.error?.message ?? (truncate(rawBody) || response.statusText);
    fail(`Image API request failed (${response.status}): ${detail}`);
  }

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
  const outputPath = `${options.outputDir}/${filename}`;
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

function getRequestId(headers) {
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

function printHelp() {
  console.log(`
Usage:
  npm run generate -- "A precise prompt"

Options:
  --base-url <url>        Image API base URL. Defaults to IMAGE_API_BASE_URL.
  --api-url <url>         Full image generation endpoint URL. Overrides base URL.
  --prompt-file <path>    Read the prompt from a UTF-8 text file.
  --model <name>          Image model. Defaults to IMAGE_API_MODEL.
  --size <size>           Example: 1024x1024, 1024x1536, 1536x1024.
  --quality <quality>     Example: auto, low, medium, high.
  --background <value>    Example: auto, transparent, opaque.
  --format <format>       Example: png, jpeg, webp.
  --output-dir <path>     Defaults to outputs.
  --dry-run               Print the request payload without calling the API.
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
