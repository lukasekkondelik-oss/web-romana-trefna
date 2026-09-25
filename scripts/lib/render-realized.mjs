import fs from "node:fs/promises";
import {
  INDEX_HTML,
  REALIZED_MARKER_START,
  REALIZED_MARKER_END,
  PLACEHOLDER_IMAGE,
  MAX_REALIZED_CARDS,
} from "../config.mjs";

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
            <span class="listing-tag is-sold">Realizováno</span>
          </div>
          <div class="listing-card__body">
            <p class="listing-card__loc">${escapeHtml(property.location || "")}</p>
            <h3 class="listing-card__title">${escapeHtml(property.title)}</h3>
            <p class="listing-card__desc">${escapeHtml(shortDescription(property.description))}</p>
            <div class="listing-card__meta"><span>${escapeHtml(areaLabel)}</span><span>${escapeHtml(property.priceDisplay || "Cena na vyžádání")}</span></div>
          </div>
        </a>`;
}

function sectionHtml(realized) {
  return `  <section class="section section--alt" id="realizace">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Realizované obchody</span>
        <h2 class="section-title">Nemovitosti, které jsem už úspěšně prodala nebo pronajala.</h2>
      </div>

      <div class="grid grid--3">
${realized.map(cardHtml).join("\n\n")}
      </div>
    </div>
  </section>`;
}

// Renders the "Realizované obchody" showcase section — properties that were
// once active via Urbium and later dropped off the feed (ourStatus !==
// "active"), kept for history per Urbium's recommendation. The whole
// section is omitted (not just left empty) until there's at least one to
// show, so the homepage never displays an empty showcase.
export async function renderRealizedListings(state) {
  const realized = Object.values(state.properties)
    .filter((p) => p.ourStatus === "realized")
    .sort((a, b) => new Date(b.urbiumLastModified || 0) - new Date(a.urbiumLastModified || 0))
    .slice(0, MAX_REALIZED_CARDS);

  const block = realized.length ? `\n${sectionHtml(realized)}\n\n  ` : "\n  ";

  const html = await fs.readFile(INDEX_HTML, "utf8");
  const startIdx = html.indexOf(REALIZED_MARKER_START);
  const endIdx = html.indexOf(REALIZED_MARKER_END);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`index.html is missing the URBIUM:REALIZED markers — cannot safely regenerate the realized-listings section.`);
  }

  const before = html.slice(0, startIdx + REALIZED_MARKER_START.length);
  const after = html.slice(endIdx);
  const updated = `${before}${block}${after}`;

  if (updated !== html) {
    await fs.writeFile(INDEX_HTML, updated, "utf8");
    return true;
  }
  return false;
}
