import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  buildHeaders,
  joinUrl,
  loadEnvFiles,
  makeFilename,
  parseJson,
  readNumber,
  readPositiveInteger,
  readPromptFile,
  readValue,
  resolveApiKey,
  truncate,
} from "./common.js";

const DEFAULTS = {
  baseUrl: "https://api.openai.com/v1",
  chatPath: "/chat/completions",
  model: "gpt-image-2",
  outputDir: "outputs",
  maxBodyChars: 6000,
};

let stepIndex = 0;
const startedAt = Date.now();

async function main() {
  step("Loading environment files", ".env, .env.active");
  const env = await loadEnvFiles([".env", ".env.active"]);

  step("Parsing command line arguments");
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    printHelp();
    return;
  }

  const prompt = await resolvePrompt(cli);
  if (!prompt) {
    fail("Prompt file is empty after trimming.");
  }

  const apiKey = resolveApiKey(env);
  if (!apiKey) {
    fail("Missing API key. Run: node src/doctor.js");
  }

  const options = {
    apiUrl: cli.apiUrl ?? env.OPENAI_CHAT_COMPLETIONS_URL,
    baseUrl: cli.baseUrl ?? env.OPENAI_BASE_URL ?? DEFAULTS.baseUrl,
    chatPath: env.OPENAI_CHAT_COMPLETIONS_PATH ?? DEFAULTS.chatPath,
    maxBodyChars: cli.maxBodyChars ?? DEFAULTS.maxBodyChars,
    model: cli.model ?? env.OPENAI_IMAGE_MODEL ?? DEFAULTS.model,
    outputDir: cli.outputDir ?? DEFAULTS.outputDir,
    saveImages: cli.saveImages,
    temperature: cli.temperature,
  };

  const apiUrl = options.apiUrl ?? joinUrl(options.baseUrl, options.chatPath);
  const payload = buildPayload(prompt, options);
  step("Prepared chat completions request", `model=${payload.model}, url=${apiUrl}`);

  if (cli.dryRun) {
    step("Dry-run enabled", "printing request without calling the API");
    console.log(JSON.stringify({ url: apiUrl, payload }, null, 2));
    return;
  }

  step("Sending chat completions request", "real external request");
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: buildHeaders(env, apiKey),
    body: JSON.stringify(payload),
  });

  step("Received response headers", `status=${response.status}`);
  const requestId = getRequestId(response.headers);
  if (requestId) {
    step("Provider request id", requestId);
  }

  step("Reading response body");
  const rawBody = await response.text();
  const body = parseJson(rawBody);

  printResponseSummary({ body, maxBodyChars: options.maxBodyChars, rawBody, response });

  if (!response.ok) {
    const detail = body?.error?.message ?? (truncate(rawBody, options.maxBodyChars) || response.statusText);
    fail(`Chat completions request failed (${response.status}): ${detail}`);
  }

  const found = findImageCandidates(body, rawBody);
  printImageCandidates(found);

  if (options.saveImages) {
    await saveBase64Images(found.base64Images, options.outputDir);
  }
}

function buildPayload(prompt, options) {
  const payload = {
    model: options.model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  };

  if (options.temperature !== undefined) {
    payload.temperature = options.temperature;
  }

  return payload;
}

function parseArgs(args) {
  const parsed = {
    dryRun: false,
    help: false,
    promptFile: "",
    promptParts: [],
    saveImages: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--save-images") {
      parsed.saveImages = true;
    } else if (arg === "--api-url") {
      parsed.apiUrl = readValue(args, ++index, arg);
    } else if (arg === "--base-url") {
      parsed.baseUrl = readValue(args, ++index, arg);
    } else if (arg === "--prompt-file") {
      parsed.promptFile = readValue(args, ++index, arg);
    } else if (arg === "--model") {
      parsed.model = readValue(args, ++index, arg);
    } else if (arg === "--max-body-chars") {
      parsed.maxBodyChars = readPositiveInteger(readValue(args, ++index, arg), arg);
    } else if (arg === "--output-dir") {
      parsed.outputDir = readValue(args, ++index, arg);
    } else if (arg === "--temperature") {
      parsed.temperature = readNumber(readValue(args, ++index, arg), arg);
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

async function resolvePrompt(cli) {
  const inlinePrompt = cli.prompt?.trim();
  if (inlinePrompt && cli.promptFile) {
    fail("Use either an inline prompt or --prompt-file <path>, not both.");
  }

  if (cli.promptFile) {
    step("Loading prompt file", cli.promptFile);
    return readPromptFile(cli.promptFile);
  }

  if (!inlinePrompt) {
    fail("Please provide a prompt or --prompt-file <path>.");
  }

  return inlinePrompt;
}

function printResponseSummary({ body, maxBodyChars, rawBody, response }) {
  const headers = {};
  for (const name of [
    "content-type",
    "cf-ray",
    "x-request-id",
    "request-id",
    "openai-request-id",
    "x-openai-request-id",
  ]) {
    const value = response.headers.get(name);
    if (value) {
      headers[name] = value;
    }
  }

  console.log(
    JSON.stringify(
      {
        status: response.status,
        headers,
        usage: body?.usage ?? null,
        firstChoice: summarizeFirstChoice(body),
        bodyPreview: truncate(rawBody, maxBodyChars),
      },
      null,
      2
    )
  );
}

function summarizeFirstChoice(body) {
  const choice = body?.choices?.[0];
  if (!choice) {
    return null;
  }

  const content = choice.message?.content ?? choice.text ?? "";
  return {
    finishReason: choice.finish_reason ?? null,
    messageRole: choice.message?.role ?? null,
    contentPreview: truncate(typeof content === "string" ? content : JSON.stringify(content), 1000),
  };
}

function findImageCandidates(body, rawBody) {
  const text = typeof rawBody === "string" ? rawBody : JSON.stringify(body);
  const urls = [...new Set(text.match(/https?:\/\/[^\s"'<>\\)]+/g) ?? [])];
  const likelyImageUrls = urls.filter((url) => /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(url));
  const dataUris = [...text.matchAll(/data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)/g)].map((match) => ({
    extension: extensionForMimePart(match[1]),
    value: match[2],
  }));
  const b64JsonValues = [];
  collectB64Json(body, b64JsonValues);

  return {
    base64Images: [...dataUris, ...b64JsonValues],
    likelyImageUrls,
    urls,
  };
}

function collectB64Json(value, output) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectB64Json(item, output);
    }
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if ((key === "b64_json" || key === "image_base64") && typeof nested === "string") {
      output.push({ extension: "png", value: nested });
    } else {
      collectB64Json(nested, output);
    }
  }
}

function printImageCandidates(found) {
  console.log("\nImage candidates:");
  console.log(`- URLs: ${found.urls.length}`);
  console.log(`- likely image URLs: ${found.likelyImageUrls.length}`);
  console.log(`- base64 images: ${found.base64Images.length}`);

  if (found.likelyImageUrls.length) {
    console.log("\nLikely image URLs:");
    for (const url of found.likelyImageUrls.slice(0, 20)) {
      console.log(`- ${url}`);
    }
  } else if (found.urls.length) {
    console.log("\nOther URLs found:");
    for (const url of found.urls.slice(0, 20)) {
      console.log(`- ${url}`);
    }
  }
}

async function saveBase64Images(images, outputDir) {
  if (!images.length) {
    step("No base64 images to save");
    return;
  }

  step("Saving base64 image candidates", `outputDir=${outputDir}`);
  await mkdir(outputDir, { recursive: true });

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const filename = makeFilename(`chat-candidate-${index + 1}`, image.extension, {
      fallback: "chat-candidate",
      prefix: "v4",
    });
    const outputPath = path.join(outputDir, filename);
    await writeFile(outputPath, Buffer.from(image.value, "base64"));
    console.log(`Saved image candidate to ${outputPath}`);
  }
}

function extensionForMimePart(mimePart) {
  return mimePart.toLowerCase().replace("jpeg", "jpg");
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
  node src/chat-completions-probe.js --prompt-file prompts/2.txt

Options:
  --prompt-file <path>    Read the prompt from a UTF-8 text file.
  --base-url <url>        OpenAI-compatible base URL. Defaults to OPENAI_BASE_URL.
  --api-url <url>         Full chat completions endpoint URL. Overrides base URL.
  --model <name>          Model name. Defaults to OPENAI_IMAGE_MODEL or gpt-image-2.
  --temperature <number>  Optional temperature value.
  --max-body-chars <n>    Response preview length. Defaults to ${DEFAULTS.maxBodyChars}.
  --save-images           Save base64 image candidates if any are found.
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
