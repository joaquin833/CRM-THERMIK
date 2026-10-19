"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  importId: string;
  status: string;
};

type Company = {
  id: string;
  razon_social: string;
  nombre_fantasia: string | null;
  rut: string | null;
  segmento: string | null;
  estado: string | null;
};

type ParsedData = {
  cliente?: string | null;
  rut_cliente?: string | null;
  direccion_proyecto?: string | null;
};

type InitialData = {
  companies: Company[];
  importRecord: {
    id: string;
    status: string;
    parsed_data: ParsedData | null;
    matched_company_id: string | null;
    imported_quote_id: string | null;
  };
  catalogs: unknown;
};

type CompanyMode = "individual" | "existing" | "new";

function tomorrowAtTen(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function QuoteImportConfirmButton({ importId, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [parsedData, setParsedData] = useState<ParsedData>({});
  const [companyMode, setCompanyMode] = useState<CompanyMode>("individual");
  const [existingCompanyId, setExistingCompanyId] = useState("");
  const [companyLegalName, setCompanyLegalName] = useState("");
  const [companyTradeName, setCompanyTradeName] = useState("");
  const [companyRut, setCompanyRut] = useState("");
  const [companyBusinessActivity, setCompanyBusinessActivity] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyCommune, setCompanyCommune] = useState("");
  const [companyCity, setCompanyCity] = useState("");
  const [companyRegion, setCompanyRegion] = useState("");
  const [companySegment, setCompanySegment] = useState("Otro");
  const [nextAction, setNextAction] = useState(
    "Confirmar recepcion de la cotizacion",
  );
  const [nextAt, setNextAt] = useState(tomorrowAtTen());
  const [priority, setPriority] = useState("alta");
  const [reminderMinutes, setReminderMinutes] = useState("60");

  const canConfirm = status === "ready" || status === "review";

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(
          `/api/cotizaciones/importar/${importId}/confirmar`,
          {
            method: "GET",
            cache: "no-store",
          },
        );
        const json = (await response.json()) as InitialData & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(json.error ?? "No fue posible cargar las empresas.");
        if (!active) return;

        const parsed = json.importRecord.parsed_data ?? {};
        setCompanies(json.companies ?? []);
        setParsedData(parsed);
        setCompanyLegalName(parsed.cliente ?? "");
        setCompanyRut(parsed.rut_cliente ?? "");
        setCompanyAddress(parsed.direccion_proyecto ?? "");

        if (json.importRecord.matched_company_id) {
          setCompanyMode("existing");
          setExistingCompanyId(json.importRecord.matched_company_id);
        }
      } catch (operationError) {
        if (active) {
          setError(
            operationError instanceof Error
              ? operationError.message
              : "No fue posible cargar la informacion de Empresas.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [importId]);

  const matchingCompany = useMemo(() => {
    const normalizedRut = companyRut.replace(/[^0-9kK]/g, "").toLowerCase();
    if (!normalizedRut) return null;
    return (
      companies.find(
        (company) =>
          (company.rut ?? "").replace(/[^0-9kK]/g, "").toLowerCase() ===
          normalizedRut,
      ) ?? null
    );
  }, [companies, companyRut]);

  useEffect(() => {
    if (matchingCompany && !existingCompanyId) {
      setCompanyMode("existing");
      setExistingCompanyId(matchingCompany.id);
    }
  }, [matchingCompany, existingCompanyId]);

  async function submit() {
    if (!canConfirm || busy) return;
    if (companyMode === "existing" && !existingCompanyId) {
      setError("Seleccione una empresa existente.");
      return;
    }
    if (companyMode === "new" && !companyLegalName.trim()) {
      setError("La razon social es obligatoria.");
      return;
    }
    if (!nextAt) {
      setError("Seleccione la fecha del primer seguimiento.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      const response = await fetch(
        `/api/cotizaciones/importar/${importId}/confirmar`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            companyMode,
            existingCompanyId: existingCompanyId || null,
            companyLegalName: companyLegalName || null,
            companyTradeName: companyTradeName || null,
            companyRut: companyRut || null,
            companyBusinessActivity: companyBusinessActivity || null,
            companyAddress: companyAddress || null,
            companyCommune: companyCommune || null,
            companyCity: companyCity || null,
            companyRegion: companyRegion || null,
            companySegment,
            companyOrigin: "Cotizacion PDF",
            nextAction,
            nextAt: new Date(nextAt).toISOString(),
            priority,
            reminderMinutes: Number(reminderMinutes),
          }),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        quoteId?: string;
      };
      if (!response.ok)
        throw new Error(
          result.error ?? "No fue posible confirmar la importacion.",
        );
      if (!result.quoteId)
        throw new Error("La operacion no devolvio una cotizacion valida.");

      router.push(`/cotizaciones/${result.quoteId}`);
      router.refresh();
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "No fue posible confirmar la importacion.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (status === "confirmed") {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="font-semibold text-emerald-950">
          Importacion confirmada
        </h2>
        <p className="mt-1 text-sm text-emerald-800">
          La cotizacion ya fue incorporada al CRM.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
        Confirmacion definitiva
      </p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">
        Empresa y primer seguimiento
      </h2>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Cargando empresas...</p>
      ) : (
        <div className="mt-5 grid gap-6">
          <fieldset className="grid gap-3">
            <legend className="font-semibold text-slate-900">
              Tipo de cliente
            </legend>

            <label className="flex gap-3 rounded-xl border p-4">
              <input
                type="radio"
                name="companyMode"
                checked={companyMode === "individual"}
                onChange={() => setCompanyMode("individual")}
              />
              <span>
                <strong className="block">Cliente particular</strong>
                <span className="text-sm text-slate-500">
                  No se vinculara una empresa.
                </span>
              </span>
            </label>

            <label className="flex gap-3 rounded-xl border p-4">
              <input
                type="radio"
                name="companyMode"
                checked={companyMode === "existing"}
                onChange={() => setCompanyMode("existing")}
              />
              <span>
                <strong className="block">Vincular empresa existente</strong>
                <span className="text-sm text-slate-500">
                  Usa una empresa ya registrada.
                </span>
              </span>
            </label>

            <label className="flex gap-3 rounded-xl border p-4">
              <input
                type="radio"
                name="companyMode"
                checked={companyMode === "new"}
                onChange={() => setCompanyMode("new")}
              />
              <span>
                <strong className="block">Crear empresa nueva</strong>
                <span className="text-sm text-slate-500">
                  Se creara al confirmar la importacion.
                </span>
              </span>
            </label>
          </fieldset>

          {companyMode === "existing" && (
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Empresa existente
              <select
                value={existingCompanyId}
                onChange={(event) => setExistingCompanyId(event.target.value)}
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
            <div className="grid gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Razon social *
                <input
                  value={companyLegalName}
                  onChange={(e) => setCompanyLegalName(e.target.value)}
                  className="rounded-lg border bg-white p-3"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Nombre de fantasia
                <input
                  value={companyTradeName}
                  onChange={(e) => setCompanyTradeName(e.target.value)}
                  className="rounded-lg border bg-white p-3"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                RUT
                <input
                  value={companyRut}
                  onChange={(e) => setCompanyRut(e.target.value)}
                  className="rounded-lg border bg-white p-3"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Giro
                <input
                  value={companyBusinessActivity}
                  onChange={(e) => setCompanyBusinessActivity(e.target.value)}
                  className="rounded-lg border bg-white p-3"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                Direccion
                <input
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  className="rounded-lg border bg-white p-3"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Comuna
                <input
                  value={companyCommune}
                  onChange={(e) => setCompanyCommune(e.target.value)}
                  className="rounded-lg border bg-white p-3"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Ciudad
                <input
                  value={companyCity}
                  onChange={(e) => setCompanyCity(e.target.value)}
                  className="rounded-lg border bg-white p-3"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Region
                <input
                  value={companyRegion}
                  onChange={(e) => setCompanyRegion(e.target.value)}
                  className="rounded-lg border bg-white p-3"
                />
              </label>
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
            </div>
          )}

          <div className="grid gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
              Primera accion
              <input
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                className="rounded-lg border bg-white p-3"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Fecha y hora
              <input
                type="datetime-local"
                value={nextAt}
                onChange={(e) => setNextAt(e.target.value)}
                className="rounded-lg border bg-white p-3"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Prioridad
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="rounded-lg border bg-white p-3"
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Recordatorio
              <select
                value={reminderMinutes}
                onChange={(e) => setReminderMinutes(e.target.value)}
                className="rounded-lg border bg-white p-3"
              >
                <option value="0">Sin recordatorio</option>
                <option value="15">15 minutos antes</option>
                <option value="30">30 minutos antes</option>
                <option value="60">1 hora antes</option>
                <option value="1440">1 dia antes</option>
              </select>
            </label>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={!canConfirm || busy}
            onClick={submit}
            className="rounded-lg bg-brand px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Confirmando..." : "Confirmar importacion"}
          </button>
        </div>
      )}
    </section>
  );
}
