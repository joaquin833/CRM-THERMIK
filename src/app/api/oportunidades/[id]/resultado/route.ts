import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  outcomeType: z.enum(["ganada", "perdida", "postergada", "cancelada"]),
  effectiveAt: z.string().datetime({ offset: true }),
  closedAmount: z.coerce.number().nonnegative().nullable().optional(),
  lossReason: z.string().trim().max(500).nullable().optional(),
  competitor: z.string().trim().max(250).nullable().optional(),
  postponementReason: z.string().trim().max(500).nullable().optional(),
  reactivationAt: z.string().datetime({ offset: true }).nullable().optional(),
  comment: z.string().trim().max(5000).nullable().optional(),
});

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const opportunityId = z.string().uuid().parse(id);
    const input = schema.parse(await request.json());
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("close_opportunity", {
      p_opportunity_id: opportunityId,
      p_outcome_type: input.outcomeType,
      p_effective_at: input.effectiveAt,
      p_closed_amount: input.closedAmount ?? null,
      p_loss_reason: input.lossReason ?? null,
      p_competitor: input.competitor ?? null,
      p_postponement_reason: input.postponementReason ?? null,
      p_reactivation_at: input.reactivationAt ?? null,
      p_comment: input.comment ?? null,
    });

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Revisa los campos obligatorios del resultado.",
          issues: error.issues,
        },
        { status: 422 },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible registrar el resultado.",
      },
      { status: 500 },
    );
  }
}
