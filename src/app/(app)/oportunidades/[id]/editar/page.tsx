import { AppShell } from "@/components/app-shell";
import { OpportunityEditForm } from "@/components/opportunity-edit-form";
import { getOpportunity360 } from "@/lib/services/opportunities";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const [data, options] = await Promise.all([
    getOpportunity360(id),
    getOptions(),
  ]);

  return (
    <AppShell>
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
          Edición controlada
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">
          Editar {data.opportunity.nombre}
        </h1>
        <p className="mt-1 text-slate-600">
          Actualiza los antecedentes comerciales sin modificar la etapa ni la
          probabilidad.
        </p>
      </header>

      <OpportunityEditForm
        data={data}
        contacts={options.contacts}
        companies={options.companies}
        projects={options.projects}
      />
    </AppShell>
  );
}

async function getOptions() {
  const supabase = await createClient();
  const [contactsResult, companiesResult, projectsResult] = await Promise.all([
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
    supabase
      .from("proyectos")
      .select("id,nombre,empresa_id")
      .is("deleted_at", null)
      .order("nombre"),
  ]);

  if (contactsResult.error) throw new Error(contactsResult.error.message);
  if (companiesResult.error) throw new Error(companiesResult.error.message);
  if (projectsResult.error) throw new Error(projectsResult.error.message);

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
    projects: (projectsResult.data ?? []).map((item) => ({
      id: item.id,
      label: item.nombre,
      companyId: item.empresa_id,
    })),
  };
}
