import fs from "node:fs/promises";
import { INDEX_HTML, LISTINGS_MARKER_START, LISTINGS_MARKER_END, PLACEHOLDER_IMAGE, MAX_HOMEPAGE_CARDS } from "../config.mjs";

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortDescription(description, max = 140) {
  const text = String(description || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

function cardHtml(property) {
  const photo = property.images[0];
  const photoSrc = photo ? photo.localPath : PLACEHOLDER_IMAGE;
  const typeLabel = property.propertyType || "Nemovitost";
  const areaLabel = property.area ? `${typeLabel} · ${property.area} m²` : typeLabel;

  return `        <a class="listing-card" href="${property.url.replace(/^\//, "")}">
          <div class="listing-card__media">
            <img src="${photoSrc}" alt="${escapeHtml(property.title)}" width="1024" height="768" loading="lazy" />
            <span class="listing-tag">V nabídce</span>
          </div>
          <div class="listing-card__body">
            <p class="listing-card__loc">${escapeHtml(property.location || "")}</p>
            <h3 class="listing-card__title">${escapeHtml(property.title)}</h3>
            <p class="listing-card__desc">${escapeHtml(shortDescription(property.description))}</p>
            <div class="listing-card__meta"><span>${escapeHtml(areaLabel)}</span><span>${escapeHtml(property.priceDisplay || "Cena na vyžádání")}</span></div>
          </div>
        </a>`;
}

export async function renderIndexListings(state) {
  const active = Object.values(state.properties)
    .filter((p) => p.ourStatus === "active")
    .sort((a, b) => new Date(b.urbiumLastModified || 0) - new Date(a.urbiumLastModified || 0))
    .slice(0, MAX_HOMEPAGE_CARDS);

  const block = active.length
    ? `\n${active.map(cardHtml).join("\n\n")}\n\n        `
    : "\n        ";

  const html = await fs.readFile(INDEX_HTML, "utf8");
  const startIdx = html.indexOf(LISTINGS_MARKER_START);
  const endIdx = html.indexOf(LISTINGS_MARKER_END);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`index.html is missing the URBIUM:LISTINGS markers — cannot safely regenerate the listings block.`);
  }

  const before = html.slice(0, startIdx + LISTINGS_MARKER_START.length);
  const after = html.slice(endIdx);
  const updated = `${before}${block}${after}`;

  if (updated !== html) {
    await fs.writeFile(INDEX_HTML, updated, "utf8");
    return true;
  }
  return false;
}
