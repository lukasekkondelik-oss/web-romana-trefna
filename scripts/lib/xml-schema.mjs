// This is the ONE file that should need editing if Urbium's real XML field
// names turn out to differ from what's assumed here. Both mapping functions
// are tolerant: they try several plausible key names (Czech/English, snake
// and camel case) for every field, so a single wrong guess doesn't break the
// whole sync — but they should still be verified against the real feed on
// first run (see docs/urbium-sync.md, "Rollout" / diagnostic step) and this
// file corrected accordingly.

function pick(obj, candidates) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const key of candidates) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  // Case-insensitive fallback.
  const lowerMap = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k]));
  for (const key of candidates) {
    const realKey = lowerMap.get(key.toLowerCase());
    if (realKey && obj[realKey] !== undefined && obj[realKey] !== null && obj[realKey] !== "") {
      return obj[realKey];
    }
  }
  return undefined;
}

function text(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object") {
    if ("@_description" in value) return String(value["@_description"]).trim();
    if ("#text" in value) return String(value["#text"]).trim();
  }
  return String(value).trim();
}

// Urbium's timestamps come as "YYYY-MM-DD HH:mm:ss" (space, not ISO's "T").
function normalizeTimestamp(raw) {
  if (!raw) return null;
  return raw.includes("T") ? raw : raw.replace(" ", "T");
}

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Normalizes one entry from the list endpoint into
 * { propertyId, status, lastModified } (lastModified as raw string — parsed
 * to a Date by scripts/lib/diff.mjs).
 */
export function mapListEntry(raw) {
  const propertyId = text(pick(raw, ["id", "property_id", "propertyId", "ID"]));
  const status = text(pick(raw, ["stav", "status", "state"]));
  const lastModified = normalizeTimestamp(
    text(pick(raw, ["datum_modifikace", "last_modified", "modified", "date_modified", "datum_zmeny", "lastModified", "modification_date"]))
  );

  if (!propertyId) return null;
  return { propertyId, status: status || "unknown", lastModified: lastModified || null };
}

/**
 * Extracts the array of property nodes from a parsed list-endpoint document,
 * whatever the outer wrapper element(s) turn out to be named. Urbium's real
 * feed nests it as root.status.properties.property[].
 */
export function extractListEntries(parsedDoc) {
  const root = pick(parsedDoc, ["status", "properties", "list", "nemovitosti", "export", "data"]) ?? parsedDoc;
  const propertiesNode = pick(root, ["properties", "list", "nemovitosti"]) ?? root;
  const items = pick(propertiesNode, ["property", "nemovitost", "item", "row"]);
  return toArray(items).map(mapListEntry).filter(Boolean);
}

function parsePrice(raw) {
  const priceRaw = text(pick(raw, ["cena", "price", "cena_czk", "price_czk"]));
  if (!priceRaw) return { price: null, priceDisplay: "Cena na vyžádání" };
  const numeric = Number(String(priceRaw).replace(/[^\d]/g, ""));
  if (!numeric) return { price: null, priceDisplay: "Cena na vyžádání" };
  return { price: numeric, priceDisplay: `${numeric.toLocaleString("cs-CZ")} Kč` };
}

function parseImages(raw) {
  const photosNode = pick(raw, ["fotografie", "obrazky", "photos", "images", "gallery"]);
  const photoItems = toArray(pick(photosNode, ["foto", "photo", "image", "item"]) ?? photosNode);
  return photoItems
    .map((item) => text(item?.url ?? item?.["@_url"] ?? item))
    .filter(Boolean)
    .map((sourceUrl) => ({ sourceUrl }));
}

function parseVideos(raw) {
  const videosNode = pick(raw, ["videa", "videos", "video"]);
  const videoItems = toArray(videosNode);
  return videoItems
    .map((item) => text(item?.url ?? item?.["@_url"] ?? item))
    .filter(Boolean)
    .map((sourceUrl) => ({
      sourceUrl,
      kind: /youtube|vimeo|youtu\.be/i.test(sourceUrl) ? "embed" : "downloaded",
    }));
}

/**
 * Normalizes one detail-endpoint document into the property shape stored in
 * data/urbium-properties.json (see docs/urbium-sync.md for the full shape).
 */
export function mapDetailEntry(parsedDoc) {
  // The list endpoint turned out to wrap everything under a "status" element
  // (see extractListEntries) — try that first, then fall back to a bare
  // "property" node in case the detail endpoint isn't wrapped the same way.
  let raw = pick(parsedDoc, ["status", "property", "nemovitost", "data"]) ?? parsedDoc;
  // If we landed on a status/wrapper object rather than the property itself,
  // drill one level further into its nested property node.
  if (raw && typeof raw === "object" && !Array.isArray(raw) && !("id" in raw) && !("property_id" in raw)) {
    raw = pick(raw, ["property", "nemovitost", "data"]) ?? raw;
  }
  // The list/detail parser forces repeating tag names into arrays even when
  // the detail endpoint returns a single node — unwrap that here.
  if (Array.isArray(raw)) raw = raw[0];

  const propertyId = text(pick(raw, ["id", "property_id", "propertyId", "ID"]));
  const status = text(pick(raw, ["stav", "status", "state"])) || "unknown";
  const lastModified = normalizeTimestamp(
    text(pick(raw, ["datum_modifikace", "last_modified", "modified", "date_modified", "datum_zmeny", "lastModified", "modification_date"]))
  );

  const title = text(pick(raw, ["nazev", "title", "name", "predmet"])) || "Nemovitost";
  const description = text(pick(raw, ["popis", "description", "text"])) || "";
  const location = text(pick(raw, ["lokalita", "location", "obec", "city"])) || "";
  const address = text(pick(raw, ["adresa", "address", "street", "ulice"])) || location;
  const areaRaw = text(pick(raw, ["plocha", "uzitna_plocha", "area", "usable_area"]));
  const area = areaRaw ? Number(String(areaRaw).replace(/[^\d.]/g, "")) || null : null;
  const layout = text(pick(raw, ["dispozice", "layout", "disposition"])) || "";
  const propertyType = text(pick(raw, ["typ", "type", "kategorie", "category"])) || "";

  return {
    propertyId,
    urbiumStatusRaw: status,
    urbiumLastModifiedRaw: lastModified,
    title,
    description,
    location,
    address,
    area,
    layout,
    propertyType,
    ...parsePrice(raw),
    images: parseImages(raw),
    videos: parseVideos(raw),
  };
}
