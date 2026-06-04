import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const DEFAULTS = {
  stateFile: ".provider-guard.json",
  cooldownSeconds: 30 * 60,
  preflightTimeoutMs: 10_000,
};

export async function runProviderGuard({
  apiKey,
  baseUrl,
  env,
  fail,
  force,
  headers,
  model,
  noPreflight,
  operation,
  step,
}) {
  const config = readGuardConfig(env);
  if (!config.enabled) {
    step("Provider guard disabled", "PROVIDER_GUARD=off");
    return;
  }

  const key = makeProviderKey(baseUrl, model);

  if (force) {
    step("Provider guard override", "--force was used");
    return;
  }

  const state = await readState(config.stateFile);
  const record = state.records?.[key];
  if (record?.blockedUntil && Date.now() < Date.parse(record.blockedUntil)) {
    fail(
      [
        "Provider guard stopped this request before calling the paid image API.",
        `Provider: ${baseUrl}`,
        `Model: ${model}`,
        `Blocked until: ${record.blockedUntil}`,
        `Last problem: ${record.lastStatus || "unknown"} ${record.lastError || ""}`.trim(),
        "No image request was sent, so this run should not consume image credits.",
        "Use --force only if you intentionally want to send the request anyway.",
      ].join("\n")
    );
  }

  if (noPreflight) {
    step("Skipping provider preflight", "--no-preflight was used");
    return;
  }

  if (!config.preflightEnabled) {
    step("Skipping provider preflight", "PROVIDER_PREFLIGHT=off");
    return;
  }

  await preflightModels({
    apiKey,
    baseUrl,
    config,
    fail,
    headers,
    key,
    model,
    operation,
    step,
  });
}

export async function recordProviderSuccess({ baseUrl, env, model, step }) {
  const config = readGuardConfig(env);
  if (!config.enabled) {
    return;
  }

  const key = makeProviderKey(baseUrl, model);
  const state = await readState(config.stateFile);
  if (!state.records?.[key]) {
    return;
  }

  delete state.records[key];
  await writeState(config.stateFile, state);
  step("Provider guard state cleared", "successful response received");
}

export async function recordProviderFailure({ baseUrl, detail, env, model, status, step }) {
  const config = readGuardConfig(env);
  if (!config.enabled || !isUnstableStatus(status)) {
    return;
  }

  const key = makeProviderKey(baseUrl, model);
  const now = Date.now();
  const blockedUntil = new Date(now + config.cooldownSeconds * 1000).toISOString();
  const state = await readState(config.stateFile);
  state.records ??= {};
  const current = state.records[key] ?? {};
  state.records[key] = {
    baseUrl,
    model,
    blockedUntil,
    failures: (current.failures ?? 0) + 1,
    lastAt: new Date(now).toISOString(),
    lastError: truncate(String(detail || ""), 300),
    lastStatus: status,
  };

  await writeState(config.stateFile, state);
  step("Provider guard cooldown started", `status=${status}, until=${blockedUntil}`);
}

function readGuardConfig(env) {
  return {
    cooldownSeconds: readPositiveInteger(env.PROVIDER_COOLDOWN_SECONDS, DEFAULTS.cooldownSeconds),
    enabled: !isOff(env.PROVIDER_GUARD),
    preflightEnabled: !isOff(env.PROVIDER_PREFLIGHT),
    preflightTimeoutMs: readPositiveInteger(env.PROVIDER_PREFLIGHT_TIMEOUT_MS, DEFAULTS.preflightTimeoutMs),
    stateFile: env.PROVIDER_GUARD_STATE || DEFAULTS.stateFile,
  };
}

async function preflightModels({ apiKey, baseUrl, config, fail, headers, key, model, operation, step }) {
  const url = joinUrl(baseUrl, "/models");
  step("Running provider preflight", `GET ${url}`);

  let response;
  let rawBody = "";
  try {
    response = await fetchWithTimeout(url, {
      headers,
      timeoutMs: config.preflightTimeoutMs,
    });
    rawBody = await response.text();
  } catch (error) {
    await recordPreflightFailure({
      baseUrl,
      config,
      detail: error.message,
      key,
      model,
      status: "network",
      step,
    });
    fail(
      [
        "Provider preflight failed before calling the paid image API.",
        `Operation: ${operation}`,
        `Reason: ${error.message}`,
        "The image request was not sent.",
        "If this provider does not support /models but image generation still works, run again with --no-preflight.",
      ].join("\n")
    );
  }

  step("Received provider preflight response", `status=${response.status}`);
  if (!response.ok) {
    const body = parseJson(rawBody);
    const detail = body?.error?.message ?? truncate(rawBody) ?? response.statusText;
    if (isUnstableStatus(response.status)) {
      await recordPreflightFailure({
        baseUrl,
        config,
        detail,
        key,
        model,
        status: response.status,
        step,
      });
    }

    fail(
      [
        "Provider preflight failed before calling the paid image API.",
        `Operation: ${operation}`,
        `Status: ${response.status}`,
        `Detail: ${detail || response.statusText}`,
        "The image request was not sent.",
        "Use --force only if you intentionally want to send the paid request anyway.",
      ].join("\n")
    );
  }

  const body = parseJson(rawBody);
  const ids = Array.isArray(body?.data) ? body.data.map((item) => item.id).filter(Boolean) : [];
  if (ids.length && !ids.includes(model)) {
    step("Provider preflight warning", `model ${model} was not listed by /models`);
  } else {
    step("Provider preflight passed", ids.length ? `model ${model} is listed` : "/models responded OK");
  }

  void apiKey;
}

async function fetchWithTimeout(url, { headers, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`preflight timed out after ${timeoutMs} ms`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function recordPreflightFailure({ baseUrl, config, detail, key, model, status, step }) {
  const now = Date.now();
  const blockedUntil = new Date(now + config.cooldownSeconds * 1000).toISOString();
  const state = await readState(config.stateFile);
  state.records ??= {};
  const current = state.records[key] ?? {};
  state.records[key] = {
    baseUrl,
    model,
    blockedUntil,
    failures: (current.failures ?? 0) + 1,
    lastAt: new Date(now).toISOString(),
    lastError: truncate(String(detail || ""), 300),
    lastStatus: status,
  };
  await writeState(config.stateFile, state);
  step("Provider guard cooldown started", `preflight=${status}, until=${blockedUntil}`);
}

async function readState(stateFile) {
  if (!existsSync(stateFile)) {
    return { records: {} };
  }

  try {
    const body = await readFile(stateFile, "utf8");
    const state = JSON.parse(body);
    return state && typeof state === "object" ? state : { records: {} };
  } catch {
    return { records: {} };
  }
}

async function writeState(stateFile, state) {
  const dir = path.dirname(stateFile);
  if (dir && dir !== ".") {
    await mkdir(dir, { recursive: true });
  }

  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

function isUnstableStatus(status) {
  return Number(status) === 524 || (Number(status) >= 500 && Number(status) <= 599);
}

function makeProviderKey(baseUrl, model) {
  return `${baseUrl.replace(/\/+$/g, "")}::${model}`;
}

function readPositiveInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function isOff(value) {
  return ["0", "false", "no", "off"].includes(String(value || "").trim().toLowerCase());
}

function joinUrl(baseUrl, pathname) {
  return `${baseUrl.replace(/\/+$/g, "")}/${pathname.replace(/^\/+/g, "")}`;
}

function parseJson(rawBody) {
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

function truncate(text, maxLength = 1000) {
  if (!text) {
    return "";
  }

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
