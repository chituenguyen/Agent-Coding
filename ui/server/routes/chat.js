import { Router } from "express";
import { readFile, readdir, stat, rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";

import { WORKSPACE, chatsDir } from "../lib/paths.js";
import { findTeam } from "../lib/companies.js";
import {
  chatPath,
  ensureChatsDir,
  readChat,
  writeChat,
} from "../lib/chat-files.js";
import { chatEditedPaths } from "../state/chat.js";

const router = Router();

router.get("/api/chats", async (req, res) => {
  try {
    await ensureChatsDir();
    const files = await readdir(chatsDir());
    const wantKind = req.query.kind || "chat";
    const wantCompany = req.query.companyId || null;
    const wantTeam = req.query.teamId || null;
    const chats = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          try {
            const c = JSON.parse(
              await readFile(path.join(chatsDir(), f), "utf8"),
            );
            const kind = c.kind || "chat";
            if (kind !== wantKind) return null;
            if (wantCompany && (c.companyId || null) !== wantCompany)
              return null;
            if (wantTeam && (c.teamId || null) !== wantTeam) return null;
            return {
              id: c.id,
              title: c.title,
              kind,
              agent: c.agent || null,
              companyId: c.companyId || null,
              teamId: c.teamId || null,
              createdAt: c.createdAt,
              updatedAt: c.updatedAt,
              messageCount: (c.messages || []).length,
            };
          } catch {
            return null;
          }
        }),
    );
    res.json(
      chats
        .filter(Boolean)
        .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/chats", async (req, res) => {
  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const ALLOWED_KINDS = ["chat", "investigate", "trading", "team"];
    const kind = ALLOWED_KINDS.includes(req.body?.kind)
      ? req.body.kind
      : "chat";
    let agent =
      typeof req.body?.agent === "string" && req.body.agent.trim()
        ? req.body.agent.trim()
        : null;
    let folderPaths = [WORKSPACE];
    let companyId = null;
    let teamId = null;
    let title =
      kind === "investigate"
        ? "New investigation"
        : kind === "trading"
          ? "New analysis"
          : "New chat";
    if (
      kind === "team" &&
      typeof req.body?.companyId === "string" &&
      typeof req.body?.teamId === "string"
    ) {
      const found = await findTeam(req.body.companyId, req.body.teamId);
      if (!found) return res.status(404).json({ error: "Team not found" });
      companyId = found.company.id;
      teamId = found.team.id;
      agent = found.team.agent || agent;
      folderPaths = [WORKSPACE];
      title = "New thread";
    } else if (
      typeof req.body?.companyId === "string" &&
      req.body.companyId.trim()
    ) {
      companyId = req.body.companyId.trim();
    }
    const chat = {
      id,
      title,
      kind,
      agent,
      companyId,
      teamId,
      sessionId: null,
      model: "sonnet",
      folderPaths,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    await writeChat(chat);
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/chats/:id", async (req, res) => {
  const chat = await readChat(req.params.id);
  if (!chat) return res.status(404).json({ error: "Not found" });
  res.json(chat);
});

// Read a file for the live-edit panel. Restricted to WORKSPACE + the chat's
// declared folderPaths (which are the same dirs claude is allowed to touch
// via --add-dir), so a malicious chatId can't pull arbitrary files.
router.get("/api/chats/:id/file", async (req, res) => {
  const chat = await readChat(req.params.id);
  if (!chat) return res.status(404).json({ error: "Chat not found" });
  const filePath = req.query.path;
  if (typeof filePath !== "string" || !filePath) {
    return res.status(400).json({ error: "path required" });
  }
  const resolved = path.resolve(filePath);
  const allowedRoots = [WORKSPACE, ...(chat.folderPaths || [])]
    .filter(Boolean)
    .map((p) => path.resolve(p));
  const inAllowedRoot = allowedRoots.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep),
  );
  const wasEdited = chatEditedPaths.get(req.params.id)?.has(resolved);
  if (!inAllowedRoot && !wasEdited) {
    return res.status(403).json({ error: "Path outside allowed roots" });
  }
  if (!existsSync(resolved)) {
    return res.status(404).json({ error: "File not found" });
  }
  try {
    const st = await stat(resolved);
    if (st.size > 1024 * 1024) {
      return res
        .status(413)
        .json({ error: "File too large (>1MB)", size: st.size });
    }
    const content = await readFile(resolved, "utf8");
    res.json({ path: resolved, content, size: st.size, mtime: st.mtimeMs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/chats/:id", async (req, res) => {
  const chat = await readChat(req.params.id);
  if (!chat) return res.status(404).json({ error: "Not found" });
  if (typeof req.body.title === "string")
    chat.title = req.body.title.trim().slice(0, 200) || chat.title;
  if (
    typeof req.body.model === "string" &&
    ["sonnet", "opus", "opus-4-6", "haiku"].includes(req.body.model)
  )
    chat.model = req.body.model;
  if (Array.isArray(req.body.folderPaths)) {
    let next = req.body.folderPaths
      .filter((p) => typeof p === "string" && p.trim())
      .slice(0, 10);
    if (chat.kind === "team" && chat.companyId && chat.teamId) {
      const found = await findTeam(chat.companyId, chat.teamId);
      const allowed = new Set([
        WORKSPACE,
        ...(found?.team?.repos || []).filter(Boolean),
      ]);
      next = next.filter((p) => allowed.has(p));
    }
    chat.folderPaths = next;
  }
  if (
    typeof req.body.effort === "string" &&
    ["low", "medium", "high", "xhigh", "max", ""].includes(req.body.effort)
  ) {
    chat.effort = req.body.effort || null;
  }
  if (typeof req.body.planMode === "boolean") {
    chat.planMode = req.body.planMode;
  }
  chat.updatedAt = new Date().toISOString();
  await writeChat(chat);
  res.json(chat);
});

router.delete("/api/chats/:id", async (req, res) => {
  try {
    if (existsSync(chatPath(req.params.id))) await rm(chatPath(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
