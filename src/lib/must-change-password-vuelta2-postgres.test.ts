// ============================================================================
// GSG-SEG-013 · vuelta 2 (refutador) · tres puertas que pasaban por alto el cambio obligatorio de contraseña,
// contra Postgres con RLS (base efímera, src/test/base-efimera.ts). Regla del dueño: «nunca una provisoria sin
// cambio obligatorio», y con el cambio pendiente no hay sesión para nada salvo cambiar la contraseña y salir.
//   1) ALTA: la clave que la dueña fija al crear un usuario es provisoria → el usuario nace con el flag.
//   2) MEDIA: el club crudo (lectura por slug, cliente base) rechaza a quien tiene el cambio pendiente.
//   3) MEDIA (plata): la anulación de un renglón de caja no se autoriza con la clave de un encargado con el
//      cambio pendiente (esa clave la conoce quien la fijó).
// Sin Postgres local se saltea con el motivo (en CI falla).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, CLAVE_DE_PRUEBA } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
// Sólo para la prueba: nunca se imprime.
const CLAVE_DEL_ALTA = ["alta", "de", "prueba", "2026"].join("-");

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  return { base, duenio };
}

test("alta de usuario por la dueña: la clave que ella fija es provisoria (nace con el cambio obligatorio)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const { createUser } = await import("@/lib/user-actions");
  const email = "nueva-empleada@a.test";
  const fd = new FormData();
  fd.set("name", "Nueva Empleada");
  fd.set("email", email);
  fd.set("role", "RECEPTION");
  fd.set("password", CLAVE_DEL_ALTA);
  const r = await ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () => createUser(fd));
  assert.equal(r.tipo === "redireccion" && r.destino.includes("ok_created"), true, JSON.stringify(r));
  const nueva = await duenio.user.findFirstOrThrow({ where: { tenantId: base.a.id, email }, select: { mustChangePassword: true } });
  assert.equal(nueva.mustChangePassword, true, "la empleada nueva tiene que cambiar la clave al entrar");
  const laDuenia = await duenio.user.findUniqueOrThrow({ where: { id: base.a.duenia.id }, select: { mustChangePassword: true } });
  assert.equal(laDuenia.mustChangePassword, false, "a la dueña no se le toca");
});

test("club crudo con la lectura real: con el cambio pendiente no entra; con el cambio hecho, sí", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const { SLUG_DEL_CLUB_CRUDO } = await import("@/lib/club-crudo");
  const { esUsuarioDelClubCrudo } = await import("@/lib/club-crudo.server");
  // El negocio B de la base efímera hace de breakpoint (el club se resuelve por slug fijo).
  await duenio.tenant.update({ where: { id: base.b.id }, data: { slug: SLUG_DEL_CLUB_CRUDO } });
  const uid = base.b.duenia.id;
  await duenio.user.update({ where: { id: uid }, data: { mustChangePassword: true } });
  assert.equal(await esUsuarioDelClubCrudo(uid), false, "con la provisoria pendiente, para el club no hay sesión");
  await duenio.user.update({ where: { id: uid }, data: { mustChangePassword: false } });
  assert.equal(await esUsuarioDelClubCrudo(uid), true, "control: con el cambio hecho, la dueña de breakpoint entra");
});

test("caja: el encargado con el cambio de contraseña pendiente no autoriza la anulación; hecho el cambio, sí", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  await duenio.tenant.update({ where: { id: base.a.id }, data: { blueprintId: "supermercado", modules: ["pos", "caja-rapida"] } });
  const { anularRenglonDeCaja } = await import("@/lib/supermercado/caja-actions");
  const renglon = { nombre: "Gaseosa 2,25 L", cantidad: 1, importe: 4600 };
  const cajera = { negocio: base.a, usuario: base.a.recepcion };
  const autoriza = { email: base.a.duenia.email, clave: CLAVE_DE_PRUEBA };

  await duenio.user.update({ where: { id: base.a.duenia.id }, data: { mustChangePassword: true } });
  const conFlag = await ejecutarAccion(cajera, () => anularRenglonDeCaja({ ticket: "ticket-flag-1", renglon, autoriza }));
  assert.ok(conFlag.tipo === "respuesta" && !conFlag.valor.ok, JSON.stringify(conFlag));
  assert.match(conFlag.tipo === "respuesta" && !conFlag.valor.ok ? conFlag.valor.error : "", /cambiar su clave/);
  const auditadas = await duenio.auditLog.count({ where: { tenantId: base.a.id, entity: "CajaRenglon", entityId: "ticket-flag-1" } });
  assert.equal(auditadas, 0, "no quedó una anulación autorizada por la provisoria");

  await duenio.user.update({ where: { id: base.a.duenia.id }, data: { mustChangePassword: false } });
  const ok = await ejecutarAccion(cajera, () => anularRenglonDeCaja({ ticket: "ticket-flag-1", renglon, autoriza }));
  assert.ok(ok.tipo === "respuesta" && ok.valor.ok && ok.valor.autorizo === base.a.duenia.nombre, JSON.stringify(ok));
});
