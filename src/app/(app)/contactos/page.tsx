import Link from "next/link";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/brand";
import { clp } from "@/lib/money";
import {
  getContact360,
  type ContactActivity,
  type ContactOpportunity,
  type ContactProject,
  type ContactQuote,
  type ContactTask,
} from "@/lib/services/contacts";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ContactPage({ params }: PageProps) {
  const { id } = await params;
  const data = await getContact360(id);
  const { contact, company, responsible, summary } = data;
  const contactName = contact.nombre_completo || "Contacto sin nombre";
  const location = [
    contact.direccion,
    contact.comuna,
    contact.ciudad,
    contact.region,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <AppShell>
      <nav className="mb-5 text-sm text-slate-500" aria-label="Migas de pan">
        <Link href="/contactos" className="hover:text-emerald-700">
          Contactos
        </Link>
        <span className="px-2">/</span>
        <span className="text-slate-700">{contactName}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Ficha 360 de contacto
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">
            {contactName}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Contacto comercial vinculado a cotizaciones, proyectos y
            seguimiento.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge>{humanize(contact.estado)}</StatusBadge>
          <Link
            href={`/contactos/${contact.id}/editar`}
            className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Editar contacto
          </Link>
        </div>
      </header>

      {summary.overdue_tasks > 0 && (
        <section className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-900">
          <p className="font-semibold">
            {summary.overdue_tasks === 1
              ? "Este contacto tiene una tarea atrasada"
              : `Este contacto tiene ${summary.overdue_tasks} tareas atrasadas`}
          </p>
          <p className="mt-1 text-sm">
            Revisa el seguimiento pendiente antes de programar una nueva acción.
          </p>
        </section>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Cotizaciones" value={summary.quotes} />
        <MetricCard label="Proyectos" value={summary.projects} />
        <MetricCard label="Oportunidades" value={summary.opportunities} />
        <MetricCard label="Actividades" value={summary.activities} />
        <MetricCard label="Tareas activas" value={summary.active_tasks} />
        <MetricCard
          label="Tareas atrasadas"
          value={summary.overdue_tasks}
          tone={summary.overdue_tasks > 0 ? "danger" : "neutral"}
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Datos de contacto" eyebrow="Comunicación">
          <dl className="grid gap-5 sm:grid-cols-2">
            <DataField label="Teléfono" value={contact.telefono} />
            <DataField label="WhatsApp" value={contact.whatsapp} />
            <DataField label="Correo" value={contact.correo} />
            <DataField
              label="Preferencia de contacto"
              value={contact.preferencia_contacto}
            />
          </dl>

          <div className="mt-5 flex flex-wrap gap-3">
            {contact.telefono && (
              <a
                href={`tel:${contact.telefono_normalizado || contact.telefono}`}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Llamar
              </a>
            )}
            {contact.whatsapp && (
              <a
                href={`https://wa.me/${onlyDigits(contact.whatsapp)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
              >
                Abrir WhatsApp
              </a>
            )}
            {contact.correo && (
              <a
                href={`mailto:${contact.correo}`}
                className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50"
              >
                Enviar correo
              </a>
            )}
          </div>
        </Panel>

        <Panel title="Contexto comercial" eyebrow="Clasificación">
          <dl className="grid gap-5 sm:grid-cols-2">
            <DataField label="Tipo de contacto" value={contact.tipo_contacto} />
            <DataField label="Origen" value={contact.origen} />
            <DataField label="Cargo" value={contact.cargo} />
            <DataField
              label="Empresa"
              value={company?.razon_social || null}
              href={company ? `/empresas/${company.id}` : undefined}
            />
            <DataField
              label="Responsable"
              value={responsible?.nombre_completo || null}
            />
            <DataField
              label="Comunicaciones adicionales"
              value={
                contact.consentimiento_comunicaciones
                  ? "Autorizadas"
                  : "Sin autorización"
              }
            />
          </dl>
        </Panel>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel
          title="Ubicación y observaciones"
          eyebrow="Información complementaria"
        >
          <dl className="grid gap-5">
            <DataField label="Ubicación" value={location || null} />
            <DataField
              label="Observaciones"
              value={contact.observaciones}
              multiline
            />
          </dl>
        </Panel>

        <Panel title="Seguimiento pendiente" eyebrow="Tareas comerciales">
          <TaskList
            tasks={data.tasks.filter(isActiveTask)}
            empty="No hay tareas activas."
          />
        </Panel>
      </section>

      <section className="mt-6">
        <Panel
          title="Cotizaciones vinculadas"
          eyebrow="Núcleo comercial"
          count={data.quotes.length}
        >
          <QuoteList quotes={data.quotes} />
        </Panel>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel
          title="Proyectos"
          eyebrow="Relaciones"
          count={data.projects.length}
        >
          <ProjectList projects={data.projects} />
        </Panel>

        <Panel
          title="Oportunidades"
          eyebrow="Relaciones"
          count={data.opportunities.length}
        >
          <OpportunityList opportunities={data.opportunities} />
        </Panel>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel
          title="Actividades recientes"
          eyebrow="Historial comercial"
          count={data.activities.length}
        >
          <ActivityList activities={data.activities} />
        </Panel>

        <Panel
          title="Historial de tareas"
          eyebrow="Seguimientos"
          count={data.tasks.length}
        >
          <TaskList tasks={data.tasks} empty="No hay tareas registradas." />
        </Panel>
      </section>
    </AppShell>
  );
}

function Panel({
  title,
  eyebrow,
  count,
  children,
}: {
  title: string;
  eyebrow: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">{title}</h2>
        </div>
        {typeof count === "number" && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            {count}
          </span>
        )}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "danger";
}) {
  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm ${
        tone === "danger"
          ? "border-red-300 bg-red-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${
          tone === "danger" ? "text-red-900" : "text-slate-950"
        }`}
      >
        {value}
      </p>
    </article>
  );
}

function DataField({
  label,
  value,
  href,
  multiline = false,
}: {
  label: string;
  value: string | null | undefined;
  href?: string;
  multiline?: boolean;
}) {
  const displayed = value?.trim() || "Sin registrar";

  return (
    <div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd
        className={`mt-1 font-medium text-slate-900 ${
          multiline ? "whitespace-pre-wrap leading-6" : ""
        }`}
      >
        {href && value ? (
          <Link href={href} className="text-emerald-700 hover:underline">
            {displayed}
          </Link>
        ) : (
          displayed
        )}
      </dd>
    </div>
  );
}

function QuoteList({ quotes }: { quotes: ContactQuote[] }) {
  if (quotes.length === 0)
    return <EmptyState>No hay cotizaciones vinculadas.</EmptyState>;

  return (
    <div className="grid gap-3">
      {quotes.map((quote) => (
        <Link
          key={quote.id}
          href={`/cotizaciones/${quote.id}`}
          className="rounded-xl border p-4 transition hover:border-emerald-400 hover:bg-emerald-50/40"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-950">
                Cotización N.º {quote.numero_cotizacion}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {formatDate(quote.fecha_emision)} · {quote.moneda} ·{" "}
                {clp(quote.total)}
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900">
              {quote.estado_comercial ||
                quote.estado_documental ||
                "Sin estado"}
            </span>
          </div>
          {quote.proxima_accion && (
            <p className="mt-3 text-sm text-slate-700">
              <strong>Próxima acción:</strong> {quote.proxima_accion}
              {quote.fecha_proximo_seguimiento
                ? ` · ${formatDateTime(quote.fecha_proximo_seguimiento)}`
                : ""}
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}

function ProjectList({ projects }: { projects: ContactProject[] }) {
  if (projects.length === 0)
    return <EmptyState>No hay proyectos vinculados.</EmptyState>;

  return (
    <div className="grid gap-3">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={`/proyectos/${project.id}`}
          className="rounded-xl border p-4 hover:border-emerald-400 hover:bg-emerald-50/40"
        >
          <p className="font-semibold text-slate-950">{project.nombre}</p>
          <p className="mt-1 text-sm text-slate-500">
            {project.estado || "Sin estado"}
          </p>
        </Link>
      ))}
    </div>
  );
}

function OpportunityList({
  opportunities,
}: {
  opportunities: ContactOpportunity[];
}) {
  if (opportunities.length === 0) {
    return <EmptyState>No hay oportunidades vinculadas.</EmptyState>;
  }

  return (
    <div className="grid gap-3">
      {opportunities.map((opportunity) => (
        <Link
          key={opportunity.id}
          href={`/oportunidades/${opportunity.id}`}
          className="rounded-xl border p-4 hover:border-emerald-400 hover:bg-emerald-50/40"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-950">
                {opportunity.nombre}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {opportunity.etapa_comercial ||
                  opportunity.estado ||
                  "Sin etapa"}
              </p>
            </div>
            {opportunity.probabilidad !== null && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                {opportunity.probabilidad} %
              </span>
            )}
          </div>
          {opportunity.proxima_accion && (
            <p className="mt-3 text-sm text-slate-700">
              <strong>Próxima acción:</strong> {opportunity.proxima_accion}
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}

function ActivityList({ activities }: { activities: ContactActivity[] }) {
  if (activities.length === 0)
    return <EmptyState>No hay actividades registradas.</EmptyState>;

  return (
    <div className="grid gap-3">
      {activities.map((activity) => (
        <article key={activity.id} className="rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-950">
                {activity.resultado || activity.tipo_actividad}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {formatDateTime(
                  activity.fecha_hora_inicio || activity.created_at,
                )}
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-900">
              {activity.tipo_actividad}
            </span>
          </div>
          {activity.descripcion && (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {activity.descripcion}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

function TaskList({ tasks, empty }: { tasks: ContactTask[]; empty: string }) {
  if (tasks.length === 0) return <EmptyState>{empty}</EmptyState>;

  return (
    <div className="grid gap-3">
      {tasks.map((task) => {
        const overdue =
          isActiveTask(task) &&
          Boolean(task.fecha_hora_vencimiento) &&
          new Date(task.fecha_hora_vencimiento as string).getTime() <
            Date.now();

        return (
          <article
            key={task.id}
            className={`rounded-xl border p-4 ${
              overdue ? "border-red-300 bg-red-50" : "border-slate-200"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{task.titulo}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDateTime(task.fecha_hora_vencimiento)}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  overdue
                    ? "bg-red-200 text-red-900"
                    : "bg-amber-100 text-amber-900"
                }`}
              >
                {overdue ? "Atrasada" : humanize(task.estado)}
              </span>
            </div>
            {task.descripcion && (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {task.descripcion}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
      {children}
    </p>
  );
}

function isActiveTask(task: ContactTask): boolean {
  return task.estado === "pendiente" || task.estado === "en_curso";
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function humanize(value: string): string {
  const normalized = value.replaceAll("_", " ").trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatDate(value: string | null): string {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeZone: "America/Santiago",
  }).format(date);
}

function formatDateTime(value: string | null): string {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(date);
}
