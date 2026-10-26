"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AgendaTaskForm from "@/components/agenda/AgendaTaskForm";
import {
  completeAgendaTask,
  listAgendaTasks,
  reopenAgendaTask,
  type AgendaTask,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from "@/lib/agenda";

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
  cancelled: "Cancelada",
};

const TYPE_LABELS: Record<TaskType, string> = {
  follow_up: "Seguimiento",
  call: "Llamada",
  meeting: "Reunión",
  email: "Correo",
  visit: "Visita",
  quote_review: "Revisión de cotización",
  other: "Otro",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

const STATUS_OPTIONS: TaskStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
];

const TYPE_OPTIONS: TaskType[] = [
  "follow_up",
  "call",
  "meeting",
  "email",
  "visit",
  "quote_review",
  "other",
];

const PRIORITY_OPTIONS: TaskPriority[] = ["low", "medium", "high", "urgent"];

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no válida";

  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isTaskOverdue(task: AgendaTask) {
  if (task.is_overdue !== undefined) return task.is_overdue;
  if (!task.due_at || task.status === "completed" || task.status === "cancelled") return false;
  return new Date(task.due_at).getTime() < Date.now();
}

function priorityClasses(priority: TaskPriority) {
  switch (priority) {
    case "urgent":
      return "bg-red-100 text-red-700 ring-red-200";
    case "high":
      return "bg-orange-100 text-orange-700 ring-orange-200";
    case "medium":
      return "bg-amber-100 text-amber-700 ring-amber-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function statusClasses(status: TaskStatus) {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-700 ring-emerald-200";
    case "in_progress":
      return "bg-blue-100 text-blue-700 ring-blue-200";
    case "cancelled":
      return "bg-slate-100 text-slate-600 ring-slate-200";
    default:
      return "bg-violet-100 text-violet-700 ring-violet-200";
  }
}

export default function AgendaPage() {
  const [tasks, setTasks] = useState<AgendaTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const [type, setType] = useState<TaskType | "all">("all");
  const [priority, setPriority] = useState<TaskPriority | "all">("all");
  const [formOpen, setFormOpen] = useState(false);

  const loadTasks = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);

    setError(null);

    try {
      const result = await listAgendaTasks({ limit: 500 });
      setTasks(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible cargar la agenda.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const metrics = useMemo(() => {
    return {
      pending: tasks.filter((task) => task.status === "pending").length,
      inProgress: tasks.filter((task) => task.status === "in_progress").length,
      overdue: tasks.filter(isTaskOverdue).length,
      completed: tasks.filter((task) => task.status === "completed").length,
    };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("es-CL");

    return tasks.filter((task) => {
      const searchable = [task.title, task.description, task.notes]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("es-CL");

      return (
        (!normalizedSearch || searchable.includes(normalizedSearch)) &&
        (status === "all" || task.status === status) &&
        (type === "all" || task.task_type === type) &&
        (priority === "all" || task.priority === priority)
      );
    });
  }, [priority, search, status, tasks, type]);

  async function toggleCompleted(task: AgendaTask) {
    setActionId(task.id);
    setError(null);

    try {
      const updated =
        task.status === "completed"
          ? await reopenAgendaTask(task.id)
          : await completeAgendaTask(task.id);

      setTasks((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible actualizar la actividad.");
    } finally {
      setActionId(null);
    }
  }

  function clearFilters() {
    setSearch("");
    setStatus("all");
    setType("all");
    setPriority("all");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
              Gestión comercial
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Agenda</h1>
            <p className="mt-2 text-sm text-slate-600">
              Revisa y gestiona seguimientos, llamadas, reuniones y tareas comerciales.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadTasks(true)}
              disabled={refreshing}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? "Actualizando..." : "Actualizar"}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Nueva actividad
            </button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen de agenda">
          <MetricCard label="Pendientes" value={metrics.pending} accent="violet" />
          <MetricCard label="En curso" value={metrics.inProgress} accent="blue" />
          <MetricCard label="Vencidas" value={metrics.overdue} accent="red" />
          <MetricCard label="Completadas" value={metrics.completed} accent="green" />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="xl:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Buscar
              </span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Título, descripción o notas"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <FilterSelect
              label="Estado"
              value={status}
              onChange={(value) => setStatus(value as TaskStatus | "all")}
              options={STATUS_OPTIONS.map((value) => ({ value, label: STATUS_LABELS[value] }))}
            />
            <FilterSelect
              label="Tipo"
              value={type}
              onChange={(value) => setType(value as TaskType | "all")}
              options={TYPE_OPTIONS.map((value) => ({ value, label: TYPE_LABELS[value] }))}
            />
            <FilterSelect
              label="Prioridad"
              value={priority}
              onChange={(value) => setPriority(value as TaskPriority | "all")}
              options={PRIORITY_OPTIONS.map((value) => ({ value, label: PRIORITY_LABELS[value] }))}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-600">
              Mostrando <strong>{filteredTasks.length}</strong> de <strong>{tasks.length}</strong> actividades
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-semibold text-blue-600 hover:text-blue-800"
            >
              Limpiar filtros
            </button>
          </div>
        </section>

        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <strong className="block font-semibold">No pudimos completar la operación</strong>
            <span className="mt-1 block">{error}</span>
          </div>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Cargando agenda...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="p-10 text-center">
              <h2 className="text-base font-semibold text-slate-800">No hay actividades para mostrar</h2>
              <p className="mt-1 text-sm text-slate-500">
                Ajusta los filtros o crea una actividad cuando habilitemos el formulario D5.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredTasks.map((task) => {
                const overdue = isTaskOverdue(task);
                const processing = actionId === task.id;

                return (
                  <article key={task.id} className="p-4 transition hover:bg-slate-50 sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-base font-semibold text-slate-900">{task.title}</h2>
                          {overdue && (
                            <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                              Vencida
                            </span>
                          )}
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusClasses(task.status)}`}>
                            {STATUS_LABELS[task.status]}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${priorityClasses(task.priority)}`}>
                            {PRIORITY_LABELS[task.priority]}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                          <span>{TYPE_LABELS[task.task_type]}</span>
                          <span className={overdue ? "font-semibold text-red-600" : ""}>
                            Vence: {formatDate(task.due_at)}
                          </span>
                          {task.start_at && <span>Inicio: {formatDate(task.start_at)}</span>}
                        </div>

                        {task.description && (
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{task.description}</p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => void toggleCompleted(task)}
                        disabled={processing || task.status === "cancelled"}
                        className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {processing
                          ? "Guardando..."
                          : task.status === "completed"
                            ? "Reabrir"
                            : "Marcar completada"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
      <AgendaTaskForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={(task) => setTasks((current) => [task, ...current])}
      />
    </main>
  );
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "violet" | "blue" | "red" | "green";
}) {
  const accents = {
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    red: "border-red-200 bg-red-50 text-red-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${accents[accent]}`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        <option value="all">Todos</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
