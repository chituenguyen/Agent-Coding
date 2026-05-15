import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ui/server/lib → workspace root is three levels up
export const WORKSPACE = path.resolve(__dirname, "..", "..", "..");
// ui/ directory (sibling of server/, holds dist/, public/, node_modules/)
export const UI_DIR = path.resolve(__dirname, "..", "..");

export const PORT = process.env.PORT || 3001;

export const CLOUDFLARED_BIN = path.join(
  UI_DIR,
  "node_modules/cloudflared/bin/cloudflared",
);

export const mcpServerPath = path.join(WORKSPACE, "mcp_server.json");
export const queuePath = () => path.join(WORKSPACE, "queue.json");
export const usagePath = () => path.join(WORKSPACE, "usage.jsonl");
export const attachmentsDir = () => path.join(WORKSPACE, "attachments");
export const chatsDir = () => path.join(WORKSPACE, "chats");
export const agentsDir = () => path.join(WORKSPACE, ".claude/agents");
export const skillsDir = () => path.join(WORKSPACE, ".claude/skills");
export const commandsDir = () => path.join(WORKSPACE, ".claude/commands");

export const WORKSPACE_NAME_FILE = path.join(WORKSPACE, ".workspace-name");
export const DEFAULT_WORKSPACE_NAME = "Platform";

export const GLOBAL_SETTINGS = path.join(
  process.env.HOME || process.env.USERPROFILE,
  ".claude/settings.json",
);
export const GLOBAL_CLAUDE_JSON = path.join(
  process.env.HOME || process.env.USERPROFILE,
  ".claude.json",
);
export const PROJECT_MCP_JSON = path.join(WORKSPACE, ".mcp.json");
