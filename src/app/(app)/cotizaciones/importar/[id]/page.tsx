import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { clp } from "@/lib/money";
import { requireProfile } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ id: string }>;
};

type ExtractedItem = {
  descripcion?: string | null;
  cantidad?: number | null;
  unidad?: string | null;
  valor_unitario?: number | null;
  subtotal?: number | null;
};

type ExtractedQuote = {
  numero_cotizacion?: string | null;
  fecha_emision?: string | null;
  fecha_validez?: string | null;
  cliente?: string | null;
  rut_cliente?: string | null;
  nombre_contacto?: string | null;
  telefono_contacto?: string | null;
  correo_contacto?: string | null;
  proyecto?: string | null;
  direccion_proyecto?: string | null;
  moneda?: string | null;
  neto_afecto?: number | null;
  neto_exento?: number | null;
  iva?: number | null;
  total?: number | null;
  metros_cuadrados?: number | null;
  plazo_ejecucion?: string | null;
  condiciones?: string[];
  items?: ExtractedItem[];
};

export default async function ImportReviewPage({ params }: PageProps) {
  const profile = await requireProfile([
    "admin",
    "jefatura_comercial",
    "ejecutivo_comercial",
  ]);
  const { id } = await params;
  const supabase = await createClient();

  const result = await supabase
    .from("quote_pdf_imports")
    .select("id,file_name,file_size,status,parsed_data,validation_errors,validation_warnings,confidence,error_message,analyzed_at,created_at")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data) {
    notFound();
  }

  const record = result.data;
  const quote = (record.parsed_data ?? {}) as ExtractedQuote;
  const errors = Array.isArray(record.validation_errors)
    ? record.validation_errors.map(String)
    : [];
  const warnings = Array.isArray(record.validation_warnings)
    ? record.validation_warnings.map(String)
    : [];
  const items = Array.isArray(quote.items) ? quote.items : [];

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
            Revisión de importación
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">
            {quote.numero_cotizacion
              ? `Cotización N.º ${quote.numero_cotizacion}`
              : "Cotización pendiente de identificar"}
          </h1>
          <p className="mt-2 text-slate-600">{record.file_name}</p>
        </div>

        <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
          {formatStatus(record.status)}
        </span>
      </div>

      {errors.length > 0 && (
        <section className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-5">
          <h2 className="font-semibold text-red-950">Errores que deben revisarse</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-red-800">
            {errors.map((message) => <li key={message}>{message}</li>)}
          </ul>
        </section>
      )}

      {warnings.length > 0 && (
        <section className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-950">Advertencias</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-900">
            {warnings.map((message) => <li key={message}>{message}</li>)}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">Datos extraídos del PDF</h2>
        <p className="mt-1 text-sm text-slate-500">
          Revisa todos los campos antes de confirmar la importación. En esta etapa aún no se crea la cotización.
        </p>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="N.º de cotización" value={quote.numero_cotizacion} />
          <Field label="Fecha de emisión" value={quote.fecha_emision} />
          <Field label="Fecha de validez" value={quote.fecha_validez} />
          <Field label="Cliente o empresa" value={quote.cliente} />
          <Field label="RUT del cliente" value={quote.rut_cliente} />
          <Field label="Nombre del contacto" value={quote.nombre_contacto} />
          <Field label="Celular del contacto" value={quote.telefono_contacto} />
          <Field label="Correo del contacto" value={quote.correo_contacto} />
          <Field label="Proyecto" value={quote.proyecto} />
          <Field label="Dirección del proyecto" value={quote.direccion_proyecto} />
          <Field label="Metros cuadrados" value={quote.metros_cuadrados} />
          <Field label="Plazo de ejecución" value={quote.plazo_ejecucion} />
          <Field label="Neto afecto" value={money(quote.neto_afecto)} />
          <Field label="Neto exento" value={money(quote.neto_exento)} />
          <Field label="IVA" value={money(quote.iva)} />
          <Field label="Total" value={money(quote.total)} />
        </dl>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-950">Ítems detectados</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            {items.length}
          </span>
        </div>

        {items.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
            No se detectaron ítems estructurados.
          </p>
        ) : (
          <div className="mt-4 divide-y">
            {items.map((item, index) => (
              <article key={`${index}-${item.descripcion ?? "item"}`} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium text-slate-900">
                    {item.descripcion ?? "Sin descripción"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.cantidad ?? "Sin cantidad"} {item.unidad ?? ""}
                    {item.valor_unitario !== null && item.valor_unitario !== undefined
                      ? ` · Unitario ${clp(item.valor_unitario)}`
                      : ""}
                  </p>
                </div>
                <p className="font-semibold text-slate-900">{money(item.subtotal)}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <p className="font-semibold text-blue-950">Siguiente etapa</p>
        <p className="mt-1 text-sm text-blue-800">
          Después de validar esta pantalla agregaremos la edición de campos, la vinculación con contacto, empresa, proyecto y oportunidad, y el botón Confirmar importación.
        </p>
      </section>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium text-slate-900">
        {value === null || value === undefined || value === "" ? "No identificado" : String(value)}
      </dd>
    </div>
  );
}

function money(value: number | null | undefined): string {
  return value === null || value === undefined ? "No identificado" : clp(value);
}

function formatStatus(value: string): string {
  const labels: Record<string, string> = {
    uploaded: "Pendiente de análisis",
    analyzing: "Analizando",
    review: "Requiere revisión",
    ready: "Listo para revisar",
    confirmed: "Importado",
    duplicate: "Duplicado",
    error: "Error",
    discarded: "Descartado",
  };

  return labels[value] ?? value;
}
