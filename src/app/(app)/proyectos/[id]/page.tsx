import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { clp } from "@/lib/money";
import { getProject360 } from "@/lib/services/projects";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const data = await getProject360(id);
  const { project, contact, company, summary } = data;

  return (
    <AppShell>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
            Ficha 360 de Proyecto
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">
            {project.nombre}
          </h1>
          <p className="mt-1 text-slate-600">
            {[project.direccion, project.comuna, project.ciudad, project.region]
              .filter(Boolean)
              .join(", ") || "Sin ubicación registrada"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
            {project.estado}
          </span>
          <Link
            href={`/proyectos/${project.id}/editar`}
            className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white"
          >
            Editar proyecto
          </Link>
        </div>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Cotizaciones" value={summary.cotizaciones_activas} />
        <Metric label="Oportunidades" value={summary.oportunidades} />
        <Metric
          label="Monto cotizado"
          value={clp(summary.monto_total_cotizado)}
        />
        <Metric label="Tareas atrasadas" value={summary.tareas_atrasadas} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Datos del proyecto">
          <Definition label="Tipo de proyecto" value={project.tipo_proyecto} />
          <Definition label="Tipo de obra" value={project.tipo_obra} />
          <Definition
            label="Metros cuadrados"
            value={
              project.metros_cuadrados_estimados == null
                ? null
                : `${project.metros_cuadrados_estimados} m²`
            }
          />
          <Definition label="Observaciones" value={project.observaciones} />
        </Card>

        <Card title="Relaciones principales">
          <Definition
            label="Contacto principal"
            value={contact?.nombre_completo}
            href={contact ? `/contactos/${contact.id}` : undefined}
          />
          <Definition
            label="Empresa"
            value={company?.razon_social}
            href={company ? `/empresas/${company.id}` : undefined}
          />
          <Definition label="Teléfono" value={contact?.telefono} />
          <Definition label="WhatsApp" value={contact?.whatsapp} />
          <Definition label="Correo" value={contact?.correo} />
        </Card>
      </section>

      <RelationSection title="Cotizaciones" count={data.quotes.length}>
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
              <p className="font-bold text-slate-950">{clp(quote.total)}</p>
            </div>
          </Link>
        ))}
      </RelationSection>

      <RelationSection title="Oportunidades" count={data.opportunities.length}>
        {data.opportunities.map((opportunity) => (
          <Link
            key={opportunity.id}
            href={`/oportunidades/${opportunity.id}`}
            className="block rounded-xl border p-4 transition hover:border-emerald-300 hover:bg-emerald-50"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">
                  {opportunity.nombre}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {opportunity.etapa_comercial || "Sin etapa"} ·{" "}
                  {opportunity.estado || "Sin estado"}
                </p>
              </div>
              <p className="font-semibold text-slate-900">
                {clp(opportunity.monto_estimado ?? 0)}
              </p>
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
              <p className="font-semibold text-slate-950">
                {activity.tipo_actividad || "Actividad"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {formatDateTime(activity.fecha_hora_inicio)} ·{" "}
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

        <RelationSection title="Tareas" count={data.tasks.length} compact>
          {data.tasks.map((task) => (
            <article key={task.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-semibold text-slate-950">{task.titulo}</p>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                  {task.estado || "Sin estado"}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {formatDateTime(task.fecha_hora_vencimiento)} ·{" "}
                {task.prioridad || "Sin prioridad"}
              </p>
            </article>
          ))}
        </RelationSection>
      </section>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="rounded-2xl border bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
    </article>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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
  children: React.ReactNode;
  compact?: boolean;
}) {
  const empty = count === 0;
  return (
    <section
      className={`${compact ? "" : "mt-6"} rounded-2xl border bg-white p-5 shadow-sm`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
          {count}
        </span>
      </div>
      {empty ? (
        <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
          No hay registros vinculados.
        </p>
      ) : (
        <div className="mt-4 grid gap-3">{children}</div>
      )}
    </section>
  );
}

function formatDate(value?: string | null): string {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(date);
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
