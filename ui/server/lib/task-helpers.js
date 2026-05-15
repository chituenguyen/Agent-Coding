import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

import { WORKSPACE } from "./paths.js";

export function deriveStatus(taskDir) {
  const has = (f) => existsSync(path.join(taskDir, f));
  if (has("commit.md")) return "done";
  if (has("review/approval.md")) return "approved";
  if (has("review/fix-log.md")) return "fixed";
  if (has("review/issues.md")) return "issues";
  if (has("review/backend-summary.md") || has("review/frontend-summary.md"))
    return "coded";
  if (has("SPEC.md")) return "planned";
  if (has("input.md")) return "created";
  return "unknown";
}

export function parseInputMd(content) {
  const get = (key) => {
    const m = content.match(new RegExp(`\\*\\*${key}:\\*\\*\\s*(.+)`));
    return m ? m[1].trim() : "";
  };
  const getDescription = () => {
    const m = content.match(
      /\*\*Description:\*\*\s*([\s\S]+?)(?=\n\*\*[A-Za-z]|\n\n## |\n\n\*\*|$)/,
    );
    if (!m) return get("Description");
    return m[1].trim();
  };
  return {
    taskId: get("Task ID"),
    project: get("Project"),
    created: get("Created"),
    description: getDescription(),
    targetPath: get("Path"),
    companyId: get("Company") || null,
  };
}

// Build a map of repo path (or any prefix) → companyId from companies.json.
// Used to infer which company owns a task/queue item that lacks an explicit
// companyId (e.g. legacy items created before the field existed).
export async function getCompanyForPath(targetPath) {
  if (!targetPath) return null;
  try {
    const raw = await readFile(path.join(WORKSPACE, "companies.json"), "utf8");
    const data = JSON.parse(raw);
    const normalized = String(targetPath).replace(/\/+$/, "");
    for (const co of data.companies || []) {
      for (const room of co.rooms || []) {
        for (const team of room.teams || []) {
          for (const repo of team.repos || []) {
            const r = String(repo).replace(/\/+$/, "");
            if (normalized === r || normalized.startsWith(r + "/")) {
              return co.id;
            }
          }
        }
      }
    }
  } catch {}
  return null;
}
