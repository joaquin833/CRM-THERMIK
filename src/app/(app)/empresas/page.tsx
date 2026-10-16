import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { getCompanies } from "@/lib/services/companies";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    q?: string;
    estado?: string;
    segmento?: string;
  }>;
};

export default async function CompaniesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const companies = await getCompanies();
  const query = params.q?.trim().toLocaleLowerCase("es-CL") ?? "";
  const stateFilter = params.estado?.trim() ?? "";
  const segmentFilter = params.segmento?.trim() ?? "";

  const segments = Array.from(
    new Set(
      companies
        .map((company) => company.segmento)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((first, second) => first.localeCompare(second, "es-CL"));

  const filteredCompanies = companies.filter((company) => {
    const searchableText = [
      company.razon_social,
      company.nombre_fantasia,
      company.rut,
      company.giro,
      company.comuna,
      company.ciudad,
      company.region,
      company.segmento,
      company.origen,
      company.responsable,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("es-CL");

    return (
      (!query || searchableText.includes(query)) &&
      (!stateFilter || company.estado === stateFilter) &&
      (!segmentFilter || company.segmento === segmentFilter)
    );
  });

  const activeCompanies = companies.filter(
    (company) => company.estado === "activo",
  ).length;
  const withoutRut = companies.filter((company) => !company.rut).length;
  const withoutResponsible = companies.filter(
    (company) => !company.responsable,
  ).length;

  return (
    <AppShell>
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Gestión comercial
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">Empresas</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Empresas relacionadas con contactos, proyectos, oportunidades y
          cotizaciones.
        </p>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Empresas" value={companies.length} />
        <MetricCard label="Activas" value={activeCompanies} />
        <MetricCard
          label="Sin RUT"
          value={withoutRut}
          tone={withoutRut > 0 ? "warning" : "neutral"}
        />
        <MetricCard
          label="Sin responsable"
          value={withoutResponsible}
          tone={withoutResponsible > 0 ? "warning" : "neutral"}
        />
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
        <form className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Buscar empresa
            <input
              type="search"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Razón social, RUT, giro, ciudad..."
              className="rounded-lg border border-slate-300 bg-white p-3"
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Estado
            <select
              name="estado"
              defaultValue={stateFilter}
              className="rounded-lg border border-slate-300 bg-white p-3"
            >
              <option value="">Todos</option>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Segmento
            <select
              name="segmento"
              defaultValue={segmentFilter}
              className="rounded-lg border border-slate-300 bg-white p-3"
            >
              <option value="">Todos</option>
              {segments.map((segment) => (
                <option key={segment} value={segment}>
                  {segment}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              Filtrar
            </button>
            <Link
              href="/empresas"
              className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Limpiar
            </Link>
          </div>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              Empresas comerciales
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Selecciona una empresa para abrir su ficha 360.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            {filteredCompanies.length}
          </span>
        </div>

        {filteredCompanies.length === 0 ? (
          <p className="m-5 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
            No hay empresas que coincidan con los filtros seleccionados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Empresa</th>
                  <th className="px-5 py-3">RUT</th>
                  <th className="px-5 py-3">Giro</th>
                  <th className="px-5 py-3">Ubicación</th>
                  <th className="px-5 py-3">Segmento</th>
                  <th className="px-5 py-3">Responsable</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredCompanies.map((company) => (
                  <tr key={company.id} className="align-top hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {company.razon_social}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {company.nombre_fantasia || "Sin nombre de fantasía"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      {company.rut || "Sin RUT"}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      {company.giro || "Sin giro"}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      {location(company.comuna, company.ciudad, company.region)}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      {company.segmento || "Sin segmento"}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      {company.responsable || "Sin responsable"}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyle(
                          company.estado,
                        )}`}
                      >
                        {humanize(company.estado)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/empresas/${company.id}`}
                        className="inline-flex rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
                      >
                        Ver ficha 360
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warning";
}) {
  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm ${
        tone === "warning"
          ? "border-amber-300 bg-amber-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${
          tone === "warning" ? "text-amber-950" : "text-slate-950"
        }`}
      >
        {value}
      </p>
    </article>
  );
}

function location(
  comuna: string | null,
  ciudad: string | null,
  region: string | null,
): string {
  return [comuna, ciudad, region].filter(Boolean).join(", ") || "Sin ubicación";
}

function humanize(value: string): string {
  const normalized = value.replaceAll("_", " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function statusStyle(status: string): string {
  return status === "activo"
    ? "bg-emerald-100 text-emerald-900"
    : "bg-slate-100 text-slate-700";
}
