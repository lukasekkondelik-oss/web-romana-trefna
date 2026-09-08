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
  if (typeof value === "object" && "#text" in value) return String(value["#text"]).trim();
  return String(value).trim();
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
  const propertyId = text(pick(raw, ["property_id", "id", "propertyId", "ID"]));
  const status = text(pick(raw, ["status", "stav", "state"]));
  const lastModified = text(
    pick(raw, ["last_modified", "modified", "date_modified", "datum_zmeny", "lastModified", "modification_date"])
  );

  if (!propertyId) return null;
  return { propertyId, status: status || "unknown", lastModified: lastModified || null };
}

/**
 * Extracts the array of property nodes from a parsed list-endpoint document,
 * whatever the outer wrapper element(s) turn out to be named.
 */
export function extractListEntries(parsedDoc) {
  const root = pick(parsedDoc, ["properties", "list", "nemovitosti", "export", "data"]) ?? parsedDoc;
  const items = pick(root, ["property", "nemovitost", "item", "row"]);
  return toArray(items).map(mapListEntry).filter(Boolean);
}

function parsePrice(raw) {
  const priceRaw = text(pick(raw, ["price", "cena", "cena_czk", "price_czk"]));
  if (!priceRaw) return { price: null, priceDisplay: "Cena na vyžádání" };
  const numeric = Number(String(priceRaw).replace(/[^\d]/g, ""));
  if (!numeric) return { price: null, priceDisplay: "Cena na vyžádání" };
  return { price: numeric, priceDisplay: `${numeric.toLocaleString("cs-CZ")} Kč` };
}

function parseImages(raw) {
  const photosNode = pick(raw, ["photos", "images", "fotografie", "obrazky", "gallery"]);
  const photoItems = toArray(pick(photosNode, ["photo", "image", "foto", "item"]) ?? photosNode);
  return photoItems
    .map((item) => text(item?.url ?? item?.["@_url"] ?? item))
    .filter(Boolean)
    .map((sourceUrl) => ({ sourceUrl }));
}

function parseVideos(raw) {
  const videosNode = pick(raw, ["videos", "videa", "video"]);
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
  let raw = pick(parsedDoc, ["property", "nemovitost", "data"]) ?? parsedDoc;
  // The list/detail parser forces repeating tag names into arrays even when
  // the detail endpoint returns a single node — unwrap that here.
  if (Array.isArray(raw)) raw = raw[0];

  const propertyId = text(pick(raw, ["property_id", "id", "propertyId", "ID"]));
  const status = text(pick(raw, ["status", "stav", "state"])) || "unknown";
  const lastModified = text(
    pick(raw, ["last_modified", "modified", "date_modified", "datum_zmeny", "lastModified", "modification_date"])
  );

  const title = text(pick(raw, ["title", "name", "nazev", "predmet"])) || "Nemovitost";
  const description = text(pick(raw, ["description", "popis", "text"])) || "";
  const location = text(pick(raw, ["location", "lokalita", "city", "obec"])) || "";
  const address = text(pick(raw, ["address", "adresa", "street"])) || location;
  const areaRaw = text(pick(raw, ["area", "plocha", "usable_area", "uzitna_plocha"]));
  const area = areaRaw ? Number(String(areaRaw).replace(/[^\d.]/g, "")) || null : null;
  const layout = text(pick(raw, ["layout", "dispozice", "disposition"])) || "";
  const propertyType = text(pick(raw, ["type", "typ", "category", "kategorie"])) || "";

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
