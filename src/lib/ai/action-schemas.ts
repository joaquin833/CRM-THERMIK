import { z } from "zod";

const taskType = z.enum([
  "follow_up",
  "call",
  "meeting",
  "email",
  "visit",
  "quote_review",
  "other",
]);

const priority = z.enum(["low", "medium", "high", "urgent"]);

export const proposedActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_task"),
    requiresConfirmation: z.literal(true),
    label: z.string().min(3).max(120),
    payload: z.object({
      title: z.string().min(3).max(160),
      description: z.string().max(2000).nullable().default(null),
      task_type: taskType,
      priority,
      start_at: z.string().datetime({ offset: true }),
      due_at: z.string().datetime({ offset: true }),
      reminder_at: z.string().datetime({ offset: true }).nullable().default(null),
      all_day: z.boolean().default(false),
      contact_id: z.string().uuid().nullable().default(null),
      company_id: z.string().uuid().nullable().default(null),
      project_id: z.string().uuid().nullable().default(null),
      opportunity_id: z.string().uuid().nullable().default(null),
      quote_id: z.string().uuid().nullable().default(null),
      relations: z.object({
        contact_name: z.string().max(200).nullable().default(null),
        company_name: z.string().max(200).nullable().default(null),
        project_name: z.string().max(200).nullable().default(null),
        opportunity_name: z.string().max(200).nullable().default(null),
        quote_number: z.string().max(100).nullable().default(null),
      }).default({
        contact_name: null,
        company_name: null,
        project_name: null,
        opportunity_name: null,
        quote_number: null,
      }),
    }),
  }),
  z.object({
    type: z.literal("reschedule_task"),
    requiresConfirmation: z.literal(true),
    label: z.string().min(3).max(120),
    payload: z.object({
      task_id: z.string().uuid(),
      start_at: z.string().datetime({ offset: true }),
      due_at: z.string().datetime({ offset: true }),
      reminder_at: z.string().datetime({ offset: true }).nullable().default(null),
      all_day: z.boolean().default(false),
    }),
  }),
]);

export const executeActionSchema = proposedActionSchema;
export type ProposedAIAction = z.infer<typeof proposedActionSchema>;
