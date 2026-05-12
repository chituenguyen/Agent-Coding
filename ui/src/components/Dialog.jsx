// Imperative confirm() / prompt() / alert() replacements using a custom modal
// that matches the cofounder-skin. Mount <DialogHost /> once in App.jsx, then
// call dialog.confirm(...) / dialog.prompt(...) / dialog.alert(...) from anywhere.

import { useEffect, useRef, useState } from "react";

let _push = null;

export const dialog = {
  confirm: (opts) => open({ kind: "confirm", ...opts }),
  prompt: (opts) => open({ kind: "prompt", ...opts }),
  alert: (opts) => open({ kind: "alert", ...opts }),
};

function open(opts) {
  return new Promise((resolve) => {
    if (!_push) {
      resolve(opts.kind === "prompt" ? null : false);
      return;
    }
    _push({ ...opts, resolve });
  });
}

export function DialogHost() {
  const [queue, setQueue] = useState([]);
  const current = queue[0];

  useEffect(() => {
    _push = (item) => setQueue((q) => [...q, item]);
    return () => {
      _push = null;
    };
  }, []);

  function close(result) {
    if (!current) return;
    current.resolve(result);
    setQueue((q) => q.slice(1));
  }

  if (!current) return null;
  return <DialogModal key={queue.length} item={current} onClose={close} />;
}

function DialogModal({ item, onClose }) {
  const isPrompt = item.kind === "prompt";
  const isAlert = item.kind === "alert";
  const [value, setValue] = useState(item.defaultValue || "");
  const inputRef = useRef(null);

  useEffect(() => {
    if (isPrompt) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(isPrompt ? null : false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPrompt, onClose]);

  function submit(e) {
    e?.preventDefault?.();
    if (isPrompt) onClose(value);
    else onClose(true);
  }

  const tone = item.tone || (isAlert ? "info" : "default");
  const accent =
    tone === "danger"
      ? "rgb(var(--co-destructive-rgb))"
      : tone === "success"
        ? "rgb(var(--co-success-rgb))"
        : "rgb(var(--co-accent-rgb))";

  const confirmLabel =
    item.confirmLabel || (isPrompt ? "OK" : isAlert ? "Got it" : "Confirm");
  const cancelLabel = item.cancelLabel || "Cancel";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/35 backdrop-blur-sm"
        onClick={() => onClose(isPrompt ? null : false)}
      />
      <form
        onSubmit={submit}
        className="cofounder-skin relative w-full max-w-sm overflow-hidden rounded-co-lg border border-co-fg/10 bg-co-surface shadow-2xl"
      >
        <div
          className="h-1 w-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          }}
        />
        <div className="px-6 py-5">
          {item.title && (
            <h3 className="text-base font-semibold tracking-tight text-co-fg">
              {item.title}
            </h3>
          )}
          {item.message && (
            <p
              className={`text-xs leading-relaxed text-co-fg/65 ${item.title ? "mt-2" : ""}`}
            >
              {item.message}
            </p>
          )}
          {isPrompt && (
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={item.placeholder || ""}
              className="mt-4 w-full rounded-co-sm border border-co-fg/15 bg-co-bg px-3 py-2 text-sm text-co-fg outline-none focus:border-co-fg/40"
            />
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-co-fg/10 bg-co-bg/40 px-6 py-3">
          {!isAlert && (
            <button
              type="button"
              onClick={() => onClose(isPrompt ? null : false)}
              className="rounded-co-sm px-3 py-1.5 text-xs font-medium text-co-fg/60 transition-colors hover:bg-co-fg/[0.05] hover:text-co-fg"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="submit"
            className="rounded-co-sm px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            style={{
              background:
                tone === "danger"
                  ? "rgb(var(--co-destructive-rgb))"
                  : "rgb(var(--co-primary-rgb))",
              color:
                tone === "danger" ? "white" : "rgb(var(--co-primary-fg-rgb))",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
