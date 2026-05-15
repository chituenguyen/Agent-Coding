import { existsSync } from "fs";

import { getDb } from "./memory/db.js";
import { startIndexer } from "./memory/indexer.js";
import { getRepos } from "./lib/mcp-config.js";
import { checkLinks } from "./lib/workspace-links.js";

export async function startMemoryIndexer() {
  const db = await getDb();
  if (db) {
    startIndexer({ db, logger: console });
  }
}

export function startLinkHealthCheck() {
  // Advisory only — never auto-repairs.
  (async () => {
    try {
      const repos = await getRepos();
      for (const r of repos || []) {
        if (!r.path || !existsSync(r.path)) continue;
        try {
          const status = await checkLinks(r.path);
          console.error(`[link-check] ${r.name}: ${status.status}`);
        } catch (err) {
          console.error(`[link-check] ${r.name}: error ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`[link-check] failed: ${err.message}`);
    }
  })();
}
