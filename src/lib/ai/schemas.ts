import {z} from 'zod';
export const summarySchema=z.object({summary:z.string(),openQuotes:z.array(z.string()),pending:z.array(z.string()),risks:z.array(z.string()),nextAction:z.string()});
export const nextActionSchema=z.object({action:z.string(),priority:z.enum(['baja','media','alta','urgente']),reason:z.string(),channel:z.enum(['llamada','WhatsApp','correo','reunión','visita']),suggestedDate:z.string().nullable(),messageDraft:z.string()});
export const communicationSchema=z.object({subject:z.string().optional(),message:z.string(),tone:z.string(),recordsUsed:z.array(z.string())});
export const assistantSchema=z.object({answer:z.string(),recordsUsed:z.array(z.object({type:z.string(),id:z.string(),label:z.string(),url:z.string()})),suggestedAction:z.string().nullable()});
