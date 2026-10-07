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

      <form className="mt-5">
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
              <th className="p-3">Próximo seguimiento</th>
            </tr>
          </thead>

          <tbody>
            {quotes.map((quote) => {
              const company = quote.empresas?.[0]?.razon_social;
              const contact = quote.contactos?.[0];
              const contactName = [contact?.nombre, contact?.apellido]
                .filter(Boolean)
                .join(" ");

              return (
                <tr
                  className="border-t transition hover:bg-slate-50"
                  key={quote.id}
                >
                  <td className="p-3">
                    <Link href={`/cotizaciones/${quote.id}`}>
                      <QuoteNumberBadge
                        number={quote.numero_cotizacion}
                      />
                    </Link>
                  </td>

                  <td className="p-3">
                    {company ?? contactName ?? "Sin cliente"}
                  </td>

                  <td className="p-3">
                    {quote.proyectos?.[0]?.nombre ?? "Sin proyecto"}
                  </td>

                  <td className="p-3">
                    {formatDate(quote.fecha_emision)}
                  </td>

                  <td className="p-3 font-semibold">
                    {clp(Number(quote.total ?? 0))}
                  </td>

                  <td className="p-3">
                    <StatusBadge>
                      {quote.estado_comercial ?? quote.estado}
                    </StatusBadge>
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
