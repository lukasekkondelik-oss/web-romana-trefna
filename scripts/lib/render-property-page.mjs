import fs from "node:fs/promises";
import { SITE_BASE_URL, PLACEHOLDER_IMAGE } from "../config.mjs";

const TEMPLATE_PATH = new URL("../templates/property.html", import.meta.url).pathname;

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphsHtml(description) {
  const paragraphs = String(description || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return "        <p>Podrobnější informace o této nemovitosti vám ráda poskytnu osobně.</p>\n";
  }
  return paragraphs.map((p) => `        <p>${escapeHtml(p)}</p>`).join("\n") + "\n";
}

function buildJsonLd(property) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Apartment",
    name: property.title,
    image: property.images[0]
      ? `${SITE_BASE_URL}/${property.images[0].localPath}`
      : `${SITE_BASE_URL}/${PLACEHOLDER_IMAGE}`,
    description: property.description || property.title,
    address: {
      "@type": "PostalAddress",
      streetAddress: property.address || property.location,
      addressLocality: property.location,
      addressCountry: "CZ",
    },
  };

  if (property.area) {
    jsonLd.floorSize = { "@type": "QuantitativeValue", value: String(property.area), unitCode: "MTK" };
  }
  if (property.layout) {
    jsonLd.numberOfRooms = property.layout;
  }

  if (property.ourStatus === "active") {
    jsonLd.offers = {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      url: `${SITE_BASE_URL}${property.url}`,
    };
    if (property.price) {
      jsonLd.offers.price = String(property.price);
      jsonLd.offers.priceCurrency = "CZK";
    }
  } else {
    jsonLd.offers = {
      "@type": "Offer",
      availability: "https://schema.org/OutOfStock",
      url: `${SITE_BASE_URL}${property.url}`,
    };
  }

  return JSON.stringify(jsonLd, null, 2);
}

const STATUS_LABELS = {
  active: "V nabídce",
  hidden: "Již není v nabídce",
  sold: "Prodáno",
};

const STATUS_BADGE_MODIFIERS = {
  active: "",
  hidden: " is-sold",
  sold: " is-sold",
};

export async function renderPropertyPage(property) {
  const template = await fs.readFile(TEMPLATE_PATH, "utf8");

  const canonicalUrl = `${SITE_BASE_URL}${property.url}`;
  const metaDescription = (property.description || property.title)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  const photo = property.images[0];
  const addressForMap = property.address || property.location;

  const replacements = {
    TITLE: escapeHtml(property.title),
    META_DESCRIPTION: escapeHtml(metaDescription),
    ROBOTS: property.ourStatus === "active" ? "index, follow" : "noindex, follow",
    CANONICAL_URL: canonicalUrl,
    OG_DESCRIPTION: escapeHtml(metaDescription),
    OG_IMAGE: photo ? `${SITE_BASE_URL}/${photo.localPath}` : `${SITE_BASE_URL}/${PLACEHOLDER_IMAGE}`,
    JSONLD: buildJsonLd(property),
    LOCATION: escapeHtml(property.location || ""),
    PRICE_DISPLAY: escapeHtml(property.priceDisplay || "Cena na vyžádání"),
    STATUS_BADGE_MODIFIER: STATUS_BADGE_MODIFIERS[property.ourStatus] ?? "",
    STATUS_LABEL: STATUS_LABELS[property.ourStatus] ?? "V nabídce",
    MAP_QUERY: encodeURIComponent(addressForMap),
    ADDRESS: escapeHtml(addressForMap),
    DESCRIPTION_PARAGRAPHS: paragraphsHtml(property.description),
    AREA_META: escapeHtml(
      property.area ? `${property.area} m²${property.layout ? ` (${property.layout})` : ""}` : property.layout || "Plocha na vyžádání"
    ),
    PHOTO_SRC: photo ? photo.localPath : PLACEHOLDER_IMAGE,
    PHOTO_ALT: escapeHtml(property.title),
    MAILTO_SUBJECT: encodeURIComponent(property.title),
  };

  let html = template;
  for (const [token, value] of Object.entries(replacements)) {
    html = html.split(`{{${token}}}`).join(value);
  }
  return html;
}
