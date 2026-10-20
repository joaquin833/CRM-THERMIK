"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  quoteId: string;
};

type CompanyMode = "individual" | "existing" | "new";

type Company = {
  id: string;
  razon_social: string;
  nombre_fantasia: string | null;
  rut: string | null;
  segmento: string | null;
  estado: string | null;
};

type QuoteData = {
  id: string;
  numero_cotizacion: string;
  empresa_id: string | null;
  contacto_id: string | null;
  empresas: {
    id: string;
    razon_social: string;
    nombre_fantasia: string | null;
    rut: string | null;
  } | null;
  contactos: {
    id: string;
    nombre: string;
    apellido: string | null;
    empresa_id: string | null;
    tipo_contacto: string | null;
  } | null;
};

export function QuoteCompanyLinkForm({ quoteId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyMode, setCompanyMode] = useState<CompanyMode>("individual");
  const [existingCompanyId, setExistingCompanyId] = useState("");
  const [linkContact, setLinkContact] = useState(true);
  const [companyLegalName, setCompanyLegalName] = useState("");
  const [companyTradeName, setCompanyTradeName] = useState("");
  const [companyRut, setCompanyRut] = useState("");
  const [companyBusinessActivity, setCompanyBusinessActivity] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyCommune, setCompanyCommune] = useState("");
  const [companyCity, setCompanyCity] = useState("");
  const [companyRegion, setCompanyRegion] = useState("");
  const [companySegment, setCompanySegment] = useState("Otro");
  const [companyNotes, setCompanyNotes] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`/api/cotizaciones/${quoteId}/empresa`, {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok)
        throw new Error(json.error ?? "No fue posible cargar Empresas.");

      setQuote(json.quote);
      setCompanies(json.companies ?? []);
      if (json.quote.empresa_id) {
        setCompanyMode("existing");
        setExistingCompanyId(json.quote.empresa_id);
      } else {
        setCompanyMode("individual");
      }
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "No fue posible cargar Empresas.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && !quote && !loading) void load();
  }, [open, quote, loading]);

  async function submit() {
    if (companyMode === "existing" && !existingCompanyId) {
      setError("Seleccione una empresa existente.");
      return;
    }
    if (companyMode === "new" && !companyLegalName.trim()) {
      setError("La razon social es obligatoria.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      setSuccess("");

      const response = await fetch(`/api/cotizaciones/${quoteId}/empresa`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyMode,
          existingCompanyId: existingCompanyId || null,
          companyLegalName: companyLegalName || null,
          companyTradeName: companyTradeName || null,
          companyRut: companyRut || null,
          companyBusinessActivity: companyBusinessActivity || null,
          companyWebsite: companyWebsite || null,
          companyAddress: companyAddress || null,
          companyCommune: companyCommune || null,
          companyCity: companyCity || null,
          companyRegion: companyRegion || null,
          companySegment,
          companyOrigin: "Cotizacion PDF",
          companyNotes: companyNotes || null,
          linkContact,
        }),
      });
      const json = await response.json();
      if (!response.ok)
        throw new Error(json.error ?? "No fue posible actualizar la empresa.");

      setSuccess(json.message ?? "Empresa actualizada correctamente.");
      setQuote(null);
      await load();
      router.refresh();
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "No fue posible actualizar la empresa.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Empresa vinculada
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">
            {quote?.empresas?.razon_social ?? "Sin empresa vinculada"}
          </h2>
          {quote?.empresas?.rut && (
            <p className="mt-1 text-sm text-slate-500">
              RUT {quote.empresas.rut}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
        >
          {open ? "Cerrar" : "Asignar o cambiar empresa"}
        </button>
      </div>

      {open && (
        <div className="mt-5 grid gap-5 border-t pt-5">
          {loading ? (
            <p className="text-sm text-slate-500">Cargando empresas...</p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  ["individual", "Cliente particular"],
                  ["existing", "Empresa existente"],
                  ["new", "Empresa nueva"],
                ].map(([value, label]) => (
                  <label
                    key={value}
                    className="flex gap-3 rounded-xl border p-4"
                  >
                    <input
                      type="radio"
                      name={`companyMode-${quoteId}`}
                      checked={companyMode === value}
                      onChange={() => setCompanyMode(value as CompanyMode)}
                    />
                    <span className="font-medium text-slate-800">{label}</span>
                  </label>
                ))}
              </div>

              {companyMode === "existing" && (
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Empresa
                  <select
                    value={existingCompanyId}
                    onChange={(event) =>
                      setExistingCompanyId(event.target.value)
                    }
                    className="rounded-lg border bg-white p-3"
                  >
                    <option value="">Seleccione una empresa</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.razon_social}
                        {company.rut ? ` - ${company.rut}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {companyMode === "new" && (
                <div className="grid gap-4 rounded-xl border border-blue-200 bg-blue-50 p-4 md:grid-cols-2">
                  <Field
                    label="Razon social *"
                    value={companyLegalName}
                    onChange={setCompanyLegalName}
                  />
                  <Field
                    label="Nombre de fantasia"
                    value={companyTradeName}
                    onChange={setCompanyTradeName}
                  />
                  <Field
                    label="RUT"
                    value={companyRut}
                    onChange={setCompanyRut}
                  />
                  <Field
                    label="Giro"
                    value={companyBusinessActivity}
                    onChange={setCompanyBusinessActivity}
                  />
                  <Field
                    label="Pagina web"
                    value={companyWebsite}
                    onChange={setCompanyWebsite}
                  />
                  <Field
                    label="Direccion"
                    value={companyAddress}
                    onChange={setCompanyAddress}
                  />
                  <Field
                    label="Comuna"
                    value={companyCommune}
                    onChange={setCompanyCommune}
                  />
                  <Field
                    label="Ciudad"
                    value={companyCity}
                    onChange={setCompanyCity}
                  />
                  <Field
                    label="Region"
                    value={companyRegion}
                    onChange={setCompanyRegion}
                  />
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Segmento
                    <select
                      value={companySegment}
                      onChange={(e) => setCompanySegment(e.target.value)}
                      className="rounded-lg border bg-white p-3"
                    >
                      <option value="Residencial">Residencial</option>
                      <option value="Construccion">Construccion</option>
                      <option value="Industrial">Industrial</option>
                      <option value="Comercial">Comercial</option>
                      <option value="Institucional">Institucional</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                    Observaciones
                    <textarea
                      value={companyNotes}
                      onChange={(e) => setCompanyNotes(e.target.value)}
                      className="min-h-24 rounded-lg border bg-white p-3"
                    />
                  </label>
                </div>
              )}

              <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <input
                  type="checkbox"
                  checked={linkContact}
                  onChange={(e) => setLinkContact(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <strong className="block text-slate-900">
                    Actualizar tambien el contacto
                  </strong>
                  <span className="text-sm text-slate-600">
                    Vincula o desvincula el contacto principal junto con esta
                    operacion.
                  </span>
                </span>
              </label>

              {error && (
                <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
                  {success}
                </div>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={submit}
                className="rounded-lg bg-brand px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Guardando..." : "Guardar vinculacion de empresa"}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border bg-white p-3"
      />
    </label>
  );
}
