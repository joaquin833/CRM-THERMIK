import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { CompanyEditForm } from "@/components/company-edit-form";
import { getCompany360 } from "@/lib/services/companies";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditCompanyPage({ params }: PageProps) {
  const { id } = await params;
  const data = await getCompany360(id);
  const displayName = data.company.nombre_fantasia || data.company.razon_social;

  return (
    <AppShell>
      <nav className="mb-5 text-sm text-slate-500" aria-label="Migas de pan">
        <Link href="/empresas" className="hover:text-emerald-700">
          Empresas
        </Link>
        <span className="px-2">/</span>
        <Link href={`/empresas/${id}`} className="hover:text-emerald-700">
          {displayName}
        </Link>
        <span className="px-2">/</span>
        <span className="text-slate-700">Editar</span>
      </nav>

      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Datos comerciales editables
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">
          Editar {displayName}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Actualiza los datos de la empresa sin modificar cotizaciones
          oficiales.
        </p>
      </header>

      <div className="mt-6">
        <CompanyEditForm company={data.company} catalogs={data.catalogs} />
      </div>
    </AppShell>
  );
}
