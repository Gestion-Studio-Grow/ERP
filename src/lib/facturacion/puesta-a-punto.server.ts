// Lee lo que necesita la puesta a punto (src/lib/facturacion/puesta-a-punto.ts) del negocio de la
// sesión: la ficha fiscal y el certificado (vía el asistente de ARCA, que ya los lee), la clase de
// Factura A y lo facturado en el mes. `tenantId` explícito en cada lectura, además de RLS.
import "server-only";
import { tenantTransaction } from "@/lib/rls";
import { contarFacturasDelMes } from "@/lib/bancos-glue";
import { esDePrueba, LIMITE_FACTURAS_FACTURITA } from "@/lib/facturita-core";
import { leerRegimenFacturaA } from "@/lib/fiscal/regimen-factura-a.server";
import type { VistaDelAsistente } from "@/lib/fiscal/asistente-arca.server";
import { enlaceDeWhatsApp } from "@/lib/facturacion/facturador-core";
import { TEXTO_AVISO_AL_CONTADOR } from "@/lib/facturacion/estados-ux";
import { estadoDePuesta, type PuestaAPunto } from "@/lib/facturacion/puesta-a-punto";

/** El plan con tope mensual de comprobantes (Factoque gratis), el mismo de emision-manual.server.ts. */
const BLUEPRINT_CON_TOPE = "facturita";

export const BASE_PUESTA_A_PUNTO = "/admin/facturacion?vista=arca";

export async function leerPuestaAPunto(tenantId: string, vista: VistaDelAsistente): Promise<PuestaAPunto> {
  const f = vista.entrada.ficha;
  const [regimenFacturaA, usadas, negocio] = await Promise.all([
    f.arcaCondicionIva === "RESPONSABLE_INSCRIPTO" ? leerRegimenFacturaA(tenantId).catch(() => null) : Promise.resolve(null),
    contarFacturasDelMes(tenantId).catch(() => 0),
    tenantTransaction((tx) => tx.tenant.findUnique({ where: { id: tenantId }, select: { blueprintId: true } }), { tenantId }).catch(() => null),
  ]);
  const conTope = negocio?.blueprintId === BLUEPRINT_CON_TOPE;
  return estadoDePuesta({
    cuit: f.arcaCuit,
    condicionIva: f.arcaCondicionIva,
    puntoVenta: f.arcaPuntoVenta,
    puntoVentaDelContador: !!f.delegacion,
    certificado: vista.estado.certificado,
    modoDePrueba: esDePrueba(f.modoArca, f.arcaHomologacion),
    regimenFacturaA,
    mes: { usadas, limite: conTope ? LIMITE_FACTURAS_FACTURITA : null },
    base: BASE_PUESTA_A_PUNTO,
    avisoAlContador: enlaceDeWhatsApp(TEXTO_AVISO_AL_CONTADOR),
    ayuda: vista.soporte,
    planes: conTope ? "/facturita/planes" : null,
  });
}
