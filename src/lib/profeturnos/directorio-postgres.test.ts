/**
 * Directorio público de profes contra Postgres de verdad, con la app conectada como `app_rls` y
 * `RLS_ENFORCEMENT=on` (como producción). QA PROFE-004 (13/11): `candidatos` leía `PadelConfig` sin
 * contexto de negocio y, con RLS, volvía vacío: el buscador público quedaba SIEMPRE sin profes,
 * y ningún test lo veía porque todos usaban datos de mentira.
 *
 * Dos negocios de prueba con el módulo de clases:
 *   · A se anotó (`_directorio` visible, zona Canning) y tiene horarios: tiene que aparecer.
 *   · B NO tiene `PadelConfig` (negocio sin config): no aparece y no rompe el armado.
 * El armado corre FUERA de todo contexto de negocio, como en la página pública.
 * Sin Postgres local se saltea diciendo por qué; en CI (job «tests», Postgres con app_rls) falla.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DOMINIO_DE_PRUEBA, apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("directorio con RLS (app_rls): aparece el negocio anotado, no el que no tiene config, sin fuga de datos", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const db = await prismaComoDuenio(base);

  for (const id of [base.a.id, base.b.id]) {
    await db.tenant.update({ where: { id }, data: { status: "ACTIVE", modules: { push: "padel-clases" } } });
  }
  await db.padelConfig.create({
    data: {
      tenantId: base.a.id, duracionMin: 60, precioIndividual: 25_000, anticipacionMin: 120, diasAdelante: 14,
      maxPendientesPorTel: 5, whatsappProfe: "1123456789", plantillas: { _directorio: { visible: true, zona: "Canning" } },
    },
  });
  await db.padelDisponibilidad.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ tenantId: base.a.id, diaSemana: d, desde: "08:00", hasta: "22:00", tipo: "DA" })) });

  const { basePrisma } = await import("@/lib/prisma");
  const { armarDirectorio } = await import("./directorio-core");
  const { depsDirectorio } = await import("./directorio.server");
  assert.equal(await basePrisma.padelConfig.count(), 0, "sin contexto de negocio, app_rls no ve PadelConfig (RLS prendido)");

  const candidatos = await depsDirectorio.candidatos(300);
  assert.deepEqual(candidatos.map((c) => c.tenantId).sort(), [base.a.id, base.b.id].sort(), "los candidatos salen de Tenant (sin RLS)");

  const profes = await armarDirectorio(depsDirectorio, DOMINIO_DE_PRUEBA);
  assert.deepEqual(profes.map((p) => p.clave), [base.a.subdominio], "el anotado aparece; el negocio sin config, no");
  const [a] = profes;
  assert.equal(a.zona, "Canning");
  assert.equal(a.precioIndividual, 25_000);
  assert.ok(a.dias.some((d) => d.horas.length > 0), "con horarios libres de su agenda");
  const publico = JSON.stringify(profes);
  for (const prohibido of [base.a.id, base.b.id, "1123456789"]) {
    assert.equal(publico.includes(prohibido), false, `la tarjeta pública no lleva ${prohibido === "1123456789" ? "el teléfono" : "el id del negocio"}`);
  }

  // Si A se baja, desaparece (el ajuste leído en su negocio decide, no el índice).
  await db.padelConfig.update({ where: { tenantId: base.a.id }, data: { plantillas: { _directorio: { visible: false, zona: "Canning" } } } });
  assert.deepEqual(await armarDirectorio(depsDirectorio, DOMINIO_DE_PRUEBA), []);
});
