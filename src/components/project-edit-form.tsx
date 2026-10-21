"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ProjectCatalogs, Project360 } from "@/lib/services/projects";

type Option = { id: string; label: string };

type Props = {
  data: Project360;
  contacts: Option[];
  companies: Option[];
  returnTo?: string;
};

export function ProjectEditForm({
  data,
  contacts,
  companies,
  returnTo,
}: Props) {
  const router = useRouter();
  const project = data.project;
  const catalogs: ProjectCatalogs = data.catalogs;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const numberValue = String(
      form.get("metrosCuadradosEstimados") ?? "",
    ).trim();
    const payload = {
      nombre: String(form.get("nombre") ?? ""),
      contactoPrincipalId: emptyToNull(form.get("contactoPrincipalId")),
      empresaId: emptyToNull(form.get("empresaId")),
      direccion: emptyToNull(form.get("direccion")),
      comuna: emptyToNull(form.get("comuna")),
      ciudad: emptyToNull(form.get("ciudad")),
      region: emptyToNull(form.get("region")),
      tipoProyecto: emptyToNull(form.get("tipoProyecto")),
      tipoObra: emptyToNull(form.get("tipoObra")),
      metrosCuadradosEstimados: numberValue ? Number(numberValue) : null,
      estado: String(form.get("estado") ?? "activo"),
      observaciones: emptyToNull(form.get("observaciones")),
    };

    try {
      const response = await fetch(`/api/proyectos/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "No fue posible guardar el proyecto.");
      router.push(returnTo || `/proyectos/${project.id}`);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No fue posible guardar el proyecto.",
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
          label="Nombre del proyecto *"
          name="nombre"
          defaultValue={project.nombre}
          required
        />
        <Select
          label="Estado"
          name="estado"
          defaultValue={project.estado}
          options={catalogs.estados}
        />
        <Select
          label="Tipo de proyecto"
          name="tipoProyecto"
          defaultValue={project.tipo_proyecto ?? ""}
          options={catalogs.tipos_proyecto}
          empty="Sin clasificar"
        />
        <Select
          label="Tipo de obra"
          name="tipoObra"
          defaultValue={project.tipo_obra ?? ""}
          options={catalogs.tipos_obra}
          empty="Sin clasificar"
        />
        <Select
          label="Contacto principal"
          name="contactoPrincipalId"
          defaultValue={project.contacto_principal_id ?? ""}
          options={contacts.map((item) => ({
            value: item.id,
            label: item.label,
          }))}
          empty="Sin contacto"
        />
        <Select
          label="Empresa"
          name="empresaId"
          defaultValue={project.empresa_id ?? ""}
          options={companies.map((item) => ({
            value: item.id,
            label: item.label,
          }))}
          empty="Cliente particular"
        />
        <Field
          label="Dirección"
          name="direccion"
          defaultValue={project.direccion ?? ""}
        />
        <Field
          label="Comuna"
          name="comuna"
          defaultValue={project.comuna ?? ""}
        />
        <Field
          label="Ciudad"
          name="ciudad"
          defaultValue={project.ciudad ?? ""}
        />
        <Field
          label="Región"
          name="region"
          defaultValue={project.region ?? ""}
        />
        <Field
          label="Metros cuadrados estimados"
          name="metrosCuadradosEstimados"
          type="number"
          min="0"
          step="0.01"
          defaultValue={project.metros_cuadrados_estimados ?? ""}
        />
        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Observaciones
          </span>
          <textarea
            name="observaciones"
            defaultValue={project.observaciones ?? ""}
            rows={5}
            className="w-full rounded-lg border px-3 py-2"
          />
        </label>
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push(returnTo || `/proyectos/${project.id}`)}
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
  options: Array<{ value: string; label: string }>;
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
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}
