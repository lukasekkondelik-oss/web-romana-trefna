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

// The detail endpoint (confirmed against the real feed) does NOT use fixed
// named elements like the list endpoint — instead each property is a
// <property><column name="..." description="...">...</column>...</property>
// generic name/value list. Build a name -> value lookup from it.
function locatePropertyNode(parsedDoc) {
  const root = pick(parsedDoc, ["properties", "status", "property", "nemovitost", "data"]) ?? parsedDoc;
  let propertyNode = pick(root, ["property", "nemovitost", "data"]) ?? root;
  if (Array.isArray(propertyNode)) propertyNode = propertyNode[0];
  return propertyNode;
}

function buildColumnMap(propertyNode) {
  const columns = toArray(propertyNode?.column);
  const map = {};
  for (const col of columns) {
    const name = col?.["@_name"];
    if (!name) continue;
    const textVal = col?.column_text_value;
    const itemVal = col?.column_item_value;
    const hasText = textVal !== undefined && textVal !== null && textVal !== "";
    map[name] = { value: hasText ? textVal : itemVal, description: col?.["@_description"] };
  }
  return map;
}

/**
 * For diagnosing the real feed: returns every column's name/description and
 * whether it carries a value, without dumping (potentially huge) text
 * values into the log.
 */
export function summarizeDetailColumns(parsedDoc) {
  const propertyNode = locatePropertyNode(parsedDoc);
  return toArray(propertyNode?.column).map((c) => ({
    name: c?.["@_name"],
    description: c?.["@_description"],
    hasValue: Boolean(c?.column_text_value) || (c?.column_item_value !== undefined && c?.column_item_value !== ""),
  }));
}

/**
 * Normalizes one detail-endpoint document into the property shape stored in
 * data/urbium-properties.json (see docs/urbium-sync.md for the full shape).
 * `knownPropertyId` is the ID we already have from the list endpoint — used
 * as a fallback since the detail payload's own ID field is unconfirmed.
 */
export function mapDetailEntry(parsedDoc, knownPropertyId) {
  const propertyNode = locatePropertyNode(parsedDoc);
  const columns = buildColumnMap(propertyNode);

  function field(...names) {
    for (const name of names) {
      const col = columns[name];
      if (col && col.value !== undefined && col.value !== "") return text(col.value);
    }
    return text(pick(propertyNode, names));
  }

  const propertyId = field("id", "property_id", "propertyId") || text(knownPropertyId);
  const status = field("stav", "status", "state") || "unknown";
  const lastModified = normalizeTimestamp(
    field("datum_modifikace", "last_modified", "modified", "date_modified", "datum_zmeny", "lastModified", "modification_date")
  );

  // "popisz" (title) and "popis" (description) confirmed from the real feed.
  const title = field("popisz", "nazev", "title", "name", "predmet") || "Nemovitost";
  const description = field("popis", "description", "text") || "";
  const location = field("lokalita", "obec", "mesto", "location", "city") || "";
  const address = field("adresa", "ulice", "address", "street") || location;
  const areaRaw = field("plocha", "uzitna_plocha", "plocha_uzitna", "area", "usable_area");
  const area = areaRaw ? Number(String(areaRaw).replace(/[^\d.]/g, "")) || null : null;
  const layout = field("dispozice", "layout", "disposition") || "";
  // "typ_nemovitosti_u" (refined type, e.g. "Rodinný dům") confirmed from the real feed.
  const propertyType = field("typ_nemovitosti_u", "typ_nemovitosti", "typ", "type", "kategorie", "category") || "";

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
    ...parsePrice({ cena: field("cena", "cena_czk", "price_czk", "price") }),
    images: parseImages(propertyNode),
    videos: parseVideos(propertyNode),
  };
}
