// ============================================================================
// GSG-SEG-013 · PORTÓN DE VERDAD del cambio obligatorio de contraseña (ENG-104), contra Postgres con RLS.
//
// «Con User.mustChangePassword = true sólo pasan /admin/cambiar-password y salir.» Antes el único freno era la
// redirección del layout de /admin/(dashboard): una Server Action, una ruta de exportación o /contador corrían
// igual con la contraseña provisoria. Ahora el portón vive en la sesión (`session.ts` / `authz.ts`):
//   · `getCurrentUser()` no devuelve a quien tiene el cambio pendiente (toda pantalla, acción o ruta que lo usa
//     lo trata como sin sesión);
//   · `requireUser()` (y todo `requireCapability` / `requireApp`) lo manda a /admin/cambiar-password;
//   · cambiar la contraseña y salir siguen andando.
// Además (hallazgo 3): si la dueña le fija la clave a una empleada, esa clave es provisoria → flag en true.
//
// Sin Postgres local se saltea con el motivo (en CI falla).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const CAMBIAR = "/admin/cambiar-password";
// Sólo para la prueba: nunca se imprime.
const CLAVE_NUEVA_EMPLEADA = ["otra", "clave", "de", "prueba", "2026"].join("-");

test("con el cambio pendiente: la acción y la ruta rechazan; cambiar la contraseña y salir pasan", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const a = base.a;
  const pedido = { negocio: a, usuario: a.duenia };

  await duenio.user.update({ where: { id: a.duenia.id }, data: { mustChangePassword: true } });
  const hashDeLaEmpleada = async () =>
    (await duenio.user.findUniqueOrThrow({ where: { id: a.recepcion.id }, select: { passwordHash: true } })).passwordHash;
  const hashAntes = await hashDeLaEmpleada();

  const { resetUserPassword } = await import("@/lib/user-actions");
  const { getCurrentUser } = await import("@/lib/session");
  const { GET } = await import("@/app/admin/(dashboard)/facturacion/exportar/route");
  const { changeOwnPassword } = await import("@/lib/change-password-actions");
  const { logout } = await import("@/lib/auth-actions");

  // 1) Server Action de mutación: no corre, va a cambiar la contraseña. La clave de la empleada no se tocó.
  const fd = new FormData();
  fd.set("userId", a.recepcion.id);
  fd.set("password", CLAVE_NUEVA_EMPLEADA);
  const accion = await ejecutarAccion(pedido, () => resetUserPassword(fd));
  assert.equal(accion.tipo, "redireccion");
  assert.equal(accion.tipo === "redireccion" && accion.destino, CAMBIAR);
  assert.equal(await hashDeLaEmpleada(), hashAntes, "la acción no llegó a escribir");

  // 2) Ruta (route handler) con sesión: tampoco.
  const ruta = await ejecutarAccion(pedido, () => GET(new Request(`http://${a.host}/admin/facturacion/exportar`)));
  assert.equal(ruta.tipo, "redireccion");
  assert.equal(ruta.tipo === "redireccion" && ruta.destino, CAMBIAR);

  // 3) Quien usa `getCurrentUser()` directo lo ve sin sesión.
  const yo = await ejecutarAccion(pedido, () => getCurrentUser());
  assert.equal(yo.tipo === "respuesta" && yo.valor, null);

  // 4) Cambiar la contraseña SÍ pasa el portón (con la actual mal, vuelve a su pantalla con el error, no al portón).
  const cambio = new FormData();
  cambio.set("currentPassword", "no-es-la-actual");
  cambio.set("newPassword", "x");
  cambio.set("confirmPassword", "x");
  const intento = await ejecutarAccion(pedido, () => changeOwnPassword(cambio));
  assert.equal(intento.tipo === "redireccion" && intento.destino, `${CAMBIAR}?status=error_current`);

  // 5) Salir también.
  const salir = await ejecutarAccion(pedido, () => logout());
  assert.equal(salir.tipo === "redireccion" && salir.destino, "/admin/login");

  // Control: sin el flag, la misma sesión vuelve a pasar.
  await duenio.user.update({ where: { id: a.duenia.id }, data: { mustChangePassword: false } });
  const yaNo = await ejecutarAccion(pedido, () => getCurrentUser());
  assert.equal(yaNo.tipo === "respuesta" && yaNo.valor && yaNo.valor.id, a.duenia.id);
});

test("la dueña le fija la clave a una empleada: esa clave es provisoria (cambio obligatorio)", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const b = base.b;
  const { resetUserPassword } = await import("@/lib/user-actions");

  const fd = new FormData();
  fd.set("userId", b.recepcion.id);
  fd.set("password", CLAVE_NUEVA_EMPLEADA);
  const r = await ejecutarAccion({ negocio: b, usuario: b.duenia }, () => resetUserPassword(fd));
  assert.equal(r.tipo === "redireccion" && r.destino.includes("ok_password_reset"), true);

  const flag = async (id: string) =>
    (await duenio.user.findUniqueOrThrow({ where: { id }, select: { mustChangePassword: true } })).mustChangePassword;
  assert.equal(await flag(b.recepcion.id), true, "la empleada tiene que cambiarla al entrar");
  assert.equal(await flag(b.duenia.id), false, "a la dueña no se le toca");
});
