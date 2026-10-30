"use client";

import Link from "next/link";
import { CalendarClock, Check, Loader2, X } from "lucide-react";

import type { ProposedAIAction } from "@/lib/ai/action-schemas";

type Props = {
  action: ProposedAIAction;
  busy: boolean;
  result?: { message: string; url: string; calendar?: { synced: boolean } } | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AIActionPreview({ action, busy, result, onConfirm, onCancel }: Props) {
  if (result) {
    return (
      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
        <p className="font-semibold">{result.message}</p>
        <p className="mt-1 text-xs">
          {result.calendar?.synced
            ? "Google Calendar actualizado."
            : "Guardada en Agenda. Google Calendar queda pendiente de sincronización."}
        </p>
        <Link href={result.url} className="mt-2 inline-block text-xs font-semibold underline">
          Ver en Agenda
        </Link>
      </div>
    );
  }

  const start = new Date(action.payload.start_at);
  const due = new Date(action.payload.due_at);

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
      <div className="flex items-center gap-2 text-sm font-bold">
        <CalendarClock className="size-4" /> Acción propuesta
      </div>
      <p className="mt-2 text-sm font-semibold">{action.label}</p>
      {action.type === "create_task" ? (
        <dl className="mt-2 grid gap-1 text-xs">
          <Row label="Título" value={action.payload.title} />
          <Row label="Tipo" value={taskTypeLabel(action.payload.task_type)} />
          <Row label="Prioridad" value={priorityLabel(action.payload.priority)} />
          <RelationRow label="Contacto" value={action.payload.relations.contact_name} linked={!!action.payload.contact_id} />
          <RelationRow label="Empresa" value={action.payload.relations.company_name} linked={!!action.payload.company_id} />
          <RelationRow label="Proyecto" value={action.payload.relations.project_name} linked={!!action.payload.project_id} />
          <RelationRow label="Oportunidad" value={action.payload.relations.opportunity_name} linked={!!action.payload.opportunity_id} />
          <RelationRow label="Cotización" value={action.payload.relations.quote_number} linked={!!action.payload.quote_id} />
        </dl>
      ) : (
        <dl className="mt-2 grid gap-1 text-xs">
          <Row label="Acción" value="Reprogramar actividad existente" />
        </dl>
      )}
      <dl className="mt-2 grid gap-1 text-xs">
        <Row label="Inicio" value={formatDate(start)} />
        <Row label="Término" value={formatDate(due)} />
      </dl>
      <p className="mt-3 text-[11px] leading-4 text-amber-800">
        La acción solo se ejecutará cuando presiones Confirmar.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-amber-100 disabled:opacity-50">
          <X className="size-3" /> Cancelar
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-50">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
          Confirmar
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex gap-2"><dt className="w-16 shrink-0 font-semibold">{label}:</dt><dd>{value}</dd></div>;
}

function RelationRow({ label, value, linked }: { label: string; value: string | null; linked: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 font-semibold">{label}:</dt>
      <dd className={linked ? "text-emerald-800" : "text-slate-500"}>
        {linked ? value || "Registro vinculado" : "Sin vincular"}
      </dd>
    </div>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(value);
}

function taskTypeLabel(value: string) {
  return ({ follow_up: "Seguimiento", call: "Llamada", meeting: "Reunión", email: "Correo", visit: "Visita", quote_review: "Revisión de cotización", other: "Otro" } as Record<string, string>)[value] ?? value;
}

function priorityLabel(value: string) {
  return ({ low: "Baja", medium: "Media", high: "Alta", urgent: "Urgente" } as Record<string, string>)[value] ?? value;
}
