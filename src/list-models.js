import { loadEnvFiles, resolveApiKey, buildHeaders } from "./common.js";

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

function fail(message) {
  console.error(message);
  process.exit(1);
}

main().catch((error) => fail(error.stack ?? error.message));
