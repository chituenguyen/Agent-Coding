import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

import { WORKSPACE, UI_DIR } from "./paths.js";

export function slugifyCompanyId(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function readCompaniesFile() {
  const raw = await readFile(path.join(WORKSPACE, "companies.json"), "utf8");
  return JSON.parse(raw);
}

export async function writeCompaniesFile(data) {
  await writeFile(
    path.join(WORKSPACE, "companies.json"),
    JSON.stringify(data, null, 2) + "\n",
    "utf8",
  );
}

export function defaultEngineerRoom(repoPath) {
  const repos = repoPath ? [repoPath] : [];
  return {
    id: "engineer",
    name: "Engineer Room",
    description:
      "Cross-functional engineering — FE, BE, DevOps, Solution Architect",
    kind: "engineer",
    teams: [
      {
        id: "frontend",
        name: "Frontend",
        tagline: "React, Next.js, dashboards",
        agent: "coder-frontend",
        color: "#3b82f6",
        icon: "🎨",
        repos: [...repos],
      },
      {
        id: "backend",
        name: "Backend",
        tagline: "APIs, services, business logic",
        agent: "coder-backend",
        color: "#10b981",
        icon: "⚙️",
        repos: [...repos],
      },
      {
        id: "devops",
        name: "DevOps",
        tagline: "K8s, CI/CD, infrastructure",
        agent: "devops",
        color: "#f97316",
        icon: "🚀",
        repos: [...repos],
      },
      {
        id: "architect",
        name: "Solution Architect",
        tagline: "Cross-team design, specs, integration",
        agent: "architect",
        color: "#8b5cf6",
        icon: "🏛️",
        repos: [...repos],
      },
    ],
  };
}

// Persist an uploaded logo (base64 data URL) to ui/public/logos/{id}/logo.{ext}
// and return the public URL ("/logos/{id}/logo.{ext}").
export async function saveCompanyLogo(companyId, logoInput) {
  if (!logoInput) return null;
  // If a string URL/path is passed in, just return it as-is.
  if (typeof logoInput === "string") return logoInput || null;
  const { dataUrl, filename } = logoInput;
  if (!dataUrl) return null;
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("logo dataUrl must be a base64 data URL");
  const mime = match[1];
  const buf = Buffer.from(match[2], "base64");
  if (buf.length > 5 * 1024 * 1024)
    throw new Error("Logo too large (max 5 MB)");
  const extFromMime = (mime.split("/")[1] || "png").replace("+xml", "");
  const ext = (filename?.split(".").pop() || extFromMime).toLowerCase();
  const safeExt = /^[a-z0-9]{1,5}$/.test(ext) ? ext : "png";
  const dir = path.join(UI_DIR, "public", "logos", companyId);
  await mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, `logo.${safeExt}`);
  await writeFile(fullPath, buf);
  return `/logos/${companyId}/logo.${safeExt}?v=${Date.now()}`;
}

export async function findTeam(companyId, teamId) {
  const raw = await readFile(path.join(WORKSPACE, "companies.json"), "utf8");
  const data = JSON.parse(raw);
  const company = (data.companies || []).find((c) => c.id === companyId);
  if (!company) return null;
  for (const room of company.rooms || []) {
    for (const team of room.teams || []) {
      if (team.id === teamId) return { company, room, team };
    }
  }
  return null;
}

export async function buildCompanyPathMap() {
  const map = new Map();
  try {
    const raw = await readFile(path.join(WORKSPACE, "companies.json"), "utf8");
    const data = JSON.parse(raw);
    for (const co of data.companies || []) {
      for (const room of co.rooms || []) {
        for (const team of room.teams || []) {
          for (const repo of team.repos || []) {
            const p = String(repo).replace(/\/+$/, "");
            if (!map.has(p)) {
              map.set(p, {
                id: co.id,
                name: co.name,
                accent: co.accent || "",
              });
            }
          }
        }
      }
    }
  } catch {}
  return map;
}

export function lookupCompanyForPath(map, repoPath) {
  if (!repoPath) return null;
  const normalized = String(repoPath).replace(/\/+$/, "");
  if (map.has(normalized)) return map.get(normalized);
  let cur = normalized;
  for (let i = 0; i < 2; i++) {
    const parent = path.dirname(cur);
    if (!parent || parent === cur) break;
    if (map.has(parent)) return map.get(parent);
    cur = parent;
  }
  return null;
}
