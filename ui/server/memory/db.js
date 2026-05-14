import path from "path";
import { readFileSync, existsSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_SCHEMA_VERSION = 1;
const SCHEMA_SQL = readFileSync(path.join(__dirname, "schema.sql"), "utf8");

let dbInstance = null;
let initPromise = null;

export async function getDb() {
  if (dbInstance) return dbInstance;
  if (!initPromise) {
    initPromise = initDb();
  }
  return initPromise;
}

async function initDb() {
  try {
    const Database = (await import("better-sqlite3")).default;
    return openDb(Database);
  } catch (err) {
    console.warn(
      `memory: disabled (better-sqlite3 unavailable): ${err.message}`,
    );
    return createStubDb();
  }
}

function openDb(Database) {
  const workspace = process.env.WORKSPACE || path.resolve(__dirname, "../..");
  const cacheDir = path.join(workspace, ".cache");
  const dbPath = path.join(cacheDir, "memory.sqlite");

  const db = new Database(dbPath);
  db.pragma("journal_mode=WAL");
  db.pragma("synchronous=NORMAL");
  db.pragma("busy_timeout=5000");

  // Check schema version
  try {
    const meta = db
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get("schema_version");
    if (meta && parseInt(meta.value) !== MEMORY_SCHEMA_VERSION) {
      db.exec(
        "DROP TABLE IF EXISTS turns_fts; DROP TABLE IF EXISTS turns; DROP TABLE IF EXISTS watermarks;",
      );
    }
  } catch (err) {
    // Table doesn't exist yet
  }

  // Corruption check
  try {
    const check = db.pragma("quick_check");
    if (check[0]?.quick_check !== "ok") {
      throw new Error("Corruption detected");
    }
  } catch (err) {
    console.warn(`memory: db corrupted, recreating: ${err.message}`);
    db.close();
    try {
      [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].forEach((p) => {
        if (existsSync(p)) unlinkSync(p);
      });
    } catch {}
    // Recursively reopen
    return openDb(Database);
  }

  // Create schema
  db.exec(SCHEMA_SQL);

  // Set schema version
  db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)").run(
    "schema_version",
    MEMORY_SCHEMA_VERSION,
  );

  return db;
}

function createStubDb() {
  return {
    prepare: () => ({
      run: () => {},
      get: () => null,
      all: () => [],
    }),
    exec: () => {},
    transaction: (fn) => fn,
    pragma: () => [{ quick_check: "ok" }],
    close: () => {},
  };
}

// Initialize on module load
dbInstance = initDb();
