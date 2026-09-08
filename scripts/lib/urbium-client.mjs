import { XMLParser } from "fast-xml-parser";
import {
  listUrl,
  detailUrl,
  REQUEST_TIMEOUT_MS,
  REQUEST_MAX_RETRIES,
  REQUEST_RETRY_BASE_DELAY_MS,
  USER_AGENT,
  URBIUM_USERNAME,
  URBIUM_PASSWORD,
} from "../config.mjs";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (tagName) =>
    // Urbium's exact repeating-element tag name is confirmed on first real
    // run against the live feed (see rollout step 3) — list every plausible
    // candidate so a single node still parses to an array, not a bare object.
    ["property", "nemovitost", "item", "row"].includes(tagName),
});

function maskUrl(url) {
  return url
    .replace(new RegExp(`username=${URBIUM_USERNAME}`), "username=***")
    .replace(new RegExp(`password=${URBIUM_PASSWORD}`), "password=***");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchXml(url) {
  let lastError;
  for (let attempt = 0; attempt <= REQUEST_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/xml,text/xml" },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        // 4xx (bad credentials/URL) won't be fixed by retrying — fail fast.
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`Urbium request failed with ${response.status} ${response.statusText}: ${maskUrl(url)}`);
        }
        throw new RetryableError(`Urbium request failed with ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      return parser.parse(text);
    } catch (err) {
      clearTimeout(timeout);
      lastError = err;
      if (!(err instanceof RetryableError) && !isNetworkError(err)) {
        throw err;
      }
      if (attempt < REQUEST_MAX_RETRIES) {
        const delay = REQUEST_RETRY_BASE_DELAY_MS * Math.pow(3, attempt);
        console.warn(`Urbium request attempt ${attempt + 1} failed (${err.message}), retrying in ${delay}ms`);
        await sleep(delay);
      }
    }
  }
  throw new Error(`Urbium request failed after ${REQUEST_MAX_RETRIES + 1} attempts: ${lastError?.message}`, {
    cause: lastError,
  });
}

class RetryableError extends Error {}

function isNetworkError(err) {
  return err?.name === "AbortError" || err?.code === "ECONNRESET" || err?.code === "ETIMEDOUT" || err instanceof TypeError;
}

export async function fetchList() {
  return fetchXml(listUrl());
}

export async function fetchDetail(propertyId) {
  return fetchXml(detailUrl(propertyId));
}
