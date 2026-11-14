// ============================================================================
// BOTÓN DE ARREPENTIMIENTO Y BOTÓN DE BAJA DE PROFETURNOS — contra Postgres (base efímera, app_rls)
// ============================================================================
//  · Público (sin cuenta) con el usuario del turnero de un profe: registra en SU negocio con la acción
//    `profeturnos.tramite.*`, anota si el email es de un usuario del negocio y no toca el plan.
//  · Público con un usuario que no es de nadie, o de un negocio que no es ProfeTurnos: nada en ninguna base.
//  · Con sesión: pasa por el enganche de T2 (hoy «registrado») y deja la fila; en otro producto, no.
//  · Aislamiento: el trámite de B no deja filas en A.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("trámites de ProfeTurnos: el público sólo registra, con su acción y en su negocio", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const { registrarTramiteProfeturnos, registrarTramiteProfeturnosPublico } = await import("@/lib/profeturnos/tramites.server");
  const duenio = await prismaComoDuenio(base);
  const A = base.a.id;
  const B = base.b.id;
  await duenio.tenant.update({ where: { id: B }, data: { blueprintId: "profe-padel", subdomain: "profe-b", plan: null } });
  const filas = (tenantId: string, action: string) => duenio.auditLog.findMany({ where: { tenantId, action }, orderBy: { createdAt: "asc" } });
  type Cambios = { tramite: string; efecto: string; emailCoincide?: boolean; usuario: string };

  // Público, con el email de la dueña de B: registra en B con la acción de ProfeTurnos.
  const datos = { email: base.b.duenia.email, usuario: "profe-b", motivo: "me mudo" };
  assert.equal(await registrarTramiteProfeturnosPublico("arrepentimiento", "ARR-20261110-PT001", datos), B);
  const arr = await filas(B, "profeturnos.tramite.arrepentimiento");
  assert.equal(arr.length, 1);
  assert.equal(arr[0].channel, "public");
  assert.equal(arr[0].actor, `publico:${base.b.duenia.email}`);
  const c = arr[0].changes as Cambios;
  assert.equal(c.tramite, "ARR-20261110-PT001");
  assert.equal(c.efecto, "registrado");
  assert.equal(c.emailCoincide, true);
  assert.equal((await duenio.tenant.findUniqueOrThrow({ where: { id: B } })).plan, null, "sin sesión no se cambia el plan");
  assert.equal(await duenio.auditLog.count({ where: { action: { startsWith: "factoque." } } }), 0, "no usa la acción de Factoque");

  // Por slug y con un email ajeno: registra igual (no se pierde el pedido) y lo marca para que GSG valide.
  const slugB = (await duenio.tenant.findUniqueOrThrow({ where: { id: B } })).slug;
  assert.equal(await registrarTramiteProfeturnosPublico("baja", "BAJ-20261110-PT002", { ...datos, usuario: slugB, email: "otro@x.com" }), B);
  const baja = await filas(B, "profeturnos.tramite.baja");
  assert.equal(baja.length, 1);
  assert.equal((baja[0].changes as Cambios).emailCoincide, false);

  // Usuario de nadie, o de un negocio que no es ProfeTurnos (A): número igual, ninguna fila.
  const antes = await duenio.auditLog.count();
  assert.equal(await registrarTramiteProfeturnosPublico("baja", "BAJ-20261110-PT003", { ...datos, usuario: "nadie-con-este-usuario" }), null);
  assert.equal(await registrarTramiteProfeturnosPublico("baja", "BAJ-20261110-PT004", { ...datos, usuario: base.a.slug }), null);
  assert.equal(await duenio.auditLog.count(), antes);

  // Con sesión: el enganche de T2 hoy da «registrado» y deja la fila del panel.
  const r = await registrarTramiteProfeturnos("baja", "BAJ-20261110-PT005", datos, { tenantId: B, userId: base.b.duenia.id });
  assert.deepEqual(r, { numero: "BAJ-20261110-PT005", efecto: "registrado", tenantId: B });
  const conSesion = (await filas(B, "profeturnos.tramite.baja")).filter((f) => f.channel === "admin");
  assert.equal(conSesion.length, 1);
  assert.equal(conSesion[0].actor, `user:${base.b.duenia.id}`);

  // Aislamiento: nada de esto quedó en A; y con sesión en un negocio que no es ProfeTurnos, no se registra.
  assert.equal(await duenio.auditLog.count({ where: { tenantId: A, action: { startsWith: "profeturnos." } } }), 0);
  await assert.rejects(
    registrarTramiteProfeturnos("baja", "BAJ-20261110-PT006", datos, { tenantId: A, userId: base.a.duenia.id }),
    /producto ProfeTurnos/,
  );
});
