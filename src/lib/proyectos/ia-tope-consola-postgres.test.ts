// TOPE DE IA (cert. T4 · 4): con la consola conectada como `app_rls` (como hoy en producción, sin medir:
// ENG-204), fijar el tope FALLA CERRADO con un mensaje que dice qué falta, y no queda nada escrito. La
// migración le deja a `app_rls` sólo SELECT sobre "IaTope". Archivo propio: `operator-db` lee
// OPERATOR_DATABASE_URL al importarse, y ia-tope-postgres.test.ts la apunta al rol dueño.

import { test } from "node:test";
import assert from "node:assert/strict";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

test("tope de IA: la consola como app_rls no puede fijarlo y lo dice", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  prepararAccionesDeServidor();
  apuntarLaAppA(base);
  const tope = await import("./ia-tope.server");
  const duenio = await prismaComoDuenio(base);
  assert.deepEqual(await tope.guardarTopeIA({ tenantId: base.a.id, topeMicroUsd: BigInt(5_000_000), operador: "qa" }), {
    ok: false,
    error: tope.CONSOLA_SIN_PERMISO_TOPE,
  });
  assert.equal(await duenio.iaTope.count(), 0, "no quedó ningún tope");
  assert.equal(await duenio.auditLog.count({ where: { action: "ia_tope_mensual" } }), 0, "ni su auditoría");
});
