export type QuoteItemInput = { cantidad: number; valorUnitarioOriginal: number; porcentajeDescuento: number; afectoIva?: boolean };
export function calculateItem(item: QuoteItemInput) {
  if (!Number.isFinite(item.cantidad) || item.cantidad <= 0) throw new Error('Cantidad inválida');
  if (!Number.isInteger(item.valorUnitarioOriginal) || item.valorUnitarioOriginal < 0) throw new Error('Valor unitario inválido');
  if (item.porcentajeDescuento < 0 || item.porcentajeDescuento > 100) throw new Error('Descuento inválido');
  const valorDescuento = Math.round(item.valorUnitarioOriginal * item.porcentajeDescuento / 100);
  const valorUnitarioFinal = item.valorUnitarioOriginal - valorDescuento;
  const subtotalNeto = Math.round(item.cantidad * valorUnitarioFinal);
  return { valorDescuento, valorUnitarioFinal, subtotalNeto, afectoIva: item.afectoIva ?? true };
}
export function calculateTotals(items: QuoteItemInput[]) {
  const calculated = items.map(calculateItem);
  const netoAfecto = calculated.filter(x => x.afectoIva).reduce((a,x)=>a+x.subtotalNeto,0);
  const netoExento = calculated.filter(x => !x.afectoIva).reduce((a,x)=>a+x.subtotalNeto,0);
  const iva = Math.round(netoAfecto * 0.19);
  return { netoAfecto, netoExento, iva, total: netoAfecto + netoExento + iva };
}
export const clp = (value: number) => new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(value);
