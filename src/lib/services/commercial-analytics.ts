import { createClient } from "@/lib/supabase/client";

export type DashboardFilters = {
  from: string;
  to: string;
  userId?: string | null;
};

export type DashboardExecutive = {
  id: string;
  name: string;
  role: string;
  active: boolean;
};

export type DashboardPipelineStage = {
  stage: string;
  count: number;
  amount: number;
  weighted_amount: number;
  share: number;
};

export type DashboardMonthlyPoint = {
  month: string;
  quoted_amount: number;
  quote_count: number;
  opportunity_count: number;
  won_amount: number;
};

export type DashboardTask = {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  due_at: string;
  is_overdue: boolean;
  contact_id: string | null;
  contact_name: string | null;
  quote_id: string | null;
  quote_number: string | null;
};

export type DashboardOpportunity = {
  id: string;
  name: string;
  stage: string;
  status: string;
  amount: number;
  probability: number;
  priority: string | null;
  temperature: string | null;
  estimated_close_date: string | null;
  next_action: string | null;
  next_action_at: string | null;
  contact_name: string | null;
  company_name: string | null;
  project_name: string | null;
};

export type DashboardClient = {
  contact_id: string;
  contact_name: string | null;
  company_name: string | null;
  quote_count: number;
  opportunity_count: number;
  active_amount: number;
  last_activity_at: string | null;
};

type ValueKpi = {
  value: number;
};

export type CommercialDashboardData = {
  meta: {
    from: string;
    to: string;
    previous_from: string;
    previous_to: string;
    user_id: string | null;
    generated_at: string;
  };
  kpis: {
    quoted_amount: ValueKpi & {
      count: number;
      previous: number;
      change_pct: number | null;
    };
    open_opportunities: ValueKpi & {
      gross_amount: number;
    };
    weighted_pipeline: ValueKpi & {
      gross_amount: number;
    };
    commercial_progress: {
      won: number;
      lost: number;
      total: number;
      rate: number;
    };
    pending_tasks: ValueKpi & {
      next_seven_days: number;
    };
    overdue_tasks: ValueKpi & {
      share: number;
    };
    opportunities_created: ValueKpi & {
      previous: number;
    };
    opportunities_without_next_action: number;
  };
  pipeline: DashboardPipelineStage[];
  monthly_evolution: DashboardMonthlyPoint[];
  upcoming_tasks: DashboardTask[];
  priority_opportunities: DashboardOpportunity[];
  top_clients: DashboardClient[];
  executives: DashboardExecutive[];
  data_quality: {
    quotes_without_company: number;
    formal_closures: number;
  };
};

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDashboard(raw: CommercialDashboardData): CommercialDashboardData {
  return {
    ...raw,
    kpis: {
      quoted_amount: {
        ...raw.kpis.quoted_amount,
        value: numberValue(raw.kpis.quoted_amount.value),
        count: numberValue(raw.kpis.quoted_amount.count),
        previous: numberValue(raw.kpis.quoted_amount.previous),
        change_pct:
          raw.kpis.quoted_amount.change_pct === null
            ? null
            : numberValue(raw.kpis.quoted_amount.change_pct),
      },
      open_opportunities: {
        ...raw.kpis.open_opportunities,
        value: numberValue(raw.kpis.open_opportunities.value),
        gross_amount: numberValue(raw.kpis.open_opportunities.gross_amount),
      },
      weighted_pipeline: {
        ...raw.kpis.weighted_pipeline,
        value: numberValue(raw.kpis.weighted_pipeline.value),
        gross_amount: numberValue(raw.kpis.weighted_pipeline.gross_amount),
      },
      commercial_progress: {
        won: numberValue(raw.kpis.commercial_progress.won),
        lost: numberValue(raw.kpis.commercial_progress.lost),
        total: numberValue(raw.kpis.commercial_progress.total),
        rate: numberValue(raw.kpis.commercial_progress.rate),
      },
      pending_tasks: {
        ...raw.kpis.pending_tasks,
        value: numberValue(raw.kpis.pending_tasks.value),
        next_seven_days: numberValue(raw.kpis.pending_tasks.next_seven_days),
      },
      overdue_tasks: {
        ...raw.kpis.overdue_tasks,
        value: numberValue(raw.kpis.overdue_tasks.value),
        share: numberValue(raw.kpis.overdue_tasks.share),
      },
      opportunities_created: {
        ...raw.kpis.opportunities_created,
        value: numberValue(raw.kpis.opportunities_created.value),
        previous: numberValue(raw.kpis.opportunities_created.previous),
      },
      opportunities_without_next_action: numberValue(
        raw.kpis.opportunities_without_next_action,
      ),
    },
    pipeline: (raw.pipeline ?? []).map((item) => ({
      ...item,
      count: numberValue(item.count),
      amount: numberValue(item.amount),
      weighted_amount: numberValue(item.weighted_amount),
      share: numberValue(item.share),
    })),
    monthly_evolution: (raw.monthly_evolution ?? []).map((item) => ({
      ...item,
      quoted_amount: numberValue(item.quoted_amount),
      quote_count: numberValue(item.quote_count),
      opportunity_count: numberValue(item.opportunity_count),
      won_amount: numberValue(item.won_amount),
    })),
    upcoming_tasks: raw.upcoming_tasks ?? [],
    priority_opportunities: (raw.priority_opportunities ?? []).map((item) => ({
      ...item,
      amount: numberValue(item.amount),
      probability: numberValue(item.probability),
    })),
    top_clients: (raw.top_clients ?? []).map((item) => ({
      ...item,
      quote_count: numberValue(item.quote_count),
      opportunity_count: numberValue(item.opportunity_count),
      active_amount: numberValue(item.active_amount),
    })),
    executives: raw.executives ?? [],
    data_quality: {
      quotes_without_company: numberValue(raw.data_quality.quotes_without_company),
      formal_closures: numberValue(raw.data_quality.formal_closures),
    },
  };
}

export async function getCommercialDashboard(
  filters: DashboardFilters,
): Promise<CommercialDashboardData> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("commercial_dashboard", {
    p_from: filters.from,
    p_to: filters.to,
    p_user_id: filters.userId || null,
  });

  if (error) {
    throw new Error(`Dashboard: ${error.message}`);
  }

  if (!data || typeof data !== "object") {
    throw new Error("Dashboard: la función analítica no devolvió datos válidos.");
  }

  return normalizeDashboard(data as CommercialDashboardData);
}
