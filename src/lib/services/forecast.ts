import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const monthlySchema = z.object({
  month: z.string(),
  label: z.string(),
  opportunities: z.coerce.number().default(0),
  pipeline_total: z.coerce.number().default(0),
  scenario_conservative: z.coerce.number().default(0),
  scenario_probable: z.coerce.number().default(0),
  scenario_potential: z.coerce.number().default(0),
  won_amount: z.coerce.number().default(0),
  won_count: z.coerce.number().default(0),
  lost_count: z.coerce.number().default(0),
});

const stageSchema = z.object({
  stage: z.string(),
  opportunities: z.coerce.number().default(0),
  pipeline_total: z.coerce.number().default(0),
  pipeline_weighted: z.coerce.number().default(0),
  probability_average: z.coerce.number().default(0),
});

const topOpportunitySchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  etapa_comercial: z.string(),
  estado: z.string(),
  amount: z.coerce.number().default(0),
  probability: z.coerce.number().default(0),
  weighted_amount: z.coerce.number().default(0),
  prioridad: z.string().nullable().optional(),
  temperatura: z.string().nullable().optional(),
  fecha_estimada_cierre: z.string().nullable().optional(),
  proxima_accion: z.string().nullable().optional(),
  fecha_proxima_accion: z.string().nullable().optional(),
  proyecto: z.string().nullable().optional(),
  contacto_nombre: z.string().nullable().optional(),
  contacto_apellido: z.string().nullable().optional(),
  empresa: z.string().nullable().optional(),
});

const riskSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  amount: z.coerce.number().default(0),
  stage: z.string(),
  priority: z.string().nullable().optional(),
  temperature: z.string().nullable().optional(),
  next_action: z.string().nullable().optional(),
  next_action_at: z.string().nullable().optional(),
  estimated_close_date: z.string().nullable().optional(),
  risk_type: z.string(),
});

const forecastSchema = z.object({
  period: z.object({
    start_date: z.string(),
    start_month: z.string(),
    end_month_exclusive: z.string(),
    months: z.coerce.number(),
    generated_at: z.string(),
  }),
  summary: z.object({
    active_opportunities: z.coerce.number().default(0),
    pipeline_total: z.coerce.number().default(0),
    pipeline_weighted: z.coerce.number().default(0),
    scenario_conservative: z.coerce.number().default(0),
    scenario_probable: z.coerce.number().default(0),
    scenario_potential: z.coerce.number().default(0),
    won_amount_period: z.coerce.number().default(0),
    won_count_period: z.coerce.number().default(0),
    lost_count_period: z.coerce.number().default(0),
    postponed_count_period: z.coerce.number().default(0),
    overdue_followups: z.coerce.number().default(0),
    without_estimated_close_date: z.coerce.number().default(0),
    high_value_opportunities: z.coerce.number().default(0),
  }),
  monthly_forecast: z.array(monthlySchema).default([]),
  by_stage: z.array(stageSchema).default([]),
  top_opportunities: z.array(topOpportunitySchema).default([]),
  risks: z.array(riskSchema).default([]),
  loss_reasons: z
    .array(
      z.object({
        reason: z.string(),
        opportunities: z.coerce.number().default(0),
      }),
    )
    .default([]),
});

export type OpportunityForecast = z.infer<typeof forecastSchema>;

export async function getOpportunityForecast(
  startDate: string,
  months: number,
): Promise<OpportunityForecast> {
  const safeDate = z.string().date().parse(startDate);
  const safeMonths = z.number().int().min(1).max(24).parse(months);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_opportunity_forecast", {
    p_start_date: safeDate,
    p_months: safeMonths,
  });

  if (error) {
    throw new Error(`No fue posible cargar el forecast: ${error.message}`);
  }

  return forecastSchema.parse(data);
}
