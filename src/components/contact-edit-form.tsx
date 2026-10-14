"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import type {
  Contact360Contact,
  ContactCatalogs,
} from "@/lib/services/contacts";

type CompanyOption = {
  id: string;
  razon_social: string;
};

type Props = {
  contact: Contact360Contact;
  catalogs: ContactCatalogs;
  companies: CompanyOption[];
  currentCompanyId: string | null;
  returnTo: string;
};

type WarningMatch = {
  contact_id: string;
  nombre_completo: string | null;
  nivel: string;
};

type UpdateResponse = {
  success?: boolean;
  error?: string;
  detail?: string | null;
  hint?: string | null;
  warnings?: {
    phone_matches?: WarningMatch[];
    name_matches?: WarningMatch[];
  };
};

export function ContactEditForm({
  contact,
  catalogs,
  companies,
  currentCompanyId,
  returnTo,
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [contactType, setContactType] = useState(contact.tipo_contacto ?? "");

  const companyRequired = contactType === "Contacto de empresa";
  const sortedCompanies = useMemo(
    () =>
      [...companies].sort((first, second) =>
        first.razon_social.localeCompare(second.razon_social, "es-CL"),
      ),
    [companies],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setWarnings([]);

    const form = new FormData(event.currentTarget);
    const payload = {
      nombre: stringValue(form, "nombre"),
      apellido: stringValue(form, "apellido"),
      cargo: stringValue(form, "cargo"),
      telefono: stringValue(form, "telefono"),
      whatsapp: stringValue(form, "whatsapp"),
      correo: stringValue(form, "correo"),
      direccion: stringValue(form, "direccion"),
      comuna: stringValue(form, "comuna"),
      ciudad: stringValue(form, "ciudad"),
      region: stringValue(form, "region"),
      tipo_contacto: stringValue(form, "tipo_contacto"),
      preferencia_contacto: stringValue(form, "preferencia_contacto"),
      origen: stringValue(form, "origen"),
      estado: stringValue(form, "estado"),
      empresa_id: stringValue(form, "empresa_id"),
      consentimiento_comunicaciones: form.has("consentimiento_comunicaciones"),
      observaciones: stringValue(form, "observaciones"),
    };

    try {
      const response = await fetch(`/api/contactos/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as UpdateResponse;

      if (!response.ok) {
        setError(
          [result.error, result.detail, result.hint]
            .filter(Boolean)
            .join(" ") || "No fue posible guardar los cambios.",
        );
        return;
      }

      const messages: string[] = [];
      const phoneMatches = result.warnings?.phone_matches ?? [];
      const nameMatches = result.warnings?.name_matches ?? [];

      if (phoneMatches.length > 0) {
        messages.push(
          `Existe ${phoneMatches.length} contacto adicional con el mismo teléfono.`,
        );
      }
      if (nameMatches.length > 0) {
        messages.push(
          `Existe ${nameMatches.length} contacto adicional con un nombre coincidente.`,
        );
      }

      setWarnings(messages);
      router.push(returnTo);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible guardar los cambios.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      <Section title="Identificación">
        <Field
          label="Nombre"
          name="nombre"
          defaultValue={contact.nombre}
          required
        />
        <Field
          label="Apellido"
          name="apellido"
          defaultValue={contact.apellido}
        />
        <Field label="Cargo" name="cargo" defaultValue={contact.cargo} />
        <SelectField
          label="Tipo de contacto"
          name="tipo_contacto"
          value={contactType}
          options={catalogs.tipos_contacto}
          onChange={setContactType}
        />
        <SelectField
          label="Estado"
          name="estado"
          value={contact.estado}
          options={catalogs.estados}
          required
        />
        <SelectField
          label="Origen"
          name="origen"
          value={contact.origen ?? ""}
          options={catalogs.origenes}
        />
      </Section>

      <Section title="Datos de contacto">
        <Field
          label="Teléfono"
          name="telefono"
          defaultValue={contact.telefono}
        />
        <Field
          label="WhatsApp"
          name="whatsapp"
          defaultValue={contact.whatsapp}
        />
        <Field
          label="Correo"
          name="correo"
          type="email"
          defaultValue={contact.correo}
        />
        <SelectField
          label="Preferencia de contacto"
          name="preferencia_contacto"
          value={contact.preferencia_contacto ?? ""}
          options={catalogs.preferencias_contacto}
        />
        <p className="sm:col-span-2 text-sm text-slate-500">
          Debes mantener al menos un correo, teléfono o WhatsApp.
        </p>
      </Section>

      <Section title="Empresa y ubicación">
        <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
          Empresa {companyRequired ? "(obligatoria)" : "(opcional)"}
          <select
            name="empresa_id"
            defaultValue={currentCompanyId ?? ""}
            required={companyRequired}
            className="rounded-lg border border-slate-300 bg-white p-3"
          >
            <option value="">Sin empresa</option>
            {sortedCompanies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.razon_social}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Dirección"
          name="direccion"
          defaultValue={contact.direccion}
        />
        <Field label="Comuna" name="comuna" defaultValue={contact.comuna} />
        <Field label="Ciudad" name="ciudad" defaultValue={contact.ciudad} />
        <Field label="Región" name="region" defaultValue={contact.region} />
      </Section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">
          Observaciones y comunicaciones
        </h2>
        <label className="mt-5 grid gap-1 text-sm font-medium text-slate-700">
          Observaciones
          <textarea
            name="observaciones"
            defaultValue={contact.observaciones ?? ""}
            rows={5}
            className="rounded-lg border border-slate-300 bg-white p-3"
          />
        </label>
        <label className="mt-5 flex items-start gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            name="consentimiento_comunicaciones"
            defaultChecked={contact.consentimiento_comunicaciones}
            className="mt-1 h-4 w-4"
          />
          <span>
            Autoriza comunicaciones comerciales adicionales. Esta opción no
            afecta el seguimiento normal de una cotización solicitada.
          </span>
        </label>
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push(returnTo)}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  defaultValue: string | null;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        className="rounded-lg border border-slate-300 bg-white p-3"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  value,
  options,
  required = false,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  options: string[];
  required?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <select
        name={name}
        defaultValue={value}
        required={required}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
        className="rounded-lg border border-slate-300 bg-white p-3"
      >
        {!required && <option value="">Sin registrar</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {humanize(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function stringValue(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function humanize(value: string): string {
  const normalized = value.replaceAll("_", " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
