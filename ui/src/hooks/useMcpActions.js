import { useState } from "react";
import { toast } from "sonner";
import { api } from "../api";
import { dialog } from "../components/Dialog";
import {
  EMPTY_FORM,
  configFromForm,
  formFromConfig,
} from "../components/mcp/mcpForm";

export function useMcpActions({ refetch, dispatch, modalProps }) {
  const [saving, setSaving] = useState(false);

  function openEdit(server, repoOrNull) {
    const scope = repoOrNull ? "repo" : "global";
    dispatch({
      type: "OPEN_MODAL",
      modal: "edit",
      props: {
        project: repoOrNull?.name,
        form: {
          ...formFromConfig(server.name, scope, server.config || {}),
          scope,
        },
        mode: "edit",
        isRepo: !!repoOrNull,
      },
    });
  }

  async function handleDelete(server, repoOrNull) {
    const target = repoOrNull ? repoOrNull.name : "global";
    if (
      !(await dialog.confirm({
        message: `Remove "${server.name}" from ${target}?`,
        tone: "danger",
        confirmLabel: "Delete",
      }))
    )
      return;
    try {
      if (repoOrNull) await api.deleteRepoMcp(repoOrNull.name, server.name);
      else await api.deleteMcp("global", server.name);
      refetch();
    } catch (err) {
      toast.error("Failed to delete: " + err.message);
    }
  }

  async function handleSaveEdit() {
    const { form, isRepo, project } = modalProps || {};
    if (!form?.name?.trim()) return;
    setSaving(true);
    try {
      const cfg = configFromForm(form);
      if (isRepo) await api.upsertRepoMcp(project, form.name.trim(), cfg);
      else await api.upsertMcp(form.scope, form.name.trim(), cfg);
      dispatch({ type: "CLOSE_MODAL" });
      refetch();
    } catch (err) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCatalogAdd(item, targetRepo) {
    try {
      const hasEmptyEnv =
        item.config.env && Object.values(item.config.env).some((v) => v === "");
      if (hasEmptyEnv) {
        dispatch({
          type: "OPEN_MODAL",
          modal: "edit",
          props: {
            project: targetRepo?.name,
            isRepo: !!targetRepo,
            mode: "add",
            form: {
              ...EMPTY_FORM,
              ...formFromConfig(
                item.name,
                targetRepo ? "repo" : "global",
                item.config,
              ),
              scope: targetRepo ? "repo" : "global",
            },
          },
        });
      } else if (targetRepo) {
        await api.upsertRepoMcp(targetRepo.name, item.name, item.config);
        dispatch({ type: "CLOSE_MODAL" });
        refetch();
      } else {
        await api.upsertMcp("global", item.name, item.config);
        dispatch({ type: "CLOSE_MODAL" });
        refetch();
      }
    } catch (err) {
      toast.error("Failed: " + err.message);
    }
  }

  return { saving, openEdit, handleDelete, handleSaveEdit, handleCatalogAdd };
}

export function buildPath(node) {
  if (!node || node.type === "dashboard") return "/mcp";
  if (node.type === "global") return "/mcp/global";
  if (node.type === "global-server")
    return `/mcp/global/${encodeURIComponent(node.id)}`;
  if (node.type === "company")
    return `/mcp/company/${encodeURIComponent(node.id)}`;
  if (node.type === "repo")
    return `/mcp/company/${encodeURIComponent(node.parentId)}/repo/${encodeURIComponent(node.id)}`;
  if (node.type === "unaffiliated")
    return node.id
      ? `/mcp/unaffiliated/${encodeURIComponent(node.id)}`
      : "/mcp";
  return "/mcp";
}

export function nodeFromParams(params, pathname) {
  if (pathname === "/mcp" || pathname === "/mcp/") return { type: "dashboard" };
  if (params.serverId) return { type: "global-server", id: params.serverId };
  if (pathname.startsWith("/mcp/global")) return { type: "global" };
  if (params.repoId && params.companyId)
    return { type: "repo", id: params.repoId, parentId: params.companyId };
  if (params.companyId) return { type: "company", id: params.companyId };
  if (params.repoId) return { type: "unaffiliated", id: params.repoId };
  if (pathname.startsWith("/mcp/unaffiliated")) return { type: "unaffiliated" };
  return { type: "dashboard" };
}

export const INITIAL_STATE = {
  modal: null,
  modalProps: {},
  selectedNode: { type: "dashboard" },
  search: "",
};

export function mcpReducer(state, action) {
  switch (action.type) {
    case "OPEN_MODAL":
      return { ...state, modal: action.modal, modalProps: action.props || {} };
    case "CLOSE_MODAL":
      return { ...state, modal: null, modalProps: {} };
    case "SELECT":
      return { ...state, selectedNode: action.node };
    case "SET_SEARCH":
      return { ...state, search: action.value };
    default:
      return state;
  }
}
