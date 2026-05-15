import { useEffect, useReducer, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useMcpData } from "../hooks/useMcpData";
import {
  useMcpActions,
  nodeFromParams,
  buildPath,
  mcpReducer,
  INITIAL_STATE,
} from "../hooks/useMcpActions";
import McpLayout from "../components/mcp/McpLayout";
import McpTree from "../components/mcp/McpTree";
import McpDetailPane from "../components/mcp/McpDetailPane";
import CatalogModal from "../components/mcp/CatalogModal";
import McpModal from "../components/mcp/McpModal";

export default function Mcp() {
  const { data, loading, error, refetch } = useMcpData();
  const [catalog, setCatalog] = useState([]);
  const [state, dispatch] = useReducer(mcpReducer, INITIAL_STATE);
  const params = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onSelect = (node) => navigate(buildPath(node));
  const { saving, openEdit, handleDelete, handleSaveEdit, handleCatalogAdd } =
    useMcpActions({ refetch, dispatch, modalProps: state.modalProps });

  useEffect(() => {
    api
      .getCatalog()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    dispatch({ type: "SELECT", node: nodeFromParams(params, pathname) });
  }, [params.serverId, params.companyId, params.repoId, pathname]);

  const openCatalog = (repo) =>
    dispatch({
      type: "OPEN_MODAL",
      modal: "catalog",
      props: { targetRepo: repo || null },
    });

  return (
    <McpLayout
      search={state.search}
      onSearch={(v) => dispatch({ type: "SET_SEARCH", value: v })}
      onAddCatalog={() => openCatalog(null)}
      left={
        loading ? (
          <div className="text-xs text-gray-400 p-2">Loading…</div>
        ) : error ? (
          <div className="text-xs text-red-500 p-2">Failed to load</div>
        ) : (
          <McpTree
            data={data}
            selectedNode={state.selectedNode}
            onSelect={onSelect}
          />
        )
      }
    >
      {loading ? (
        <div className="text-sm text-gray-400 p-4">Loading…</div>
      ) : (
        <McpDetailPane
          data={data}
          selectedNode={state.selectedNode}
          onSelect={onSelect}
          onEditServer={openEdit}
          onDeleteServer={handleDelete}
          onAddCatalogForRepo={openCatalog}
        />
      )}
      {state.modal === "catalog" && (
        <CatalogModal
          open
          onClose={() => dispatch({ type: "CLOSE_MODAL" })}
          catalog={catalog}
          existingNames={(data?.global?.servers || []).map((s) => s.name)}
          targetRepo={state.modalProps.targetRepo}
          onAdd={handleCatalogAdd}
        />
      )}
      {state.modal === "edit" && (
        <McpModal
          modal={state.modalProps}
          saving={saving}
          onChange={(patch) =>
            dispatch({
              type: "OPEN_MODAL",
              modal: "edit",
              props: {
                ...state.modalProps,
                form: { ...state.modalProps.form, ...patch },
              },
            })
          }
          onSave={handleSaveEdit}
          onClose={() => dispatch({ type: "CLOSE_MODAL" })}
          isRepo={state.modalProps.isRepo}
        />
      )}
    </McpLayout>
  );
}
