import path from "path";

// Per-chat in-process state. Lives module-private; mutated by ws.js +
// routes/chat.js + lib/compact.js via the exported helpers.

// Currently running spawn for each chat (one at a time).
// Key = chatId, Value = { proc, assistantText, toolEvents, ... }.
export const activeChatProcs = new Map();

// WebSocket subscribers per chat. Survives proc lifecycle.
// Key = chatId, Value = Set<ws>.
export const chatSubscribers = new Map();

// Files the agent has edited during this server's lifetime.
// Key = chatId, Value = Set<absolute file path>.
export const chatEditedPaths = new Map();

export function rememberEditedPath(chatId, p) {
  if (!chatId || !p) return;
  if (!chatEditedPaths.has(chatId)) chatEditedPaths.set(chatId, new Set());
  chatEditedPaths.get(chatId).add(path.resolve(p));
}

export function addChatSubscriber(chatId, ws) {
  if (!chatSubscribers.has(chatId)) chatSubscribers.set(chatId, new Set());
  chatSubscribers.get(chatId).add(ws);
}

export function broadcastToChat(chatId, payload) {
  const subs = chatSubscribers.get(chatId);
  if (!subs || subs.size === 0) return;
  const data = JSON.stringify(payload);
  for (const ws of subs) {
    if (ws.readyState === 1) ws.send(data);
  }
}
