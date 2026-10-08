type QuotePdfLinkProps = {
  quoteId: string;
  hasPdf: boolean;
};

export function QuotePdfLink({ quoteId, hasPdf }: QuotePdfLinkProps) {
  if (!hasPdf) {
    return (
      <span className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500">
        PDF no disponible
      </span>
    );
  }

  return (
    <a
      href={`/api/cotizaciones/${quoteId}/pdf`}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50"
    >
      Abrir PDF original
    </a>
  );
}
