import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { IMAGES_DIR, USER_AGENT, REQUEST_TIMEOUT_MS } from "../config.mjs";

function extFromContentType(contentType) {
  if (!contentType) return "jpg";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

async function downloadFile(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal });
    if (!response.ok) throw new Error(`Image download failed with ${response.status}: ${url}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) throw new Error(`Image download returned an empty body: ${url}`);
    const contentType = response.headers.get("content-type");
    return { buffer, ext: extFromContentType(contentType) };
  } finally {
    clearTimeout(timeout);
  }
}

// Downloads any images referenced in `normalizedImages` that aren't already
// present locally (matched by sourceUrl against `existingImages`), and
// prunes local files no longer referenced by the result.
// Returns the new `images` array to store in state for this property.
export async function syncPropertyImages(propertyId, normalizedImages, existingImages = []) {
  const dir = path.join(IMAGES_DIR, propertyId);
  await fs.mkdir(dir, { recursive: true });

  const existingByUrl = new Map(existingImages.map((img) => [img.sourceUrl, img]));
  const result = [];

  for (let i = 0; i < normalizedImages.length; i++) {
    const { sourceUrl } = normalizedImages[i];
    const already = existingByUrl.get(sourceUrl);

    if (already) {
      try {
        await fs.access(path.join(process.cwd(), already.localPath));
        result.push(already);
        continue;
      } catch {
        // File missing on disk despite being in state — re-download below.
      }
    }

    try {
      const { buffer, ext } = await downloadFile(sourceUrl);
      const index = String(i + 1).padStart(2, "0");
      const filename = `${index}.${ext}`;
      const localPath = path.relative(process.cwd(), path.join(dir, filename));
      await fs.writeFile(path.join(dir, filename), buffer);
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      result.push({ sourceUrl, localPath, hash: `sha256:${hash}` });
    } catch (err) {
      console.warn(`Image download failed for property ${propertyId}, skipping: ${err.message}`);
    }
  }

  // Prune stray files from the directory itself (by filename actually on
  // disk), not by iterating the OLD state's recorded localPaths. Urbium
  // reissues a fresh URL for a photo whenever a listing is edited, even for
  // visually unchanged photos, so new downloads above are written under the
  // same position-based filenames (01.jpg, 02.jpg, ...) old images used.
  // Deleting "by old record" would delete the file a new photo was just
  // written to, the moment that old record's (now-superseded) URL fell out
  // of the new payload — which is exactly what wiped out this property's
  // photos. Comparing against what's actually on disk avoids that race.
  const keptFilenames = new Set(result.map((img) => path.basename(img.localPath)));
  const dirEntries = await fs.readdir(dir).catch(() => []);
  for (const filename of dirEntries) {
    if (!keptFilenames.has(filename)) {
      await fs.rm(path.join(dir, filename), { force: true });
    }
  }

  return result;
}
