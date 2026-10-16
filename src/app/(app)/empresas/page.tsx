import Link from "next/link";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/brand";
import { clp } from "@/lib/money";
import {
  getCompany360,
  type CompanyContact,
  type CompanyOpportunity,
  type CompanyProject,
  type CompanyQuote,
} from "@/lib/services/companies";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CompanyPage({ params }: PageProps) {
  const { id } = await params;
  const data = await getCompany360(id);
  const { company, responsible, summary } = data;
  const displayName = company.nombre_fantasia || company.razon_social;
  const companyLocation = [
    company.direccion,
    company.comuna,
    company.ciudad,
    company.region,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <AppShell>
      <nav className="mb-5 text-sm text-slate-500" aria-label="Migas de pan">
        <Link href="/empresas" className="hover:text-emerald-700">
          Empresas
        </Link>
        <span className="px-2">/</span>
        <span className="text-slate-700">{displayName}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Ficha 360 de empresa
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">
            {displayName}
          </h1>
          {company.nombre_fantasia && (
            <p className="mt-1 text-base text-slate-600">
              {company.razon_social}
            </p>
          )}
          <p className="mt-2 text-sm text-slate-500">
            Empresa vinculada a contactos, proyectos, oportunidades y
            cotizaciones.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge>{humanize(company.estado)}</StatusBadge>
          <Link
            href={`/empresas/${company.id}/editar`}
            className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Editar empresa
          </Link>
        </div>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Contactos" value={summary.active_contacts} />
        <MetricCard label="Proyectos" value={summary.projects} />
        <MetricCard label="Oportunidades" value={summary.opportunities} />
        <MetricCard label="Cotizaciones" value={summary.active_quotes} />
        <MetricCard
          label="Monto cotizado"
          value={clp(summary.quoted_amount)}
          textValue
        />
        <MetricCard
          label="Última cotización"
          value={formatDate(summary.last_quote_at)}
          textValue
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Identificación" eyebrow="Datos legales y comerciales">
          <dl className="grid gap-5 sm:grid-cols-2">
            <DataField label="Razón social" value={company.razon_social} />
            <DataField
              label="Nombre de fantasía"
              value={company.nombre_fantasia}
            />
            <DataField label="RUT" value={company.rut} />
            <DataField label="Giro" value={company.giro} />
            <DataField label="Segmento" value={company.segmento} />
            <DataField label="Origen" value={company.origen} />
          </dl>
        </Panel>

        <Panel title="Ubicación y gestión" eyebrow="Información complementaria">
          <dl className="grid gap-5 sm:grid-cols-2">
            <DataField label="Ubicación" value={companyLocation || null} />
            <DataField label="Sitio web" value={company.pagina_web} external />
            <DataField
              label="Responsable"
              value={responsible?.nombre_completo || null}
            />
            <DataField label="Correo responsable" value={responsible?.correo} />
          </dl>
        </Panel>
      </section>

      <section className="mt-6">
        <Panel title="Observaciones" eyebrow="Contexto comercial">
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {company.observaciones || "Sin observaciones registradas."}
          </p>
        </Panel>
      </section>

      <section className="mt-6">
        <Panel
          title="Contactos vinculados"
          eyebrow="Personas"
          count={data.contacts.length}
        >
          <ContactList contacts={data.contacts} />
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

      <section className="mt-6">
        <Panel
          title="Cotizaciones vinculadas"
          eyebrow="Actividad comercial"
          count={data.quotes.length}
        >
          <QuoteList quotes={data.quotes} />
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
  textValue = false,
}: {
  label: string;
  value: number | string;
  textValue?: boolean;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={
          textValue
            ? "mt-1 break-words text-lg font-bold text-slate-950"
            : "mt-1 text-2xl font-bold text-slate-950"
        }
      >
        {value}
      </p>
    </article>
  );
}

function DataField({
  label,
  value,
  external = false,
}: {
  label: string;
  value: string | null | undefined;
  external?: boolean;
}) {
  const displayed = value?.trim() || "Sin registrar";
  const href = external && value ? ensureProtocol(value) : null;

  return (
    <div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-medium text-slate-900">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-emerald-700 hover:underline"
          >
            {displayed}
          </a>
        ) : (
          displayed
        )}
      </dd>
    </div>
  );
}

function ContactList({ contacts }: { contacts: CompanyContact[] }) {
  if (contacts.length === 0) {
    return <EmptyState>No hay contactos vinculados.</EmptyState>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {contacts.map((contact) => (
        <Link
          key={contact.id}
          href={`/contactos/${contact.id}`}
          className="rounded-xl border p-4 transition hover:border-emerald-400 hover:bg-emerald-50/40"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-950">
                {contact.nombre_completo || "Contacto sin nombre"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {contact.cargo || contact.tipo_contacto || "Sin cargo"}
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-900">
              {humanize(contact.estado)}
            </span>
          </div>
          <div className="mt-3 grid gap-1 text-sm text-slate-700">
            <p>{contact.telefono || "Teléfono sin registrar"}</p>
            <p>{contact.correo || "Correo sin registrar"}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function ProjectList({ projects }: { projects: CompanyProject[] }) {
  if (projects.length === 0) {
    return <EmptyState>No hay proyectos vinculados.</EmptyState>;
  }

  return (
    <div className="grid gap-3">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={`/proyectos/${project.id}`}
          className="rounded-xl border p-4 transition hover:border-emerald-400 hover:bg-emerald-50/40"
        >
          <p className="font-semibold text-slate-950">{project.nombre}</p>
          <p className="mt-1 text-sm text-slate-500">
            {[project.comuna, project.ciudad, project.region]
              .filter(Boolean)
              .join(", ") || "Ubicación sin registrar"}
          </p>
          <p className="mt-2 text-sm text-slate-700">
            {project.tipo_proyecto ||
              project.tipo_obra ||
              project.estado ||
              "Sin clasificación"}
          </p>
        </Link>
      ))}
    </div>
  );
}

function OpportunityList({
  opportunities,
}: {
  opportunities: CompanyOpportunity[];
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
          className="rounded-xl border p-4 transition hover:border-emerald-400 hover:bg-emerald-50/40"
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
            {opportunity.probabilidad_cierre !== null && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                {opportunity.probabilidad_cierre} %
              </span>
            )}
          </div>
          {opportunity.monto_estimado !== null && (
            <p className="mt-3 text-sm font-medium text-slate-700">
              {clp(opportunity.monto_estimado)}
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}

function QuoteList({ quotes }: { quotes: CompanyQuote[] }) {
  if (quotes.length === 0) {
    return <EmptyState>No hay cotizaciones vinculadas.</EmptyState>;
  }

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
                {formatDate(quote.fecha_emision)} · {quote.moneda}
              </p>
            </div>
            <p className="font-semibold text-slate-950">{clp(quote.total)}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-900">
              {quote.estado_comercial || "Sin estado comercial"}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              {quote.estado_documental || "Sin estado documental"}
            </span>
          </div>
        </Link>
      ))}
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

function ensureProtocol(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
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
