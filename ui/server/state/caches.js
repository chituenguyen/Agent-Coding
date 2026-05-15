// Mutable runtime caches owned by state/ — read/written by their associated
// lib/* modules. Co-located here to keep "no mutable state inside lib/" rule
// tidy and to give QC a single file to grep for runtime caches.

// Model auto-detection cache. Owner: lib/models.js. Key = claude binary mtime.
export const modelCache = { mtime: null, list: null };
