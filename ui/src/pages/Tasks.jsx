import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { api } from "../api";
import StatusBadge from "../components/StatusBadge";
import Terminal from "../components/Terminal";

import Modal from "../components/Modal";
import TaskFormFields from "../components/TaskFormFields";
import PromptEvaluator from "../components/PromptEvaluator";
import { toast } from "sonner";
import { dialog } from "../components/Dialog";

const EMPTY_FORM = {
  description: "",
  targetPath: "",
  ticketId: "",
  workflow: "sequential",
};

// ─── Task detail constants & helpers ────────────────────────────────────────

const STEPS = [
  { key: "created", label: "Created" },
  { key: "planned", label: "Spec Written" },
  { key: "coded", label: "Code Written" },
  { key: "reviewed", label: "Reviewed" },
  { key: "done", label: "Committed" },
];
const STATUS_TO_STEP = {
  created: 0,
  planned: 1,
  coded: 2,
  issues: 2,
  fixed: 2,
  approved: 3,
  done: 4,
};

// ─── Main page ───────────────────────────────────────────────────────────────

function EmptyTasks({ onCreate }) {
  return (
    <div className="relative mt-10 overflow-hidden rounded-co-lg border border-co-fg/10 bg-co-surface px-8 py-12 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgb(var(--co-accent-rgb)), transparent)",
          opacity: 0.5,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgb(var(--co-accent-rgb)) 0%, transparent 70%)",
        }}
      />
      <div className="relative mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-co bg-co-bg ring-1 ring-co-fg/[0.08]">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-co-fg/50"
        >
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      </div>
      <h3 className="text-base font-semibold tracking-tight text-co-fg">
        No tasks yet
      </h3>
      <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-co-fg/55">
        Describe what you want to build or fix — Architect, Coder and Reviewer
        agents will plan, code and ship it for you.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 rounded-co-sm bg-co-primary px-4 py-2 text-xs font-semibold text-co-primary-fg transition-opacity hover:opacity-90"
        >
          <span className="text-base leading-none">+</span>
          Create first task
        </button>
      </div>
    </div>
  );
}

function DetailPlaceholder() {
  return (
    <div className="relative z-10 hidden flex-1 items-center justify-center md:flex">
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -m-16 rounded-full opacity-[0.06] blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgb(var(--co-accent-rgb)) 0%, transparent 70%)",
          }}
        />
        <div className="relative flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-co-lg bg-co-surface ring-1 ring-co-fg/[0.08]">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-co-fg/40"
            >
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M8 10h8M8 14h5" />
            </svg>
          </div>
          <p className="text-sm font-medium text-co-fg/70">
            Select a task to view details
          </p>
          <p className="mt-1 text-[11px] text-co-fg/40">
            Or hit{" "}
            <kbd className="rounded bg-co-fg/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-co-fg/60">
              + New task
            </kbd>{" "}
            to start one.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Tasks() {
  const [searchParams] = useSearchParams();
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeProject, setActiveProject] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  // Auto-select task from URL params (e.g. ?project=X&task=Y&tab=fixes)
  const urlProject = searchParams.get("project");
  const urlTask = searchParams.get("task");
  const [selected, setSelected] = useState(
    urlProject && urlTask ? { project: urlProject, taskId: urlTask } : null,
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setTasks(await api.getTasks(companyId));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Silent refresh (no loading spinner)
  async function refresh() {
    try {
      setTasks(await api.getTasks(companyId));
    } catch {}
  }

  useEffect(() => {
    load();
  }, [companyId]);

  // Poll task list while any task is running or not in a terminal state
  useEffect(() => {
    const hasActive = tasks.some(
      (t) => t.running || (t.status !== "done" && t.status !== "created"),
    );
    if (!hasActive) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [tasks]);

  async function handleCreate() {
    if (!form.description.trim() || !form.targetPath.trim()) return;
    setCreating(true);
    try {
      const { taskId, project } = await api.createTask({
        description: form.description.trim(),
        targetPath: form.targetPath.trim(),
        ticketId: form.ticketId.trim() || undefined,
        companyId: companyId || undefined,
      });
      // Auto-add to queue so workflow starts immediately
      await api.addToQueue({
        description: form.description.trim(),
        target: form.targetPath.trim(),
        task_id: taskId,
        project,
        task_path: `tasks/${project}/${taskId}`,
        workflow: form.workflow === "team" ? "team" : "sequential",
        companyId: companyId || undefined,
      });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      await load();
      setSelected({ project, taskId });
    } catch (err) {
      toast.error("Failed to create task: " + err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(task, e) {
    e.stopPropagation();
    if (!(await dialog.confirm({ message: `Delete task "${plainDescription(task.description)}"?`, tone: "danger", confirmLabel: "Delete" })))
      return;
    try {
      await api.deleteTask(task.project, task.taskId);
      if (selected?.taskId === task.taskId) setSelected(null);
      load();
    } catch (err) {
      toast.error("Failed to delete: " + err.message);
    }
  }

  async function handleClearDone() {
    const done = tasks.filter((t) => t.status === "done");
    if (!done.length) return;
    if (
      !(await dialog.confirm({
        message: `Delete ${done.length} completed task${done.length !== 1 ? "s" : ""}?`,
        tone: "danger",
        confirmLabel: "Delete",
      }))
    )
      return;
    await Promise.all(done.map((t) => api.deleteTask(t.project, t.taskId)));
    if (selected && done.some((t) => t.taskId === selected.taskId))
      setSelected(null);
    load();
  }

  const projects = [...new Set(tasks.map((t) => t.project))].sort();
  const filtered =
    activeProject === "all"
      ? tasks
      : tasks.filter((t) => t.project === activeProject);
  const grouped = filtered.reduce((acc, t) => {
    if (!acc[t.project]) acc[t.project] = [];
    acc[t.project].push(t);
    return acc;
  }, {});

  return (
    <div className="cofounder-skin relative flex h-full overflow-hidden bg-co-bg">
      {/* decorative orb */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/3 h-[360px] w-[360px] rounded-full opacity-[0.06] blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgb(var(--co-accent-rgb)) 0%, transparent 70%)",
        }}
      />
      {/* ── Left: task list ── */}
      <div
        className={`relative z-10 flex flex-col overflow-hidden border-r border-co-fg/10 transition-all ${selected ? "hidden md:flex w-80 xl:w-96 shrink-0" : "flex-1 max-w-3xl"}`}
      >
        {/* Header */}
        <div className="shrink-0 px-6 pb-5 pt-7">
          {companyId && (
            <button
              onClick={() => navigate(`/co/${companyId}`)}
              className="group mb-3 inline-flex items-center gap-1.5 rounded-co-sm bg-co-fg/[0.04] px-2 py-1 text-[11px] font-medium text-co-fg/60 transition-colors hover:bg-co-fg/[0.07] hover:text-co-fg"
            >
              <span className="transition-transform group-hover:-translate-x-0.5">
                ←
              </span>
              {companyId}
            </button>
          )}
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-co-fg/40">
                <span className="h-px w-5 bg-co-fg/20" />
                Workspace
              </div>
              <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-co-fg">
                Tasks
              </h1>
              <p className="mt-1 text-xs text-co-fg/55">
                {loading
                  ? "Loading…"
                  : `${tasks.length} task${tasks.length !== 1 ? "s" : ""}${companyId ? ` · ${companyId}` : ""}`}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {tasks.some((t) => t.status === "done") && (
                <button
                  onClick={handleClearDone}
                  className="flex h-8 w-8 items-center justify-center rounded-co-sm text-co-fg/45 transition-colors hover:bg-co-destructive/10 hover:text-co-destructive"
                  title="Clear done"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 rounded-co-sm bg-co-primary px-3.5 py-2 text-xs font-semibold text-co-primary-fg transition-opacity hover:opacity-90"
              >
                <span className="text-base leading-none">+</span>
                New task
              </button>
            </div>
          </div>
        </div>

        {/* Project filter */}
        {!loading && projects.length > 1 && (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-6 pb-3">
            <button
              onClick={() => setActiveProject("all")}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                activeProject === "all"
                  ? "bg-co-primary text-co-primary-fg"
                  : "bg-co-fg/[0.05] text-co-fg/70 hover:bg-co-fg/[0.08] hover:text-co-fg"
              }`}
            >
              All
              <span
                className={`rounded-full px-1.5 py-0 text-[10px] ${
                  activeProject === "all"
                    ? "bg-co-primary-fg/15"
                    : "bg-co-fg/10 text-co-fg/55"
                }`}
              >
                {tasks.length}
              </span>
            </button>
            {projects.map((p) => (
              <button
                key={p}
                onClick={() => setActiveProject(p)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  activeProject === p
                    ? "bg-co-primary text-co-primary-fg"
                    : "bg-co-fg/[0.05] text-co-fg/70 hover:bg-co-fg/[0.08] hover:text-co-fg"
                }`}
              >
                {p}
                <span
                  className={`rounded-full px-1.5 py-0 text-[10px] ${
                    activeProject === p
                      ? "bg-co-primary-fg/15"
                      : "bg-co-fg/10 text-co-fg/55"
                  }`}
                >
                  {tasks.filter((t) => t.project === p).length}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-co-fg/45">
              <svg
                className="h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8z"
                />
              </svg>
              Loading…
            </div>
          ) : error ? (
            <div className="rounded-co border border-co-destructive/30 bg-co-destructive/[0.06] p-4 text-sm text-co-destructive">
              {error}
            </div>
          ) : tasks.length === 0 ? (
            <EmptyTasks onCreate={() => setShowCreate(true)} />
          ) : filtered.length === 0 ? (
            <div className="rounded-co border border-dashed border-co-fg/15 bg-co-bg/40 px-6 py-12 text-center text-sm text-co-fg/55">
              No tasks in this project
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([project, projectTasks]) => (
                <div key={project}>
                  {activeProject === "all" && (
                    <div className="mb-2 flex items-center gap-3">
                      <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-co-fg/45">
                        {project}
                      </h2>
                      <span className="rounded-full bg-co-fg/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-co-fg/55">
                        {projectTasks.length}
                      </span>
                      <span className="h-px flex-1 bg-co-fg/[0.08]" />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {projectTasks.map((task) => (
                      <TaskRow
                        key={task.taskId}
                        task={task}
                        selected={selected?.taskId === task.taskId}
                        onClick={() =>
                          setSelected({
                            project: task.project,
                            taskId: task.taskId,
                          })
                        }
                        onDelete={(e) => handleDelete(task, e)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: detail panel ── */}
      {selected ? (
        <div className="relative z-10 flex-1 overflow-y-auto bg-co-bg">
          <TaskDetailPanel
            key={selected.taskId}
            project={selected.project}
            taskId={selected.taskId}
            onClose={() => setSelected(null)}
            onDeleted={() => {
              setSelected(null);
              load();
            }}
          />
        </div>
      ) : (
        <DetailPlaceholder />
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal
          title="New Task"
          onClose={() => {
            setShowCreate(false);
            setForm(EMPTY_FORM);
          }}
          footer={
            <>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setForm(EMPTY_FORM);
                }}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={
                  creating ||
                  !form.description.trim() ||
                  !form.targetPath.trim()
                }
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? "Creating..." : "Create Task →"}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <TaskFormFields
              description={form.description}
              onDescriptionChange={(txt) =>
                setForm((f) => ({ ...f, description: txt }))
              }
              targetRepo={form.targetPath}
              onTargetChange={(v) => setForm((f) => ({ ...f, targetPath: v }))}
              ticketId={form.ticketId}
              onTicketChange={(v) => setForm((f) => ({ ...f, ticketId: v }))}
              mode="task"
              descriptionLabel="What do you want to build or fix?"
              placeholder="e.g. Build a login API with JWT authentication..."
              autoFocus
              onSubmit={handleCreate}
              targetRequired
            />

            {/* Workflow picker — sequential vs team */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Workflow
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, workflow: "sequential" }))
                  }
                  className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    form.workflow !== "team"
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 dark:border-indigo-400"
                      : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Sequential
                    </span>
                    {form.workflow !== "team" && (
                      <svg
                        className="w-4 h-4 text-indigo-600 dark:text-indigo-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                    <code className="font-mono">/workflow</code> — Architect →
                    Coder → Reviewer, one at a time
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, workflow: "team" }))}
                  className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    form.workflow === "team"
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 dark:border-indigo-400"
                      : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Team
                    </span>
                    {form.workflow === "team" && (
                      <svg
                        className="w-4 h-4 text-indigo-600 dark:text-indigo-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                    <code className="font-mono">/team-workflow</code> — FE + BE
                    + DevOps run in parallel, message each other
                  </p>
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Task row ────────────────────────────────────────────────────────────────

// Strip XML tags and return first meaningful line for display
function plainDescription(desc = "") {
  return desc
    .replace(/<\/?[\w_]+>/g, "")
    .replace(/\n+/g, " ")
    .trim();
}

function TaskRow({ task, selected, onClick, onDelete }) {
  const date = task.created
    ? new Date(task.created).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <div
      onClick={onClick}
      className={`group relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-co border px-3.5 py-2.5 transition-all ${
        selected
          ? "border-co-fg/15 bg-co-surface shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)]"
          : "border-co-fg/10 bg-co-surface/70 hover:border-co-fg/20 hover:bg-co-surface"
      }`}
    >
      {/* Accent rail on selected */}
      {selected && (
        <span
          aria-hidden
          className="absolute inset-y-1 left-0 w-0.5 rounded-r"
          style={{ background: "rgb(var(--co-accent-rgb))" }}
        />
      )}
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium transition-colors ${
            selected ? "text-co-fg" : "text-co-fg/85 group-hover:text-co-fg"
          }`}
        >
          {plainDescription(task.description)}
        </p>
        {date && (
          <p className="mt-0.5 text-[11px] text-co-fg/45">{date}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <StatusBadge
          status={
            task.running && task.status !== "done" ? "running" : task.status
          }
        />
        <button
          onClick={onDelete}
          title="Delete"
          className="flex h-6 w-6 items-center justify-center rounded-co-sm text-co-fg/30 opacity-0 transition-all hover:bg-co-destructive/10 hover:text-co-destructive group-hover:opacity-100"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Task detail panel ───────────────────────────────────────────────────────

function TaskDetailPanel({ project, taskId, onClose, onDeleted }) {
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fixes, setFixes] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [fixModal, setFixModal] = useState(false);
  const [fixDesc, setFixDesc] = useState("");
  const [fixCreating, setFixCreating] = useState(false);
  const [subtaskModal, setSubtaskModal] = useState(false);
  const [subtaskDesc, setSubtaskDesc] = useState("");
  const [subtaskCreating, setSubtaskCreating] = useState(false);
  const [toast, setToast] = useState(null);
  const [workflowRunning, setWorkflowRunning] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const detailTab = searchParams.get("tab") || "overview";
  const setDetailTab = (tab) =>
    setSearchParams(
      (prev) => {
        prev.set("tab", tab);
        return prev;
      },
      { replace: true },
    );

  const showToast = (msg, color = "green") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3500);
  };

  async function load() {
    setLoading(true);
    try {
      setTask(await api.getTask(project, taskId));
    } catch {
    } finally {
      setLoading(false);
    }
  }
  async function refresh() {
    try {
      setTask(await api.getTask(project, taskId));
    } catch {}
  }
  async function loadFixes() {
    try {
      setFixes(await api.getFixes(project, taskId));
    } catch {}
  }
  async function loadSubtasks() {
    try {
      setSubtasks(await api.getSubtasks(project, taskId));
    } catch {}
  }

  useEffect(() => {
    load();
    loadFixes();
    loadSubtasks();
  }, [project, taskId]);

  // Poll task + fixes/subtasks when anything is active (running/queued/non-done task)
  const hasActiveChild = [...fixes, ...subtasks].some(
    (i) => i.status === "running" || i.status === "queued",
  );
  const taskInProgress =
    task && task.status !== "done" && task.status !== "created";
  useEffect(() => {
    if (!hasActiveChild && !taskInProgress) return;
    const t = setInterval(() => {
      refresh();
      loadFixes();
      loadSubtasks();
    }, 3000);
    return () => clearInterval(t);
  }, [hasActiveChild, taskInProgress]);

  async function handleDelete() {
    if (!(await dialog.confirm({ message: `Delete task "${task?.description}"?`, tone: "danger", confirmLabel: "Delete" }))) return;
    try {
      await api.deleteTask(project, taskId);
      onDeleted();
    } catch (err) {
      toast.error("Failed: " + err.message);
    }
  }

  async function handleCreateSubtask() {
    if (!subtaskDesc.trim()) return;
    setSubtaskCreating(true);
    try {
      await api.createSubtask(project, taskId, {
        description: subtaskDesc.trim(),
      });
      setSubtaskModal(false);
      setSubtaskDesc("");
      await loadSubtasks();
      showToast("Sub-task created", "violet");
    } catch (err) {
      toast.error("Failed: " + err.message);
    } finally {
      setSubtaskCreating(false);
    }
  }

  async function handleCreateFix() {
    if (!fixDesc.trim()) return;
    setFixCreating(true);
    try {
      await api.createFix(project, taskId, { bugDescription: fixDesc.trim() });
      setFixModal(false);
      setFixDesc("");
      await loadFixes();
      showToast("Bug fix created", "orange");
    } catch (err) {
      toast.error("Failed: " + err.message);
    } finally {
      setFixCreating(false);
    }
  }

  async function handleQueueItem(type, item) {
    try {
      if (type === "fix") {
        const desc =
          item.bugMd
            ?.match(/## Description\s*\n+([\s\S]+?)(\n\n|$)/)?.[1]
            ?.trim() || item.fixId;
        await api.addFixToQueue(
          project,
          taskId,
          item.fixId,
          item.fixPath,
          desc,
        );
      } else {
        await api.addSubtaskToQueue(
          project,
          taskId,
          item.subtaskId,
          item.subtaskPath,
          item.description,
        );
      }
      type === "fix" ? await loadFixes() : await loadSubtasks();
      showToast(
        `${type === "fix" ? "Bug fix" : "Sub-task"} added to queue`,
        type === "fix" ? "orange" : "violet",
      );
    } catch (err) {
      toast.error("Failed: " + err.message);
    }
  }

  async function handleResetItem(type, item) {
    const label = type === "fix" ? "bug fix" : "sub-task";
    if (
      !(await dialog.confirm({
        title: `Reset ${label}?`,
        message: `All generated files (SPEC, code, review) will be deleted. Only the original description will be kept.`,
        tone: "danger",
        confirmLabel: "Reset",
      }))
    )
      return;
    try {
      if (type === "fix") {
        await api.resetFix(project, taskId, item.fixId);
        await loadFixes();
      } else {
        await api.resetSubtask(project, taskId, item.subtaskId);
        await loadSubtasks();
      }
      showToast(
        `${label.charAt(0).toUpperCase() + label.slice(1)} reset to created`,
        "green",
      );
    } catch (err) {
      toast.error("Failed: " + err.message);
    }
  }

  async function handleDeleteItem(type, item) {
    const label = type === "fix" ? "bug fix" : "sub-task";
    if (!(await dialog.confirm({ message: `Delete this ${label}?`, tone: "danger", confirmLabel: "Delete" }))) return;
    try {
      if (type === "fix") {
        await api.deleteFix(project, taskId, item.fixId);
        await loadFixes();
      } else {
        await api.deleteSubtask(project, taskId, item.subtaskId);
        await loadSubtasks();
      }
      showToast(
        `${label.charAt(0).toUpperCase() + label.slice(1)} deleted`,
        "green",
      );
    } catch (err) {
      toast.error("Failed: " + err.message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm p-8">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8z"
          />
        </svg>
        Loading...
      </div>
    );
  }

  if (!task)
    return (
      <div className="p-8 text-sm text-gray-400 dark:text-gray-500">
        Task not found.
      </div>
    );

  const stepIndex = STATUS_TO_STEP[task.status] ?? 0;
  const hasIssues = task.status === "issues";
  const inProgressStep =
    taskInProgress && stepIndex < STEPS.length - 1 ? stepIndex + 1 : -1;

  return (
    <div className="p-6 max-w-2xl relative">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-white text-sm font-medium flex items-center gap-2 transition-all ${
            toast.color === "violet"
              ? "bg-violet-600"
              : toast.color === "orange"
                ? "bg-orange-500"
                : "bg-green-600"
          }`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
              {task.taskId}
            </span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {task.project}
            </span>
            {task.targetPath && task.targetPath !== "N/A" && (
              <>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate max-w-xs">
                  {task.targetPath}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <StatusBadge
              status={
                task.running && task.status !== "done" ? "running" : task.status
              }
            />
            {task.status === "done" && (
              <>
                <button
                  onClick={() => {
                    setDetailTab("subtasks");
                    setSubtaskDesc("");
                    setSubtaskModal(true);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-violet-200 dark:border-violet-800 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950 rounded-lg transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                    />
                  </svg>
                  Sub-task
                </button>
                <button
                  onClick={() => {
                    setDetailTab("fixes");
                    setFixDesc("");
                    setFixModal(true);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950 rounded-lg transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    />
                  </svg>
                  Fix Bug
                </button>
              </>
            )}
            <button
              onClick={handleDelete}
              title="Delete task"
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
            <button
              onClick={onClose}
              title="Close"
              className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
        <DescriptionCard description={task.description} />
      </div>

      {/* Progress steps */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-4">
        <div className="flex items-center">
          {STEPS.map((step, i) => (
            <div
              key={step.key}
              className="flex items-center flex-1 last:flex-none"
            >
              <div className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    i < stepIndex
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : i === stepIndex
                        ? hasIssues
                          ? "bg-red-500 border-red-500 text-white"
                          : "bg-indigo-600 border-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-indigo-900"
                        : i === inProgressStep
                          ? "bg-yellow-400 border-yellow-400 text-yellow-900 ring-4 ring-yellow-100 dark:ring-yellow-900 animate-pulse"
                          : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600"
                  }`}
                >
                  {i < stepIndex ? (
                    <svg
                      className="w-3.5 h-3.5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  ) : i === inProgressStep ? (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8z"
                      />
                    </svg>
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <span
                  className={`text-xs mt-1 whitespace-nowrap font-medium ${
                    i <= stepIndex
                      ? "text-gray-700 dark:text-gray-200"
                      : i === inProgressStep
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "text-gray-300 dark:text-gray-600"
                  }`}
                >
                  {i === inProgressStep ? `${step.label}...` : step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1.5 mb-5 transition-all ${
                    i < stepIndex
                      ? "bg-indigo-600"
                      : i === stepIndex && inProgressStep > stepIndex
                        ? "bg-yellow-300 dark:bg-yellow-700 animate-pulse"
                        : "bg-gray-200 dark:bg-gray-700"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        {hasIssues && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-start gap-2">
            <svg
              className="w-4 h-4 text-red-500 mt-0.5 shrink-0"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <p className="text-xs text-red-600 dark:text-red-400">
              Reviewer found issues. Run the workflow again or check the Issues
              file below.
            </p>
          </div>
        )}
      </div>

      {/* Workflow live terminal — shown when task is in-progress or running */}
      {task.status !== "done" && (
        <div className="mb-4">
          <Terminal
            taskPath={`tasks/${project}/${taskId}`}
            onDone={() => {
              setWorkflowRunning(false);
              load();
              loadFixes();
              loadSubtasks();
            }}
            onRunningChange={setWorkflowRunning}
          />
        </div>
      )}

      {/* Tabs — only shown for done tasks */}
      {task.status === "done" && (
        <div className="flex items-center gap-0.5 mb-4 border-b border-gray-200 dark:border-gray-700">
          {[
            { key: "overview", label: "Overview" },
            {
              key: "fixes",
              label: "Bug Fixes",
              count: fixes.length,
              color: "orange",
            },
            {
              key: "subtasks",
              label: "Sub-tasks",
              count: subtasks.length,
              color: "violet",
            },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setDetailTab(tab.key)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                detailTab === tab.key
                  ? "border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400"
                  : "border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none ${
                    detailTab === tab.key
                      ? tab.color === "orange"
                        ? "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400"
                        : tab.color === "violet"
                          ? "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400"
                          : "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400"
                      : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Tab: Overview (output files) — shown always for non-done, or when overview tab selected */}
      {(task.status !== "done" || detailTab === "overview") &&
        (task.files.spec ||
          task.files.approval ||
          task.files.issues ||
          task.files.commit ||
          task.files.backendSummary ||
          task.files.frontendSummary ||
          task.files.fixLog) && (
          <div className="mb-4">
            {task.status !== "done" && (
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Output Files
              </h2>
            )}
            <div className="space-y-2">
              {task.files.spec && (
                <FileCard title="SPEC.md" content={task.files.spec} />
              )}
              {task.files.backendSummary && (
                <FileCard
                  title="Backend Summary"
                  content={task.files.backendSummary}
                />
              )}
              {task.files.frontendSummary && (
                <FileCard
                  title="Frontend Summary"
                  content={task.files.frontendSummary}
                />
              )}
              {task.files.issues && (
                <FileCard
                  title="Issues Found"
                  content={task.files.issues}
                  variant="red"
                  defaultOpen
                />
              )}
              {task.files.fixLog && (
                <FileCard
                  title="Fix Log"
                  content={task.files.fixLog}
                  variant="orange"
                />
              )}
              {task.files.approval && (
                <FileCard
                  title="Approval"
                  content={task.files.approval}
                  variant="green"
                  defaultOpen
                />
              )}
              {task.files.commit && (
                <FileCard
                  title="Commit Info"
                  content={task.files.commit}
                  variant="indigo"
                  defaultOpen
                />
              )}
            </div>
          </div>
        )}

      {/* Tab: Bug Fixes */}
      {task.status === "done" && detailTab === "fixes" && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Report and track bug fixes for this completed task.
            </p>
            <button
              onClick={() => {
                setFixDesc("");
                setFixModal(true);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Report Bug
            </button>
          </div>
          {fixes.length === 0 ? (
            <div className="text-center py-10 text-gray-400 dark:text-gray-500">
              <svg
                className="w-10 h-10 mx-auto mb-2 opacity-30"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                />
              </svg>
              <p className="text-xs">No bug fixes reported yet.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {fixes.map((fix) => (
                <ChildRow
                  key={fix.fixId}
                  item={fix}
                  type="fix"
                  onQueue={() => handleQueueItem("fix", fix)}
                  onDelete={() => handleDeleteItem("fix", fix)}
                  onReset={() => handleResetItem("fix", fix)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Sub-tasks */}
      {task.status === "done" && detailTab === "subtasks" && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Add follow-up work that builds on this completed task.
            </p>
            <button
              onClick={() => {
                setSubtaskDesc("");
                setSubtaskModal(true);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New Sub-task
            </button>
          </div>
          {subtasks.length === 0 ? (
            <div className="text-center py-10 text-gray-400 dark:text-gray-500">
              <svg
                className="w-10 h-10 mx-auto mb-2 opacity-30"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <p className="text-xs">No sub-tasks yet.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {subtasks.map((st) => (
                <ChildRow
                  key={st.subtaskId}
                  item={st}
                  type="subtask"
                  onQueue={() => handleQueueItem("subtask", st)}
                  onDelete={() => handleDeleteItem("subtask", st)}
                  onReset={() => handleResetItem("subtask", st)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sub-task modal */}
      {subtaskModal && (
        <Modal
          title="New Sub-task"
          onClose={() => setSubtaskModal(false)}
          footer={
            <>
              <button
                onClick={() => setSubtaskModal(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSubtask}
                disabled={subtaskCreating || !subtaskDesc.trim()}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {subtaskCreating ? "Creating..." : "Create →"}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Describe what to build next. Agents will use the original task's
              SPEC, implementation, and all prior changes as context — building
              on top without duplicating or conflicting.
            </p>
            <textarea
              value={subtaskDesc}
              onChange={(e) => setSubtaskDesc(e.target.value)}
              placeholder="e.g. Add OAuth login with Google and GitHub providers."
              rows={4}
              autoFocus
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                  handleCreateSubtask();
              }}
            />
            {task.targetPath && task.targetPath !== "N/A" && (
              <PromptEvaluator
                value={subtaskDesc}
                targetRepo={task.targetPath}
                mode="subtask"
                onRewrite={(txt) => setSubtaskDesc(txt)}
              />
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Cmd+Enter to add to queue
            </p>
          </div>
        </Modal>
      )}

      {/* Fix Bug modal */}
      {fixModal && (
        <Modal
          title="Report a Bug"
          onClose={() => setFixModal(false)}
          footer={
            <>
              <button
                onClick={() => setFixModal(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFix}
                disabled={fixCreating || !fixDesc.trim()}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {fixCreating ? "Creating..." : "Create →"}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Describe the bug clearly. The AI will use the original task's
              SPEC, approval, and all prior fixes as context to trace the root
              cause and apply a surgical fix.
            </p>
            <textarea
              value={fixDesc}
              onChange={(e) => setFixDesc(e.target.value)}
              placeholder="e.g. The login button does nothing after clicking. Expected: redirect to dashboard."
              rows={4}
              autoFocus
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                  handleCreateFix();
              }}
            />
            {task.targetPath && task.targetPath !== "N/A" && (
              <PromptEvaluator
                value={fixDesc}
                targetRepo={task.targetPath}
                mode="fix"
                onRewrite={(txt) => setFixDesc(txt)}
              />
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Cmd+Enter to add to queue
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Child row (fix or subtask) ──────────────────────────────────────────────

const CHILD_STATUS = {
  queued: {
    label: "Queued",
    cls: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
  },
  running: {
    label: "Running",
    cls: "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300",
  },
  investigated: {
    label: "Investigated",
    cls: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
  },
  debugged: {
    label: "Debugged",
    cls: "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300",
  },
  planned: {
    label: "Planned",
    cls: "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300",
  },
  approved: {
    label: "Approved",
    cls: "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300",
  },
  issues: {
    label: "Issues",
    cls: "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300",
  },
  fixed: {
    label: "Fixed",
    cls: "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300",
  },
  done: {
    label: "Done",
    cls: "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300",
  },
  failed: {
    label: "Failed",
    cls: "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300",
  },
  created: {
    label: "Created",
    cls: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
  },
};

const FIX_STEPS = [
  { key: "created", label: "Created" },
  { key: "investigated", label: "Investigated" },
  { key: "debugged", label: "Debugged" },
  { key: "reviewed", label: "Reviewed" },
  { key: "fixed", label: "Fixed" },
];
const FIX_STATUS_TO_STEP = {
  created: 0,
  investigated: 1,
  debugged: 2,
  issues: 3,
  approved: 3,
  fixed: 4,
  done: 4,
};

const SUBTASK_STEPS = [
  { key: "created", label: "Created" },
  { key: "planned", label: "Spec Written" },
  { key: "coded", label: "Code Written" },
  { key: "reviewed", label: "Reviewed" },
  { key: "done", label: "Committed" },
];
const SUBTASK_STATUS_TO_STEP = {
  created: 0,
  planned: 1,
  coded: 2,
  issues: 3,
  approved: 3,
  done: 4,
};

function ChildRow({ item, type, onQueue, onDelete, onReset }) {
  const isActiveStatus = item.status === "running" || item.status === "queued";
  const [expanded, setExpanded] = useState(isActiveStatus);
  const cfg = CHILD_STATUS[item.status] ?? CHILD_STATUS.created;
  const isFix = type === "fix";
  const isTerminal = item.status === "done" || item.status === "fixed";
  const isActive_ = item.status === "running" || item.status === "queued";
  const isStalled = !isTerminal && !isActive_ && item.status !== "created";
  // can act: created, failed, or stalled (stuck mid-workflow)
  const canAct =
    item.status === "created" || item.status === "failed" || isStalled;
  const desc = isFix
    ? plainDescription(
        item.bugMd
          ?.match(/## Description\s*\n+([\s\S]+?)(\n\n|$)/)?.[1]
          ?.trim() || "",
      ).slice(0, 120) || item.fixId
    : plainDescription(item.description || "").slice(0, 120) || item.subtaskId;
  const fullContent = isFix ? item.bugMd : item.inputMd;
  const steps = isFix ? FIX_STEPS : SUBTASK_STEPS;
  const statusMap = isFix ? FIX_STATUS_TO_STEP : SUBTASK_STATUS_TO_STEP;
  // When running, use subStep (real filesystem progress) for the stepper
  const effectiveStatus =
    item.status === "running" && item.subStep ? item.subStep : item.status;
  const stepIndex = statusMap[effectiveStatus] ?? 0;
  const isRunning = item.status === "running" || item.status === "queued";
  const hasIssues = effectiveStatus === "issues";
  const idDate = (() => {
    const m = (item.fixId || item.subtaskId || "").match(
      /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/,
    );
    if (!m) return "";
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).toLocaleDateString(
      "en-US",
      { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
    );
  })();

  return (
    <div
      className={`rounded-lg border transition-all ${
        isActiveStatus
          ? isFix
            ? "border-orange-300 dark:border-orange-700 bg-orange-50/60 dark:bg-orange-950/30"
            : "border-violet-300 dark:border-violet-700 bg-violet-50/60 dark:bg-violet-950/30"
          : isFix
            ? "border-orange-100 dark:border-orange-900/40 bg-orange-50/40 dark:bg-orange-950/20"
            : "border-violet-100 dark:border-violet-900/40 bg-violet-50/40 dark:bg-violet-950/20"
      }`}
    >
      <div
        className="flex items-start gap-3 px-3 py-2.5 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        {/* icon */}
        <div
          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
            isFix
              ? "bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-400"
              : "bg-violet-100 dark:bg-violet-900 text-violet-600 dark:text-violet-400"
          }`}
        >
          {item.status === "running" ? (
            <svg
              className="w-2.5 h-2.5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8z"
              />
            </svg>
          ) : item.status === "fixed" || item.status === "done" ? (
            <svg
              className="w-2.5 h-2.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          ) : (
            <svg
              className="w-2.5 h-2.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              {isFix ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              )}
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-700 dark:text-gray-200 leading-relaxed">
            {desc}
          </p>
          {idDate && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {idDate}
            </p>
          )}
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
            isStalled
              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
              : cfg.cls
          } ${item.status === "running" ? "animate-pulse" : ""}`}
        >
          {isStalled && (
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01"
              />
            </svg>
          )}
          {isStalled
            ? "Stalled"
            : isRunning && item.subStep
              ? `Running · ${(statusMap[item.subStep] ?? 0) + 1}/${steps.length}`
              : cfg.label}
        </span>
        <svg
          className={`w-3.5 h-3.5 shrink-0 text-gray-400 dark:text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
      {/* Expanded detail */}
      {expanded && (
        <div
          className={`px-3 pb-3 border-t ${
            isFix
              ? "border-orange-100 dark:border-orange-900/40"
              : "border-violet-100 dark:border-violet-900/40"
          }`}
        >
          {/* Progress stepper — show when there's progress or running */}
          {stepIndex > 0 || isRunning ? (
            <div className="flex items-center mt-3 mb-2">
              {steps.map((step, i) => (
                <div
                  key={step.key}
                  className="flex items-center flex-1 last:flex-none"
                >
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border-2 transition-all ${
                        i < stepIndex
                          ? (isFix
                              ? "bg-orange-500 border-orange-500"
                              : "bg-violet-500 border-violet-500") +
                            " text-white"
                          : i === stepIndex
                            ? hasIssues
                              ? "bg-red-500 border-red-500 text-white"
                              : (isFix
                                  ? "bg-orange-500 border-orange-500 ring-2 ring-orange-200 dark:ring-orange-900"
                                  : "bg-violet-500 border-violet-500 ring-2 ring-violet-200 dark:ring-violet-900") +
                                " text-white"
                            : isRunning && i === stepIndex + 1
                              ? "bg-yellow-400 border-yellow-400 text-yellow-900 animate-pulse"
                              : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600"
                      }`}
                    >
                      {i < stepIndex ? (
                        <svg
                          className="w-2.5 h-2.5"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                      ) : isRunning && i === stepIndex + 1 ? (
                        <svg
                          className="w-2.5 h-2.5"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v8z"
                          />
                        </svg>
                      ) : (
                        <span>{i + 1}</span>
                      )}
                    </div>
                    <span
                      className={`text-[9px] mt-0.5 whitespace-nowrap font-medium ${
                        i <= stepIndex
                          ? "text-gray-600 dark:text-gray-300"
                          : isRunning && i === stepIndex + 1
                            ? "text-yellow-600 dark:text-yellow-400"
                            : "text-gray-300 dark:text-gray-600"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-1 mb-4 transition-all ${
                        i < stepIndex
                          ? isFix
                            ? "bg-orange-500"
                            : "bg-violet-500"
                          : isRunning && i === stepIndex
                            ? "bg-yellow-300 dark:bg-yellow-700 animate-pulse"
                            : "bg-gray-200 dark:bg-gray-700"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : null}
          {/* Live output terminal for running items */}
          {item.status === "running" && (item.fixPath || item.subtaskPath) && (
            <ChildTerminal trackPath={item.fixPath || item.subtaskPath} />
          )}
          {fullContent && (
            <pre className="mt-2 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap font-mono bg-gray-100 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md p-3 max-h-64 overflow-auto leading-relaxed">
              {fullContent}
            </pre>
          )}
        </div>
      )}
      {/* Action buttons — shown when item can be actioned */}
      {canAct && (
        <div
          className={`flex items-center gap-2 px-3 pb-2.5 border-t pt-2 ${
            isFix
              ? "border-orange-100 dark:border-orange-900/40"
              : "border-violet-100 dark:border-violet-900/40"
          }`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQueue();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              isFix
                ? "bg-orange-600 hover:bg-orange-700 text-white"
                : "bg-violet-600 hover:bg-violet-700 text-white"
            }`}
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 10h16M4 14h16M4 18h7"
              />
            </svg>
            Add to Queue
          </button>
          {isStalled && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Reset
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete"
            className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function DescriptionCard({ description }) {
  const [expanded, setExpanded] = useState(false);
  const plain = description
    .replace(/<\/?[\w_]+>/g, "")
    .replace(/\n+/g, " ")
    .trim();
  const isLong = plain.length > 200;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5">
      {isLong && !expanded ? (
        <>
          <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
            {plain.slice(0, 200).trim()}...
          </p>
          <button
            onClick={() => setExpanded(true)}
            className="mt-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium"
          >
            Show more
          </button>
        </>
      ) : (
        <>
          <pre className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap break-words font-sans max-h-60 overflow-y-auto">
            {description}
          </pre>
          {isLong && (
            <button
              onClick={() => setExpanded(false)}
              className="mt-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium"
            >
              Show less
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ChildTerminal({ trackPath }) {
  const [lines, setLines] = useState([]);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!trackPath) return;

    // First load history via REST
    fetch(`/api/workflows/${encodeURIComponent(trackPath)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.output?.length) {
          const history = data.output
            .map((l) => ({
              text: l.text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ""),
              isErr: l.isErr,
            }))
            .filter((l) => l.text);
          setLines(history);
        }

        // Then subscribe for live updates
        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({ action: "subscribe", taskPath: trackPath }));
          setConnected(true);
        };

        let replayDone = false;
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.type === "started") {
            setTimeout(() => {
              replayDone = true;
            }, 500);
            return;
          }
          if (!replayDone && (msg.type === "stdout" || msg.type === "stderr"))
            return;
          if (msg.type === "stdout" || msg.type === "stderr") {
            const clean = (msg.data || "").replace(
              /\x1b\[[0-9;]*[A-Za-z]/g,
              "",
            );
            if (clean)
              setLines((prev) => [
                ...prev.slice(-200),
                { text: clean, isErr: msg.type === "stderr" },
              ]);
          } else if (msg.type === "done") {
            setLines((prev) => [
              ...prev,
              {
                text: `\n● Process exited with code ${msg.code}`,
                isErr: msg.code !== 0,
              },
            ]);
          }
        };

        ws.onerror = () => setConnected(false);
        ws.onclose = () => {
          wsRef.current = null;
          setConnected(false);
        };
      })
      .catch(() => {});

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [trackPath]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div className="mt-2 border border-gray-800 rounded-lg overflow-hidden bg-gray-950">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border-b border-gray-800">
        <div
          className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400" : "bg-gray-500"}`}
        />
        <span className="text-xs font-mono text-gray-500">Live output</span>
      </div>
      <div className="overflow-y-auto p-3 max-h-48 font-mono text-xs">
        {lines.length === 0 ? (
          <span className="text-gray-600">Waiting for output...</span>
        ) : (
          lines.map((line, i) => (
            <pre
              key={i}
              className={`whitespace-pre-wrap break-words leading-relaxed ${line.isErr ? "text-red-400" : "text-green-300"}`}
            >
              {line.text}
            </pre>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function FileCard({
  title,
  content,
  variant = "default",
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const variants = {
    default: {
      header:
        "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700",
      text: "text-gray-700 dark:text-gray-200",
      body: "bg-white dark:bg-gray-900",
    },
    green: {
      header:
        "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 hover:bg-green-100",
      text: "text-green-800 dark:text-green-300",
      body: "bg-green-50 dark:bg-green-950",
    },
    red: {
      header:
        "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 hover:bg-red-100",
      text: "text-red-800 dark:text-red-300",
      body: "bg-red-50 dark:bg-red-950",
    },
    orange: {
      header:
        "bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800 hover:bg-orange-100",
      text: "text-orange-800 dark:text-orange-300",
      body: "bg-orange-50 dark:bg-orange-950",
    },
    indigo: {
      header:
        "bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100",
      text: "text-indigo-800 dark:text-indigo-300",
      body: "bg-indigo-50 dark:bg-indigo-950",
    },
  };
  const v = variants[variant];
  return (
    <div
      className={`border rounded-xl overflow-hidden ${v.header.split(" ")[1]}`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-left transition-colors ${v.header}`}
      >
        <span className={v.text}>{title}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {open && (
        <div className={`px-4 pb-4 pt-3 ${v.body}`}>
          <pre className="text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words font-mono bg-white/70 dark:bg-gray-800/70 rounded-lg p-3 border border-gray-100 dark:border-gray-800 max-h-80 overflow-y-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
