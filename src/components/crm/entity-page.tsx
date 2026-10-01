import { AppShell } from '@/components/app-shell';
import { createEntity, listEntity, type EntityName } from '@/lib/services/crm';
import { revalidatePath } from 'next/cache';

const config = {
  empresas: { title: 'Empresas', fields: [['razon_social','Razón social'],['nombre_fantasia','Nombre de fantasía'],['rut','RUT'],['segmento','Segmento']] },
  contactos: { title: 'Contactos', fields: [['nombre','Nombre'],['apellido','Apellido'],['correo','Correo'],['telefono','Teléfono']] },
  prospectos: { title: 'Prospectos', fields: [['contacto_id','ID contacto'],['empresa_id','ID empresa opcional'],['necesidad_principal','Necesidad principal'],['fuente','Fuente']] },
  proyectos: { title: 'Proyectos', fields: [['nombre','Nombre del proyecto'],['contacto_principal_id','ID contacto principal'],['empresa_id','ID empresa opcional'],['tipo_proyecto','Tipo de proyecto']] },
} as const;

export async function EntityPage({ entity }: { entity: EntityName }) {
  const rows = await listEntity(entity);
  const c = config[entity];
  async function action(formData: FormData) {
    'use server';
    await createEntity(entity, Object.fromEntries(formData));
    revalidatePath(`/${entity}`);
  }
  return <AppShell><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-bold">{c.title}</h1><p className="text-slate-600">Datos persistidos en Supabase y protegidos por RLS.</p></div></div><form action={action} className="mt-6 grid gap-3 rounded-2xl border bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-4">{c.fields.map(([name,label])=><label className="text-sm" key={name}>{label}<input required={name==='razon_social'||name==='nombre'||name==='contacto_id'||name==='contacto_principal_id'||name==='necesidad_principal'} className="mt-1 w-full rounded-lg border p-2" name={name}/></label>)}<button className="rounded-lg bg-brand px-4 py-2 font-semibold text-white md:self-end">Crear registro</button></form><div className="mt-6 overflow-x-auto rounded-2xl border bg-white"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left"><tr>{c.fields.map(([,l])=><th className="p-3" key={l}>{l}</th>)}<th className="p-3">Estado</th></tr></thead><tbody>{rows.map((row: Record<string, unknown>)=><tr className="border-t" key={String(row.id)}>{c.fields.map(([n])=><td className="p-3" key={n}>{String(row[n]??'')}</td>)}<td className="p-3">{String(row.estado??'activo')}</td></tr>)}</tbody></table>{rows.length===0&&<p className="p-6 text-center text-slate-500">Todavía no hay registros.</p>}</div></AppShell>;
}
