import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { QuoteImportReviewForm } from "@/components/quote-import-review-form";
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
    .select("id,file_name,status,parsed_data,validation_errors,validation_warnings,error_message")
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
        <MessageList
          title="Errores que deben revisarse"
          messages={errors}
          tone="error"
        />
      )}

      {warnings.length > 0 && (
        <MessageList
          title="Advertencias"
          messages={warnings}
          tone="warning"
        />
      )}

      <div className="mt-6">
        <QuoteImportReviewForm
          importId={record.id}
          initialData={{
            numero_cotizacion: quote.numero_cotizacion ?? "",
            fecha_emision: quote.fecha_emision ?? null,
            fecha_validez: quote.fecha_validez ?? null,
            cliente: quote.cliente ?? null,
            rut_cliente: quote.rut_cliente ?? null,
            nombre_contacto: quote.nombre_contacto ?? null,
            telefono_contacto: quote.telefono_contacto ?? null,
            correo_contacto: quote.correo_contacto ?? null,
            proyecto: quote.proyecto ?? null,
            direccion_proyecto: quote.direccion_proyecto ?? null,
            moneda: quote.moneda ?? "CLP",
            neto_afecto: quote.neto_afecto ?? null,
            neto_exento: quote.neto_exento ?? null,
            iva: quote.iva ?? null,
            total: quote.total ?? null,
            metros_cuadrados: quote.metros_cuadrados ?? null,
            plazo_ejecucion: quote.plazo_ejecucion ?? null,
            condiciones: quote.condiciones ?? [],
            items: items.map((item) => ({
              descripcion: item.descripcion ?? "Ítem sin descripción",
              cantidad: item.cantidad ?? null,
              unidad: item.unidad ?? null,
              valor_unitario: item.valor_unitario ?? null,
              subtotal: item.subtotal ?? null,
            })),
          }}
        />
      </div>

      <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <p className="font-semibold text-blue-950">Siguiente etapa</p>
        <p className="mt-1 text-sm text-blue-800">
          Guarda las correcciones. Luego vincularemos esta información con un
          contacto, empresa, proyecto y oportunidad antes de confirmar la
          importación.
        </p>
      </section>
    </AppShell>
  );
}

function MessageList({
  title,
  messages,
  tone,
}: {
  title: string;
  messages: string[];
  tone: "error" | "warning";
}) {
  const className =
    tone === "error"
      ? "mt-6 rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900"
      : "mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-900";

  return (
    <section className={className}>
      <h2 className="font-semibold">{title}</h2>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </section>
  );
}

function formatStatus(value: string): string {
  const labels: Record<string, string> = {
    uploaded: "Pendiente de análisis",
    analyzing: "Analizando",
    review: "Requiere revisión",
    ready: "Listo para vincular",
    confirmed: "Importado",
    duplicate: "Duplicado",
    error: "Error",
    discarded: "Descartado",
  };

  return labels[value] ?? value;
}
