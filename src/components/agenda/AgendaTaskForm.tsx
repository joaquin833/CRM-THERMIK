"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  createAgendaTask,
  TASK_PRIORITIES,
  TASK_TYPES,
  type AgendaTask,
  type CreateTaskInput,
  type TaskPriority,
  type TaskType,
} from "@/lib/agenda";

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

type FormState = {
  title: string;
  description: string;
  task_type: TaskType;
  priority: TaskPriority;
  start_at: string;
  due_at: string;
  reminder_at: string;
  all_day: boolean;
  contact_id: string;
  company_id: string;
  project_id: string;
  opportunity_id: string;
  quote_id: string;
  notes: string;
};

const INITIAL_STATE: FormState = {
  title: "",
  description: "",
  task_type: "follow_up",
  priority: "medium",
  start_at: "",
  due_at: "",
  reminder_at: "",
  all_day: false,
  contact_id: "",
  company_id: "",
  project_id: "",
  opportunity_id: "",
  quote_id: "",
  notes: "",
};

interface AgendaTaskFormProps {
  open: boolean;
  onClose: () => void;
  onCreated: (task: AgendaTask) => void;
}

function optional(value: string) {
  const cleaned = value.trim();
  return cleaned || null;
}

function toIsoOrNull(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export default function AgendaTaskForm({ open, onClose, onCreated }: AgendaTaskFormProps) {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateError = useMemo(() => {
    if (!form.start_at || !form.due_at) return null;
    return new Date(form.due_at).getTime() < new Date(form.start_at).getTime()
      ? "La fecha de vencimiento no puede ser anterior al inicio."
      : null;
  }, [form.due_at, form.start_at]);

  if (!open) return null;

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function close() {
    if (saving) return;
    setError(null);
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.title.trim()) {
      setError("El título es obligatorio.");
      return;
    }
    if (dateError) {
      setError(dateError);
      return;
    }

    const input: CreateTaskInput = {
      title: form.title.trim(),
      description: optional(form.description),
      task_type: form.task_type,
      status: "pending",
      priority: form.priority,
      start_at: toIsoOrNull(form.start_at),
      due_at: toIsoOrNull(form.due_at),
      reminder_at: toIsoOrNull(form.reminder_at),
      all_day: form.all_day,
      contact_id: optional(form.contact_id),
      company_id: optional(form.company_id),
      project_id: optional(form.project_id),
      opportunity_id: optional(form.opportunity_id),
      quote_id: optional(form.quote_id),
      notes: optional(form.notes),
    };

    setSaving(true);
    try {
      const created = await createAgendaTask(input);
      setForm(INITIAL_STATE);
      onCreated(created);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible crear la actividad.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="agenda-form-title">
      <div className="my-4 w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 id="agenda-form-title" className="text-xl font-bold text-slate-900">Nueva actividad</h2>
            <p className="mt-1 text-sm text-slate-500">Registra una acción comercial y vincúlala cuando corresponda.</p>
          </div>
          <button type="button" onClick={close} disabled={saving} aria-label="Cerrar formulario" className="rounded-lg px-3 py-2 text-xl leading-none text-slate-500 hover:bg-slate-100 disabled:opacity-50">×</button>
        </div>

        <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Título" required className="sm:col-span-2">
              <input value={form.title} onChange={(e) => update("title", e.target.value)} maxLength={180} required autoFocus className={inputClass} placeholder="Ej.: Llamar para revisar propuesta" />
            </Field>

            <Field label="Tipo">
              <select value={form.task_type} onChange={(e) => update("task_type", e.target.value as TaskType)} className={inputClass}>
                {TASK_TYPES.map((value) => <option key={value} value={value}>{TYPE_LABELS[value]}</option>)}
              </select>
            </Field>

            <Field label="Prioridad">
              <select value={form.priority} onChange={(e) => update("priority", e.target.value as TaskPriority)} className={inputClass}>
                {TASK_PRIORITIES.map((value) => <option key={value} value={value}>{PRIORITY_LABELS[value]}</option>)}
              </select>
            </Field>

            <Field label="Inicio">
              <input type="datetime-local" value={form.start_at} onChange={(e) => update("start_at", e.target.value)} className={inputClass} />
            </Field>

            <Field label="Vencimiento">
              <input type="datetime-local" value={form.due_at} onChange={(e) => update("due_at", e.target.value)} className={inputClass} />
            </Field>

            <Field label="Recordatorio">
              <input type="datetime-local" value={form.reminder_at} onChange={(e) => update("reminder_at", e.target.value)} className={inputClass} />
            </Field>

            <label className="flex items-center gap-3 self-end rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={form.all_day} onChange={(e) => update("all_day", e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
              Actividad de todo el día
            </label>

            <Field label="Descripción" className="sm:col-span-2">
              <textarea value={form.description} onChange={(e) => update("description", e.target.value)} rows={3} className={inputClass} placeholder="Contexto y objetivo de la actividad" />
            </Field>
          </div>

          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-2 text-sm font-semibold text-slate-700">Vínculos comerciales opcionales</legend>
            <p className="mb-4 text-xs text-slate-500">Usa UUID existentes. La cotización vinculada permanece en solo lectura.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contacto ID"><input value={form.contact_id} onChange={(e) => update("contact_id", e.target.value)} className={inputClass} placeholder="UUID del contacto" /></Field>
              <Field label="Empresa ID"><input value={form.company_id} onChange={(e) => update("company_id", e.target.value)} className={inputClass} placeholder="UUID de la empresa" /></Field>
              <Field label="Proyecto ID"><input value={form.project_id} onChange={(e) => update("project_id", e.target.value)} className={inputClass} placeholder="UUID del proyecto" /></Field>
              <Field label="Oportunidad ID"><input value={form.opportunity_id} onChange={(e) => update("opportunity_id", e.target.value)} className={inputClass} placeholder="UUID de la oportunidad" /></Field>
              <Field label="Cotización ID" className="sm:col-span-2"><input value={form.quote_id} onChange={(e) => update("quote_id", e.target.value)} className={inputClass} placeholder="UUID de la cotización, solo referencia" /></Field>
            </div>
          </fieldset>

          <Field label="Notas internas">
            <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={3} className={inputClass} placeholder="Información adicional para el seguimiento" />
          </Field>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={close} disabled={saving} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={saving || Boolean(dateError)} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Guardando..." : "Crear actividad"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function Field({ label, required = false, className = "", children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}{required && <span className="ml-1 text-red-600">*</span>}</span>
      {children}
    </label>
  );
}
