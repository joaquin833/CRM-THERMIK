import Link from "next/link";

export type QuoteContact = {
  id: string;
  nombre?: string | null;
  apellido?: string | null;
  cargo?: string | null;
  telefono?: string | null;
  whatsapp?: string | null;
  correo?: string | null;
  preferencia_contacto?: string | null;
  tipo_contacto?: string | null;
  estado?: string | null;
};

type Props = {
  contact: QuoteContact | null;
  companyName?: string | null;
  quoteId: string;
};

export function QuoteContactCard({ contact, companyName, quoteId }: Props) {
  if (!contact) {
    return (
      <section className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-800">
          Contacto comercial
        </p>
        <h2 className="mt-1 text-xl font-semibold text-amber-950">
          Sin contacto vinculado
        </h2>
        <p className="mt-2 text-sm text-amber-900">
          La cotización necesita un contacto para registrar medios de
          comunicación y mantener el seguimiento comercial.
        </p>
      </section>
    );
  }

  const name =
    [contact.nombre, contact.apellido].filter(Boolean).join(" ").trim() ||
    "Contacto sin nombre";
  const telephone = cleanText(contact.telefono);
  const whatsapp = cleanText(contact.whatsapp);
  const email = cleanText(contact.correo);
  const missingCommunication = !telephone && !whatsapp && !email;
  const returnTo = `/cotizaciones/${quoteId}`;
  const editHref = `/contactos/${contact.id}/editar?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <section
      className={`mt-6 rounded-2xl border p-5 shadow-sm ${
        missingCommunication
          ? "border-amber-300 bg-amber-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Contacto comercial
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">{name}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Datos comerciales editables. No modifican el documento oficial de la
            cotización.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/contactos/${contact.id}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Ver ficha 360
          </Link>
          <Link
            href={editHref}
            className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Editar contacto
          </Link>
        </div>
      </div>

      {missingCommunication && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-100/60 p-3 text-sm text-amber-950">
          Falta registrar teléfono, WhatsApp o correo. Completa al menos un
          medio para facilitar el seguimiento de esta cotización.
        </div>
      )}

      <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Data label="Teléfono" value={telephone} />
        <Data label="WhatsApp" value={whatsapp} />
        <Data label="Correo" value={email} />
        <Data
          label="Preferencia"
          value={cleanText(contact.preferencia_contacto)}
        />
        <Data
          label="Tipo de contacto"
          value={cleanText(contact.tipo_contacto)}
        />
        <Data label="Cargo" value={cleanText(contact.cargo)} />
        <Data label="Empresa" value={cleanText(companyName)} />
        <Data label="Estado" value={humanize(contact.estado)} />
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        {telephone && (
          <a
            href={`tel:${onlyDigits(telephone)}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Llamar
          </a>
        )}
        {whatsapp && onlyDigits(whatsapp) && (
          <a
            href={`https://wa.me/${onlyDigits(whatsapp)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
          >
            Abrir WhatsApp
          </a>
        )}
        {email && (
          <a
            href={`mailto:${email}`}
            className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50"
          >
            Enviar correo
          </a>
        )}
      </div>
    </section>
  );
}

function Data({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-medium text-slate-900">
        {value || "Sin registrar"}
      </dd>
    </div>
  );
}

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function humanize(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const normalized = text.replaceAll("_", " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
