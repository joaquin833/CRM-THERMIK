"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  completeAgendaTask,
  createAgendaTask,
  listAgendaTasks,
  reopenAgendaTask,
  TASK_PRIORITIES,
  TASK_TYPES,
  type AgendaTask,
  type CreateTaskInput,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from "@/lib/agenda";

const statusLabel: Record<TaskStatus, string> = { pending: "Pendiente", in_progress: "En curso", completed: "Completada", cancelled: "Cancelada" };
const typeLabel: Record<TaskType, string> = { follow_up: "Seguimiento", call: "Llamada", meeting: "Reunión", email: "Correo", visit: "Visita", quote_review: "Revisión de cotización", other: "Otro" };
const priorityLabel: Record<TaskPriority, string> = { low: "Baja", medium: "Media", high: "Alta", urgent: "Urgente" };

type FormState = { title: string; description: string; task_type: TaskType; priority: TaskPriority; start_at: string; due_at: string; reminder_at: string; all_day: boolean; notes: string };
const initialForm: FormState = { title: "", description: "", task_type: "follow_up", priority: "medium", start_at: "", due_at: "", reminder_at: "", all_day: false, notes: "" };

function dateText(value: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha no válida" : new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
function overdue(task: AgendaTask) {
  return task.is_overdue ?? Boolean(task.due_at && !["completed", "cancelled"].includes(task.status) && new Date(task.due_at).getTime() < Date.now());
}
function optional(value: string) { return value.trim() || null; }
function iso(value: string) { return value ? new Date(value).toISOString() : null; }
const fieldClass = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100";

export default function AgendaPage() {
  const [tasks, setTasks] = useState<AgendaTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const [type, setType] = useState<TaskType | "all">("all");
  const [priority, setPriority] = useState<TaskPriority | "all">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setTasks((await listAgendaTasks({ limit: 500 })).data); }
    catch (e) { setError(e instanceof Error ? e.message : "No fue posible cargar la agenda."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => tasks.filter((task) => {
    const text = [task.title, task.description, task.notes].filter(Boolean).join(" ").toLowerCase();
    return (!search.trim() || text.includes(search.trim().toLowerCase())) && (status === "all" || task.status === status) && (type === "all" || task.task_type === type) && (priority === "all" || task.priority === priority);
  }), [tasks, search, status, type, priority]);

  const totals = useMemo(() => ({ pending: tasks.filter(t => t.status === "pending").length, progress: tasks.filter(t => t.status === "in_progress").length, overdue: tasks.filter(overdue).length, completed: tasks.filter(t => t.status === "completed").length }), [tasks]);

  async function toggle(task: AgendaTask) {
    try {
      const updated = task.status === "completed" ? await reopenAgendaTask(task.id) : await completeAgendaTask(task.id);
      setTasks(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item));
    } catch (e) { setError(e instanceof Error ? e.message : "No fue posible actualizar la actividad."); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    if (!form.title.trim()) return setError("El título es obligatorio.");
    if (form.start_at && form.due_at && new Date(form.due_at) < new Date(form.start_at)) return setError("El vencimiento no puede ser anterior al inicio.");
    const input: CreateTaskInput = { title: form.title.trim(), description: optional(form.description), task_type: form.task_type, status: "pending", priority: form.priority, start_at: iso(form.start_at), due_at: iso(form.due_at), reminder_at: iso(form.reminder_at), all_day: form.all_day, notes: optional(form.notes) };
    setSaving(true);
    try { const created = await createAgendaTask(input); setTasks(current => [created, ...current]); setForm(initialForm); setFormOpen(false); }
    catch (e) { setError(e instanceof Error ? e.message : "No fue posible crear la actividad."); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-semibold uppercase tracking-wider text-orange-600">Gestión comercial</p><h1 className="mt-1 text-2xl font-bold text-zinc-900">Agenda</h1><p className="mt-1 text-sm text-zinc-600">Seguimientos, llamadas, reuniones y tareas comerciales.</p></div>
        <div className="flex gap-2"><button type="button" onClick={() => void load()} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">Actualizar</button><button type="button" onClick={() => setFormOpen(true)} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700">Nueva actividad</button></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[['Pendientes', totals.pending], ['En curso', totals.progress], ['Vencidas', totals.overdue], ['Completadas', totals.completed]].map(([label, value]) => <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-sm text-zinc-500">{label}</p><p className="mt-1 text-2xl font-bold text-zinc-900">{value}</p></div>)}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"><div className="grid gap-3 lg:grid-cols-4"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar actividad" className={fieldClass} /><select value={status} onChange={e => setStatus(e.target.value as TaskStatus | 'all')} className={fieldClass}><option value="all">Todos los estados</option>{Object.entries(statusLabel).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select><select value={type} onChange={e => setType(e.target.value as TaskType | 'all')} className={fieldClass}><option value="all">Todos los tipos</option>{TASK_TYPES.map(v => <option key={v} value={v}>{typeLabel[v]}</option>)}</select><select value={priority} onChange={e => setPriority(e.target.value as TaskPriority | 'all')} className={fieldClass}><option value="all">Todas las prioridades</option>{TASK_PRIORITIES.map(v => <option key={v} value={v}>{priorityLabel[v]}</option>)}</select></div></div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        {loading ? <p className="p-8 text-center text-sm text-zinc-500">Cargando agenda...</p> : shown.length === 0 ? <p className="p-8 text-center text-sm text-zinc-500">No hay actividades para mostrar.</p> : <div className="divide-y divide-zinc-200">{shown.map(task => <div key={task.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-zinc-900">{task.title}</h2>{overdue(task) && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Vencida</span>}<span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">{statusLabel[task.status]}</span></div><p className="mt-1 text-sm text-zinc-600">{typeLabel[task.task_type]} · {priorityLabel[task.priority]} · {dateText(task.due_at)}</p>{task.description && <p className="mt-1 text-sm text-zinc-500">{task.description}</p>}</div><button type="button" disabled={task.status === "cancelled"} onClick={() => void toggle(task)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">{task.status === "completed" ? "Reabrir" : "Completar"}</button></div>)}</div>}
      </div>

      {formOpen && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"><div className="my-4 w-full max-w-2xl rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-zinc-200 p-5"><div><h2 className="text-xl font-bold text-zinc-900">Nueva actividad</h2><p className="text-sm text-zinc-500">Registra una acción comercial.</p></div><button type="button" onClick={() => setFormOpen(false)} className="rounded-lg px-3 py-2 text-zinc-500 hover:bg-zinc-100">Cerrar</button></div><form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2"><label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium">Título *</span><input required autoFocus value={form.title} onChange={e => setForm({...form,title:e.target.value})} className={fieldClass}/></label><label><span className="mb-1 block text-sm font-medium">Tipo</span><select value={form.task_type} onChange={e => setForm({...form,task_type:e.target.value as TaskType})} className={fieldClass}>{TASK_TYPES.map(v => <option key={v} value={v}>{typeLabel[v]}</option>)}</select></label><label><span className="mb-1 block text-sm font-medium">Prioridad</span><select value={form.priority} onChange={e => setForm({...form,priority:e.target.value as TaskPriority})} className={fieldClass}>{TASK_PRIORITIES.map(v => <option key={v} value={v}>{priorityLabel[v]}</option>)}</select></label><label><span className="mb-1 block text-sm font-medium">Inicio</span><input type="datetime-local" value={form.start_at} onChange={e => setForm({...form,start_at:e.target.value})} className={fieldClass}/></label><label><span className="mb-1 block text-sm font-medium">Vencimiento</span><input type="datetime-local" value={form.due_at} onChange={e => setForm({...form,due_at:e.target.value})} className={fieldClass}/></label><label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium">Descripción</span><textarea rows={3} value={form.description} onChange={e => setForm({...form,description:e.target.value})} className={fieldClass}/></label><label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium">Notas</span><textarea rows={3} value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} className={fieldClass}/></label><div className="flex justify-end gap-2 border-t border-zinc-200 pt-4 sm:col-span-2"><button type="button" onClick={() => setFormOpen(false)} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold">Cancelar</button><button disabled={saving} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">{saving ? "Guardando..." : "Crear actividad"}</button></div></form></div></div>}
    </div>
  );
}
