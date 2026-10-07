import { AppShell } from "@/components/app-shell";
import { QuoteNumberBadge, StatusBadge } from "@/components/brand";
import { QuoteFollowUpForm } from "@/components/quote-followup-form";
import { clp } from "@/lib/money";
import { getQuote } from "@/lib/services/quotes";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type ActivityResultOption = {
  id: string;
  codigo: string;
  nombre: string;
  requiere_proxima_accion: boolean;
  requiere_fecha: boolean;
  requiere_comentario: boolean;
  cierra_oportunidad: boolean;
  resultado_cierre: string | null;
  orden: number;
};

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Sin registrar";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
  }).format(date);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Sin registrar";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function displayText(value: unknown, fallback = "Sin registrar"): string {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const quote = await getQuote(id);

  const contactName = [
    quote.contactos?.nombre,
    quote.contactos?.apellido,
  ]
    .filter(Boolean)
    .join(" ");

  const clientName =
    quote.empresas?.razon_social || contactName || "Sin cliente";

  const projectName =
    quote.proyectos?.nombre ||
    quote.oportunidades?.nombre ||
    "Sin proyecto asociado";

  const commercialStatus =
    quote.estado_comercial || quote.estado || "Importada";

  const responsibleName = quote.responsible_profile
    ? [
        quote.responsible_profile.nombre,
        quote.responsible_profile.apellido,
      ]
        .filter(Boolean)
        .join(" ")
    : "Sin responsable";

  const activityResults = (
    quote.activity_results ?? []
  ).map((result: Record<string, unknown>) => ({
    id: String(result.id),
    codigo: String(result.codigo),
    nombre: String(result.nombre),
    requiere_proxima_accion: Boolean(
      result.requiere_proxima_accion
    ),
    requiere_fecha: Boolean(result.requiere_fecha),
    requiere_comentario: Boolean(result.requiere_comentario),
    cierra_oportunidad: Boolean(result.cierra_oportunidad),
    resultado_cierre:
      result.resultado_cierre === null ||
      result.resultado_cierre === undefined
        ? null
        : String(result.resultado_cierre),
    orden: Number(result.orden ?? 0),
  })) as ActivityResultOption[];

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <QuoteNumberBadge number={quote.numero_cotizacion} />

          <h1 className="mt-3 text-3xl font-bold text-slate-950">
            {projectName}
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Gestión y seguimiento comercial de una cotización emitida por
            el sistema oficial.
          </p>
        </div>

        <StatusBadge>{commercialStatus}</StatusBadge>
      </div>

      <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <p className="font-semibold text-blue-950">
          Información oficial de solo lectura
        </p>
        <p className="mt-1 text-sm text-blue-800">
          El número, los ítems y los valores económicos provienen del
          sistema oficial de cotizaciones y no pueden modificarse desde el
          CRM.
        </p>
      </section>

      {quote.commercial_indicators?.has_overdue_follow_up && (
        <section className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4">
          <p className="font-semibold text-red-900">
            Esta cotización tiene seguimientos atrasados.
          </p>
          <p className="mt-1 text-sm text-red-800">
            Revisa las tareas pendientes y registra el resultado del
            contacto comercial.
          </p>
        </section>
      )}

      {quote.commercial_indicators?.requires_commercial_action && (
        <section className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold text-amber-950">
            Falta programar una próxima acción.
          </p>
          <p className="mt-1 text-sm text-amber-900">
            Registra un seguimiento para que la cotización no quede sin
            gestión comercial.
          </p>
        </section>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <InfoCard label="Cliente" value={clientName} />
        <InfoCard label="Monto total" value={clp(Number(quote.total ?? 0))} />
        <InfoCard label="Fecha de emisión" value={formatDate(quote.fecha_emision)} />
        <InfoCard
          label="Próximo seguimiento"
          value={formatDateTime(quote.fecha_proximo_seguimiento)}
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="grid gap-6">
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                  Documento externo
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">
                  Datos oficiales
                </h2>
              </div>

              {quote.archivo_pdf_url && (
                <a
                  href={quote.archivo_pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
                >
                  Abrir PDF original
                </a>
              )}
            </div>

            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <DataField label="N.º de cotización" value={quote.numero_cotizacion} />
              <DataField label="Estado documental" value={quote.estado_documental_externo || quote.estado} />
              <DataField label="Fecha de emisión" value={formatDate(quote.fecha_emision)} />
              <DataField label="Fecha de validez" value={formatDate(quote.fecha_validez)} />
              <DataField label="Sistema de origen" value={quote.external_sources?.nombre || quote.sistema_origen} />
              <DataField label="Última sincronización" value={formatDateTime(quote.fecha_ultima_sincronizacion)} />
              <DataField label="Contacto" value={contactName || "Sin contacto"} />
              <DataField label="Proyecto" value={projectName} />
            </dl>
          </section>

          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-950">
              Ítems oficiales
            </h2>

            {quote.quote_items.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
                La cotización no tiene ítems estructurados. Utiliza el PDF
                original como documento oficial.
              </p>
            ) : (
              <div className="mt-4 divide-y">
                {quote.quote_items.map((item: Record<string, unknown>) => (
                  <article
                    key={String(item.id)}
                    className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">
                        {displayText(item.descripcion)}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {displayText(item.cantidad, "0")} {displayText(item.unidad, "")}
                      </p>
                    </div>
                    <p className="font-semibold text-slate-900">
                      {clp(Number(item.subtotal_neto ?? 0))}
                    </p>
                  </article>
                ))}
              </div>
            )}

            <div className="mt-4 grid gap-2 border-t pt-4 text-right">
              <p>
                Neto: {clp(Number(quote.neto_afecto ?? 0) + Number(quote.neto_exento ?? 0))}
              </p>
              <p>IVA: {clp(Number(quote.iva ?? 0))}</p>
              <p className="text-xl font-bold text-slate-950">
                Total: {clp(Number(quote.total ?? 0))}
              </p>
            </div>
          </section>
        </div>

        <div className="grid content-start gap-6">
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
              Seguimiento
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              Estado comercial
            </h2>

            <dl className="mt-5 grid gap-4">
              <DataField label="Estado" value={commercialStatus} />
              <DataField label="Responsable" value={responsibleName} />
              <DataField label="Última actividad" value={formatDateTime(quote.ultima_actividad_at)} />
              <DataField label="Próxima acción" value={quote.proxima_accion} />
              <DataField label="Fecha próxima acción" value={formatDateTime(quote.fecha_proximo_seguimiento)} />
              <DataField
                label="Probabilidad de cierre"
                value={
                  quote.probabilidad_cierre === null ||
                  quote.probabilidad_cierre === undefined
                    ? "Sin registrar"
                    : `${quote.probabilidad_cierre} %`
                }
              />
            </dl>
          </section>

          <QuoteFollowUpForm
            quoteId={quote.id}
            quoteNumber={quote.numero_cotizacion}
            activityResults={activityResults}
          />
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-950">
              Actividades comerciales
            </h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              {quote.activities.length}
            </span>
          </div>

          {quote.activities.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
              Todavía no se han registrado actividades para esta cotización.
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              {quote.activities.map((activity: Record<string, unknown>) => (
                <article
                  key={String(activity.id)}
                  className="rounded-xl border p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {displayText(activity.tipo_actividad)}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {formatDateTime(String(activity.fecha_hora_inicio))}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                      {displayText(activity.resultado, "Sin resultado")}
                    </span>
                  </div>

                  {activity.descripcion && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                      {String(activity.descripcion)}
                    </p>
                  )}

                  {activity.proxima_accion && (
                    <p className="mt-3 text-sm text-slate-700">
                      <strong>Próxima acción:</strong>{" "}
                      {String(activity.proxima_accion)}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-950">
              Seguimientos pendientes
            </h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              {quote.pending_tasks.length}
            </span>
          </div>

          {quote.pending_tasks.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
              No hay seguimientos pendientes para esta cotización.
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              {quote.pending_tasks.map((task: Record<string, unknown>) => {
                const dueDate = String(task.fecha_hora_vencimiento);
                const overdue = new Date(dueDate).getTime() < Date.now();

                return (
                  <article
                    key={String(task.id)}
                    className={`rounded-xl border p-4 ${
                      overdue
                        ? "border-red-300 bg-red-50"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {displayText(task.titulo)}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {formatDateTime(dueDate)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          overdue
                            ? "bg-red-200 text-red-900"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {overdue ? "Atrasado" : displayText(task.prioridad)}
                      </span>
                    </div>

                    <p className="mt-3 text-sm text-slate-600">
                      Google Calendar:{" "}
                      {task.sincronizado_google
                        ? "Sincronizado"
                        : task.google_sync_status || "Pendiente"}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">
          Historial de estados
        </h2>

        {quote.state_history.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No existe historial de cambios de estado.
          </p>
        ) : (
          <div className="mt-4 grid gap-4">
            {quote.state_history.map((entry: Record<string, unknown>) => (
              <article
                key={String(entry.id)}
                className="border-l-2 border-emerald-500 pl-4"
              >
                <p className="font-semibold text-slate-900">
                  {displayText(entry.estado_anterior, "Creada")} {" -> "}
                  {displayText(entry.estado_nuevo)}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDateTime(String(entry.created_at))}
                </p>
                {entry.comentario && (
                  <p className="mt-2 text-sm text-slate-700">
                    {String(entry.comentario)}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-950">{value}</p>
    </article>
  );
}

function DataField({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium text-slate-900">
        {displayText(value)}
      </dd>
    </div>
  );
}
