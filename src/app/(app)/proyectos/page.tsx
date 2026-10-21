import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { getProjectCatalogs, getProjects } from "@/lib/services/projects";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    q?: string;
    estado?: string;
    tipo?: string;
  }>;
};

type RelationRecord = Record<string, unknown>;

export default async function Page({ searchParams }: PageProps) {
  const { q = "", estado = "", tipo = "" } = await searchParams;
  const [projects, catalogs] = await Promise.all([
    getProjects(),
    getProjectCatalogs(),
  ]);

  const query = q.trim().toLowerCase();
  const filtered = projects.filter((project) => {
    const contact = firstRelation(project.contactos);
    const company = firstRelation(project.empresas);
    const searchable = [
      project.nombre,
      project.direccion,
      project.comuna,
      project.ciudad,
      project.region,
      project.tipo_proyecto,
      project.tipo_obra,
      contact?.nombre,
      contact?.apellido,
      contact?.correo,
      company?.razon_social,
      company?.nombre_fantasia,
      company?.rut,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      (!query || searchable.includes(query)) &&
      (!estado || project.estado === estado) &&
      (!tipo || project.tipo_proyecto === tipo)
    );
  });

  const withoutAddress = projects.filter(
    (project) => !project.direccion,
  ).length;
  const withoutCompany = projects.filter(
    (project) => !project.empresa_id,
  ).length;

  return (
    <AppShell>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">Proyectos</h1>
          <p className="mt-1 text-slate-600">
            Contactos, empresas, oportunidades y cotizaciones vinculadas.
          </p>
        </div>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Proyectos registrados" value={projects.length} />
        <Metric label="Resultados mostrados" value={filtered.length} />
        <Metric label="Sin dirección" value={withoutAddress} />
        <Metric label="Sin empresa" value={withoutCompany} />
      </section>

      <form className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-[1fr_220px_220px_auto]">
        <input
          name="q"
          defaultValue={q}
          className="rounded-lg border px-3 py-2"
          placeholder="Buscar proyecto, contacto, empresa o ubicación"
        />

        <select
          name="estado"
          defaultValue={estado}
          className="rounded-lg border px-3 py-2"
        >
          <option value="">Todos los estados</option>
          {catalogs.estados.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          name="tipo"
          defaultValue={tipo}
          className="rounded-lg border px-3 py-2"
        >
          <option value="">Todos los tipos</option>
          {catalogs.tipos_proyecto.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <button className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white">
          Filtrar
        </button>
      </form>

      <section className="mt-6 overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="p-3">Proyecto</th>
              <th className="p-3">Contacto</th>
              <th className="p-3">Empresa</th>
              <th className="p-3">Ubicación</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">Estado</th>
              <th className="p-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((project) => {
              const contact = firstRelation(project.contactos);
              const company = firstRelation(project.empresas);
              const contactName = [contact?.nombre, contact?.apellido]
                .filter(Boolean)
                .join(" ");
              const location = [project.comuna, project.ciudad, project.region]
                .filter(Boolean)
                .join(", ");

              return (
                <tr key={project.id} className="border-t align-top">
                  <td className="p-3">
                    <p className="font-semibold text-slate-950">
                      {project.nombre}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {project.direccion || "Sin dirección registrada"}
                    </p>
                  </td>
                  <td className="p-3">{contactName || "Sin contacto"}</td>
                  <td className="p-3">
                    {text(company?.razon_social) || "Cliente particular"}
                  </td>
                  <td className="p-3">{location || "Sin ubicación"}</td>
                  <td className="p-3">
                    {project.tipo_proyecto || "Sin clasificar"}
                  </td>
                  <td className="p-3">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {project.estado}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <Link
                      href={`/proyectos/${project.id}`}
                      className="font-semibold text-emerald-700 hover:underline"
                    >
                      Ver ficha 360
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <p className="p-8 text-center text-slate-500">
            No se encontraron proyectos.
          </p>
        )}
      </section>
    </AppShell>
  );
}

function firstRelation(value: unknown): RelationRecord | null {
  if (Array.isArray(value))
    return (value[0] as RelationRecord | undefined) ?? null;
  if (value && typeof value === "object") return value as RelationRecord;
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-2xl border bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
    </article>
  );
}
