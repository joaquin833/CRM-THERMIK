import Link from "next/link";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { OpportunityOutcomeSection } from "@/components/opportunity-outcome-section";
import { getOpportunity360 } from "@/lib/services/opportunities";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const data = await getOpportunity360(id);
  const { opportunity, contact, company, project, summary } = data;

  return (
    <AppShell>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
            Ficha 360 de Oportunidad
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">
            {opportunity.nombre}
          </h1>
          <p className="mt-1 text-slate-600">
            {project?.nombre ||
              company?.razon_social ||
              contact?.nombre_completo ||
              "Sin relación principal"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge>{opportunity.etapa_comercial}</Badge>
          <Badge>{opportunity.estado}</Badge>

          <OpportunityOutcomeSection opportunity={opportunity} />

          <Link
            href={`/oportunidades/${opportunity.id}/editar`}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Editar oportunidad
          </Link>

          <Link
            href="/oportunidades"
            className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Volver al pipeline
          </Link>
        </div>
      </header>

      {opportunity.seguimiento_atrasado && (
        <section className="mt-5 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-900">
          <p className="font-semibold">Seguimiento pendiente o atrasado</p>
          <p className="mt-1 text-sm">
            Programa o actualiza la próxima acción desde el pipeline.
          </p>
        </section>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Monto estimado"
          value={money(opportunity.monto_estimado ?? 0)}
        />
        <Metric
          label="Probabilidad"
          value={`${opportunity.probabilidad_cierre ?? 0}%`}
        />
        <Metric
          label="Monto ponderado"
          value={money(opportunity.monto_ponderado)}
        />
        <Metric
          label="Monto cotizado"
          value={money(summary.monto_total_cotizado)}
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Gestión comercial">
          <Definition label="Prioridad" value={opportunity.prioridad} />
          <Definition label="Temperatura" value={opportunity.temperatura} />
          <Definition
            label="Fecha estimada de cierre"
            value={formatDate(opportunity.fecha_estimada_cierre)}
          />
          <Definition
            label="Próxima acción"
            value={opportunity.proxima_accion}
          />
          <Definition
            label="Fecha próxima acción"
            value={formatDateTime(opportunity.fecha_proxima_accion)}
          />
          <Definition label="Observaciones" value={opportunity.observaciones} />
        </Card>

        <Card title="Relaciones principales">
          <Definition
            label="Contacto"
            value={contact?.nombre_completo}
            href={contact ? `/contactos/${contact.id}` : undefined}
          />
          <Definition label="Teléfono" value={contact?.telefono} />
          <Definition label="WhatsApp" value={contact?.whatsapp} />
          <Definition label="Correo" value={contact?.correo} />
          <Definition
            label="Empresa"
            value={company?.razon_social}
            href={company ? `/empresas/${company.id}` : undefined}
          />
          <Definition
            label="Proyecto"
            value={project?.nombre}
            href={project ? `/proyectos/${project.id}` : undefined}
          />
        </Card>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Cotizaciones"
          value={String(summary.cotizaciones_activas)}
        />
        <Metric label="Actividades" value={String(summary.actividades)} />
        <Metric label="Tareas activas" value={String(summary.tareas_activas)} />
        <Metric
          label="Tareas atrasadas"
          value={String(summary.tareas_atrasadas)}
          danger={summary.tareas_atrasadas > 0}
        />
      </section>

      <RelationSection
        title="Cotizaciones vinculadas"
        count={data.quotes.length}
      >
        {data.quotes.map((quote) => (
          <Link
            key={quote.id}
            href={`/cotizaciones/${quote.id}`}
            className="block rounded-xl border p-4 transition hover:border-emerald-300 hover:bg-emerald-50"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">
                  Cotización N.º {quote.numero_cotizacion}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDate(quote.fecha_emision)} ·{" "}
                  {quote.estado_comercial || quote.estado || "Sin estado"}
                </p>
              </div>
              <p className="font-bold text-slate-950">{money(quote.total)}</p>
            </div>
          </Link>
        ))}
      </RelationSection>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <RelationSection
          title="Actividades"
          count={data.activities.length}
          compact
        >
          {data.activities.map((activity) => (
            <article key={activity.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold text-slate-950">
                  {activity.tipo_actividad || "Actividad comercial"}
                </p>
                <span className="text-xs text-slate-500">
                  {formatDateTime(activity.fecha_hora_inicio)}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {activity.resultado || "Sin resultado"}
              </p>
              {activity.descripcion && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {activity.descripcion}
                </p>
              )}
            </article>
          ))}
        </RelationSection>

        <RelationSection
          title="Tareas y seguimientos"
          count={data.tasks.length}
          compact
        >
          {data.tasks.map((task) => (
            <article key={task.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold text-slate-950">{task.titulo}</p>
                <Badge>{task.estado || "Sin estado"}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {formatDateTime(task.fecha_hora_vencimiento)} ·{" "}
                {task.prioridad || "Sin prioridad"}
              </p>
            </article>
          ))}
        </RelationSection>
      </section>

      <RelationSection
        title="Historial de cierres"
        count={data.closures.length}
      >
        {data.closures.map((closure, index) => (
          <article
            key={String(closure.id ?? index)}
            className="rounded-xl border p-4"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Definition
                label="Resultado"
                value={stringValue(
                  closure.resultado ??
                    closure.estado ??
                    closure.tipo_cierre ??
                    closure.outcome_type,
                )}
              />
              <Definition
                label="Fecha"
                value={formatDateTime(
                  stringValue(
                    closure.fecha_cierre ??
                      closure.effective_at ??
                      closure.created_at,
                  ),
                )}
              />
              <Definition
                label="Monto"
                value={
                  closure.monto_cierre == null && closure.closed_amount == null
                    ? null
                    : money(
                        numberValue(
                          closure.monto_cierre ?? closure.closed_amount,
                        ),
                      )
                }
              />
            </div>
          </article>
        ))}
      </RelationSection>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm ${
        danger ? "border-red-200 bg-red-50" : "bg-white"
      }`}
    >
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${
          danger ? "text-red-800" : "text-slate-950"
        }`}
      >
        {value}
      </p>
    </article>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <dl className="mt-4 grid gap-4">{children}</dl>
    </section>
  );
}

function Definition({
  label,
  value,
  href,
}: {
  label: string;
  value?: string | null;
  href?: string;
}) {
  const content = value || "Sin registrar";
  return (
    <div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium text-slate-900">
        {href && value ? (
          <Link href={href} className="text-emerald-700 hover:underline">
            {content}
          </Link>
        ) : (
          content
        )}
      </dd>
    </div>
  );
}

function RelationSection({
  title,
  count,
  children,
  compact = false,
}: {
  title: string;
  count: number;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <section
      className={`${
        compact ? "" : "mt-6"
      } rounded-2xl border bg-white p-5 shadow-sm`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
        <Badge>{count}</Badge>
      </div>
      {count === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
          No hay registros vinculados.
        </p>
      ) : (
        <div className="mt-4 grid gap-3">{children}</div>
      )}
    </section>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
      {children}
    </span>
  );
}

function money(value: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value?: string | null): string {
  if (!value) return "Sin registrar";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(date);
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Sin registrar";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function stringValue(value: unknown): string | null {
  return value == null ? null : String(value);
}

function numberValue(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}
