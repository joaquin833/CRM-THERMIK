import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  stage: z.string().trim().min(1),
  nextAction: z.string().trim().nullable().optional(),
  nextAt: z.string().datetime({ offset: true }).nullable().optional(),
  priority: z.string().trim().nullable().optional(),
  temperature: z.string().trim().nullable().optional(),
  estimatedCloseDate: z.string().date().nullable().optional(),
  comment: z.string().trim().max(5000).nullable().optional(),
});

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const opportunityId = z.string().uuid().parse(id);
    const input = schema.parse(await request.json());
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("change_opportunity_stage", {
      p_opportunity_id: opportunityId,
      p_stage: input.stage,
      p_next_action: input.nextAction ?? null,
      p_next_at: input.nextAt ?? null,
      p_priority: input.priority ?? null,
      p_temperature: input.temperature ?? null,
      p_estimated_close_date: input.estimatedCloseDate ?? null,
      p_comment: input.comment ?? null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Revisa los campos del cambio de etapa.",
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
            : "No fue posible cambiar la etapa.",
      },
      { status: 500 },
    );
  }
}
