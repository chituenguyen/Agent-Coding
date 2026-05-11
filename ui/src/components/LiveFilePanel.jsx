import { useEffect, useMemo, useRef, useState } from "react";
import hljs from "highlight.js/lib/common";
import "highlight.js/styles/github-dark.css";

const EXT_LANG = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  md: "markdown",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  css: "css",
  scss: "scss",
  html: "xml",
  xml: "xml",
  sql: "sql",
};

function detectLang(filePath) {
  const ext = (filePath?.split(".").pop() || "").toLowerCase();
  return EXT_LANG[ext] || "plaintext";
}

function HighlightedFile({ content, lang, highlightLines }) {
  const lines = content.split("\n");
  // Highlight whole file once for syntax colors
  const highlightedHtml = useMemo(() => {
    if (!content) return "";
    try {
      const result =
        lang && hljs.getLanguage(lang)
          ? hljs.highlight(content, { language: lang, ignoreIllegals: true })
          : hljs.highlightAuto(content);
      return result.value;
    } catch {
      return content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
  }, [content, lang]);
  // Split highlighted html back into lines so we can put gutter + bg per line
  const htmlLines = highlightedHtml.split("\n");
  return (
    <pre className="text-[11px] leading-snug bg-[#0d1117] m-0 overflow-x-auto">
      <code className={`hljs language-${lang}`}>
        {htmlLines.map((line, i) => {
          const lineNum = i + 1;
          const isHl = highlightLines?.has(lineNum);
          return (
            <div
              key={i}
              className={`flex ${
                isHl
                  ? "bg-emerald-500/15 border-l-2 border-emerald-500"
                  : "border-l-2 border-transparent"
              }`}
            >
              <span className="select-none px-2 text-right text-gray-600 w-10 shrink-0">
                {lineNum}
              </span>
              <span
                className="px-2 flex-1 min-w-0"
                dangerouslySetInnerHTML={{ __html: line || "&nbsp;" }}
              />
            </div>
          );
        })}
      </code>
    </pre>
  );
}

export default function LiveFilePanel({
  chatId,
  fileEdits,
  onClose,
  width = 480,
}) {
  // fileEdits: array of { name: 'Edit' | 'Write' | 'MultiEdit', input, ts }
  // De-duplicate by file_path keeping the latest edit per file (with edit count)
  const fileSummary = useMemo(() => {
    const m = new Map();
    for (const e of fileEdits) {
      const fp = e.input?.file_path;
      if (!fp) continue;
      const prev = m.get(fp) || { count: 0 };
      m.set(fp, {
        path: fp,
        latest: e,
        count: prev.count + 1,
      });
    }
    return Array.from(m.values());
  }, [fileEdits]);

  const [activePath, setActivePath] = useState(null);
  const [content, setContent] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [highlightLines, setHighlightLines] = useState(new Set());
  const flashTimer = useRef(null);

  // Auto-pick most recently edited file when nothing selected, or auto-follow
  // if user is already viewing the file that just got edited.
  const lastEditPath = fileEdits[fileEdits.length - 1]?.input?.file_path;
  useEffect(() => {
    if (!activePath && lastEditPath) setActivePath(lastEditPath);
  }, [lastEditPath, activePath]);

  // Refetch whenever the active file gets a new edit (we use the count as a
  // refresh trigger).
  const activeSummary = fileSummary.find((s) => s.path === activePath);
  const refreshKey = activeSummary?.count || 0;

  useEffect(() => {
    if (!activePath || !chatId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/chats/${chatId}/file?path=${encodeURIComponent(activePath)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "fetch failed");
        return j;
      })
      .then((j) => {
        if (cancelled) return;
        setContent(j.content || "");
        // Flash the lines that changed in the latest edit
        const last = activeSummary?.latest;
        if (last && (last.name === "Edit" || last.name === "Write")) {
          const newStr =
            last.name === "Edit" ? last.input?.new_string : last.input?.content;
          if (newStr) {
            const hl = new Set();
            const idx = j.content.indexOf(newStr);
            if (idx >= 0) {
              const before = j.content.slice(0, idx);
              const startLine = (before.match(/\n/g) || []).length + 1;
              const lineCount = (newStr.match(/\n/g) || []).length + 1;
              for (let i = 0; i < lineCount; i++) hl.add(startLine + i);
            }
            setHighlightLines(hl);
            clearTimeout(flashTimer.current);
            flashTimer.current = setTimeout(
              () => setHighlightLines(new Set()),
              4000,
            );
          }
        } else {
          setHighlightLines(new Set());
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activePath, chatId, refreshKey]);

  if (fileEdits.length === 0) {
    return (
      <aside
        style={{ width }}
        className="border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col"
      >
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            Live files
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm"
          >
            ×
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400 dark:text-gray-600 p-4 text-center">
          Files the agent edits will appear here as it works.
        </div>
      </aside>
    );
  }

  const lang = detectLang(activePath);
  const fileName = activePath?.split("/").pop() || activePath;
  const dir =
    activePath?.includes("/") && activePath !== fileName
      ? activePath.slice(0, activePath.lastIndexOf("/"))
      : "";

  return (
    <aside
      style={{ width }}
      className="border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col"
    >
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          Live files{" "}
          <span className="text-gray-400 dark:text-gray-600">
            · {fileSummary.length}
          </span>
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm"
        >
          ×
        </button>
      </div>

      <div className="px-2 py-1.5 border-b border-gray-200 dark:border-gray-800 overflow-x-auto whitespace-nowrap flex gap-1">
        {fileSummary.map((s) => (
          <button
            key={s.path}
            onClick={() => setActivePath(s.path)}
            title={s.path}
            className={`px-2 py-1 text-[11px] font-mono rounded shrink-0 ${
              s.path === activePath
                ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {s.path.split("/").pop()}
            {s.count > 1 && (
              <span className="ml-1 text-[9px] text-gray-400">×{s.count}</span>
            )}
          </button>
        ))}
      </div>

      {activePath && (
        <div
          className="px-3 py-1 text-[10px] font-mono text-gray-400 dark:text-gray-600 border-b border-gray-200 dark:border-gray-800 truncate"
          title={activePath}
        >
          {dir ? <span>{dir}/</span> : null}
          <span className="text-gray-700 dark:text-gray-300 font-semibold">
            {fileName}
          </span>
          <span className="ml-2 px-1 rounded bg-gray-100 dark:bg-gray-800">
            {lang}
          </span>
          {loading && (
            <span className="ml-2 text-emerald-500">refreshing…</span>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto bg-[#0d1117]">
        {error ? (
          <div className="p-3 text-xs text-red-400 font-mono">⚠ {error}</div>
        ) : content ? (
          <HighlightedFile
            content={content}
            lang={lang}
            highlightLines={highlightLines}
          />
        ) : (
          <div className="p-3 text-xs text-gray-500 font-mono">
            {loading ? "loading…" : "(empty)"}
          </div>
        )}
      </div>
    </aside>
  );
}
