"use server";

// Soporte GSG corrige, desde la ficha del negocio, qué Factura A le asignó ARCA (RG 1575). La guardia
// de operador decide si puede tocar ESE negocio; la escritura vive en fiscal/regimen-factura-a.server.ts.
import { revalidatePath } from "next/cache";
import { operadorParaNegocio } from "@/lib/operador/guardia-negocio";
import { CAMPO_CONFIRMA_FACTURA_A_FUERA } from "@/lib/fiscal/regimen-factura-a";
import { corregirRegimenFacturaA } from "@/lib/fiscal/regimen-factura-a.server";
import type { RegimenFacturaA } from "@/lib/fiscal/decidir-comprobante";

export type ResultadoRegimenFacturaA = { ok: true; regimen: RegimenFacturaA } | { ok: false; error: string };

export async function corregirRegimenFacturaAAction(_previo: ResultadoRegimenFacturaA | null, fd: FormData): Promise<ResultadoRegimenFacturaA> {
  const tenantId = String(fd.get("tenantId") ?? "").trim();
  const g = await operadorParaNegocio({ id: tenantId });
  if (!g.ok) return { ok: false, error: g.motivo };
  const r = await corregirRegimenFacturaA({
    tenantId,
    operador: g.sesion.nombre,
    regimen: fd.get("regimen"),
    confirmaFuera: fd.get(CAMPO_CONFIRMA_FACTURA_A_FUERA) === "si",
  });
  if (r.ok) revalidatePath(`/operador/tenants/${tenantId}`);
  return r;
}
