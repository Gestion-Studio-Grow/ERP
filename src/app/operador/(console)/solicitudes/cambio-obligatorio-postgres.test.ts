// ============================================================================
// CONFIGURADOR · sin el cambio obligatorio de contraseña activo, el alta FRENA (GSG-SEG-013, hallazgo 4) — Postgres
// ============================================================================
//
// Regla del dueño: nunca una contraseña provisoria sin cambio obligatorio. Si a la base le falta la columna
// `User.mustChangePassword` (migración 20261109120000 sin aplicar), el configurador antes daba el alta igual y
// sólo avisaba «pedile que la cambie al entrar»: la provisoria quedaba válida para siempre. Ahora no crea nada y
// devuelve el mismo mensaje que el reset y el alta de la consola (CAMBIO_OBLIGATORIO_INACTIVO).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const SOPORTE = { nombre: "soporte", esDuenio: false };

test("configurador: sin la columna del cambio obligatorio no se da el alta (ni se emite clave)", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();

  const { operatorPrisma } = await import("@/lib/operator-db");
  const { altaClienteCarteraAction } = await import("@/lib/cartera-actions");
  const conf = await import("@/app/operador/(console)/solicitudes/configurador.server");
  const { CAMBIO_OBLIGATORIO_INACTIVO } = await import("@/lib/must-change-password");
  base.alBorrar(() => operatorPrisma.$disconnect());
  const duenio = await prismaComoDuenio(base);

  // A es el estudio; pide el alta de un cliente nuevo (con la columna todavía puesta: la sesión la lee).
  await duenio.tenant.update({ where: { id: base.a.id }, data: { modules: ["cartera", "clients", "reports"] } });
  const pedido = await ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () =>
    altaClienteCarteraAction({ nombre: "QA Cliente Nuevo", cuit: "20444444445", email: "cliente@ejemplo.test", puntoVenta: "2", condicionIva: "MONOTRIBUTO", tamanio: "chico" }),
  );
  assert.equal(pedido.tipo, "respuesta");
  const solicitud = (await conf.listarSolicitudesPendientes(operatorPrisma)).pedidos.find((s) => s.datos.cuit === "20444444445");
  assert.ok(solicitud, "el pedido llegó a la bandeja");

  await duenio.$executeRawUnsafe(`ALTER TABLE "User" DROP COLUMN "mustChangePassword"`);
  const tenantsAntes = await duenio.tenant.count();
  const usuariosAntes = (await duenio.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "User"`)[0].n;

  const r = await conf.configurarSolicitud(operatorPrisma, {
    estudioTenantId: base.a.id,
    solicitudId: solicitud.id,
    sesion: SOPORTE,
    form: {
      razonSocial: "QA Cliente Nuevo", cuit: "20444444445", condicionIva: "MONOTRIBUTO", puntoVenta: "2",
      rubro: "mostrador", plan: "micro", email: "cliente@ejemplo.test", whatsapp: "", subdominio: "",
    },
  });
  assert.deepEqual(r, { ok: false, error: CAMBIO_OBLIGATORIO_INACTIVO });
  assert.equal(await duenio.tenant.count(), tenantsAntes, "no se creó el negocio");
  assert.equal((await duenio.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "User"`)[0].n, usuariosAntes, "ni ningún usuario");
});
