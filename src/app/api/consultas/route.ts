// Entrada pública de consultas de potenciales clientes (el formulario del sitio). Sin sesión: se protege con límite por IP, campo
// trampa contra bots, tope de tamaño y sólo responde en negocios de tipo productora. Qué se hace con la consulta: consultas.server.ts.

import { NextResponse } from "next/server";
import { clientIpFromRequest, createRateLimiter } from "@/lib/rate-limit";
import { runInTenantContext } from "@/lib/tenant-context";
import { registrarConsulta, tenantDeConsultas } from "@/lib/proyectos/consultas.server";

export const dynamic = "force-dynamic";

// 10 cada 10 minutos por IP: alcanza para una oficina que comparte conexión y corta a un bot.
const limitador = createRateLimiter({ max: 10, windowMs: 10 * 60_000 });
const TOPE_BYTES = 20_000;
const json = (cuerpo: Record<string, unknown>, status = 200) => NextResponse.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const clave = `consulta:${clientIpFromRequest(request)}`;
  if (limitador.blocked(clave)) return json({ ok: false, error: "Hiciste varias consultas seguidas. Probá de nuevo en unos minutos." }, 429);
  limitador.fail(clave); // cada pedido cuenta, sea bueno o malo
  if (Number(request.headers.get("content-length") ?? 0) > TOPE_BYTES) return json({ ok: false, error: "El mensaje es demasiado largo." }, 413);

  let campos: Record<string, unknown>;
  try {
    const tipo = request.headers.get("content-type") ?? "";
    campos = tipo.includes("application/json") ? await request.json() : Object.fromEntries((await request.formData()).entries());
  } catch {
    return json({ ok: false, error: "No pudimos leer la consulta." }, 400);
  }
  if (!campos || typeof campos !== "object") return json({ ok: false, error: "No pudimos leer la consulta." }, 400);
  // Campo trampa: una persona no lo ve y no lo llena. Al bot se le dice que salió bien y no se guarda nada.
  if (typeof campos.sitio === "string" && campos.sitio.trim() !== "") return json({ ok: true });

  const tenantId = await tenantDeConsultas(request.headers.get("host"));
  if (!tenantId) return json({ ok: false, error: "No encontramos esta página." }, 404);

  const r = await runInTenantContext(tenantId, async () => await registrarConsulta({ tenantId, canal: "WEB", nombre: campos.nombre, email: campos.email, telefono: campos.telefono, empresa: campos.empresa, texto: campos.mensaje }));
  if (!r.ok) return json({ ok: false, error: r.error }, 400);
  // No se devuelve el id: quien llena el formulario no necesita nada de adentro.
  return json({ ok: true, mensaje: "Recibimos tu consulta. Una persona del equipo te va a contactar." });
}
