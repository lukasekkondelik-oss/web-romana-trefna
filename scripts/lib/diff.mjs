// Implements Urbium's recommended diff algorithm:
//   - ID not in our state            -> insert
//   - ID in state, their date newer  -> update
//   - ID in state, same/older date   -> nothing (just bump lastSeenInListAt)
//   - our active ID missing from list -> deactivate (flag, never delete)

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Builds the new set of queue actions for this run and merges them with any
// pendingActions left over (unprocessed) from a previous run.
export function buildActionQueue(state, listEntries, now = new Date().toISOString()) {
  const listIds = new Set(listEntries.map((e) => e.propertyId));
  const newActions = [];

  for (const entry of listEntries) {
    const existing = state.properties[entry.propertyId];
    if (!existing) {
      newActions.push({ propertyId: entry.propertyId, action: "insert", reason: "new id in list", queuedAt: now });
      continue;
    }

    const theirDate = parseDate(entry.lastModified);
    const ourDate = parseDate(existing.urbiumLastModified);

    // Unparseable date: err toward refreshing rather than silently going stale.
    const isNewer = theirDate && (!ourDate || theirDate > ourDate);
    if (!theirDate && entry.lastModified) {
      newActions.push({ propertyId: entry.propertyId, action: "update", reason: "unparseable modification date", queuedAt: now });
    } else if (isNewer) {
      newActions.push({ propertyId: entry.propertyId, action: "update", reason: "newer modification date", queuedAt: now });
    } else {
      existing.lastSeenInListAt = now;
    }
  }

  for (const [propertyId, existing] of Object.entries(state.properties)) {
    if (!listIds.has(propertyId) && existing.ourStatus === "active") {
      newActions.push({ propertyId, action: "deactivate", reason: "id no longer in Urbium list", queuedAt: now });
    }
  }

  return mergeActionQueues(state.pendingActions ?? [], newActions);
}

// Deduplicates by propertyId: an insert/update always wins over a stale
// queued deactivate for the same id (it clearly came back), and a fresh
// insert is never downgraded to update or vice versa — last one in wins,
// with new actions taking precedence over stale leftovers.
function mergeActionQueues(existingQueue, newActions) {
  const byId = new Map();
  for (const action of existingQueue) byId.set(action.propertyId, action);
  for (const action of newActions) byId.set(action.propertyId, action);
  return Array.from(byId.values());
}
