/**
 * API interna de Agenda del CRM Thermikhaus.
 * Requiere 0042_agenda_foundation.sql y el cliente ubicado en
 * src/lib/supabase/client.ts.
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
export const GOOGLE_SYNC_STATUSES = ["not_synced", "pending", "synced", "error"] as const;

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

export interface UpdateTaskInput extends Partial<CreateTaskInput> {
  completed_at?: string | Date | null;
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
  count: number;
}

function getSupabase() {
  return createClient();
}

function formatError(action: string, error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "Error desconocido";
  return new Error(`Agenda: no fue posible ${action}. ${message}`);
}

function toIso(value: string | Date | null | undefined) {
  if (value === null || value === undefined) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Agenda: fecha no valida.");
  return date.toISOString();
}

function cleanText(value: string | null | undefined) {
  if (value === undefined || value === null) return value;
  return value.trim() || null;
}

function validateDates(start?: string | Date | null, due?: string | Date | null) {
  if (start && due && new Date(due).getTime() < new Date(start).getTime()) {
    throw new Error("Agenda: la fecha de termino no puede ser anterior al inicio.");
  }
}

function asArray<T>(value: T | T[]) {
  return Array.isArray(value) ? value : [value];
}

function normalizeCreate(input: CreateTaskInput) {
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

function normalizeUpdate(input: UpdateTaskInput) {
  if (input.title !== undefined && !input.title.trim()) {
    throw new Error("Agenda: el titulo no puede quedar vacio.");
  }
  validateDates(input.start_at, input.due_at);

  const payload: Record<string, unknown> = {};
  const direct = [
    "task_type", "status", "priority", "all_day", "assigned_to",
    "created_by", "contact_id", "company_id", "project_id",
    "opportunity_id", "quote_id", "metadata",
  ] as const;

  for (const field of direct) {
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

export async function listAgendaTasks(filters: AgendaFilters = {}): Promise<AgendaResult<AgendaTask[]>> {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);
  let query = getSupabase()
    .from("agenda_items")
    .select("*", { count: "exact" })
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
  if (error) throw formatError("listar las actividades", error);
  return { data: (data ?? []) as AgendaTask[], count: count ?? 0 };
}

export async function getAgendaTask(id: string): Promise<AgendaTask> {
  if (!id) throw new Error("Agenda: falta el identificador.");
  const { data, error } = await getSupabase().from("agenda_items").select("*").eq("id", id).single();
  if (error) throw formatError("obtener la actividad", error);
  return data as AgendaTask;
}

export async function createAgendaTask(input: CreateTaskInput): Promise<AgendaTask> {
  const { data, error } = await getSupabase().from("tasks").insert(normalizeCreate(input)).select("*").single();
  if (error) throw formatError("crear la actividad", error);
  return data as AgendaTask;
}

export async function updateAgendaTask(id: string, input: UpdateTaskInput): Promise<AgendaTask> {
  if (!id) throw new Error("Agenda: falta el identificador.");
  const payload = normalizeUpdate(input);
  if (!Object.keys(payload).length) return getAgendaTask(id);
  const { data, error } = await getSupabase().from("tasks").update(payload).eq("id", id).select("*").single();
  if (error) throw formatError("actualizar la actividad", error);
  return data as AgendaTask;
}

export function completeAgendaTask(id: string) {
  return updateAgendaTask(id, { status: "completed", completed_at: new Date() });
}

export function reopenAgendaTask(id: string) {
  return updateAgendaTask(id, { status: "pending", completed_at: null });
}

export function cancelAgendaTask(id: string) {
  return updateAgendaTask(id, { status: "cancelled", completed_at: null });
}

export function rescheduleAgendaTask(
  id: string,
  dates: Pick<UpdateTaskInput, "start_at" | "due_at" | "reminder_at" | "all_day">,
) {
  return updateAgendaTask(id, dates);
}

export async function deleteAgendaTask(id: string): Promise<void> {
  if (!id) throw new Error("Agenda: falta el identificador.");
  const { error } = await getSupabase().from("tasks").delete().eq("id", id);
  if (error) throw formatError("eliminar la actividad", error);
}

export function listOverdueTasks(filters: Omit<AgendaFilters, "overdue"> = {}) {
  return listAgendaTasks({ ...filters, overdue: true });
}

export async function listTasksForOpportunity(opportunityId: string) {
  return (await listAgendaTasks({ opportunity_id: opportunityId, limit: 500 })).data;
}

export async function listTasksForContact(contactId: string) {
  return (await listAgendaTasks({ contact_id: contactId, limit: 500 })).data;
}

export async function listTasksForQuote(quoteId: string) {
  return (await listAgendaTasks({ quote_id: quoteId, limit: 500 })).data;
}
