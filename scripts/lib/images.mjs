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
// prunes local files for sourceUrls no longer present in the new payload.
// Returns the new `images` array to store in state for this property.
export async function syncPropertyImages(propertyId, normalizedImages, existingImages = []) {
  const dir = path.join(IMAGES_DIR, propertyId);
  await fs.mkdir(dir, { recursive: true });

  const existingByUrl = new Map(existingImages.map((img) => [img.sourceUrl, img]));
  const keptUrls = new Set();
  const result = [];

  for (let i = 0; i < normalizedImages.length; i++) {
    const { sourceUrl } = normalizedImages[i];
    keptUrls.add(sourceUrl);
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

  // Prune local files whose sourceUrl is no longer referenced.
  for (const old of existingImages) {
    if (!keptUrls.has(old.sourceUrl)) {
      await fs.rm(path.join(process.cwd(), old.localPath), { force: true });
    }
  }

  return result;
}
