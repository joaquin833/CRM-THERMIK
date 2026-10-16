"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import type {
  Company360Company,
  CompanyCatalogs,
} from "@/lib/services/companies";

type Props = {
  company: Company360Company;
  catalogs: CompanyCatalogs;
};

type ApiResponse = {
  error?: string;
  detail?: string | null;
  warnings?: { matches?: Array<{ razon_social?: string | null }> };
};

export function CompanyEditForm({ company, catalogs }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(
      [
        "razon_social",
        "nombre_fantasia",
        "rut",
        "giro",
        "pagina_web",
        "direccion",
        "comuna",
        "ciudad",
        "region",
        "segmento",
        "origen",
        "estado",
        "observaciones",
      ].map((name) => [name, stringValue(form, name)]),
    );

    try {
      const response = await fetch(`/api/empresas/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const contentType = response.headers.get("content-type") ?? "";
      const text = await response.text();
      const result: ApiResponse =
        contentType.includes("application/json") && text
          ? JSON.parse(text)
          : {};

      if (!response.ok) {
        setError(
          contentType.includes("application/json")
            ? [result.error, result.detail].filter(Boolean).join(" ")
            : `La API respondió con error HTTP ${response.status}.`,
        );
        return;
      }

      router.push(`/empresas/${company.id}`);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible guardar.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </div>
      )}

      <Section title="Identificación">
        <Field
          label="Razón social"
          name="razon_social"
          value={company.razon_social}
          required
        />
        <Field
          label="Nombre de fantasía"
          name="nombre_fantasia"
          value={company.nombre_fantasia}
        />
        <Field
          label="RUT"
          name="rut"
          value={company.rut}
          placeholder="12.345.678-5"
        />
        <Field label="Giro" name="giro" value={company.giro} />
        <Field
          label="Página web"
          name="pagina_web"
          value={company.pagina_web}
          type="url"
        />
        <Select
          label="Estado"
          name="estado"
          value={company.estado}
          options={catalogs.estados}
          required
        />
      </Section>

      <Section title="Clasificación comercial">
        <Select
          label="Segmento"
          name="segmento"
          value={company.segmento ?? ""}
          options={catalogs.segmentos}
        />
        <Select
          label="Origen"
          name="origen"
          value={company.origen ?? ""}
          options={catalogs.origenes}
        />
      </Section>

      <Section title="Ubicación">
        <Field label="Dirección" name="direccion" value={company.direccion} />
        <Field label="Comuna" name="comuna" value={company.comuna} />
        <Field label="Ciudad" name="ciudad" value={company.ciudad} />
        <Field label="Región" name="region" value={company.region} />
      </Section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">Observaciones</h2>
        <textarea
          name="observaciones"
          defaultValue={company.observaciones ?? ""}
          rows={5}
          className="mt-5 w-full rounded-lg border border-slate-300 bg-white p-3"
        />
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push(`/empresas/${company.id}`)}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  value,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  name: string;
  value: string | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value ?? ""}
        required={required}
        placeholder={placeholder}
        className="rounded-lg border border-slate-300 bg-white p-3"
      />
    </label>
  );
}

function Select({
  label,
  name,
  value,
  options,
  required = false,
}: {
  label: string;
  name: string;
  value: string;
  options: string[];
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <select
        name={name}
        defaultValue={value}
        required={required}
        className="rounded-lg border border-slate-300 bg-white p-3"
      >
        {!required && <option value="">Sin registrar</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {humanize(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function stringValue(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function humanize(value: string): string {
  const normalized = value.replaceAll("_", " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
