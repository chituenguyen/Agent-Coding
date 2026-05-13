import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../api";
import MarkdownContent from "../components/MarkdownContent";
import FileEditCard from "../components/FileEditCard";
import LiveFilePanel from "../components/LiveFilePanel";
import ThreadSidebar from "../components/teamchat/ThreadSidebar";

const FILE_EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit"]);

function friendlyToolLabel(name, input = {}) {
  if (!name) return "Working...";
  if (name === "Task")
    return `Delegating to ${input.subagent_type || "sub-agent"}`;
  if (name === "ToolSearch") return "Loading tool";
  if (name === "Bash") return `Running: ${(input.command || "").slice(0, 50)}`;
  if (name === "Read")
    return `Reading ${(input.file_path || "").split("/").pop() || "file"}`;
  if (name === "Edit")
    return `Editing ${(input.file_path || "").split("/").pop() || "file"}`;
  if (name === "Write")
    return `Writing ${(input.file_path || "").split("/").pop() || "file"}`;
  if (name === "MultiEdit")
    return `Multi-edit ${(input.file_path || "").split("/").pop() || "file"}`;
  if (name === "Glob") return `Searching ${input.pattern || ""}`;
  if (name === "Grep") return `Grep: ${input.pattern || ""}`;
  if (name === "Compact") return "Compacting context";
  if (name.startsWith("mcp__")) return name.split("__").slice(1).join(" / ");
  return name;
}

export default function TeamChat() {
  const { companyId, teamId, threadId } = useParams();
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [company, setCompany] = useState(null);
  const [chat, setChat] = useState(null);
  const [threads, setThreads] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [toolEvents, setToolEvents] = useState([]);
  const [fileEdits, setFileEdits] = useState([]);
  const [livePanelOpen, setLivePanelOpen] = useState(false);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const wsRef = useRef(null);
  const bottomRef = useRef(null);
  const messagesRef = useRef(null);

  // Hydrate panel state from chat's file edits
  function hydratePanels(activeChat) {
    const tools = (activeChat.messages || []).flatMap(
      (m) => m.toolEvents || [],
    );
    const edits = tools.filter((e) => FILE_EDIT_TOOLS.has(e.name));
    setFileEdits(edits);
  }

  // Patch thread in list when it gets auto-titled or updated
  function patchThreadFromChat(c) {
    setThreads((prev) => {
      const without = prev.filter((t) => t.id !== c.id);
      return [
        {
          id: c.id,
          title: c.title,
          updatedAt: c.updatedAt,
          messageCount: (c.messages || []).length,
          kind: c.kind,
          agent: c.agent,
          companyId: c.companyId,
          teamId: c.teamId,
        },
        ...without,
      ];
    });
  }

  // Bootstrap: load team meta, then load threads. If threadId present, load that chat.
  // If not, pick newest or create.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const co = await api.getCompany(companyId);
        if (cancelled) return;
        setCompany(co);
        const t = (co.rooms || [])
          .flatMap((r) => r.teams || [])
          .find((tm) => tm.id === teamId);
        setTeam(t || null);

        // Get all threads for this team
        const list = await api.getChats("team", companyId, teamId);
        if (cancelled) return;
        setThreads(list);

        if (threadId) {
          // Explicit thread requested
          const active = await api.getChat(threadId);
          if (!active) {
            // 404 — thread was deleted / bad URL. Fall back to newest or create.
            const fallback = list[0]
              ? await api.getChat(list[0].id)
              : await api.createChat({ kind: "team", companyId, teamId });
            navigate(`/co/${companyId}/team/${teamId}/t/${fallback.id}`, {
              replace: true,
            });
            return;
          }
          if (cancelled) return;
          setChat(active);
          hydratePanels(active);
        } else {
          // No threadId in URL: pick newest, else create. ALWAYS navigate so the
          // URL becomes canonical (deep-linkable, browser-back-friendly).
          const target = list[0]
            ? await api.getChat(list[0].id)
            : await api.createChat({ kind: "team", companyId, teamId });
          // Refresh list if we just created one
          if (!list[0]) setThreads([target, ...list]);
          navigate(`/co/${companyId}/team/${teamId}/t/${target.id}`, {
            replace: true,
          });
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, teamId, threadId]);

  // Track pinned-to-bottom
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const onScroll = () => {
      const d = el.scrollHeight - el.scrollTop - el.clientHeight;
      setPinnedToBottom(d < 80);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [chat?.id]);

  useEffect(() => {
    if (pinnedToBottom)
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages, streamText, toolEvents, pinnedToBottom]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === 1) return wsRef.current;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "chat-user-saved") {
        setChat(msg.chat);
        patchThreadFromChat(msg.chat);
      } else if (msg.type === "chat-resume") {
        setStreaming(true);
        setStreamText(msg.assistantText || "");
        const tools = (msg.toolEvents || []).map((t) => ({
          name: t.name,
          input: t.input || {},
          label: friendlyToolLabel(t.name, t.input),
        }));
        setToolEvents(tools);
        setFileEdits(tools.filter((t) => FILE_EDIT_TOOLS.has(t.name)));
      } else if (msg.type === "chat-not-running") {
        setStreaming(false);
        setStreamText("");
        setToolEvents([]);
      } else if (msg.type === "chat-delta") {
        setStreamText((p) => p + msg.text);
      } else if (msg.type === "chat-tool") {
        const evt = {
          name: msg.name,
          input: msg.input || {},
          label: friendlyToolLabel(msg.name, msg.input),
        };
        setToolEvents((p) => [...p, evt]);
        if (FILE_EDIT_TOOLS.has(msg.name)) {
          setFileEdits((p) => [...p, evt]);
          setLivePanelOpen(true);
        }
      } else if (msg.type === "chat-done") {
        setStreaming(false);
        setStreamText("");
        setToolEvents([]);
        setChat(msg.chat);
        patchThreadFromChat(msg.chat);
      } else if (msg.type === "chat-stopped") {
        setStreaming(false);
      } else if (msg.type === "chat-error") {
        setStreaming(false);
        setStreamText((p) => p + `\n[Error] ${msg.error}`);
      }
    };
    ws.onclose = () => {
      wsRef.current = null;
    };
    ws.onerror = () => setStreaming(false);
    return ws;
  }, []);

  // Subscribe whenever chat opens
  useEffect(() => {
    if (!chat?.id) return;
    const ws = connect();
    const subscribe = () =>
      ws.send(JSON.stringify({ action: "chat-subscribe", chatId: chat.id }));
    if (ws.readyState === 1) subscribe();
    else ws.addEventListener("open", subscribe, { once: true });
    return () => {
      if (wsRef.current?.readyState === 1) {
        wsRef.current.send(
          JSON.stringify({ action: "chat-unsubscribe", chatId: chat.id }),
        );
      }
    };
  }, [chat?.id, connect]);

  useEffect(() => () => wsRef.current?.close(), []);

  function send() {
    if (!input.trim() || streaming || !chat) return;
    const ws = connect();
    const message = input.trim();
    setInput("");
    setStreaming(true);
    setStreamText("");
    setToolEvents([]);
    setPinnedToBottom(true);
    const dispatch = () =>
      ws.send(
        JSON.stringify({ action: "chat-send", chatId: chat.id, message }),
      );
    if (ws.readyState === 1) dispatch();
    else ws.addEventListener("open", dispatch, { once: true });
  }

  function stop() {
    if (wsRef.current?.readyState === 1 && chat?.id) {
      wsRef.current.send(
        JSON.stringify({ action: "chat-stop", chatId: chat.id }),
      );
    }
  }

  const messages = chat?.messages || [];
  const ctxPct = Math.min(
    100,
    Math.round(((chat?.lastContextTokens || 0) / 200_000) * 100),
  );

  // Active repos = the subset of team.repos currently in chat.folderPaths.
  // The user toggles these via the pill bar; backend only injects active
  // repos into Claude's --add-dir + working-folder prompt context, so chat
  // context isn't bloated by repos the user didn't ask for.
  const activeRepoSet = new Set(chat?.folderPaths || []);
  const teamRepos = team?.repos || [];
  const activeCount = teamRepos.filter((p) => activeRepoSet.has(p)).length;

  async function toggleRepo(repoPath) {
    if (!chat) return;
    const cur = new Set(chat.folderPaths || []);
    if (cur.has(repoPath)) cur.delete(repoPath);
    else cur.add(repoPath);
    const next = [...cur];
    // Optimistic update so the pill flips instantly
    setChat({ ...chat, folderPaths: next });
    try {
      const updated = await api.updateChat(chat.id, { folderPaths: next });
      setChat(updated);
    } catch (e) {
      console.error("Failed to update scope", e);
      // Revert on error
      setChat({ ...chat });
    }
  }

  async function handleCreateThread() {
    const created = await api.createChat({ kind: "team", companyId, teamId });
    setThreads((prev) => [
      {
        id: created.id,
        title: created.title,
        updatedAt: created.updatedAt,
        messageCount: 0,
        kind: "team",
        agent: created.agent,
        companyId,
        teamId,
      },
      ...prev,
    ]);
    navigate(`/co/${companyId}/team/${teamId}/t/${created.id}`);
  }

  async function handleDeleteThread(id) {
    await api.deleteChat(id);
    const remaining = threads.filter((t) => t.id !== id);
    setThreads(remaining);
    if (id !== threadId) return; // deleted a non-active thread, just stay
    if (remaining[0]) {
      navigate(`/co/${companyId}/team/${teamId}/t/${remaining[0].id}`, {
        replace: true,
      });
    } else {
      // No threads left — bootstrap will create a fresh one
      navigate(`/co/${companyId}/team/${teamId}`, { replace: true });
    }
  }

  return (
    <div className="cofounder-skin flex h-full bg-co-bg text-co-fg">
      <ThreadSidebar
        threads={threads}
        activeThreadId={chat?.id || null}
        team={team}
        onSelect={(id) => navigate(`/co/${companyId}/team/${teamId}/t/${id}`)}
        onCreate={handleCreateThread}
        onDelete={handleDeleteThread}
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-co-fg/10 bg-co-surface px-5 py-3">
          <button
            onClick={() => navigate(`/co/${companyId}`)}
            className="text-xs text-co-fg/50 hover:text-co-fg"
          >
            ← {company?.name || "Company"}
          </button>
          {team && (
            <>
              <span className="text-co-fg/20">/</span>
              <div
                className="flex h-7 w-7 items-center justify-center rounded-co text-base"
                style={{
                  backgroundColor: `${team.color}1f`,
                  color: team.color,
                }}
              >
                {team.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold tracking-tight">
                  {team.name}
                </div>
                <div className="text-[11px] text-co-fg/50">
                  {team.tagline} ·{" "}
                  <span className="font-mono">@{team.agent}</span>
                </div>
              </div>
              <span
                title={`${(chat?.lastContextTokens || 0).toLocaleString()} / 200,000 tokens`}
                className={`rounded-co-sm px-2 py-1 font-mono text-[10px] ${
                  ctxPct >= 70
                    ? "bg-co-destructive/10 text-co-destructive"
                    : ctxPct >= 50
                      ? "bg-co-accent/20 text-co-fg/70"
                      : "bg-co-fg/[0.05] text-co-fg/50"
                }`}
              >
                ctx {ctxPct}%
              </span>
              <button
                onClick={() => setLivePanelOpen((v) => !v)}
                className={`rounded-co-sm border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  livePanelOpen
                    ? "border-co-primary bg-co-primary text-co-primary-fg"
                    : "border-co-fg/20 text-co-fg/70 hover:bg-co-fg/[0.05]"
                }`}
              >
                Files
                {fileEdits.length > 0 && (
                  <span className="ml-1 rounded bg-white/20 px-1 font-mono text-[10px]">
                    {fileEdits.length}
                  </span>
                )}
              </button>
            </>
          )}
        </header>

        {/* Repos pill bar — click to toggle which repos this chat engages.
            Only active pills are passed to Claude as --add-dir + working-folder
            context. Empty = pure ideation, no repo context. */}
        {team && teamRepos.length > 0 && (
          <div className="border-b border-co-fg/10 bg-co-surface/60 px-5 py-2">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span
                className="shrink-0 text-[10px] uppercase tracking-wider text-co-fg/40"
                title="Click a repo to include/exclude it for this chat"
              >
                Scope{" "}
                <span className="font-mono text-co-fg/30">
                  {activeCount}/{teamRepos.length}
                </span>
              </span>
              {teamRepos.map((p) => {
                const active = activeRepoSet.has(p);
                return (
                  <button
                    key={p}
                    onClick={() => toggleRepo(p)}
                    title={`${active ? "Remove" : "Add"} ${p}`}
                    className={`shrink-0 rounded-co-sm px-2 py-1 font-mono text-[10px] transition-colors ${
                      active
                        ? "bg-co-primary/15 text-co-primary ring-1 ring-co-primary/40"
                        : "bg-co-fg/[0.04] text-co-fg/50 hover:bg-co-fg/[0.08] hover:text-co-fg/80"
                    }`}
                  >
                    {active ? "● " : "○ "}
                    {p.split("/").slice(-2).join("/")}
                  </button>
                );
              })}
              {activeCount === 0 && (
                <span className="shrink-0 text-[10px] italic text-co-fg/40">
                  no repo context — pure ideation mode
                </span>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="relative min-h-0 flex-1">
          <div
            ref={messagesRef}
            className="absolute inset-0 overflow-y-auto px-5 py-5"
          >
            <div className="mx-auto max-w-3xl">
              {messages.length === 0 && !streaming && (
                <div className="rounded-co-lg border border-dashed border-co-fg/15 bg-co-surface/50 p-6 text-center text-sm text-co-fg/60">
                  Ask {team?.name || "this team"} anything. Click a repo in the{" "}
                  <strong className="text-co-fg/80">Scope</strong> bar above to
                  give it codebase context — or leave empty for pure ideation.
                  Hand off to other teams with{" "}
                  <code className="rounded bg-co-fg/[0.05] px-1 font-mono">
                    @-mention
                  </code>{" "}
                  the team name.
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`mb-4 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                      m.role === "user"
                        ? "bg-co-fg/[0.06] border border-co-fg/[0.06] text-co-fg"
                        : "bg-co-surface text-co-fg border border-co-fg/10"
                    }`}
                  >
                    {m.role === "assistant" ? (
                      <MarkdownContent content={m.content} />
                    ) : (
                      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
                        {m.content}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
              {streaming && (
                <div className="mb-4 flex justify-start">
                  <div className="max-w-[85%] rounded-2xl border border-co-fg/10 bg-co-surface px-4 py-2.5">
                    {toolEvents.filter((t) => !FILE_EDIT_TOOLS.has(t.name))
                      .length > 0 && (
                      <div className="mb-2 flex items-center gap-2 text-xs text-co-fg/50">
                        <span className="flex items-center gap-0.5">
                          <span className="h-1 w-1 animate-pulse rounded-full bg-co-fg/60" />
                          <span
                            className="h-1 w-1 animate-pulse rounded-full bg-co-fg/60"
                            style={{ animationDelay: "200ms" }}
                          />
                          <span
                            className="h-1 w-1 animate-pulse rounded-full bg-co-fg/60"
                            style={{ animationDelay: "400ms" }}
                          />
                        </span>
                        <span>
                          {toolEvents[toolEvents.length - 1]?.label ||
                            "Working"}
                        </span>
                      </div>
                    )}
                    {fileEdits.length > 0 && (
                      <div className="-mx-1.5 mb-2">
                        {fileEdits.map((t, i) => (
                          <FileEditCard key={i} tool={t.name} input={t.input} />
                        ))}
                      </div>
                    )}
                    {streamText ? (
                      <MarkdownContent content={streamText} />
                    ) : (
                      <div className="flex items-center gap-1 py-1">
                        <span
                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-co-fg/40"
                          style={{ animationDelay: "0ms" }}
                        />
                        <span
                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-co-fg/40"
                          style={{ animationDelay: "150ms" }}
                        />
                        <span
                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-co-fg/40"
                          style={{ animationDelay: "300ms" }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>
          {!pinnedToBottom && messages.length > 0 && (
            <button
              onClick={() => {
                setPinnedToBottom(true);
                bottomRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
              className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-co-primary px-3 py-1.5 text-xs text-co-primary-fg shadow-lg hover:opacity-90"
            >
              ↓ Jump to latest
            </button>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-co-fg/10 bg-co-surface p-3">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end gap-2 rounded-2xl border border-co-fg/20 bg-co-bg px-3 py-2 shadow-sm transition-all focus-within:border-co-fg/30 focus-within:ring-2 focus-within:ring-co-fg/10">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={`Message ${team?.name || "the team"}…`}
                disabled={streaming}
                rows={1}
                className="max-h-40 flex-1 resize-none bg-transparent text-sm text-co-fg placeholder:text-co-fg/50 focus:outline-none"
                style={{ minHeight: "24px" }}
                onInput={(e) => {
                  e.target.style.height = "auto";
                  e.target.style.height =
                    Math.min(e.target.scrollHeight, 160) + "px";
                }}
              />
              {streaming ? (
                <button
                  onClick={stop}
                  className="rounded-lg bg-co-destructive px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={send}
                  disabled={!input.trim()}
                  className="rounded-lg bg-co-primary px-3 py-1.5 text-xs font-medium text-co-primary-fg transition-opacity hover:opacity-90 disabled:bg-co-fg/20 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              )}
            </div>
            <p className="mt-1.5 px-1 text-xs text-co-fg/40">
              Enter to send · Shift+Enter for newline. Want a general chat?{" "}
              <Link to="/chat" className="underline hover:text-co-fg">
                Open the common chat
              </Link>
              .
            </p>
          </div>
        </div>
      </main>

      {livePanelOpen && chat?.id && (
        <LiveFilePanel
          chatId={chat.id}
          fileEdits={fileEdits}
          onClose={() => setLivePanelOpen(false)}
        />
      )}
    </div>
  );
}
