"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { AppShell } from "@/components/app-shell";
import AgendaTaskDetail from "@/components/agenda/agenda-task-detail";
import AgendaCalendar, { type CalendarView } from "@/components/agenda/agenda-calendar";
import { syncAgendaTaskAutomatically } from "@/lib/google/calendar-client";
import {
  completeAgendaTask,
  createAgendaTask,
  listAgendaTasks,
  listAgendaContacts,
  reopenAgendaTask,
  TASK_PRIORITIES,
  TASK_TYPES,
  type AgendaTask,
  type AgendaContact,
  type CreateTaskInput,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from "@/lib/agenda";

const STATUS: Record<TaskStatus, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
  cancelled: "Cancelada",
};

const TYPES: Record<TaskType, string> = {
  follow_up: "Seguimiento",
  call: "Llamada",
  meeting: "Reunión",
  email: "Correo",
  visit: "Visita",
  quote_review: "Revisión de cotización",
  other: "Otro",
};

const PRIORITIES: Record<TaskPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

const control =
  "focus-ring w-full rounded-lg border border-[rgb(var(--border))] bg-white px-3 py-2.5 text-sm text-[rgb(var(--text-primary))] outline-none";

type FormState = {
  title: string;
  description: string;
  task_type: TaskType;
  priority: TaskPriority;
  start_at: string;
  due_at: string;
  reminder_at: string;
  all_day: boolean;
  notes: string;
  contact_id: string;
};

const EMPTY: FormState = {
  title: "",
  description: "",
  task_type: "follow_up",
  priority: "medium",
  start_at: "",
  due_at: "",
  reminder_at: "",
  all_day: false,
  notes: "",
  contact_id: "",
};

export default function AgendaPage() {
  const [tasks, setTasks] = useState<AgendaTask[]>([]);
  const [contacts, setContacts] = useState<AgendaContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const [type, setType] = useState<TaskType | "all">("all");
  const [priority, setPriority] = useState<TaskPriority | "all">("all");
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<AgendaTask | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [display, setDisplay] = useState<"list" | CalendarView>("list");

  const load = useCallback(async (manual = false) => {
    manual ? setRefreshing(true) : setLoading(true);
    setError(null);

    try {
      const [agendaResult, contactList] = await Promise.all([
        listAgendaTasks({ limit: 500 }),
        listAgendaContacts(),
      ]);
      setTasks(agendaResult.data);
      setContacts(contactList);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No fue posible cargar la agenda comercial.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!modal) return;

    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setModal(false);
    };

    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [modal, saving]);

  const counts = useMemo(
    () => ({
      pending: tasks.filter((task) => task.status === "pending").length,
      progress: tasks.filter((task) => task.status === "in_progress").length,
      overdue: tasks.filter(overdue).length,
      completed: tasks.filter((task) => task.status === "completed").length,
    }),
    [tasks],
  );

  const shown = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-CL");

    return tasks.filter((task) => {
      const taskText = [task.title, task.description, task.notes]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("es-CL");

      return (
        (!term || taskText.includes(term)) &&
        (status === "all" || task.status === status) &&
        (type === "all" || task.task_type === type) &&
        (priority === "all" || task.priority === priority)
      );
    });
  }, [tasks, search, status, type, priority]);

  const filtered =
    Boolean(search.trim()) ||
    status !== "all" ||
    type !== "all" ||
    priority !== "all";

  async function toggle(task: AgendaTask) {
    setProcessing(task.id);
    setError(null);

    try {
      const updated =
        task.status === "completed"
          ? await reopenAgendaTask(task.id)
          : await completeAgendaTask(task.id);

      setTasks((current) =>
        current.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        ),
      );
      void syncAgendaTaskAutomatically(updated);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No fue posible actualizar la actividad.",
      );
    } finally {
      setProcessing(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.title.trim()) {
      return setError("El título es obligatorio.");
    }

    if (!form.due_at) {
      return setError("El vencimiento es obligatorio.");
    }

    if (
      form.start_at &&
      new Date(form.due_at) < new Date(form.start_at)
    ) {
      return setError("El vencimiento no puede ser anterior al inicio.");
    }

    const input: CreateTaskInput = {
      title: form.title.trim(),
      description: text(form.description),
      task_type: form.task_type,
      status: "pending",
      priority: form.priority,
      start_at: iso(form.start_at),
      due_at: iso(form.due_at)!,
      reminder_at: iso(form.reminder_at),
      all_day: form.all_day,
      notes: text(form.notes),
      contact_id: form.contact_id || null,
    };

    setSaving(true);

    try {
      const created = await createAgendaTask(input);
      setTasks((current) => [created, ...current]);
      void syncAgendaTaskAutomatically(created);
      setForm(EMPTY);
      setModal(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No fue posible crear la actividad.",
      );
    } finally {
      setSaving(false);
    }
  }

  function openCreateAt(date: Date) {
    const start = localInput(date);
    const due = localInput(new Date(date.getTime() + 30 * 60_000));
    setForm({ ...EMPTY, start_at: start, due_at: due });
    setModal(true);
  }

  return (
    <AppShell>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
            Agenda comercial
          </p>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-950">Agenda</h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Seguimientos, llamadas, reuniones y próximas acciones comerciales.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="focus-ring rounded-lg border border-[rgb(var(--border))] bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {refreshing ? "Actualizando..." : "Actualizar"}
          </button>

          <button
            type="button"
            onClick={() => setModal(true)}
            className="focus-ring rounded-lg bg-[rgb(var(--brand-primary-dark))] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Nueva actividad
          </button>
        </div>
      </header>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-xl bg-slate-100 p-1">
          {(["list", "month", "week", "day"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDisplay(option)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                display === option
                  ? "bg-white text-emerald-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {option === "list" ? "Lista" : option === "month" ? "Mes" : option === "week" ? "Semana" : "Día"}
            </button>
          ))}
        </div>
        <p className="text-sm text-slate-500">
          {display === "list" ? "Gestión detallada de actividades" : "Vista visual sincronizada con Agenda y Google Calendar"}
        </p>
      </div>

      <section
        className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Resumen de agenda"
      >
        <Metric label="Pendientes" value={counts.pending} />
        <Metric label="En curso" value={counts.progress} />
        <Metric label="Vencidas" value={counts.overdue} alert />
        <Metric label="Completadas" value={counts.completed} />
      </section>

      <section className="mt-6 rounded-2xl border border-[rgb(var(--border))] bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Buscar">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Título, descripción o notas"
              className={control}
            />
          </Field>

          <Field label="Estado">
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as TaskStatus | "all")
              }
              className={control}
            >
              <option value="all">Todos los estados</option>
              {Object.entries(STATUS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tipo">
            <select
              value={type}
              onChange={(event) =>
                setType(event.target.value as TaskType | "all")
              }
              className={control}
            >
              <option value="all">Todos los tipos</option>
              {TASK_TYPES.map((value) => (
                <option key={value} value={value}>
                  {TYPES[value]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Prioridad">
            <select
              value={priority}
              onChange={(event) =>
                setPriority(event.target.value as TaskPriority | "all")
              }
              className={control}
            >
              <option value="all">Todas las prioridades</option>
              {TASK_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITIES[value]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[rgb(var(--border))] pt-4 text-sm text-slate-500">
          <span>
            Mostrando <strong>{shown.length}</strong> de{" "}
            <strong>{tasks.length}</strong> actividades
          </span>

          {filtered && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatus("all");
                setType("all");
                setPriority("all");
              }}
              className="focus-ring font-semibold text-emerald-700"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          {error}
        </div>
      )}

      {display === "list" ? (
      <section className="mt-3 overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-white shadow-sm">
        {loading ? (
          <p className="p-10 text-center text-sm text-slate-500">
            Cargando agenda comercial...
          </p>
        ) : shown.length === 0 ? (
          <div className="p-10 text-center">
            <h2 className="font-semibold text-slate-950">Sin actividades</h2>
            <p className="mt-1 text-sm text-slate-500">
              {tasks.length
                ? "No hay resultados para los filtros seleccionados."
                : "Crea la primera actividad para comenzar el seguimiento comercial."}
            </p>

            {!tasks.length && (
              <button
                type="button"
                onClick={() => setModal(true)}
                className="focus-ring mt-4 rounded-lg bg-[rgb(var(--brand-primary-dark))] px-4 py-2 text-sm font-semibold text-white"
              >
                Crear primera actividad
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[rgb(var(--border))]">
            {shown.map((task) => (
              <Task
                key={task.id}
                task={task}
                busy={processing === task.id}
                onToggle={toggle}
                onOpen={setSelectedTask}
              />
            ))}
          </div>
        )}
      </section>

      ) : (
        <div className="mt-3">
          <AgendaCalendar
            tasks={shown}
            view={display}
            onTaskOpen={setSelectedTask}
            onCreateAt={openCreateAt}
          />
        </div>
      )}
      <AgendaTaskDetail
        task={selectedTask}
        contacts={contacts}
        onClose={() => setSelectedTask(null)}
        onUpdated={(updated) => {
          setTasks((current) =>
            current.map((item) =>
              item.id === updated.id ? { ...item, ...updated } : item,
            ),
          );
          setSelectedTask(null);
        }}
        onDeleted={(id) => {
          setTasks((current) => current.filter((item) => item.id !== id));
          setSelectedTask(null);
        }}
      />

      {modal && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-task-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setModal(false);
            }
          }}
        >
          <form
            onSubmit={submit}
            className="my-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
                  Agenda comercial
                </p>
                <h2
                  id="new-task-title"
                  className="mt-1 text-2xl font-bold text-slate-950"
                >
                  Nueva actividad
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Registra una próxima acción para mantener el seguimiento
                  comercial.
                </p>
              </div>

              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setModal(false);
                  setForm(EMPTY);
                }}
                className="focus-ring rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-semibold text-slate-600"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Título" required className="sm:col-span-2">
                <input
                  required
                  autoFocus
                  maxLength={180}
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  placeholder="Ej.: Llamar para revisar propuesta"
                  className={control}
                />
              </Field>

              <Field label="Tipo de actividad">
                <select
                  value={form.task_type}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      task_type: event.target.value as TaskType,
                    })
                  }
                  className={control}
                >
                  {TASK_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {TYPES[value]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Prioridad">
                <select
                  value={form.priority}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      priority: event.target.value as TaskPriority,
                    })
                  }
                  className={control}
                >
                  {TASK_PRIORITIES.map((value) => (
                    <option key={value} value={value}>
                      {PRIORITIES[value]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Contacto" className="sm:col-span-2">
                <select
                  value={form.contact_id}
                  onChange={(event) =>
                    setForm({ ...form, contact_id: event.target.value })
                  }
                  className={control}
                >
                  <option value="">Sin contacto asociado</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.nombre_completo}
                      {contact.telefono ? ` | ${contact.telefono}` : ""}
                      {contact.correo ? ` | ${contact.correo}` : ""}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Inicio">
                <input
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(event) =>
                    setForm({ ...form, start_at: event.target.value })
                  }
                  className={control}
                />
              </Field>

              <Field label="Vencimiento" required>
                <input
                  required
                  type="datetime-local"
                  value={form.due_at}
                  onChange={(event) =>
                    setForm({ ...form, due_at: event.target.value })
                  }
                  className={control}
                />
              </Field>

              <Field label="Recordatorio">
                <input
                  type="datetime-local"
                  value={form.reminder_at}
                  onChange={(event) =>
                    setForm({ ...form, reminder_at: event.target.value })
                  }
                  className={control}
                />
              </Field>

              <label className="flex items-center gap-3 self-end rounded-lg border border-[rgb(var(--border))] px-3 py-2.5 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.all_day}
                  onChange={(event) =>
                    setForm({ ...form, all_day: event.target.checked })
                  }
                  className="h-4 w-4 accent-emerald-700"
                />
                Actividad de todo el día
              </label>

              <Field label="Descripción" className="sm:col-span-2">
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="Contexto y objetivo"
                  className={control}
                />
              </Field>

              <Field label="Notas internas" className="sm:col-span-2">
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                  placeholder="Información adicional"
                  className={control}
                />
              </Field>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[rgb(var(--border))] pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setModal(false);
                  setForm(EMPTY);
                }}
                className="focus-ring rounded-lg border border-[rgb(var(--border))] px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={saving}
                className="focus-ring rounded-lg bg-[rgb(var(--brand-primary-dark))] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Crear actividad"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}

function Metric({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: number;
  alert?: boolean;
}) {
  const active = alert && value > 0;

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        active ? "border-red-200" : "border-[rgb(var(--border))]"
      }`}
    >
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${
          active ? "text-red-700" : "text-slate-950"
        }`}
      >
        {value}
      </p>
    </article>
  );
}

function Task({
  task,
  busy,
  onToggle,
  onOpen,
}: {
  task: AgendaTask;
  busy: boolean;
  onToggle: (task: AgendaTask) => void;
  onOpen: (task: AgendaTask) => void;
}) {
  const late = overdue(task);

  return (
    <article className="flex flex-col gap-4 p-4 transition hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-slate-950">{task.title}</h2>
          {late && <Badge cls="bg-red-100 text-red-800">Vencida</Badge>}
          <Status status={task.status} />
          <Priority priority={task.priority} />
        </div>

        <p className="mt-2 text-sm text-slate-600">
          {TYPES[task.task_type]} · {date(task.due_at)}
        </p>

        {task.description && (
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">
            {task.description}
          </p>
        )}
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => onOpen(task)}
          className="focus-ring rounded-lg border border-[rgb(var(--border))] bg-white px-3 py-2 text-sm font-semibold text-slate-700"
        >
          Ver detalle
        </button>

        <button
          type="button"
          disabled={busy || task.status === "cancelled"}
          onClick={() => onToggle(task)}
          className="focus-ring shrink-0 rounded-lg border border-[rgb(var(--border))] bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          {busy
            ? "Guardando..."
            : task.status === "completed"
              ? "Reabrir"
              : "Completar"}
        </button>
      </div>
    </article>
  );
}

function Status({ status }: { status: TaskStatus }) {
  const styles: Record<TaskStatus, string> = {
    pending: "bg-amber-100 text-amber-800",
    in_progress: "bg-blue-100 text-blue-800",
    completed: "bg-emerald-100 text-emerald-800",
    cancelled: "bg-slate-100 text-slate-600",
  };

  return <Badge cls={styles[status]}>{STATUS[status]}</Badge>;
}

function Priority({ priority }: { priority: TaskPriority }) {
  const styles: Record<TaskPriority, string> = {
    low: "bg-slate-100 text-slate-600",
    medium:
      "bg-[rgb(var(--brand-primary-light))] text-[rgb(var(--brand-primary-dark))]",
    high: "bg-amber-100 text-amber-800",
    urgent: "bg-red-100 text-red-800",
  };

  return <Badge cls={styles[priority]}>{PRIORITIES[priority]}</Badge>;
}

function Badge({ cls, children }: { cls: string; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

function Field({
  label,
  required = false,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </span>
      {children}
    </label>
  );
}

function text(value: string) {
  return value.trim() || null;
}

function localInput(value: Date) {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function iso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function overdue(task: AgendaTask) {
  if (task.is_overdue !== undefined) return task.is_overdue;

  return Boolean(
    task.due_at &&
      !["completed", "cancelled"].includes(task.status) &&
      new Date(task.due_at).getTime() < Date.now(),
  );
}

function date(value: string | null) {
  if (!value) return "Sin fecha programada";

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? "Fecha no válida"
    : new Intl.DateTimeFormat("es-CL", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsed);
}
