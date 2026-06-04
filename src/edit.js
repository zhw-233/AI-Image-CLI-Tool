import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  baseUrlFromApiUrl,
  buildHeaders,
  joinUrl,
  loadEnvFiles,
  makeFilename,
  parseJson,
  readPromptFile,
  readValue,
  resolveApiKey,
  truncate,
} from "./common.js";

const DEFAULTS = {
  baseUrl: "https://api.openai.com/v1",
  editPath: "/images/edits",
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
  await loadEnvFiles([".env", ".env.active"], { mutateProcessEnv: true });

  step("Parsing command line arguments");
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    printHelp();
    return;
  }

  const prompt = await resolvePrompt(
    cli,
    "Please provide an edit prompt. Example: npm run edit -- --image outputs/base.png \"Change the background to pale blue\""
  );
  if (!prompt) {
    fail("Prompt file is empty after trimming.");
  }

  if (!cli.images.length) {
    fail("Please provide at least one input image with --image <path>.");
  }

  const options = {
    apiUrl: cli.apiUrl ?? process.env.OPENAI_IMAGE_EDITS_URL,
    baseUrl: cli.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULTS.baseUrl,
    editPath: process.env.OPENAI_IMAGE_EDIT_PATH ?? DEFAULTS.editPath,
    model: cli.model ?? process.env.OPENAI_IMAGE_MODEL ?? DEFAULTS.model,
    size: cli.size ?? process.env.IMAGE_SIZE ?? DEFAULTS.size,
    quality: cli.quality ?? process.env.IMAGE_QUALITY ?? DEFAULTS.quality,
    background: cli.background ?? process.env.IMAGE_BACKGROUND ?? DEFAULTS.background,
    outputFormat: cli.format ?? process.env.IMAGE_OUTPUT_FORMAT ?? DEFAULTS.outputFormat,
    outputDir: cli.outputDir ?? DEFAULTS.outputDir,
    images: cli.images,
    mask: cli.mask,
  };

  const apiUrl = options.apiUrl ?? joinUrl(options.baseUrl, options.editPath);
  const fields = buildFields(prompt, options);
  step("Prepared edit request", `model=${fields.model}, url=${apiUrl}, images=${options.images.length}`);

  await assertReadableFiles(options.images, "image");
  if (options.mask) {
    await assertReadableFiles([options.mask], "mask");
  }

  if (cli.dryRun) {
    step("Dry-run enabled", "printing request without calling the API");
    console.log(JSON.stringify({ url: apiUrl, fields, images: options.images, mask: options.mask ?? null }, null, 2));
    return;
  }

  step("Resolving API key");
  const apiKey = resolveApiKey(process.env);
  if (!apiKey) {
    fail("Missing API key. Set OPENAI_API_KEY, or set OPENAI_API_KEY_ENV to the name of another key variable.");
  }

  const headers = buildHeaders(process.env, apiKey, { contentType: undefined });
  step("Building multipart form data");
  const form = await buildFormData(fields, options);

  step("Sending image edit request", "real external request");
  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: form,
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
    fail(`OpenAI API request failed (${response.status}): ${detail}`);
  }

  step("Reading edited image data from response");
  if (!body) {
    fail(`API response was not JSON. Raw response: ${truncate(rawBody)}`);
  }

  const imageBase64 = body?.data?.[0]?.b64_json;
  if (!imageBase64) {
    fail(`No image data returned. Response: ${JSON.stringify(body, null, 2)}`);
  }

  step("Saving edited image file", `outputDir=${options.outputDir}`);
  await mkdir(options.outputDir, { recursive: true });
  const filename = makeFilename(prompt, options.outputFormat, { fallback: "edited-image" });
  const outputPath = path.join(options.outputDir, filename);
  await writeFile(outputPath, Buffer.from(imageBase64, "base64"));

  step("Done", outputPath);
  console.log(`Saved edited image to ${outputPath}`);
}

function buildFields(prompt, options) {
  const fields = {
    model: options.model,
    prompt,
    size: options.size,
    quality: options.quality,
    background: options.background,
    output_format: options.outputFormat,
  };

  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== "auto" && value !== "")
  );
}

async function buildFormData(fields, options) {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }

  for (const imagePath of options.images) {
    await appendFile(form, "image", imagePath);
  }

  if (options.mask) {
    await appendFile(form, "mask", options.mask);
  }

  return form;
}

async function appendFile(form, fieldName, filePath) {
  const bytes = await readFile(filePath);
  const mimeType = mimeTypeFor(filePath);
  const blob = new Blob([bytes], { type: mimeType });
  form.append(fieldName, blob, path.basename(filePath));
}

function parseArgs(args) {
  const parsed = {
    dryRun: false,
    help: false,
    images: [],
    promptFile: "",
    promptParts: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--image") {
      parsed.images.push(readValue(args, ++index, arg));
    } else if (arg === "--mask") {
      parsed.mask = readValue(args, ++index, arg);
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

async function assertReadableFiles(files, label) {
  for (const file of files) {
    if (!existsSync(file)) {
      fail(`Input ${label} does not exist: ${file}`);
    }

    await readFile(file).catch((error) => {
      fail(`Could not read input ${label} ${file}: ${error.message}`);
    });
  }
}

function mimeTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  return "image/png";
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

function printHelp() {
  console.log(`
Usage:
  npm run edit -- --image <path> "Describe the desired change"

Examples:
  npm run edit -- --image outputs/base.png "Keep the apple, change the background to pale blue"
  npm run edit -- --image outputs/base.png --mask masks/bg.png "Replace only the masked background with a sunny kitchen"

Options:
  --image <path>          Input image. Can be repeated for references.
  --mask <path>           Optional mask image for partial edits.
  --base-url <url>        OpenAI-compatible base URL. Defaults to OPENAI_BASE_URL.
  --api-url <url>         Full image edits endpoint URL. Overrides base URL.
  --prompt-file <path>    Read the prompt from a UTF-8 text file.
  --model <name>          Image model. Defaults to OPENAI_IMAGE_MODEL or gpt-image-2.
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
