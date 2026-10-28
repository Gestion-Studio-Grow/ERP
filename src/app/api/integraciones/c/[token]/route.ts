// POST /api/integraciones/c/{token} — avisos de los conectores con URL por conexión (Mercado
// Pago). token → conexión → negocio, firma con el secreto de ESA conexión, EventoIntegracion
// deduplicado y handler en el contexto del negocio. Toda la lógica: src/integraciones/entrada.server.ts.
// Token desconocido → 404 vacío.
//
// El handler de Mercado Pago (acreditar el pago) se cablea ACÁ y no en `depsDeProduccion`:
// mercadopago-dispatch importa entrada.server, así que al revés sería un ciclo de imports.

import { atenderAvisoPorConexion, depsDeProduccion, type DepsEntrada } from "@/integraciones/entrada.server";
import { manejadorAvisoMP } from "@/lib/mercadopago-dispatch";
import { CLAVE_MERCADOPAGO } from "@/plugins/mercadopago/gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Tope de la función (s). Tiene que quedar por DEBAJO de LEASE_RECIBIDO_MS (entrada.server.ts, 5 min):
// una fila "recibido" de una ejecución todavía viva no se reclama. Lo verifica entrada.test.ts.
export const maxDuration = 120;

/** Los deps de producción con los handlers de los conectores de URL por conexión (no se exporta: Next sólo admite los campos de ruta). */
function depsDeLaRuta(): DepsEntrada {
  const base = depsDeProduccion();
  return { ...base, manejadores: { ...base.manejadores, [CLAVE_MERCADOPAGO]: manejadorAvisoMP() } };
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return atenderAvisoPorConexion(request, token, depsDeLaRuta());
}
