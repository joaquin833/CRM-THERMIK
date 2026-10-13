import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { getContacts } from "@/lib/services/contacts";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    q?: string;
    estado?: string;
    tipo?: string;
  }>;
};

export default async function ContactsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const contacts = await getContacts();
  const query = params.q?.trim().toLocaleLowerCase("es-CL") ?? "";
  const stateFilter = params.estado?.trim() ?? "";
  const typeFilter = params.tipo?.trim() ?? "";

  const contactTypes = Array.from(
    new Set(
      contacts
        .map((contact) => contact.tipo_contacto)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((first, second) => first.localeCompare(second, "es-CL"));

  const filteredContacts = contacts.filter((contact) => {
    const searchableText = [
      contact.nombre_completo,
      contact.correo,
      contact.telefono,
      contact.whatsapp,
      contact.empresa,
      contact.responsable,
      contact.tipo_contacto,
      contact.origen,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("es-CL");

    const matchesQuery = !query || searchableText.includes(query);
    const matchesState = !stateFilter || contact.estado === stateFilter;
    const matchesType = !typeFilter || contact.tipo_contacto === typeFilter;

    return matchesQuery && matchesState && matchesType;
  });

  const incompleteContacts = contacts.filter(
    (contact) => !contact.telefono && !contact.whatsapp,
  ).length;

  return (
    <AppShell>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Operación comercial
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Contactos</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Personas vinculadas a cotizaciones, proyectos, oportunidades y
            seguimientos. La prospección no forma parte de esta etapa.
          </p>
        </div>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Contactos activos" value={contacts.length} />
        <MetricCard label="Resultado actual" value={filteredContacts.length} />
        <MetricCard
          label="Sin teléfono o WhatsApp"
          value={incompleteContacts}
          tone={incompleteContacts > 0 ? "warning" : "neutral"}
        />
        <MetricCard
          label="Con empresa"
          value={contacts.filter((contact) => contact.empresa_id).length}
        />
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
        <form className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Buscar contacto
            <input
              type="search"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Nombre, correo, teléfono, empresa..."
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
              <option value="no_contactar">No contactar</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Tipo de contacto
            <select
              name="tipo"
              defaultValue={typeFilter}
              className="rounded-lg border border-slate-300 bg-white p-3"
            >
              <option value="">Todos</option>
              {contactTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
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
              href="/contactos"
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
              Contactos comerciales
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Selecciona un contacto para abrir su ficha 360.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            {filteredContacts.length}
          </span>
        </div>

        {filteredContacts.length === 0 ? (
          <p className="m-5 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
            No hay contactos que coincidan con los filtros seleccionados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Contacto</th>
                  <th className="px-5 py-3">Teléfono y WhatsApp</th>
                  <th className="px-5 py-3">Tipo y origen</th>
                  <th className="px-5 py-3">Empresa</th>
                  <th className="px-5 py-3">Responsable</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredContacts.map((contact) => (
                  <tr key={contact.id} className="align-top hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {contact.nombre_completo}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {contact.correo || "Correo sin registrar"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      <p>{contact.telefono || "Teléfono sin registrar"}</p>
                      <p className="mt-1 text-slate-500">
                        {contact.whatsapp
                          ? `WhatsApp: ${contact.whatsapp}`
                          : "WhatsApp sin registrar"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      <p>{contact.tipo_contacto || "Sin clasificación"}</p>
                      <p className="mt-1 text-slate-500">
                        {contact.origen || "Origen sin registrar"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      {contact.empresa || "Sin empresa"}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      {contact.responsable || "Sin responsable"}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyle(
                          contact.estado,
                        )}`}
                      >
                        {humanize(contact.estado)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/contactos/${contact.id}`}
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

function humanize(value: string): string {
  const normalized = value.replaceAll("_", " ").trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function statusStyle(status: string): string {
  if (status === "activo") return "bg-emerald-100 text-emerald-900";
  if (status === "no_contactar") return "bg-red-100 text-red-900";
  return "bg-slate-100 text-slate-700";
}
