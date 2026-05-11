import { useState, useMemo } from "react";
import hljs from "highlight.js/lib/common";

const EXT_LANG = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  md: "markdown",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
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

function Highlighted({ code, lang }) {
  const html = useMemo(() => {
    if (!code) return "";
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true })
          .value;
      }
      return hljs.highlightAuto(code).value;
    } catch {
      // Escape manually if highlighting fails
      return code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
  }, [code, lang]);
  return (
    <pre className="!my-0 !p-2 overflow-x-auto text-[11px] leading-snug bg-[#0d1117]">
      <code
        className={`hljs language-${lang}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </pre>
  );
}

function CopyButton({ text, label = "copy" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="text-[10px] text-gray-400 hover:text-gray-100"
    >
      {copied ? "✓" : label}
    </button>
  );
}

function EditDiff({ oldString, newString, lang }) {
  return (
    <div className="space-y-1">
      {oldString ? (
        <div className="border border-red-300 dark:border-red-900/60 rounded-md overflow-hidden">
          <div className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 flex items-center justify-between">
            <span>− removed</span>
            <CopyButton text={oldString} />
          </div>
          <Highlighted code={oldString} lang={lang} />
        </div>
      ) : null}
      {newString ? (
        <div className="border border-emerald-300 dark:border-emerald-900/60 rounded-md overflow-hidden">
          <div className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
            <span>+ added</span>
            <CopyButton text={newString} />
          </div>
          <Highlighted code={newString} lang={lang} />
        </div>
      ) : null}
    </div>
  );
}

export default function FileEditCard({ tool, input }) {
  const [expanded, setExpanded] = useState(true);
  const filePath = input?.file_path || input?.path || "?";
  const fileName = filePath.split("/").pop() || filePath;
  const dir =
    filePath.includes("/") && filePath !== fileName
      ? filePath.slice(0, filePath.lastIndexOf("/"))
      : "";
  const lang = detectLang(filePath);

  const isWrite = tool === "Write";
  const isMulti = tool === "MultiEdit";
  const isEdit = tool === "Edit";

  const lineCount = (s) => (s ? s.split("\n").length : 0);
  let stats = "";
  if (isWrite) {
    stats = `+${lineCount(input?.content)}`;
  } else if (isEdit) {
    stats = `−${lineCount(input?.old_string)} +${lineCount(input?.new_string)}`;
  } else if (isMulti) {
    const edits = input?.edits || [];
    const minus = edits.reduce((a, e) => a + lineCount(e.old_string), 0);
    const plus = edits.reduce((a, e) => a + lineCount(e.new_string), 0);
    stats = `${edits.length} edits · −${minus} +${plus}`;
  }

  const accent = isWrite
    ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/60"
    : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/60";

  return (
    <div className="my-1.5 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 text-left"
      >
        <span
          className={`px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded border ${accent}`}
        >
          {tool}
        </span>
        <span className="font-mono text-xs text-gray-900 dark:text-gray-100 truncate">
          {fileName}
        </span>
        {dir && (
          <span
            className="font-mono text-[10px] text-gray-400 dark:text-gray-500 truncate min-w-0 flex-1"
            title={dir}
          >
            {dir}
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-gray-500 dark:text-gray-400 shrink-0">
          {stats}
        </span>
        <svg
          className={`w-3 h-3 text-gray-400 shrink-0 transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-950/60">
          {isWrite && (
            <div className="border border-blue-200 dark:border-blue-900/60 rounded-md overflow-hidden">
              <div className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 flex items-center justify-between">
                <span>new file · {lang}</span>
                <CopyButton text={input?.content || ""} />
              </div>
              <Highlighted code={input?.content || ""} lang={lang} />
            </div>
          )}
          {isEdit && (
            <EditDiff
              oldString={input?.old_string}
              newString={input?.new_string}
              lang={lang}
            />
          )}
          {isMulti && (
            <div className="space-y-2">
              {(input?.edits || []).map((e, i) => (
                <div key={i}>
                  <div className="text-[9px] font-mono text-gray-400 dark:text-gray-500 mb-0.5">
                    edit #{i + 1}
                    {e.replace_all ? " (replace all)" : ""}
                  </div>
                  <EditDiff
                    oldString={e.old_string}
                    newString={e.new_string}
                    lang={lang}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
