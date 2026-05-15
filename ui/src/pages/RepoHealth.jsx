import { useEffect, useReducer, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { api } from "../api";
import RepoHealthLayout from "../components/repos/RepoHealthLayout";
import RepoHealthCard from "../components/repos/RepoHealthCard";
import RepoHealthDetailPane from "../components/repos/RepoHealthDetailPane";
import ClaudeMdEditor from "../components/repos/ClaudeMdEditor";

const INITIAL = { search: "", refreshKey: 0 };

function reducer(state, action) {
  switch (action.type) {
    case "SET_SEARCH":
      return { ...state, search: action.value };
    case "REFRESH":
      return { ...state, refreshKey: state.refreshKey + 1 };
    default:
      return state;
  }
}

export default function RepoHealth() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();

  const selectedName = params.name || null;
  const editorOpen = location.pathname.endsWith("/claude-md");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getRepositories()
      .then((list) => {
        if (cancelled) return;
        setRepos(list || []);
        setLoadError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.refreshKey]);

  const filtered = state.search
    ? repos.filter((r) => {
        const q = state.search.toLowerCase();
        return (
          (r.name || "").toLowerCase().includes(q) ||
          (r.repoPath || "").toLowerCase().includes(q) ||
          (r.company?.name || "").toLowerCase().includes(q)
        );
      })
    : repos;

  function openRepo(name) {
    if (selectedName === name && !editorOpen) {
      navigate("/repos");
    } else {
      navigate(`/repos/${encodeURIComponent(name)}`);
    }
  }

  function closeDetail() {
    navigate("/repos");
  }

  function openEditor(name) {
    navigate(`/repos/${encodeURIComponent(name)}/claude-md`);
  }

  function closeEditor() {
    if (selectedName) {
      navigate(`/repos/${encodeURIComponent(selectedName)}`);
    } else {
      navigate("/repos");
    }
  }

  const grid = (
    <>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 h-32 animate-pulse"
            />
          ))}
        </div>
      ) : loadError ? (
        <div className="text-sm text-red-500">
          Failed to load repositories: {loadError.message || String(loadError)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
          {state.search
            ? "No repositories match your search."
            : "No repositories configured. Add one in mcp_server.json."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((r) => (
            <RepoHealthCard
              key={`${r.name}-${state.refreshKey}`}
              name={r.name}
              repoPath={r.repoPath}
              company={r.company}
              selected={selectedName === r.name}
              onOpen={openRepo}
            />
          ))}
        </div>
      )}
    </>
  );

  const detail = selectedName ? (
    <RepoHealthDetailPane
      key={`${selectedName}-${state.refreshKey}`}
      name={selectedName}
      onClose={closeDetail}
      onEditClaudeMd={openEditor}
    />
  ) : null;

  return (
    <>
      <RepoHealthLayout
        search={state.search}
        onSearch={(v) => dispatch({ type: "SET_SEARCH", value: v })}
        onRefresh={() => dispatch({ type: "REFRESH" })}
        refreshing={loading}
        left={grid}
        right={detail}
      />
      {editorOpen && selectedName && (
        <ClaudeMdEditor
          name={selectedName}
          onClose={closeEditor}
          onSaved={() => dispatch({ type: "REFRESH" })}
        />
      )}
    </>
  );
}
