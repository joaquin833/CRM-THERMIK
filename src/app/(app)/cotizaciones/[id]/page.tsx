import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { QuoteNumberBadge, StatusBadge } from "@/components/brand";
import { InitialQuoteFollowUpForm } from "@/components/initial-quote-followup-form";
import { QuoteCommercialActions } from "@/components/quote-commercial-actions";
import { QuoteFollowUpForm } from "@/components/quote-followup-form";
import { QuotePdfLink } from "@/components/quote-pdf-link";
import { clp } from "@/lib/money";
import { getQuote } from "@/lib/services/quotes";

type PageProps = {
  params: Promise<{ id: string }>;
};

type GenericRecord = Record<string, unknown>;

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

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const quote = await getQuote(id);

  const contact = firstRelation<GenericRecord>(quote.contactos);
  const company = firstRelation<GenericRecord>(quote.empresas);
  const project = firstRelation<GenericRecord>(quote.proyectos);
  const opportunity = firstRelation<GenericRecord>(quote.oportunidades);
  const externalSource = firstRelation<GenericRecord>(quote.external_sources);

  const contactName = [contact?.nombre, contact?.apellido]
    .filter(Boolean)
    .join(" ");
  const clientName =
    cleanText(company?.razon_social) ||
    cleanText(contactName) ||
    "Sin cliente vinculado";
  const projectName =
    cleanText(project?.nombre) ||
    cleanText(opportunity?.nombre) ||
    "Sin proyecto vinculado";
  const commercialStatus =
    cleanText(quote.estado_comercial) || cleanText(quote.estado) || "Importada";
  const responsibleName = quote.responsible_profile
    ? [quote.responsible_profile.nombre, quote.responsible_profile.apellido]
        .filter(Boolean)
        .join(" ")
    : "Sin responsable";

  const items = asRecordArray(quote.quote_items);
  const activities = asRecordArray(quote.activities);
  const pendingTasks = asRecordArray(quote.pending_tasks);
  const stateHistory = asRecordArray(quote.state_history);
  const activityResults = asRecordArray(quote.activity_results).map(
    toActivityResult,
  );
  const lossReasons = asRecordArray(quote.loss_reasons).map((reason) => ({
    id: String(reason.id),
    nombre: String(reason.nombre),
    requiere_comentario: Boolean(reason.requiere_comentario),
  }));
  const needsInitialFollowUp =
    pendingTasks.length === 0 && !quote.fecha_proximo_seguimiento;

  return (
    <AppShell>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <QuoteNumberBadge number={quote.numero_cotizacion} />
          <h1 className="mt-3 text-3xl font-bold text-slate-950">
            {projectName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Gestión y seguimiento comercial de una cotización oficial.
          </p>
        </div>
        <StatusBadge>{commercialStatus}</StatusBadge>
      </header>

      <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <p className="font-semibold text-blue-950">
          Información oficial de solo lectura
        </p>
        <p className="mt-1 text-sm text-blue-800">
          El número, los ítems y los valores económicos provienen del sistema
          oficial y no se modifican desde el CRM.
        </p>
      </section>

      {quote.commercial_indicators?.has_overdue_follow_up && (
        <Alert
          tone="error"
          title="Esta cotización tiene seguimientos atrasados"
        >
          Revisa las tareas pendientes y registra el resultado del contacto.
        </Alert>
      )}

      {quote.commercial_indicators?.requires_commercial_action && (
        <Alert tone="warning" title="Falta programar una próxima acción">
          Programa el primer seguimiento para que la cotización no quede sin
          gestión.
        </Alert>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <InfoCard label="Cliente" value={clientName} />
        <InfoCard label="Monto total" value={clp(Number(quote.total ?? 0))} />
        <InfoCard
          label="Fecha de emisión"
          value={formatDate(quote.fecha_emision)}
        />
        <InfoCard
          label="Próximo seguimiento"
          value={formatDateTime(quote.fecha_proximo_seguimiento)}
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="grid content-start gap-6">
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

              <QuotePdfLink
                quoteId={quote.id}
                hasPdf={Boolean(quote.archivo_pdf_url)}
              />
            </div>

            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <DataField
                label="N.º de cotización"
                value={quote.numero_cotizacion}
              />
              <DataField
                label="Estado documental"
                value={quote.estado_documental_externo || quote.estado}
              />
              <DataField
                label="Fecha de emisión"
                value={formatDate(quote.fecha_emision)}
              />
              <DataField
                label="Fecha de validez"
                value={formatDate(quote.fecha_validez)}
              />
              <DataField label="Cliente" value={clientName} />
              <DataField label="Contacto" value={contactName || null} />
              <DataField label="Proyecto" value={projectName} />
              <DataField
                label="Sistema de origen"
                value={
                  cleanText(externalSource?.nombre) || quote.sistema_origen
                }
              />
              <DataField
                label="Última sincronización"
                value={formatDateTime(quote.fecha_ultima_sincronizacion)}
              />
            </dl>
          </section>

          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-slate-950">
                Ítems oficiales
              </h2>
              <Count value={items.length} />
            </div>

            {items.length === 0 ? (
              <EmptyState>
                No hay ítems estructurados. Utiliza el PDF como documento
                oficial.
              </EmptyState>
            ) : (
              <div className="mt-4 divide-y">
                {items.map((item) => (
                  <article
                    key={String(item.id)}
                    className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">
                        {displayText(item.descripcion)}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {displayText(item.cantidad, "0")}{" "}
                        {displayText(item.unidad, "")}
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
                Neto:{" "}
                {clp(
                  Number(quote.neto_afecto ?? 0) +
                    Number(quote.neto_exento ?? 0),
                )}
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
              <DataField
                label="Última actividad"
                value={formatDateTime(quote.ultima_actividad_at)}
              />
              <DataField label="Próxima acción" value={quote.proxima_accion} />
              <DataField
                label="Fecha próxima acción"
                value={formatDateTime(quote.fecha_proximo_seguimiento)}
              />
              <DataField
                label="Probabilidad de cierre"
                value={
                  quote.probabilidad_cierre === null ||
                  quote.probabilidad_cierre === undefined
                    ? null
                    : `${quote.probabilidad_cierre} %`
                }
              />
            </dl>
          </section>

          {needsInitialFollowUp && (
            <InitialQuoteFollowUpForm
              quoteId={quote.id}
              quoteNumber={quote.numero_cotizacion}
              hasPendingFollowUp={pendingTasks.length > 0}
            />
          )}

          <QuoteCommercialActions
            quoteId={quote.id}
            quoteNumber={quote.numero_cotizacion}
            currentStatus={commercialStatus}
            total={Number(quote.total ?? 0)}
            lossReasons={lossReasons}
          />

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
            <Count value={activities.length} />
          </div>

          {activities.length === 0 ? (
            <EmptyState>
              Todavía no se han registrado actividades para esta cotización.
            </EmptyState>
          ) : (
            <div className="mt-4 grid gap-3">
              {activities.map((activity) => (
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
                        {formatDateTime(activity.fecha_hora_inicio)}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                      {displayText(activity.resultado, "Sin resultado")}
                    </span>
                  </div>

                  {Boolean(activity.descripcion) && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                      {String(activity.descripcion)}
                    </p>
                  )}

                  {Boolean(activity.proxima_accion) && (
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
            <Count value={pendingTasks.length} />
          </div>

          {pendingTasks.length === 0 ? (
            <EmptyState>
              No hay seguimientos pendientes para esta cotización.
            </EmptyState>
          ) : (
            <div className="mt-4 grid gap-3">
              {pendingTasks.map((task) => {
                const dueDate = displayText(task.fecha_hora_vencimiento, "");
                const timestamp = dueDate ? new Date(dueDate).getTime() : NaN;
                const overdue =
                  Number.isFinite(timestamp) && timestamp < Date.now();

                return (
                  <article
                    key={String(task.id)}
                    className={`rounded-xl border p-4 ${
                      overdue ? "border-red-300 bg-red-50" : "border-slate-200"
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
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-950">
            Historial comercial
          </h2>
          <Count value={stateHistory.length} />
        </div>

        {stateHistory.length === 0 ? (
          <EmptyState>
            El historial comercial se habilitará en una etapa posterior del
            bloque de Cotizaciones.
          </EmptyState>
        ) : (
          <div className="mt-4 grid gap-4">
            {stateHistory.map((entry) => (
              <article
                key={String(entry.id)}
                className="border-l-2 border-emerald-500 pl-4"
              >
                <p className="font-semibold text-slate-900">
                  {displayText(entry.estado_anterior, "Creada")} {" → "}
                  {displayText(entry.estado_nuevo)}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDateTime(entry.created_at)}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function toActivityResult(result: GenericRecord): ActivityResultOption {
  return {
    id: String(result.id),
    codigo: String(result.codigo),
    nombre: String(result.nombre),
    requiere_proxima_accion: Boolean(result.requiere_proxima_accion),
    requiere_fecha: Boolean(result.requiere_fecha),
    requiere_comentario: Boolean(result.requiere_comentario),
    cierra_oportunidad: Boolean(result.cierra_oportunidad),
    resultado_cierre:
      result.resultado_cierre === null || result.resultado_cierre === undefined
        ? null
        : String(result.resultado_cierre),
    orden: Number(result.orden ?? 0),
  };
}

function asRecordArray(value: unknown): GenericRecord[] {
  return Array.isArray(value) ? (value as GenericRecord[]) : [];
}

function firstRelation<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  if (value && typeof value === "object") return value as T;
  return null;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function displayText(value: unknown, fallback = "Sin registrar"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function formatDate(value: unknown): string {
  if (!value) return "Sin registrar";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(date);
}

function formatDateTime(value: unknown): string {
  if (!value) return "Sin registrar";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-950">{value}</p>
    </article>
  );
}

function DataField({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium text-slate-900">{displayText(value)}</dd>
    </div>
  );
}

function Alert({
  title,
  children,
  tone,
}: {
  title: string;
  children: ReactNode;
  tone: "error" | "warning";
}) {
  const className =
    tone === "error"
      ? "mt-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-900"
      : "mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950";

  return (
    <section className={className}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm">{children}</p>
    </section>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
      {children}
    </p>
  );
}

function Count({ value }: { value: number }) {
  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
      {value}
    </span>
  );
}
