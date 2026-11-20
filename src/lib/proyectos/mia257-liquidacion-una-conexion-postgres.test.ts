// ============================================================================
// GSG-MIA-257 · generarLiquidaciones pregunta por M5 con la conexión de su transacción (Postgres de verdad: base efímera
// migrada, rol app_rls sin BYPASSRLS, RLS prendido).
//
// Hallazgo (informe MIA-254, punto 2): adentro de la transacción del negocio, `hayM5()` se llamaba sin `tx` y salía por el
// cliente global. Si M5 no está aplicada (la respuesta no queda guardada) y el pool tiene UNA conexión (`DB_CONNECTION_LIMIT=1`,
// el arranque de la demo local), esa consulta espera a que la transacción suelte la conexión y la transacción la espera a
// ella: vence y la liquidación no se genera.
//
// Sin Postgres local se saltea y lo dice; en CI, falla.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

test("MIA-257 · sin M5 y con una sola conexión, generar las liquidaciones responde y escribe la del mes", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  // UNA conexión, con la espera por conexión de siempre (10 s), más que los 5 s de la transacción.
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "1" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  // M5 «sin aplicar»: falta una de sus tablas (la base es efímera; se borra al terminar).
  await duenio.$executeRawUnsafe(`ALTER TABLE "ProyectoSaldoAFavor" RENAME TO "ProyectoSaldoAFavor_sin_m5"`);
  const persona = await duenio.proyectoPersona.create({ data: { tenantId: a.id, nombre: "Persona MIA-257", rol: "PRODUCCION", sueldoBase: 500_000 }, select: { id: true } });

  const { generarLiquidaciones } = await import("./acciones-empresa");
  const fd = new FormData();
  fd.set("periodo", "2026-11");
  const desde = Date.now();
  const r = await ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, () => generarLiquidaciones(fd));
  const ms = Date.now() - desde;
  assert.equal(r.tipo, "respuesta", JSON.stringify(r).slice(0, 400));
  const valor = (r as { valor: { ok: boolean; error?: string; generadas?: number } }).valor;
  assert.equal(valor.ok, true, valor.error);
  assert.equal(valor.generadas, 1);
  assert.ok(ms < 4_000, `generar tardó ${ms} ms: algo adentro de la transacción esperó otra conexión`);
  const fila = await duenio.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
    return tx.proyectoLiquidacion.findFirst({ where: { tenantId: a.id, personaId: persona.id, periodo: "2026-11" }, select: { total: true } });
  });
  assert.equal(fila?.total, 500_000, "la liquidación del mes queda escrita con el sueldo base");
});
