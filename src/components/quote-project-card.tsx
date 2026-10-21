import Link from "next/link";

type ProjectData = {
  id?: unknown;
  nombre?: unknown;
  direccion?: unknown;
  comuna?: unknown;
  ciudad?: unknown;
  region?: unknown;
  tipo_proyecto?: unknown;
  tipo_obra?: unknown;
  metros_cuadrados_estimados?: unknown;
  estado?: unknown;
} | null;

type Props = {
  quoteId: string;
  project: ProjectData;
};

export function QuoteProjectCard({ quoteId, project }: Props) {
  const projectId = text(project?.id);
  const projectName = text(project?.nombre) || "Sin proyecto vinculado";
  const location = [
    text(project?.direccion),
    text(project?.comuna),
    text(project?.ciudad),
    text(project?.region),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
            Proyecto vinculado
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">
            {projectName}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {location || "Sin ubicación registrada"}
          </p>
        </div>

        {projectId ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/proyectos/${projectId}`}
              className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Ver ficha 360
            </Link>
            <Link
              href={`/proyectos/${projectId}/editar?returnTo=${encodeURIComponent(
                `/cotizaciones/${quoteId}`,
              )}`}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              Editar proyecto
            </Link>
          </div>
        ) : null}
      </div>

      <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Data label="Tipo de proyecto" value={project?.tipo_proyecto} />
        <Data label="Tipo de obra" value={project?.tipo_obra} />
        <Data
          label="Metros cuadrados"
          value={
            project?.metros_cuadrados_estimados == null
              ? null
              : `${String(project.metros_cuadrados_estimados)} m²`
          }
        />
        <Data label="Estado" value={project?.estado} />
      </dl>

      {!projectId && (
        <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          La cotización no tiene un proyecto vinculado. Revisa la importación o
          la relación comercial antes de continuar.
        </p>
      )}
    </section>
  );
}

function Data({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium text-slate-900">
        {text(value) || "Sin registrar"}
      </dd>
    </div>
  );
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}
