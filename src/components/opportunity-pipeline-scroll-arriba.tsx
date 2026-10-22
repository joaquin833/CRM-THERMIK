"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  OpportunityCatalogs,
  OpportunityListItem,
} from "@/lib/services/opportunities";

type Relation = Record<string, unknown>;

type Props = {
  opportunities: OpportunityListItem[];
  catalogs: OpportunityCatalogs;
};

const CLOSED_STAGES = new Set(["Aprobada", "Perdida", "Cancelada"]);

export function OpportunityPipeline({ opportunities, catalogs }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<OpportunityListItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const topScrollRef = useRef<HTMLDivElement>(null);
  const pipelineScrollRef = useRef<HTMLDivElement>(null);
  const [pipelineWidth, setPipelineWidth] = useState(0);
  const syncingScroll = useRef(false);

  const orderedStages = useMemo(
    () => [...catalogs.etapas].sort((a, b) => a.order - b.order),
    [catalogs.etapas],
  );
  const openStages = orderedStages.filter(
    (stage) => !CLOSED_STAGES.has(stage.value),
  );
  const closedStages = orderedStages.filter((stage) =>
    CLOSED_STAGES.has(stage.value),
  );

  useEffect(() => {
    const pipeline = pipelineScrollRef.current;
    if (!pipeline) return;

    const updateWidth = () => setPipelineWidth(pipeline.scrollWidth);
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(pipeline);
    const content = pipeline.firstElementChild;
    if (content) observer.observe(content);

    return () => observer.disconnect();
  }, [openStages.length, opportunities.length]);

  function syncFromTop() {
    if (syncingScroll.current) return;
    const top = topScrollRef.current;
    const pipeline = pipelineScrollRef.current;
    if (!top || !pipeline) return;
    syncingScroll.current = true;
    pipeline.scrollLeft = top.scrollLeft;
    requestAnimationFrame(() => {
      syncingScroll.current = false;
    });
  }

  function syncFromPipeline() {
    if (syncingScroll.current) return;
    const top = topScrollRef.current;
    const pipeline = pipelineScrollRef.current;
    if (!top || !pipeline) return;
    syncingScroll.current = true;
    top.scrollLeft = pipeline.scrollLeft;
    requestAnimationFrame(() => {
      syncingScroll.current = false;
    });
  }

  async function changeStage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const localDate = String(form.get("nextAt") ?? "").trim();
    const payload = {
      stage: String(form.get("stage") ?? ""),
      nextAction: empty(form.get("nextAction")),
      nextAt: localDate ? new Date(localDate).toISOString() : null,
      priority: empty(form.get("priority")),
      temperature: empty(form.get("temperature")),
      estimatedCloseDate: empty(form.get("estimatedCloseDate")),
      comment: empty(form.get("comment")),
    };

    try {
      const response = await fetch(`/api/oportunidades/${editing.id}/etapa`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "No fue posible cambiar la etapa.");
      }
      setEditing(null);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No fue posible cambiar la etapa.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div
        ref={topScrollRef}
        onScroll={syncFromTop}
        className="mt-6 overflow-x-auto pb-2 [scrollbar-color:rgb(100_116_139)_transparent] [scrollbar-width:auto]"
        aria-label="Desplazamiento horizontal del pipeline"
      >
        <div style={{ width: pipelineWidth, height: 1 }} />
      </div>

      <section
        ref={pipelineScrollRef}
        onScroll={syncFromPipeline}
        className="overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="grid grid-flow-col auto-cols-[minmax(310px,330px)] gap-4">
          {openStages.map((stage) => {
            const items = opportunities.filter(
              (opportunity) => opportunity.etapa_comercial === stage.value,
            );
            return (
              <PipelineColumn
                key={stage.value}
                stage={stage.label}
                probability={stage.probability}
                opportunities={items}
                onEdit={setEditing}
              />
            );
          })}
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        {closedStages.map((stage) => {
          const items = opportunities.filter(
            (opportunity) => opportunity.etapa_comercial === stage.value,
          );
          return (
            <PipelineColumn
              key={stage.value}
              stage={stage.label}
              probability={stage.probability}
              opportunities={items}
              onEdit={setEditing}
              closed
            />
          );
        })}
      </section>

      {editing && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4">
          <form
            onSubmit={changeStage}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
                  Cambio de etapa
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">
                  {editing.nombre}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                Cerrar
              </button>
            </div>

            {error && (
              <p className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
                {error}
              </p>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Select
                label="Nueva etapa"
                name="stage"
                defaultValue={editing.etapa_comercial}
                options={orderedStages.map((stage) => ({
                  value: stage.value,
                  label: `${stage.label} · ${stage.probability}%`,
                }))}
              />
              <Select
                label="Prioridad"
                name="priority"
                defaultValue={editing.prioridad ?? "Media"}
                options={catalogs.prioridades}
              />
              <Select
                label="Temperatura"
                name="temperature"
                defaultValue={editing.temperatura ?? "Tibia"}
                options={catalogs.temperaturas}
              />
              <Field
                label="Fecha estimada de cierre"
                name="estimatedCloseDate"
                type="date"
                defaultValue={dateInput(editing.fecha_estimada_cierre)}
              />
              <label className="sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Próxima acción
                </span>
                <input
                  name="nextAction"
                  defaultValue={editing.proxima_accion ?? ""}
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="Ej.: llamar para confirmar decisión"
                />
              </label>
              <Field
                label="Fecha de próxima acción"
                name="nextAt"
                type="datetime-local"
                defaultValue={dateTimeInput(editing.fecha_proxima_accion)}
              />
              <label className="sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Comentario
                </span>
                <textarea
                  name="comment"
                  rows={4}
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="Motivo o contexto del cambio"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border px-4 py-2 font-semibold text-slate-700"
              >
                Cancelar
              </button>
              <button
                disabled={saving}
                className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Guardar etapa"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function PipelineColumn({
  stage,
  probability,
  opportunities,
  onEdit,
  closed = false,
}: {
  stage: string;
  probability: number;
  opportunities: OpportunityListItem[];
  onEdit: (opportunity: OpportunityListItem) => void;
  closed?: boolean;
}) {
  const total = opportunities.reduce(
    (sum, opportunity) => sum + Number(opportunity.monto_estimado ?? 0),
    0,
  );

  return (
    <section className="min-w-[310px] rounded-2xl border bg-slate-100/80 p-3">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-xl bg-slate-100/95 px-1 pb-3 pt-1 backdrop-blur">
        <div>
          <h2 className="font-semibold text-slate-950">{stage}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {opportunities.length} oportunidades · {money(total)}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            closed
              ? "bg-slate-200 text-slate-700"
              : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {probability}%
        </span>
      </div>

      <div className="grid gap-3">
        {opportunities.map((opportunity) => (
          <OpportunityCard
            key={opportunity.id}
            opportunity={opportunity}
            onEdit={onEdit}
          />
        ))}
        {opportunities.length === 0 && (
          <p className="rounded-xl border border-dashed bg-white p-5 text-center text-xs text-slate-500">
            Sin oportunidades
          </p>
        )}
      </div>
    </section>
  );
}

function OpportunityCard({
  opportunity,
  onEdit,
}: {
  opportunity: OpportunityListItem;
  onEdit: (opportunity: OpportunityListItem) => void;
}) {
  const project = relation(opportunity.proyectos);
  const company = relation(opportunity.empresas);
  const contact = relation(opportunity.contactos);
  const probability = Number(opportunity.probabilidad_cierre ?? 0);
  const amount = Number(opportunity.monto_estimado ?? 0);
  const overdue = opportunity.fecha_proxima_accion
    ? new Date(opportunity.fecha_proxima_accion).getTime() < Date.now()
    : true;

  return (
    <article className="rounded-xl border bg-white p-4 shadow-sm">
      <Link
        href={`/oportunidades/${opportunity.id}`}
        className="line-clamp-2 min-h-12 font-semibold leading-6 text-slate-950 hover:text-emerald-700"
      >
        {opportunity.nombre}
      </Link>
      <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-slate-500">
        {text(project?.nombre) || "Sin proyecto"}
      </p>
      <p className="mt-3 text-lg font-bold text-slate-950">{money(amount)}</p>
      <p className="text-xs text-slate-500">
        Ponderado: {money((amount * probability) / 100)}
      </p>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <Badge>{opportunity.prioridad || "Sin prioridad"}</Badge>
        <Badge>{opportunity.temperatura || "Sin temperatura"}</Badge>
        <Badge>{probability}%</Badge>
      </div>

      <div
        className={`mt-3 rounded-lg p-3 text-xs ${
          overdue ? "bg-red-50 text-red-900" : "bg-slate-50 text-slate-700"
        }`}
      >
        <p className="font-semibold">
          {opportunity.proxima_accion || "Sin próxima acción"}
        </p>
        <p className="mt-1">{dateTime(opportunity.fecha_proxima_accion)}</p>
      </div>

      <p className="mt-3 line-clamp-2 min-h-8 text-xs leading-4 text-slate-500">
        {text(company?.razon_social) ||
          [text(contact?.nombre), text(contact?.apellido)]
            .filter(Boolean)
            .join(" ") ||
          "Sin cliente"}
      </p>

      <button
        type="button"
        onClick={() => onEdit(opportunity)}
        className="mt-4 w-full rounded-lg border px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Cambiar etapa
      </button>
    </article>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
      {children}
    </span>
  );
}

function Field(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string },
) {
  const { label, ...inputProps } = props;
  return (
    <label>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <input {...inputProps} className="w-full rounded-lg border px-3 py-2" />
    </label>
  );
}

function Select({
  label,
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <select {...props} className="w-full rounded-lg border px-3 py-2">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function relation(value: unknown): Relation | null {
  if (Array.isArray(value)) return (value[0] as Relation | undefined) ?? null;
  if (value && typeof value === "object") return value as Relation;
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function empty(value: FormDataEntryValue | null): string | null {
  const result = String(value ?? "").trim();
  return result || null;
}

function money(value: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function dateTime(value?: string | null): string {
  if (!value) return "Sin fecha programada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function dateInput(value?: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function dateTimeInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
