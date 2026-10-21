import { AppShell } from "@/components/app-shell";
import { ProjectEditForm } from "@/components/project-edit-form";
import { getProject360 } from "@/lib/services/projects";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function Page({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { returnTo: requestedReturnTo } = await searchParams;
  const returnTo = safeReturnTo(requestedReturnTo, `/proyectos/${id}`);
  const [data, options] = await Promise.all([getProject360(id), getOptions()]);

  return (
    <AppShell>
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
          Edición controlada
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">
          Editar {data.project.nombre}
        </h1>
        <p className="mt-1 text-slate-600">
          Actualiza información comercial y técnica del proyecto.
        </p>
      </header>
      <ProjectEditForm
        data={data}
        contacts={options.contacts}
        companies={options.companies}
        returnTo={returnTo}
      />
    </AppShell>
  );
}

async function getOptions() {
  const supabase = await createClient();
  const [contactsResult, companiesResult] = await Promise.all([
    supabase
      .from("contactos")
      .select("id,nombre,apellido,correo")
      .is("deleted_at", null)
      .order("nombre"),
    supabase
      .from("empresas")
      .select("id,razon_social,rut")
      .is("deleted_at", null)
      .order("razon_social"),
  ]);

  if (contactsResult.error) throw new Error(contactsResult.error.message);
  if (companiesResult.error) throw new Error(companiesResult.error.message);

  return {
    contacts: (contactsResult.data ?? []).map((item) => ({
      id: item.id,
      label:
        [item.nombre, item.apellido].filter(Boolean).join(" ") ||
        item.correo ||
        "Contacto",
    })),
    companies: (companiesResult.data ?? []).map((item) => ({
      id: item.id,
      label: item.rut
        ? `${item.razon_social} · ${item.rut}`
        : item.razon_social,
    })),
  };
}

function safeReturnTo(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (value.startsWith("/cotizaciones/") || value.startsWith("/proyectos/")) {
    return value;
  }
  return fallback;
}
