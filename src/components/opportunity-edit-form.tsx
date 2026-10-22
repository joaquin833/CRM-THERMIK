"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Opportunity360 } from "@/lib/services/opportunities";

type Option = {
  id: string;
  label: string;
  companyId?: string | null;
};

type Props = {
  data: Opportunity360;
  contacts: Option[];
  companies: Option[];
  projects: Option[];
};

export function OpportunityEditForm({
  data,
  contacts,
  companies,
  projects,
}: Props) {
  const router = useRouter();
  const opportunity = data.opportunity;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [projectId, setProjectId] = useState(opportunity.proyecto_id ?? "");
  const selectedProject = projects.find((item) => item.id === projectId);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const nextAt = value(form.get("fechaProximaAccion"));
    const amount = value(form.get("montoEstimado"));
    const payload = {
      nombre: String(form.get("nombre") ?? ""),
      montoEstimado: amount ? Number(amount) : null,
      contactoId: String(form.get("contactoId") ?? ""),
      empresaId: emptyToNull(form.get("empresaId")),
      proyectoId: String(form.get("proyectoId") ?? ""),
      prioridad: String(form.get("prioridad") ?? "Media"),
      temperatura: String(form.get("temperatura") ?? "Tibia"),
      fechaEstimadaCierre: emptyToNull(form.get("fechaEstimadaCierre")),
      proximaAccion: emptyToNull(form.get("proximaAccion")),
      fechaProximaAccion: nextAt ? new Date(nextAt).toISOString() : null,
      observaciones: emptyToNull(form.get("observaciones")),
    };

    try {
      const response = await fetch(`/api/oportunidades/${opportunity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          result.error || "No fue posible guardar la oportunidad.",
        );
      }

      router.push(`/oportunidades/${opportunity.id}`);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No fue posible guardar la oportunidad.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 grid gap-6">
      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </p>
      )}

      <section className="grid gap-4 rounded-2xl border bg-white p-5 shadow-sm md:grid-cols-2">
        <Field
          label="Nombre de la oportunidad *"
          name="nombre"
          defaultValue={opportunity.nombre}
          required
        />
        <Field
          label="Monto estimado"
          name="montoEstimado"
          type="number"
          min="0"
          step="1"
          defaultValue={opportunity.monto_estimado ?? ""}
        />

        <Select
          label="Contacto *"
          name="contactoId"
          defaultValue={opportunity.contacto_id ?? ""}
          options={contacts}
          required
        />
        <Select
          label="Proyecto *"
          name="proyectoId"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          options={projects}
          required
        />
        <Select
          label="Empresa"
          name="empresaId"
          defaultValue={opportunity.empresa_id ?? ""}
          options={companies}
          empty="Cliente particular"
        />

        <ReadonlyField
          label="Empresa requerida por el proyecto"
          value={
            selectedProject?.companyId
              ? companies.find((item) => item.id === selectedProject.companyId)
                  ?.label || "Empresa vinculada"
              : "Cliente particular"
          }
        />

        <Select
          label="Prioridad"
          name="prioridad"
          defaultValue={opportunity.prioridad ?? "Media"}
          options={data.catalogs.prioridades.map((item) => ({
            id: item.value,
            label: item.label,
          }))}
        />
        <Select
          label="Temperatura"
          name="temperatura"
          defaultValue={opportunity.temperatura ?? "Tibia"}
          options={data.catalogs.temperaturas.map((item) => ({
            id: item.value,
            label: item.label,
          }))}
        />
        <Field
          label="Fecha estimada de cierre"
          name="fechaEstimadaCierre"
          type="date"
          defaultValue={dateInput(opportunity.fecha_estimada_cierre)}
        />
        <Field
          label="Fecha de próxima acción"
          name="fechaProximaAccion"
          type="datetime-local"
          defaultValue={dateTimeInput(opportunity.fecha_proxima_accion)}
        />

        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Próxima acción
          </span>
          <input
            name="proximaAccion"
            defaultValue={opportunity.proxima_accion ?? ""}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Ej.: llamar para confirmar decisión"
          />
        </label>

        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Observaciones
          </span>
          <textarea
            name="observaciones"
            defaultValue={opportunity.observaciones ?? ""}
            rows={5}
            className="w-full rounded-lg border px-3 py-2"
          />
        </label>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-semibold">Campos protegidos</p>
        <p className="mt-1">
          La etapa, el estado y la probabilidad se actualizan únicamente
          mediante
          <strong> Cambiar etapa</strong> en el pipeline.
        </p>
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push(`/oportunidades/${opportunity.id}`)}
          className="rounded-lg border px-4 py-2 font-semibold text-slate-700"
        >
          Cancelar
        </button>
        <button
          disabled={saving}
          className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </form>
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
  empty,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: Option[];
  empty?: string;
}) {
  return (
    <label>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <select {...props} className="w-full rounded-lg border px-3 py-2">
        {empty !== undefined && <option value="">{empty}</option>}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <p className="rounded-lg border bg-slate-50 px-3 py-2 text-slate-700">
        {value}
      </p>
    </div>
  );
}

function value(input: FormDataEntryValue | null): string {
  return String(input ?? "").trim();
}

function emptyToNull(input: FormDataEntryValue | null): string | null {
  return value(input) || null;
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
