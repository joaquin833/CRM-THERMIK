import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { ContactEditForm } from "@/components/contact-edit-form";
import { getContact360 } from "@/lib/services/contacts";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

type CompanyOption = {
  id: string;
  razon_social: string;
};

export default async function EditContactPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const data = await getContact360(id);
  const supabase = await createClient();
  const { data: companies, error } = await supabase
    .from("empresas")
    .select("id, razon_social")
    .is("deleted_at", null)
    .order("razon_social", { ascending: true });

  if (error) {
    throw new Error(`No fue posible cargar las empresas: ${error.message}`);
  }

  const name = data.contact.nombre_completo || "Contacto sin nombre";
  const defaultReturnTo = `/contactos/${data.contact.id}`;
  const returnTo = safeReturnTo(query.returnTo, defaultReturnTo);

  return (
    <AppShell>
      <nav className="mb-5 text-sm text-slate-500" aria-label="Migas de pan">
        <Link href="/contactos" className="hover:text-emerald-700">
          Contactos
        </Link>
        <span className="px-2">/</span>
        <Link
          href={`/contactos/${data.contact.id}`}
          className="hover:text-emerald-700"
        >
          {name}
        </Link>
        <span className="px-2">/</span>
        <span className="text-slate-700">Editar</span>
      </nav>

      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Datos comerciales editables
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">
          Editar {name}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Completa teléfono, WhatsApp, correo y contexto comercial. Estos
          cambios no modifican los datos oficiales, ítems ni valores de las
          cotizaciones.
        </p>
      </header>

      <div className="mt-6">
        <ContactEditForm
          contact={data.contact}
          catalogs={data.catalogs}
          companies={(companies ?? []) as CompanyOption[]}
          currentCompanyId={data.company?.id ?? null}
          returnTo={returnTo}
        />
      </div>
    </AppShell>
  );
}

function safeReturnTo(value: string | undefined, fallback: string): string {
  if (!value) return fallback;

  // Solo acepta rutas internas conocidas. Evita redirecciones a dominios externos.
  if (value.startsWith("/cotizaciones/") || value.startsWith("/contactos/")) {
    return value;
  }

  return fallback;
}
