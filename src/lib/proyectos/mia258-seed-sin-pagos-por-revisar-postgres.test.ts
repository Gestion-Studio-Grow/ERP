// ============================================================================
// GSG-MIA-258 · el seed de MIA deja las cuotas como las pide la ficha (Postgres de verdad: base efímera migrada, rol
// app_rls sin BYPASSRLS, RLS prendido).
//
// Hallazgo (certificación PR214 v12 · C8): con `seed-mia-producciones` recién corrido, Administración veía en el #4
// «Pagos por revisar · 9 cuotas a proveedores no siguen a la ficha» sin que nadie cambiara un costo. Causa: el seed
// armaba las cuotas con `planDeCuotas` y fechas propias (`en(d.dias)` y `en(l.limite)` llamados otra vez, unos
// milisegundos después de las que guardó en el proyecto y en los ítems). Montos, conceptos y proveedores iguales; el
// vencimiento corrido en milisegundos, y `pagosPorRevisar` compara el vencimiento exacto. No venía de MIA-253: daba 9
// también antes (e5016479).
//
// Contraprueba (K4): un costo cambiado sin rehacer los pagos SÍ prende el cartel.
//
// Sin Postgres local se saltea y lo dice; en CI, falla.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

test("MIA-258 · con el seed de MIA recién corrido, ningún proyecto tiene pagos por revisar; un costo cambiado sí", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  // El seed corre como en la demo local: dueño de las tablas y UNA conexión.
  const seed = spawnSync(process.execPath, ["--import", "tsx", path.join("prisma", "seed-mia-producciones.ts")], {
    env: { ...process.env, DATABASE_URL: base.urlDuenio, SEED_DB_MAX: "1" },
    encoding: "utf8",
    timeout: 240_000,
  });
  assert.equal(seed.status, 0, `el seed falló:\n${(seed.stdout ?? "") + (seed.stderr ?? "")}`.slice(0, 4000));

  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const tenant = await duenio.tenant.findFirstOrThrow({ where: { slug: "mia-producciones" }, select: { id: true } });
  const proyectos = await duenio.proyecto.findMany({ where: { tenantId: tenant.id }, select: { id: true, numero: true }, orderBy: { numero: "asc" } });
  assert.ok(proyectos.some((p) => p.numero === 4), "el seed tiene el #4");

  const gestion = await import("./gestion.server");
  const porRevisar: Record<number, number> = {};
  for (const p of proyectos) porRevisar[p.numero] = await gestion.pagosPorRevisar(tenant.id, p.id);
  assert.deepEqual(Object.entries(porRevisar).filter(([, n]) => n > 0), [], `pagos por revisar con el seed limpio: ${JSON.stringify(porRevisar)}`);

  // K4: alguien sin la plata sube el costo de un ítem del #4 con proveedor (la ficha se guarda, los pagos no se rehacen).
  const p4 = proyectos.find((p) => p.numero === 4)!;
  const item = await duenio.proyectoItem.findFirstOrThrow({ where: { tenantId: tenant.id, presupuesto: { proyectoId: p4.id }, descripcion: { startsWith: "Pantalla LED" } }, select: { id: true, costo: true } });
  await duenio.proyectoItem.update({ where: { id: item.id }, data: { costo: item.costo + 100_000 } });
  assert.equal(await gestion.pagosPorRevisar(tenant.id, p4.id), 2, "el anticipo y el saldo de la pantalla no siguen a la ficha");
});
