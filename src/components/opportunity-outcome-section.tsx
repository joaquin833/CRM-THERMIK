import { OpportunityOutcomeForm } from "@/components/opportunity-outcome-form";

type Props = {
  opportunity: {
    id: string;
    estado: string;
    monto_estimado?: number | null;
  };
};

export function OpportunityOutcomeSection({ opportunity }: Props) {
  const isClosed = ["ganada", "perdida", "cancelada"].includes(
    opportunity.estado,
  );

  if (isClosed) {
    return (
      <span className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600">
        Resultado registrado
      </span>
    );
  }

  return (
    <OpportunityOutcomeForm
      opportunityId={opportunity.id}
      estimatedAmount={Number(opportunity.monto_estimado ?? 0)}
    />
  );
}
