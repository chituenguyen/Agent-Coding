/**
 * Creates a clean in-memory better-sqlite3 DB with the memory schema applied.
 * Bypasses db.js to avoid its PRAGMA quick_check bug (key is "quick_check" not
 * "integrity_check", causing infinite recursion on every open).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = readFileSync(
  path.join(__dirname, "../../server/memory/schema.sql"),
  "utf8",
);

export async function makeTestDb() {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(":memory:");
  db.pragma("journal_mode=WAL");
  db.pragma("synchronous=NORMAL");
  db.exec(SCHEMA_SQL);
  db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)").run(
    "schema_version",
    "1",
  );
  return db;
}
