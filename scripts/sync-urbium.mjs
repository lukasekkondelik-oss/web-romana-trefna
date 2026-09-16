import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { fetchList, fetchDetail } from "./lib/urbium-client.mjs";
import { extractListEntries, mapDetailEntry, summarizeDetailColumns } from "./lib/xml-schema.mjs";
import { loadState, saveStateAtomic } from "./lib/state.mjs";
import { buildActionQueue } from "./lib/diff.mjs";
import { generateSlugAndPaths } from "./lib/slug.mjs";
import { syncPropertyImages } from "./lib/images.mjs";
import { renderPropertyPage } from "./lib/render-property-page.mjs";
import { renderIndexListings } from "./lib/render-index.mjs";
import { renderSitemapUrls } from "./lib/render-sitemap.mjs";
import { MAX_ACTIONS_PER_RUN, DETAIL_CALL_DELAY_MS, DETAIL_CALL_JITTER_MS, FAILURE_ABORT_THRESHOLD } from "./config.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function contentHash(normalized) {
  const stable = JSON.stringify(normalized, Object.keys(normalized).sort());
  return `sha256:${crypto.createHash("sha256").update(stable).digest("hex")}`;
}

async function writePropertyPageFile(property) {
  const html = await renderPropertyPage(property);
  const filePath = path.join(process.cwd(), property.pageFile);
  await fs.writeFile(filePath, html, "utf8");
}

async function processInsertOrUpdate(state, action) {
  const now = new Date().toISOString();
  const existing = state.properties[action.propertyId];

  const detailDoc = await fetchDetail(action.propertyId);
  const normalized = mapDetailEntry(detailDoc, action.propertyId);
  if (!normalized.propertyId) {
    throw new Error(`Detail response for property ${action.propertyId} is missing a property id — skipping`);
  }

  const { slug, pageFile, url } = existing
    ? { slug: existing.slug, pageFile: existing.pageFile, url: existing.url }
    : generateSlugAndPaths(normalized.title, action.propertyId);

  const images = await syncPropertyImages(action.propertyId, normalized.images, existing?.images ?? []);

  const hash = contentHash(normalized);
  const unchanged = existing && existing.contentHash === hash && existing.ourStatus === "active";

  const property = {
    propertyId: action.propertyId,
    slug,
    pageFile,
    url,
    ourStatus: "active",
    urbiumStatusRaw: normalized.urbiumStatusRaw,
    urbiumLastModifiedRaw: normalized.urbiumLastModifiedRaw,
    urbiumLastModified: normalized.urbiumLastModifiedRaw ? new Date(normalized.urbiumLastModifiedRaw).toISOString() : now,
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenInListAt: now,
    ourLastSyncedAt: now,
    contentHash: hash,
    title: normalized.title,
    price: normalized.price,
    priceDisplay: normalized.priceDisplay,
    location: normalized.location,
    address: normalized.address,
    area: normalized.area,
    layout: normalized.layout,
    propertyType: normalized.propertyType,
    description: normalized.description,
    images,
    videos: normalized.videos,
  };

  state.properties[action.propertyId] = property;

  if (!unchanged) {
    await writePropertyPageFile(property);
  }

  console.log(`${action.action === "insert" ? "Inserted" : "Updated"} property ${action.propertyId} (${property.title})`);
}

async function processDeactivate(state, action) {
  const existing = state.properties[action.propertyId];
  if (!existing) return;
  existing.ourStatus = "hidden";
  await writePropertyPageFile(existing);
  console.log(`Deactivated property ${action.propertyId} (${existing.title}) — flagged hidden, kept for history`);
}

async function run() {
  const state = await loadState();
  const now = new Date().toISOString();

  console.log("Fetching Urbium property list…");
  const listDoc = await fetchList();
  const listEntries = extractListEntries(listDoc);
  console.log(`Urbium list returned ${listEntries.length} properties.`);
  state.lastListFetchAt = now;

  if (process.env.DEBUG_SCHEMA === "true" || process.env.DEBUG_SCHEMA === "1") {
    console.log("DEBUG_SCHEMA: raw parsed list document —");
    console.log(JSON.stringify(listDoc, null, 2).slice(0, 4000));
    console.log("DEBUG_SCHEMA: first normalized list entry —", JSON.stringify(listEntries[0]));
    if (listEntries[0]) {
      const debugDetailDoc = await fetchDetail(listEntries[0].propertyId);
      // The detail endpoint uses a generic name/value "column" list, and
      // some values (e.g. the description) can be several KB of text — dump
      // just the name/description/has-value catalog so nothing gets cut off.
      console.log("DEBUG_SCHEMA: detail column catalog for first property —");
      console.log(JSON.stringify(summarizeDetailColumns(debugDetailDoc), null, 2));
      console.log(
        "DEBUG_SCHEMA: first normalized detail entry —",
        JSON.stringify(mapDetailEntry(debugDetailDoc, listEntries[0].propertyId))
      );
    }
  }

  const queue = buildActionQueue(state, listEntries, now);
  const batch = queue.slice(0, MAX_ACTIONS_PER_RUN);
  const remaining = queue.slice(MAX_ACTIONS_PER_RUN);

  console.log(`Action queue: ${queue.length} total, processing ${batch.length} this run, ${remaining.length} carried over.`);

  let consecutiveFailures = 0;
  const processedIds = new Set();
  let networkActionsSeen = 0;
  const networkActionsInBatch = batch.filter((a) => a.action !== "deactivate").length;

  for (const action of batch) {
    try {
      if (action.action === "deactivate") {
        await processDeactivate(state, action);
      } else {
        await processInsertOrUpdate(state, action);
      }
      processedIds.add(action.propertyId);
      consecutiveFailures = 0;
    } catch (err) {
      console.error(`Action failed for property ${action.propertyId} (${action.action}): ${err.message}`);
      consecutiveFailures++;
      if (consecutiveFailures >= FAILURE_ABORT_THRESHOLD) {
        throw new Error(
          `Aborting run after ${consecutiveFailures} consecutive failures — likely an Urbium outage. State from this run will not be saved.`,
          { cause: err }
        );
      }
    }

    if (action.action !== "deactivate") {
      networkActionsSeen++;
      if (networkActionsSeen < networkActionsInBatch) {
        const delay = DETAIL_CALL_DELAY_MS + Math.round((Math.random() * 2 - 1) * DETAIL_CALL_JITTER_MS);
        console.log(`Waiting ${Math.round(delay / 1000)}s before next Urbium detail call…`);
        await sleep(delay);
      }
    }
  }

  state.pendingActions = [...remaining, ...batch.filter((a) => !processedIds.has(a.propertyId))];
  state.lastSyncRunAt = new Date().toISOString();

  console.log("Regenerating homepage listings block…");
  const indexChanged = await renderIndexListings(state);

  console.log("Regenerating sitemap block…");
  const sitemapChanged = await renderSitemapUrls(state);

  await saveStateAtomic(state);

  console.log(
    `Sync run complete. Processed ${processedIds.size}/${batch.length} queued actions. ` +
      `index.html ${indexChanged ? "changed" : "unchanged"}, sitemap.xml ${sitemapChanged ? "changed" : "unchanged"}.`
  );
}

run().catch((err) => {
  console.error("Urbium sync failed:", err);
  process.exitCode = 1;
});
