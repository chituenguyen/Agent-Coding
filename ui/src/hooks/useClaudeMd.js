import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

export function useClaudeMd(name) {
  const [content, setContent] = useState("");
  const [mtime, setMtime] = useState(null);
  const [path, setPath] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exists, setExists] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!name) return;
    setLoading(true);
    setError(null);
    setConflict(null);
    try {
      const result = await api.getRepoClaudeMd(name);
      if (!mounted.current) return;
      setContent(result.content || "");
      setMtime(result.mtime || null);
      setPath(result.path || null);
      setExists(true);
    } catch (e) {
      if (!mounted.current) return;
      if (e.status === 404) {
        setContent("");
        setMtime(null);
        setPath(e.body?.path || null);
        setExists(false);
      } else {
        setError(e);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const save = useCallback(
    async (newContent, opts = {}) => {
      setSaving(true);
      setError(null);
      try {
        const expected = opts.overrideExpectedMtime ?? (exists ? mtime : null);
        const result = await api.putRepoClaudeMd(name, {
          content: newContent,
          expectedMtime: expected,
        });
        if (!mounted.current) return { ok: true };
        setContent(newContent);
        setMtime(result.mtime || null);
        setPath(result.path || path);
        setExists(true);
        setConflict(null);
        return { ok: true };
      } catch (e) {
        if (e.status === 409) {
          if (mounted.current) {
            setConflict({
              localContent: newContent,
              remoteContent: e.body?.currentContent ?? "",
              remoteMtime: e.body?.currentMtime ?? null,
            });
          }
          return { ok: false, conflict: true };
        }
        if (mounted.current) setError(e);
        return { ok: false, error: e };
      } finally {
        if (mounted.current) setSaving(false);
      }
    },
    [exists, mtime, name, path],
  );

  const resolveConflict = useCallback(
    async (action) => {
      if (!conflict) return { ok: false };
      if (action === "reload") {
        setContent(conflict.remoteContent);
        setMtime(conflict.remoteMtime);
        setExists(true);
        setConflict(null);
        return { ok: true };
      }
      if (action === "overwrite") {
        return await save(conflict.localContent, {
          overrideExpectedMtime: conflict.remoteMtime,
        });
      }
      if (action === "cancel") {
        setConflict(null);
        return { ok: true };
      }
      return { ok: false };
    },
    [conflict, save],
  );

  return {
    content,
    mtime,
    path,
    exists,
    loading,
    saving,
    error,
    conflict,
    save,
    resolveConflict,
    reload: load,
  };
}
