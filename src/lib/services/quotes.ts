import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth/authorization';
import { normalizeQuoteNumber } from '@/lib/quote-number';
import { calculateItem } from '@/lib/money';
import { z } from 'zod';

const itemSchema=z.object({descripcion:z.string().trim().min(1),cantidad:z.coerce.number().positive(),unidad:z.string().trim().min(1),valor_unitario_original:z.coerce.number().int().nonnegative(),porcentaje_descuento:z.coerce.number().min(0).max(100).default(0),afecto_iva:z.coerce.boolean().default(true)});
export const newQuoteSchema=z.object({numero_cotizacion:z.string().trim().min(1),oportunidad_id:z.string().uuid(),contacto_id:z.string().uuid(),empresa_id:z.string().uuid().optional().or(z.literal('')),proyecto_id:z.string().uuid().optional().or(z.literal('')),fecha_emision:z.string().date(),fecha_validez:z.string().date().optional().or(z.literal('')),estado:z.string().default('Borrador'),descripcion:z.string().trim().min(1),cantidad:z.coerce.number().positive(),unidad:z.string().trim().min(1),valor_unitario_original:z.coerce.number().int().nonnegative(),porcentaje_descuento:z.coerce.number().min(0).max(100).default(0)});

export async function createQuote(raw: unknown){
 const profile=await requireProfile(['admin','jefatura_comercial','ejecutivo_comercial']); const input=newQuoteSchema.parse(raw); const item=itemSchema.parse(input); const calculated=calculateItem({cantidad:item.cantidad,valorUnitarioOriginal:item.valor_unitario_original,porcentajeDescuento:item.porcentaje_descuento}); const s=await createClient();
 const {data:quote,error}=await s.from('cotizaciones').insert({organization_id:profile.organization_id,numero_cotizacion:input.numero_cotizacion,numero_cotizacion_normalizado:normalizeQuoteNumber(input.numero_cotizacion),oportunidad_id:input.oportunidad_id,contacto_id:input.contacto_id,empresa_id:input.empresa_id||null,proyecto_id:input.proyecto_id||null,fecha_emision:input.fecha_emision,fecha_validez:input.fecha_validez||null,estado:input.estado,ejecutivo_responsable_id:profile.id,created_by:profile.id}).select('id').single();
 if(error) throw new Error(error.code==='23505'?'El N.º de cotización ya existe':error.message);
 const {error:itemError}=await s.from('quote_items').insert({organization_id:profile.organization_id,cotizacion_id:quote.id,posicion:1,descripcion:item.descripcion,cantidad:item.cantidad,unidad:item.unidad,valor_unitario_original:item.valor_unitario_original,porcentaje_descuento:item.porcentaje_descuento,valor_descuento:calculated.valorDescuento,valor_unitario_final:calculated.valorUnitarioFinal,subtotal_neto:calculated.subtotalNeto,afecto_iva:true});
 if(itemError){await s.from('cotizaciones').delete().eq('id',quote.id);throw new Error(itemError.message)} return quote.id;
}

export async function getQuote(id:string){
 const s=await createClient();
 const [{data:quote,error},{data:items,error:itemError},{data:history,error:historyError}]=await Promise.all([
  s.from('cotizaciones').select('*,contactos(nombre,apellido,telefono,correo),empresas(razon_social),proyectos(nombre),oportunidades(nombre,etapa_comercial)').eq('id',id).single(),
  s.from('quote_items').select('*').eq('cotizacion_id',id).order('posicion'),
  s.from('state_history').select('*').eq('entidad_tipo','cotizacion').eq('entidad_id',id).order('created_at',{ascending:false})
 ]);
 if(error)throw error;if(itemError)throw itemError;if(historyError)throw historyError;
 return {...quote,quote_items:items??[],state_history:history??[]};
}
