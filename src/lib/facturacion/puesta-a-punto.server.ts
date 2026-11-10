// Lee lo que necesita la puesta a punto (src/lib/facturacion/puesta-a-punto.ts) del negocio de la
// sesión: la ficha fiscal y el certificado (vía el asistente de ARCA, que ya los lee), la clase de
// Factura A y lo facturado en el mes. `tenantId` explícito en cada lectura, además de RLS.
import "server-only";
import { contarFacturasDelMes, fechaFiscalDelDia } from "@/lib/bancos-glue";
import { esDePrueba } from "@/lib/facturita-core";
import { leerPlanFactoque } from "@/lib/facturacion/plan-factoque.server";
import { leerRegimenFacturaA } from "@/lib/fiscal/regimen-factura-a.server";
import type { VistaDelAsistente } from "@/lib/fiscal/asistente-arca.server";
import { enlaceDeWhatsApp } from "@/lib/facturacion/facturador-core";
import { TEXTO_AVISO_AL_CONTADOR } from "@/lib/facturacion/estados-ux";
import { estadoDePuesta, type PuestaAPunto } from "@/lib/facturacion/puesta-a-punto";

export const BASE_PUESTA_A_PUNTO = "/admin/facturacion?vista=arca";

export async function leerPuestaAPunto(tenantId: string, vista: VistaDelAsistente): Promise<PuestaAPunto> {
  const f = vista.entrada.ficha;
  const [regimenFacturaA, usadas, plan] = await Promise.all([
    f.arcaCondicionIva === "RESPONSABLE_INSCRIPTO" ? leerRegimenFacturaA(tenantId).catch(() => null) : Promise.resolve(null),
    contarFacturasDelMes(tenantId).catch(() => 0),
    leerPlanFactoque(tenantId, fechaFiscalDelDia(new Date())).catch(() => null),
  ]);
  // El tope del plan que rige hoy (plan-factoque.server.ts); `null` = no es Factoque, sin tope.
  const conTope = plan !== null;
  return estadoDePuesta({
    cuit: f.arcaCuit,
    condicionIva: f.arcaCondicionIva,
    puntoVenta: f.arcaPuntoVenta,
    puntoVentaDelContador: !!f.delegacion,
    certificado: vista.estado.certificado,
    modoDePrueba: esDePrueba(f.modoArca, f.arcaHomologacion),
    regimenFacturaA,
    mes: { usadas, limite: plan ? plan.cupo.tope : null },
    base: BASE_PUESTA_A_PUNTO,
    avisoAlContador: enlaceDeWhatsApp(TEXTO_AVISO_AL_CONTADOR),
    ayuda: vista.soporte,
    planes: conTope ? "/facturita/planes" : null,
  });
}
