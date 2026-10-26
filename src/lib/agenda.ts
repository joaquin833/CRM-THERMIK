/**
 * lib/agenda.ts
 * CRM Thermikhaus - Bloque D / D3: API interna de Agenda
 *
 * Requiere la migracion 0042_agenda_foundation.sql.
 * Las cotizaciones vinculadas se consultan como referencia y no se modifican.
 */

import { createClient } from "@/lib/supabase/client";

export const TASK_TYPES = [
  "follow_up",
  "call",
  "meeting",
  "email",
  "visit",
  "quote_review",
  "other",
] as const;

export const TASK_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export const GOOGLE_SYNC_STATUSES = [
  "not_synced",
  "pending",
  "synced",
  "error",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type GoogleSyncStatus = (typeof GOOGLE_SYNC_STATUSES)[number];

export type TaskMetadata = Record<string, unknown>;

export interface AgendaTask {
  id: string;
  title: string;
  description: string | null;
  task_type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  start_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  all_day: boolean;
  assigned_to: string | null;
  created_by: string | null;
  contact_id: string | null;
  company_id: string | null;
  project_id: string | null;
  opportunity_id: string | null;
  quote_id: string | null;
  google_event_id: string | null;
  google_calendar_id: string | null;
  google_sync_status: GoogleSyncStatus;
  google_synced_at: string | null;
  reminder_at: string | null;
  notes: string | null;
  metadata: TaskMetadata;
  created_at: string;
  updated_at: string;
  is_overdue?: boolean;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  task_type?: TaskType;
  status?: TaskStatus;
  priority?: TaskPriority;
  start_at?: string | Date | null;
  due_at?: string | Date | null;
  all_day?: boolean;
  assigned_to?: string | null;
  created_by?: string | null;
  contact_id?: string | null;
  company_id?: string | null;
  project_id?: string | null;
  opportunity_id?: string | null;
  quote_id?: string | null;
  reminder_at?: string | Date | null;
  notes?: string | null;
  metadata?: TaskMetadata;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  task_type?: TaskType;
  status?: TaskStatus;
  priority?: TaskPriority;
  start_at?: string | Date | null;
  due_at?: string | Date | null;
  completed_at?: string | Date | null;
  all_day?: boolean;
  assigned_to?: string | null;
  contact_id?: string | null;
  company_id?: string | null;
  project_id?: string | null;
  opportunity_id?: string | null;
  quote_id?: string | null;
  reminder_at?: string | Date | null;
  notes?: string | null;
  metadata?: TaskMetadata;
}

export interface AgendaFilters {
  search?: string;
  status?: TaskStatus | TaskStatus[];
  task_type?: TaskType | TaskType[];
  priority?: TaskPriority | TaskPriority[];
  assigned_to?: string;
  contact_id?: string;
  company_id?: string;
  project_id?: string;
  opportunity_id?: string;
  quote_id?: string;
  from?: string | Date;
  to?: string | Date;
  overdue?: boolean;
  limit?: number;
  offset?: number;
}

export interface AgendaResult<T> {
  data: T;
  count?: number;
}

const AGENDA_SELECT = "*";

function getSupabase() {
  return createClient();
}

function agendaError(action: string, error: unknown): Error {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "Error desconocido";
  return new Error(`Agenda: no fue posible ${action}. ${message}`);
}

function isValidDate(value: string | Date): boolean {
  return value instanceof Date
    ? !Number.isNaN(value.getTime())
    : !Number.isNaN(new Date(value).getTime());
}

function toIso(value: string | Date | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return value;
  if (!isValidDate(value)) throw new Error("Agenda: se recibio una fecha no valida.");
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function cleanText(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function validateDates(
  startAt?: string | Date | null,
  dueAt?: string | Date | null,
): void {
  if (!startAt || !dueAt) return;
  const start = new Date(startAt).getTime();
  const due = new Date(dueAt).getTime();
  if (due < start) {
    throw new Error("Agenda: la fecha de termino no puede ser anterior al inicio.");
  }
}

function normalizeCreateInput(input: CreateTaskInput) {
  const title = input.title?.trim();
  if (!title) throw new Error("Agenda: el titulo es obligatorio.");
  validateDates(input.start_at, input.due_at);

  return {
    title,
    description: cleanText(input.description) ?? null,
    task_type: input.task_type ?? "follow_up",
    status: input.status ?? "pending",
    priority: input.priority ?? "medium",
    start_at: toIso(input.start_at) ?? null,
    due_at: toIso(input.due_at) ?? null,
    all_day: input.all_day ?? false,
    assigned_to: input.assigned_to ?? null,
    created_by: input.created_by ?? null,
    contact_id: input.contact_id ?? null,
    company_id: input.company_id ?? null,
    project_id: input.project_id ?? null,
    opportunity_id: input.opportunity_id ?? null,
    quote_id: input.quote_id ?? null,
    reminder_at: toIso(input.reminder_at) ?? null,
    notes: cleanText(input.notes) ?? null,
    metadata: input.metadata ?? {},
  };
}

function normalizeUpdateInput(input: UpdateTaskInput) {
  if (input.title !== undefined && !input.title.trim()) {
    throw new Error("Agenda: el titulo no puede quedar vacio.");
  }
  validateDates(input.start_at, input.due_at);

  const payload: Record<string, unknown> = {};
  const directFields: (keyof UpdateTaskInput)[] = [
    "task_type",
    "status",
    "priority",
    "all_day",
    "assigned_to",
    "contact_id",
    "company_id",
    "project_id",
    "opportunity_id",
    "quote_id",
    "metadata",
  ];

  for (const field of directFields) {
    if (input[field] !== undefined) payload[field] = input[field];
  }

  if (input.title !== undefined) payload.title = input.title.trim();
  if (input.description !== undefined) payload.description = cleanText(input.description) ?? null;
  if (input.notes !== undefined) payload.notes = cleanText(input.notes) ?? null;
  if (input.start_at !== undefined) payload.start_at = toIso(input.start_at);
  if (input.due_at !== undefined) payload.due_at = toIso(input.due_at);
  if (input.completed_at !== undefined) payload.completed_at = toIso(input.completed_at);
  if (input.reminder_at !== undefined) payload.reminder_at = toIso(input.reminder_at);

  return payload;
}

function asArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

export async function listAgendaTasks(
  filters: AgendaFilters = {},
): Promise<AgendaResult<AgendaTask[]>> {
  const supabase = getSupabase();
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);

  let query = supabase
    .from("agenda_items")
    .select(AGENDA_SELECT, { count: "exact" })
    .order("due_at", { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[,%()]/g, " ");
    query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%,notes.ilike.%${term}%`);
  }
  if (filters.status) query = query.in("status", asArray(filters.status));
  if (filters.task_type) query = query.in("task_type", asArray(filters.task_type));
  if (filters.priority) query = query.in("priority", asArray(filters.priority));
  if (filters.assigned_to) query = query.eq("assigned_to", filters.assigned_to);
  if (filters.contact_id) query = query.eq("contact_id", filters.contact_id);
  if (filters.company_id) query = query.eq("company_id", filters.company_id);
  if (filters.project_id) query = query.eq("project_id", filters.project_id);
  if (filters.opportunity_id) query = query.eq("opportunity_id", filters.opportunity_id);
  if (filters.quote_id) query = query.eq("quote_id", filters.quote_id);
  if (filters.from) query = query.gte("due_at", toIso(filters.from)!);
  if (filters.to) query = query.lte("due_at", toIso(filters.to)!);
  if (filters.overdue !== undefined) query = query.eq("is_overdue", filters.overdue);

  const { data, error, count } = await query;
  if (error) throw agendaError("listar las actividades", error);
  return { data: (data ?? []) as AgendaTask[], count: count ?? 0 };
}

export async function getAgendaTask(id: string): Promise<AgendaTask> {
  if (!id) throw new Error("Agenda: falta el identificador de la actividad.");
  const { data, error } = await getSupabase()
    .from("agenda_items")
    .select(AGENDA_SELECT)
    .eq("id", id)
    .single();
  if (error) throw agendaError("obtener la actividad", error);
  return data as AgendaTask;
}

export async function createAgendaTask(input: CreateTaskInput): Promise<AgendaTask> {
  const payload = normalizeCreateInput(input);
  const { data, error } = await getSupabase()
    .from("tasks")
    .insert(payload)
    .select(AGENDA_SELECT)
    .single();
  if (error) throw agendaError("crear la actividad", error);
  return data as AgendaTask;
}

export async function updateAgendaTask(
  id: string,
  input: UpdateTaskInput,
): Promise<AgendaTask> {
  if (!id) throw new Error("Agenda: falta el identificador de la actividad.");
  const payload = normalizeUpdateInput(input);
  if (Object.keys(payload).length === 0) return getAgendaTask(id);

  const { data, error } = await getSupabase()
    .from("tasks")
    .update(payload)
    .eq("id", id)
    .select(AGENDA_SELECT)
    .single();
  if (error) throw agendaError("actualizar la actividad", error);
  return data as AgendaTask;
}

export async function completeAgendaTask(id: string): Promise<AgendaTask> {
  return updateAgendaTask(id, {
    status: "completed",
    completed_at: new Date(),
  });
}

export async function reopenAgendaTask(id: string): Promise<AgendaTask> {
  return updateAgendaTask(id, {
    status: "pending",
    completed_at: null,
  });
}

export async function cancelAgendaTask(id: string): Promise<AgendaTask> {
  return updateAgendaTask(id, {
    status: "cancelled",
    completed_at: null,
  });
}

export async function rescheduleAgendaTask(
  id: string,
  dates: Pick<UpdateTaskInput, "start_at" | "due_at" | "reminder_at" | "all_day">,
): Promise<AgendaTask> {
  return updateAgendaTask(id, dates);
}

export async function deleteAgendaTask(id: string): Promise<void> {
  if (!id) throw new Error("Agenda: falta el identificador de la actividad.");
  const { error } = await getSupabase().from("tasks").delete().eq("id", id);
  if (error) throw agendaError("eliminar la actividad", error);
}

export async function listOverdueTasks(
  filters: Omit<AgendaFilters, "overdue"> = {},
): Promise<AgendaResult<AgendaTask[]>> {
  return listAgendaTasks({ ...filters, overdue: true });
}

export async function listTasksForOpportunity(
  opportunityId: string,
): Promise<AgendaTask[]> {
  const result = await listAgendaTasks({ opportunity_id: opportunityId, limit: 500 });
  return result.data;
}

export async function listTasksForContact(contactId: string): Promise<AgendaTask[]> {
  const result = await listAgendaTasks({ contact_id: contactId, limit: 500 });
  return result.data;
}

export async function listTasksForQuote(quoteId: string): Promise<AgendaTask[]> {
  const result = await listAgendaTasks({ quote_id: quoteId, limit: 500 });
  return result.data;
}
