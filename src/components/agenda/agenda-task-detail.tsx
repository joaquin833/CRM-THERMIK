"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  cancelAgendaTask,
  deleteAgendaTask,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  updateAgendaTask,
  type AgendaTask,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from "@/lib/agenda";

const STATUS: Record<TaskStatus, string> = { pending: "Pendiente", in_progress: "En curso", completed: "Completada", cancelled: "Cancelada" };
const TYPES: Record<TaskType, string> = { follow_up: "Seguimiento", call: "Llamada", meeting: "ReuniÃ³n", email: "Correo", visit: "Visita", quote_review: "RevisiÃ³n de cotizaciÃ³n", other: "Otro" };
const PRIORITIES: Record<TaskPriority, string> = { low: "Baja", medium: "Media", high: "Alta", urgent: "Urgente" };
const control = "focus-ring w-full rounded-lg border border-[rgb(var(--border))] bg-white px-3 py-2.5 text-sm text-[rgb(var(--text-primary))] outline-none";

type Props = { task: AgendaTask | null; onClose: () => void; onUpdated: (task: AgendaTask) => void; onDeleted: (id: string) => void };
type State = { title: string; description: string; task_type: TaskType; status: TaskStatus; priority: TaskPriority; start_at: string; due_at: string; reminder_at: string; all_day: boolean; notes: string };
const EMPTY: State = { title: "", description: "", task_type: "follow_up", status: "pending", priority: "medium", start_at: "", due_at: "", reminder_at: "", all_day: false, notes: "" };

export default function AgendaTaskDetail({ task, onClose, onUpdated, onDeleted }: Props) {
  const [form, setForm] = useState<State>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!task) { setForm(EMPTY); return; }
    setForm({ title: task.title, description: task.description ?? "", task_type: task.task_type, status: task.status, priority: task.priority, start_at: local(task.start_at), due_at: local(task.due_at), reminder_at: local(task.reminder_at), all_day: task.all_day, notes: task.notes ?? "" });
    setError(""); setConfirmDelete(false);
  }, [task]);

  if (!task) return null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!task) return;
    if (!form.title.trim()) return setError("El tÃ­tulo es obligatorio.");
    if (form.start_at && form.due_at && new Date(form.due_at) < new Date(form.start_at)) return setError("El vencimiento no puede ser anterior al inicio.");
    setSaving(true);
    try {
      const updated = await updateAgendaTask(task.id, { title: form.title.trim(), description: clean(form.description), task_type: form.task_type, status: form.status, priority: form.priority, start_at: iso(form.start_at), due_at: iso(form.due_at)!, reminder_at: iso(form.reminder_at), all_day: form.all_day, notes: clean(form.notes), completed_at: form.status === "completed" ? task.completed_at ?? new Date() : null });
      onUpdated(updated); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No fue posible guardar los cambios."); }
    finally { setSaving(false); }
  }

  async function cancelTask() {
    if (!task) return;
    setSaving(true); setError("");
    try { const updated = await cancelAgendaTask(task.id); onUpdated(updated); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No fue posible cancelar la actividad."); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!task) return;
    setSaving(true); setError("");
    try { await deleteAgendaTask(task.id); onDeleted(task.id); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No fue posible eliminar la actividad."); }
    finally { setSaving(false); }
  }

  return <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="task-detail-title" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
    <form onSubmit={save} className="my-4 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium uppercase tracking-wide text-emerald-700">Agenda comercial</p><h2 id="task-detail-title" className="mt-1 text-2xl font-bold text-slate-950">Detalle de actividad</h2><p className="mt-1 text-sm text-slate-500">Creada {display(task.created_at)} Â· Actualizada {display(task.updated_at)}</p></div><button type="button" disabled={saving} onClick={onClose} className="focus-ring rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-semibold text-slate-600">Cerrar</button></div>
      {error && <div role="alert" className="mt-5 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</div>}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="TÃ­tulo" className="sm:col-span-2"><input required value={form.title} onChange={e => setForm({...form,title:e.target.value})} className={control}/></Field>
        <Field label="Tipo"><select value={form.task_type} onChange={e => setForm({...form,task_type:e.target.value as TaskType})} className={control}>{TASK_TYPES.map(v=><option key={v} value={v}>{TYPES[v]}</option>)}</select></Field>
        <Field label="Estado"><select value={form.status} onChange={e => setForm({...form,status:e.target.value as TaskStatus})} className={control}>{TASK_STATUSES.map(v=><option key={v} value={v}>{STATUS[v]}</option>)}</select></Field>
        <Field label="Prioridad"><select value={form.priority} onChange={e => setForm({...form,priority:e.target.value as TaskPriority})} className={control}>{TASK_PRIORITIES.map(v=><option key={v} value={v}>{PRIORITIES[v]}</option>)}</select></Field>
        <label className="flex items-center gap-3 self-end rounded-lg border border-[rgb(var(--border))] px-3 py-2.5 text-sm font-medium text-slate-700"><input type="checkbox" checked={form.all_day} onChange={e => setForm({...form,all_day:e.target.checked})} className="h-4 w-4 accent-emerald-700"/>Actividad de todo el dÃ­a</label>
        <Field label="Inicio"><input type="datetime-local" value={form.start_at} onChange={e => setForm({...form,start_at:e.target.value})} className={control}/></Field>
        <Field label="Vencimiento"><input type="datetime-local" value={form.due_at} onChange={e => setForm({...form,due_at:e.target.value})} className={control}/></Field>
        <Field label="Recordatorio"><input type="datetime-local" value={form.reminder_at} onChange={e => setForm({...form,reminder_at:e.target.value})} className={control}/></Field>
        <Field label="DescripciÃ³n" className="sm:col-span-2"><textarea rows={3} value={form.description} onChange={e => setForm({...form,description:e.target.value})} className={control}/></Field>
        <Field label="Notas internas" className="sm:col-span-2"><textarea rows={3} value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} className={control}/></Field>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[rgb(var(--border))] pt-5"><div className="flex gap-2">{task.status !== "cancelled" && <button type="button" disabled={saving} onClick={() => void cancelTask()} className="focus-ring rounded-lg border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-800">Cancelar actividad</button>}{!confirmDelete ? <button type="button" disabled={saving} onClick={() => setConfirmDelete(true)} className="focus-ring rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700">Eliminar</button> : <button type="button" disabled={saving} onClick={() => void remove()} className="focus-ring rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white">Confirmar eliminaciÃ³n</button>}</div><div className="flex gap-2"><button type="button" disabled={saving} onClick={onClose} className="focus-ring rounded-lg border border-[rgb(var(--border))] px-4 py-2.5 text-sm font-semibold text-slate-700">Volver</button><button type="submit" disabled={saving} className="focus-ring rounded-lg bg-[rgb(var(--brand-primary-dark))] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving?"Guardando...":"Guardar cambios"}</button></div></div>
    </form>
  </div>;
}

function Field({label,className="",children}:{label:string;className?:string;children:React.ReactNode}) { return <label className={className}><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>{children}</label>; }
function clean(v:string){return v.trim()||null;} function iso(v:string){return v?new Date(v).toISOString():null;}
function local(v:string|null){if(!v)return "";const d=new Date(v);if(Number.isNaN(d.getTime()))return "";const offset=d.getTimezoneOffset();return new Date(d.getTime()-offset*60000).toISOString().slice(0,16);}
function display(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?"Sin informaciÃ³n":new Intl.DateTimeFormat("es-CL",{dateStyle:"medium",timeStyle:"short"}).format(d);}

