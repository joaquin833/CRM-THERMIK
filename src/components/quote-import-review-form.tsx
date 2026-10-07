"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type QuoteItem = {
  descripcion: string;
  cantidad: number | null;
  unidad: string | null;
  valor_unitario: number | null;
  subtotal: number | null;
};

type ReviewData = {
  numero_cotizacion: string;
  fecha_emision: string | null;
  fecha_validez: string | null;
  cliente: string | null;
  rut_cliente: string | null;
  nombre_contacto: string | null;
  telefono_contacto: string | null;
  correo_contacto: string | null;
  proyecto: string | null;
  direccion_proyecto: string | null;
  moneda: string;
  neto_afecto: number | null;
  neto_exento: number | null;
  iva: number | null;
  total: number | null;
  metros_cuadrados: number | null;
  plazo_ejecucion: string | null;
  condiciones: string[];
  items: QuoteItem[];
};

type Props = {
  importId: string;
  initialData: ReviewData;
};

export function QuoteImportReviewForm({
  importId,
  initialData,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState(initialData);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function setText(field: keyof ReviewData, value: string): void {
    setForm((current) => ({
      ...current,
      [field]: value === "" ? null : value,
    }));
    setError("");
    setSuccess("");
  }

  function setNumber(field: keyof ReviewData, value: string): void {
    setForm((current) => ({
      ...current,
      [field]: value === "" ? null : Number(value),
    }));
    setError("");
    setSuccess("");
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      setBusy(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/cotizaciones/importar/${importId}/revision`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "No fue posible guardar la revisión."
        );
      }

      setSuccess(result.message ?? "Revisión guardada correctamente.");
      router.refresh();
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "No fue posible guardar la revisión."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-6">
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">
          Revisar y corregir datos
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Corrige los campos antes de vincular la cotización con el CRM.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField label="N.º de cotización" required value={form.numero_cotizacion} onChange={(value) => setForm((current) => ({ ...current, numero_cotizacion: value }))} />
          <TextField label="Fecha de emisión" type="date" value={form.fecha_emision ?? ""} onChange={(value) => setText("fecha_emision", value)} />
          <TextField label="Fecha de validez" type="date" value={form.fecha_validez ?? ""} onChange={(value) => setText("fecha_validez", value)} />
          <TextField label="Cliente o empresa" value={form.cliente ?? ""} onChange={(value) => setText("cliente", value)} />
          <TextField label="RUT del cliente" value={form.rut_cliente ?? ""} onChange={(value) => setText("rut_cliente", value)} />
          <TextField label="Nombre del contacto" value={form.nombre_contacto ?? ""} onChange={(value) => setText("nombre_contacto", value)} />
          <TextField label="Celular del contacto" value={form.telefono_contacto ?? ""} onChange={(value) => setText("telefono_contacto", value)} />
          <TextField label="Correo del contacto" type="email" value={form.correo_contacto ?? ""} onChange={(value) => setText("correo_contacto", value)} />
          <TextField label="Proyecto" value={form.proyecto ?? ""} onChange={(value) => setText("proyecto", value)} />
          <TextField label="Dirección del proyecto" value={form.direccion_proyecto ?? ""} onChange={(value) => setText("direccion_proyecto", value)} />
          <NumberField label="Metros cuadrados" value={form.metros_cuadrados} onChange={(value) => setNumber("metros_cuadrados", value)} />
          <TextField label="Plazo de ejecución" value={form.plazo_ejecucion ?? ""} onChange={(value) => setText("plazo_ejecucion", value)} />
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">
          Valores oficiales
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Neto afecto" value={form.neto_afecto} onChange={(value) => setNumber("neto_afecto", value)} />
          <NumberField label="Neto exento" value={form.neto_exento} onChange={(value) => setNumber("neto_exento", value)} />
          <NumberField label="IVA" value={form.iva} onChange={(value) => setNumber("iva", value)} />
          <NumberField label="Total" required value={form.total} onChange={(value) => setNumber("total", value)} />
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900">
          {error}
        </div>
      )}

      {success && (
        <div aria-live="polite" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
          {success}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Guardando revisión..." : "Guardar revisión"}
        </button>
      </div>
    </form>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <input
        type={type}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-slate-300 p-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <input
        type="number"
        min="0"
        step="1"
        value={value ?? ""}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-slate-300 p-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}
