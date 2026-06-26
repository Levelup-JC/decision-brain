import { createHash, randomUUID } from "node:crypto";

export function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function assetIdFromQuery(query) {
  const normalized = slugify(query);
  if (normalized) {
    return `asset_${normalized}`;
  }
  return `asset_${randomUUID()}`;
}

export function stableId(prefix, input) {
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 10);
  return `${prefix}_${hash}`;
}

export function entityId(prefix) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}
