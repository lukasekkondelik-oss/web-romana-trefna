const DIACRITICS_MAP = {
  á: "a", č: "c", ď: "d", é: "e", ě: "e", í: "i", ň: "n", ó: "o", ř: "r",
  š: "s", ť: "t", ú: "u", ů: "u", ý: "y", ž: "z",
};

function transliterate(str) {
  return str
    .toLowerCase()
    .split("")
    .map((ch) => DIACRITICS_MAP[ch] ?? ch)
    .join("");
}

function slugify(title, maxLength = 60) {
  let slug = transliterate(title)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (slug.length > maxLength) {
    slug = slug.slice(0, maxLength);
    const lastHyphen = slug.lastIndexOf("-");
    if (lastHyphen > 10) slug = slug.slice(0, lastHyphen);
  }
  return slug || "nemovitost";
}

// Generates a stable slug/filename/URL for a property. Only ever called on
// INSERT — an existing property keeps its original slug/pageFile/url forever
// (see scripts/sync-urbium.mjs), so links and SEO never break even if the
// title text changes on a later update.
export function generateSlugAndPaths(title, propertyId) {
  const slug = slugify(title);
  const pageFile = `nemovitost-${slug}-${propertyId}.html`;
  return { slug, pageFile, url: `/${pageFile}` };
}
