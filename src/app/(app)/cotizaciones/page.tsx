import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { QuoteNumberBadge, StatusBadge } from "@/components/brand";
import { clp } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

type ContactRelation = {
  nombre: string | null;
  apellido: string | null;
};

type CompanyRelation = {
  razon_social: string | null;
};

type ProjectRelation = {
  nombre: string | null;
};

type ResponsibleRelation = {
  nombre: string | null;
  apellido: string | null;
};

export default async function Page({ searchParams }: PageProps) {
  const { q = "" } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("cotizaciones")
    .select(`
      id,
      numero_cotizacion,
      estado,
      estado_comercial,
      total,
      fecha_emision,
      fecha_validez,
      fecha_proximo_seguimiento,
      proxima_accion,
      ejecutivo_responsable_id,
      contactos (
        nombre,
        apellido
      ),
      empresas (
        razon_social
      ),
      proyectos (
        nombre
      )
    `)
    .is("deleted_at", null)
    .order("fecha_emision", {
      ascending: false,
    });

  const normalizedQuery = q.replace(/\s/g, "");

  if (normalizedQuery) {
    query = query.ilike(
      "numero_cotizacion_normalizado",
      `%${normalizedQuery}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const quotes = data ?? [];
  const responsibleIds = [
    ...new Set(
      quotes
        .map((quote) => quote.ejecutivo_responsable_id)
        .filter((value): value is string => Boolean(value))
    ),
  ];

  const responsibleMap = new Map<string, ResponsibleRelation>();

  if (responsibleIds.length > 0) {
    const responsibleResult = await supabase
      .from("profiles")
      .select("id,nombre,apellido")
      .in("id", responsibleIds);

    if (responsibleResult.error) {
      throw new Error(responsibleResult.error.message);
    }

    for (const profile of responsibleResult.data ?? []) {
      responsibleMap.set(profile.id, {
        nombre: profile.nombre,
        apellido: profile.apellido,
      });
    }
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">
            Cotizaciones
          </h1>

          <p className="mt-1 text-slate-600">
            Importa las cotizaciones oficiales y administra su seguimiento
            comercial.
          </p>
        </div>

        <Link
          className="rounded-lg bg-brand px-4 py-2 font-semibold text-white transition hover:opacity-90"
          href="/cotizaciones/importar"
        >
          Importar cotización
        </Link>
      </div>

      <form className="mt-5 flex flex-wrap gap-3">
        <label className="sr-only" htmlFor="quote-search">
          Buscar por número de cotización
        </label>

        <input
          id="quote-search"
          name="q"
          defaultValue={q}
          className="w-full max-w-md rounded-lg border bg-white p-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          placeholder="Buscar N.º de cotización"
        />

        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
        >
          Buscar
        </button>
      </form>

      <div className="mt-5 overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3">N.º de cotización</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Proyecto</th>
              <th className="p-3">Fecha</th>
              <th className="p-3">Total</th>
              <th className="p-3">Estado comercial</th>
              <th className="p-3">Responsable</th>
              <th className="p-3">Próxima acción</th>
              <th className="p-3">Próximo seguimiento</th>
            </tr>
          </thead>

          <tbody>
            {quotes.map((quote) => {
              const contact = firstRelation<ContactRelation>(quote.contactos);
              const company = firstRelation<CompanyRelation>(quote.empresas);
              const project = firstRelation<ProjectRelation>(quote.proyectos);
              const responsible = quote.ejecutivo_responsable_id
                ? responsibleMap.get(quote.ejecutivo_responsable_id) ?? null
                : null;

              const contactName = [contact?.nombre, contact?.apellido]
                .filter(Boolean)
                .join(" ");
              const responsibleName = [
                responsible?.nombre,
                responsible?.apellido,
              ]
                .filter(Boolean)
                .join(" ");
              const clientName =
                cleanText(company?.razon_social) ||
                cleanText(contactName) ||
                "Sin cliente vinculado";
              const projectName =
                cleanText(project?.nombre) || "Sin proyecto vinculado";

              return (
                <tr
                  className="border-t align-top transition hover:bg-slate-50"
                  key={quote.id}
                >
                  <td className="p-3">
                    <Link href={`/cotizaciones/${quote.id}`}>
                      <QuoteNumberBadge number={quote.numero_cotizacion} />
                    </Link>
                  </td>

                  <td className="p-3 font-medium text-slate-900">
                    {clientName}
                  </td>

                  <td className="p-3">{projectName}</td>

                  <td className="p-3">{formatDate(quote.fecha_emision)}</td>

                  <td className="p-3 font-semibold">
                    {clp(Number(quote.total ?? 0))}
                  </td>

                  <td className="p-3">
                    <StatusBadge>
                      {quote.estado_comercial ?? quote.estado}
                    </StatusBadge>
                  </td>

                  <td className="p-3">
                    {responsibleName || "Sin responsable"}
                  </td>

                  <td className="max-w-72 p-3">
                    {cleanText(quote.proxima_accion) || "Sin próxima acción"}
                  </td>

                  <td className="p-3">
                    {quote.fecha_proximo_seguimiento
                      ? new Date(
                          quote.fecha_proximo_seguimiento
                        ).toLocaleString("es-CL")
                      : "Sin seguimiento"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {quotes.length === 0 && (
          <div className="p-10 text-center">
            <p className="text-slate-500">
              No se encontraron cotizaciones confirmadas.
            </p>

            <Link
              href="/cotizaciones/importar"
              className="mt-4 inline-flex rounded-lg border border-emerald-300 px-4 py-2 font-semibold text-emerald-800 hover:bg-emerald-50"
            >
              Importar la primera cotización
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function firstRelation<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] as T | undefined) ?? null;
  }

  if (value && typeof value === "object") {
    return value as T;
  }

  return null;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Sin fecha";
  }

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("es-CL");
}
