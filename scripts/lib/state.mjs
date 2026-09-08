import fs from "node:fs/promises";
import path from "node:path";
import { STATE_FILE } from "../config.mjs";

const EMPTY_STATE = {
  schemaVersion: 1,
  lastListFetchAt: null,
  lastSyncRunAt: null,
  properties: {},
  pendingActions: [],
};

export async function loadState() {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(EMPTY_STATE),
      ...parsed,
      properties: parsed.properties ?? {},
      pendingActions: parsed.pendingActions ?? [],
    };
  } catch (err) {
    if (err.code === "ENOENT") return structuredClone(EMPTY_STATE);
    throw err;
  }
}

// Atomic write: write to a temp file, then rename over the real path, so a
// crash mid-write can never leave a corrupted state file behind.
export async function saveStateAtomic(state) {
  const tmpPath = `${STATE_FILE}.tmp`;
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2) + "\n", "utf8");
  await fs.rename(tmpPath, STATE_FILE);
}
