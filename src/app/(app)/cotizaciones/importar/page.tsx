import { AppShell } from "@/components/app-shell";
import { QuotePdfUpload } from "@/components/quote-pdf-upload";
import { requireProfile } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

export default async function ImportQuotePage() {
  const profile = await requireProfile([
    "admin",
    "jefatura_comercial",
    "ejecutivo_comercial",
  ]);

  const supabase = await createClient();
  const importsResult = await supabase
    .from("quote_pdf_imports")
    .select("id,file_name,file_size,status,error_message,created_at,analyzed_at,imported_quote_id")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (importsResult.error) {
    throw new Error(importsResult.error.message);
  }

  return (
    <AppShell>
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
          Cotizaciones externas
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">
          Importar cotización desde PDF
        </h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Carga el documento oficial, revisa los datos extraídos y confirma la
          creación de la ficha comercial. Los valores económicos permanecerán
          bloqueados en el CRM.
        </p>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.85fr]">
        <QuotePdfUpload />

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">Flujo de importación</h2>
          <ol className="mt-4 grid gap-3 text-sm text-slate-700">
            <li className="rounded-xl border bg-slate-50 p-4"><strong>1. Cargar PDF.</strong> Validamos formato, tamaño y duplicados.</li>
            <li className="rounded-xl border bg-slate-50 p-4"><strong>2. Analizar.</strong> Extraemos número, fechas, proyecto y montos.</li>
            <li className="rounded-xl border bg-slate-50 p-4"><strong>3. Revisar.</strong> Confirmas los datos y las coincidencias.</li>
            <li className="rounded-xl border bg-slate-50 p-4"><strong>4. Importar.</strong> Creamos la ficha y comienzas el seguimiento.</li>
          </ol>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-950">Últimas cargas</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            {importsResult.data?.length ?? 0}
          </span>
        </div>

        {!importsResult.data?.length ? (
          <p className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
            Todavía no se han cargado PDFs de cotizaciones.
          </p>
        ) : (
          <div className="mt-4 divide-y">
            {importsResult.data.map((item) => (
              <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0">
                <div>
                  <p className="font-medium text-slate-900">{item.file_name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {new Date(item.created_at).toLocaleString("es-CL")} · {formatBytes(item.file_size)}
                  </p>
                  {item.error_message && <p className="mt-1 text-sm text-red-700">{item.error_message}</p>}
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                  {formatStatus(item.status)}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatStatus(value: string): string {
  const labels: Record<string, string> = {
    uploaded: "Pendiente de análisis",
    analyzing: "Analizando",
    review: "Requiere revisión",
    ready: "Listo para importar",
    confirmed: "Importado",
    duplicate: "Duplicado",
    error: "Error",
    discarded: "Descartado",
  };

  return labels[value] ?? value;
}
