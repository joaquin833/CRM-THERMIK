type QuotePdfLinkProps = {
  quoteId: string;
  hasPdf: boolean;
};

export function QuotePdfLink({
  quoteId,
  hasPdf,
}: QuotePdfLinkProps) {
  if (!hasPdf) {
    return (
      <span className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500">
        PDF no disponible
      </span>
    );
  }

  return (
    {`/api/cotizaciones/${quoteId}/pdf`}
      Abrir PDF original
    </a>
  );
}