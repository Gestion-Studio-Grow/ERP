/**
 * Readiness check del Core — `GET /api/ready`.
 *
 * A diferencia de `/api/health` (SHALLOW, solo liveness del proceso), este endpoint
 * confirma que la app puede REALMENTE atender: hace un `SELECT 1` contra la base. Sirve
 * para el gate de deploy / health-check de plataforma ("¿está listo para recibir
 * tráfico?"). Devuelve 200 `{ready:true}` o **503** `{ready:false}` si la DB no responde
 * — así un balanceador / deploy no manda tráfico a una instancia sin base.
 *
 * Costo $0: un `SELECT 1` es despreciable. Pensado para el chequeo del deploy, NO para un
 * uptime-monitor en loop cerrado (para eso está `/api/health`, sin DB). Usa `basePrisma`
 * (cliente crudo, sin RLS): la readiness es de infraestructura, no depende del tenant.
 *
 * Ya no mira si la conexión del operador ve los envíos de todos los negocios (ENG-027): el cron de
 * ARCA despacha cada envío parado en su negocio con la conexión de la app (arca-dispatch.ts), así
 * que esa condición dejó de importar. Con la consola sujeta a RLS, como en producción, seguiría
 * marcando "no listo" con la facturación encendida aunque el cron ya despacha.
 *
 * MOTOR ARCA (bloque `arca`). Con la base arriba, suma el semáforo del motor de facturación:
 * envíos pendientes, CAE en duda, trabados, rechazos del día y el último CAE obtenido — AGREGADO,
 * sin nombrar negocios (motor-arca.ts). Un motor ARCA en rojo NO pone la instancia en 503: la app
 * sigue pudiendo atender (vender, cobrar, turnos); el semáforo es para la alerta y el runbook
 * (docs/runbooks/facturacion/incidentes.md), no para sacar la instancia del balanceo.
 *
 * El error de la base NO viaja en la respuesta (podía traer host o rol de la conexión): va al log
 * estructurado; la respuesta dice sólo `db-unreachable`.
 */

import { basePrisma } from "@/lib/prisma-base";
import { withRequestId } from "@/lib/request-context";
import { logger } from "@/lib/logger";
import { estadoMotorArca } from "./motor-arca.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRequestId(async () => {
  try {
    await basePrisma.$queryRaw`SELECT 1`;
  } catch (err) {
    logger.error("health.ready", "la base no responde", err);
    return Response.json(
      {
        status: "not-ready",
        error: "db-unreachable",
        ts: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const arca = await estadoMotorArca();
  return Response.json(
    { status: "ready", arca, ts: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
});
