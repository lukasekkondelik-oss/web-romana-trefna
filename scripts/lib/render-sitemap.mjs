import fs from "node:fs/promises";
import { SITEMAP_XML, SITEMAP_MARKER_START, SITEMAP_MARKER_END, SITE_BASE_URL } from "../config.mjs";

function urlEntry(property) {
  return `  <url>
    <loc>${SITE_BASE_URL}${property.url}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
}

export async function renderSitemapUrls(state) {
  const active = Object.values(state.properties).filter((p) => p.ourStatus === "active");

  const block = active.length ? `\n${active.map(urlEntry).join("\n")}\n\n  ` : "\n\n  ";

  const xml = await fs.readFile(SITEMAP_XML, "utf8");
  const startIdx = xml.indexOf(SITEMAP_MARKER_START);
  const endIdx = xml.indexOf(SITEMAP_MARKER_END);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`sitemap.xml is missing the URBIUM:URLS markers — cannot safely regenerate the URL block.`);
  }

  const before = xml.slice(0, startIdx + SITEMAP_MARKER_START.length);
  const after = xml.slice(endIdx);
  const updated = `${before}${block}${after}`;

  if (updated !== xml) {
    await fs.writeFile(SITEMAP_XML, updated, "utf8");
    return true;
  }
  return false;
}
