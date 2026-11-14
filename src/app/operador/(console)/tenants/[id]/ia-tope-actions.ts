"use server";

// GSG fija, desde la ficha del negocio, el tope mensual de IA paga (Etapa 2 de MIA · T4). Lo decide el dueño;
// el negocio no lo toca. La guardia de operador decide si puede tocar ESE negocio (CH: sólo el dueño de GSG);
// la escritura y su auditoría viven en src/lib/proyectos/ia-tope.server.ts.
import { revalidatePath } from "next/cache";
import { operadorParaNegocio } from "@/lib/operador/guardia-negocio";
import { leerTopeUsd, usd } from "@/lib/proyectos/ia-tope-core";
import { guardarTopeIA } from "@/lib/proyectos/ia-tope.server";

export type ResultadoTopeIA = { ok: true; mensaje: string } | { ok: false; error: string };

export async function guardarTopeIAAction(_previo: ResultadoTopeIA | null, fd: FormData): Promise<ResultadoTopeIA> {
  const tenantId = String(fd.get("tenantId") ?? "").trim();
  const g = await operadorParaNegocio({ id: tenantId });
  if (!g.ok) return { ok: false, error: g.motivo };
  const tope = leerTopeUsd(fd.get("tope"));
  if (tope === null) return { ok: false, error: "Escribí el tope en dólares, por ejemplo 20 o 12,50 (hasta US$ 100.000)." };
  const r = await guardarTopeIA({ tenantId, topeMicroUsd: tope, operador: g.sesion.nombre });
  if (!r.ok) return r;
  revalidatePath(`/operador/tenants/${tenantId}`);
  return { ok: true, mensaje: `Guardado: ${usd(tope)} por mes.` };
}
