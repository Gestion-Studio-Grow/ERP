// ENVÍOS CONTRA POSTGRES — con el rol de la app (app_rls, sin BYPASSRLS) y RLS encendido.
//
// Base efímera propia (src/test/base-efimera.ts) con los negocios A y B del arnés. Se ejecutan las
// acciones REALES con la sesión de sus usuarios (src/test/accion-de-servidor.ts):
//   · la dueña de A guarda zonas, mínimo y retiro: una fila ConfigEnvios con el tenantId de A;
//   · guardar con la versión vieja choca y no escribe; la recepción no puede configurar;
//   · pausar la tienda conserva las zonas;
//   · AISLAMIENTO (MG-037): con el negocio de B, ni pidiendo el id de A se ve la config de A;
//     B guarda la suya sin tocar la de A.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  return { base, duenio };
}

const zonasMagra = [
  { id: "barrios", nombre: "Canning – barrios cerrados", costo: "4.000", gratisDesde: "60.000", franjas: "L-S 11-13; L-S 17-19" },
  { id: "centro", nombre: "Canning centro", costo: "3.000", gratisDesde: "50.000", franjas: "" },
];
const configA = { retiroEnLocal: true, horarioRetiro: "Lun a sáb 9–19", pedidoMinimoEnvio: "20.000", zonas: zonasMagra, franjasRetiro: "", tiendaPausada: null };

test("A guarda sus envíos, el choque de versión no pisa, la recepción no configura y pausar conserva las zonas", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const { guardarConfigEnvios, pausarTienda } = await import("./acciones");
  const sesion = { negocio: base.a, usuario: base.a.duenia };

  const r1 = await ejecutarAccion(sesion, () => guardarConfigEnvios({ config: configA, version: null }));
  assert.ok(r1.tipo === "respuesta" && r1.valor.ok, JSON.stringify(r1));
  const v1 = r1.tipo === "respuesta" && r1.valor.ok ? r1.valor.version : "";
  const filas = await duenio.auditLog.findMany({ where: { entity: "ConfigEnvios" } });
  assert.equal(filas.length, 1);
  assert.equal(filas[0].tenantId, base.a.id);
  assert.equal(filas[0].entityId, base.a.id);
  assert.equal(filas[0].id, v1);

  // Segunda pantalla abierta en "nunca guardado": choca.
  const choque = await ejecutarAccion(sesion, () => guardarConfigEnvios({ config: { ...configA, pedidoMinimoEnvio: "1" }, version: null }));
  assert.ok(choque.tipo === "respuesta" && !choque.valor.ok && /Otra persona cambió los envíos/.test(choque.valor.error), JSON.stringify(choque));
  assert.equal(await duenio.auditLog.count({ where: { entity: "ConfigEnvios" } }), 1);

  // La recepción no configura envíos.
  const recep = await ejecutarAccion({ negocio: base.a, usuario: base.a.recepcion }, () => guardarConfigEnvios({ config: configA, version: v1 }));
  assert.ok(recep.tipo !== "respuesta" || !recep.valor.ok, JSON.stringify(recep));
  assert.equal(await duenio.auditLog.count({ where: { entity: "ConfigEnvios" } }), 1);

  // Pausar sólo cambia la pausa.
  const pausa = await ejecutarAccion(sesion, () => pausarTienda({ pausar: true, mensaje: "Hoy no tomamos pedidos por la web", version: v1 }));
  assert.ok(pausa.tipo === "respuesta" && pausa.valor.ok, JSON.stringify(pausa));
  const { leerConfigEnvios } = await import("./config");
  const { prisma } = await import("@/lib/prisma");
  const e = process.env as Record<string, string | undefined>;
  e.FORCE_TENANT_SLUG = base.a.slug;
  try {
    const leida = await leerConfigEnvios(prisma, base.a.id);
    assert.deepEqual(leida.tiendaPausada, { mensaje: "Hoy no tomamos pedidos por la web" });
    assert.deepEqual(leida.zonas.map((z) => [z.nombre, z.costo, z.gratisDesde]), [
      ["Canning – barrios cerrados", 4000, 60000],
      ["Canning centro", 3000, 50000],
    ]);
    assert.equal(leida.pedidoMinimoEnvio, 20000);
  } finally {
    delete e.FORCE_TENANT_SLUG;
  }
});

test("aislamiento: B no ve la configuración de A (ni con el id de A) y guarda la suya sin tocarla (MG-037)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const { leerConfigEnvios } = await import("./config");
  const { guardarConfigEnvios } = await import("./acciones");
  const { prisma } = await import("@/lib/prisma");
  const versionDeA = (await duenio.auditLog.findFirst({ where: { tenantId: base.a.id, entity: "ConfigEnvios" }, orderBy: { createdAt: "desc" } }))?.id ?? null;
  if (!versionDeA) {
    const r = await ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () => guardarConfigEnvios({ config: configA, version: null }));
    assert.ok(r.tipo === "respuesta" && r.valor.ok);
  }
  const filasDeA = await duenio.auditLog.count({ where: { tenantId: base.a.id, entity: "ConfigEnvios" } });

  const e = process.env as Record<string, string | undefined>;
  e.FORCE_TENANT_SLUG = base.b.slug;
  try {
    assert.equal((await leerConfigEnvios(prisma, base.b.id)).version, null);
    // Aunque se le pase el id de A: el candado y RLS no dejan ver su fila.
    const conIdDeA = await leerConfigEnvios(prisma, base.a.id);
    assert.equal(conIdDeA.version, null);
    assert.deepEqual(conIdDeA.zonas, []);
  } finally {
    delete e.FORCE_TENANT_SLUG;
  }

  // B guarda lo suyo (sin zonas, con retiro): su fila es de B y A queda igual.
  const r = await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () =>
    guardarConfigEnvios({ config: { retiroEnLocal: true, zonas: [], franjasRetiro: "", tiendaPausada: null }, version: null }),
  );
  assert.ok(r.tipo === "respuesta" && r.valor.ok, JSON.stringify(r));
  assert.equal(await duenio.auditLog.count({ where: { tenantId: base.b.id, entity: "ConfigEnvios" } }), 1);
  assert.equal(await duenio.auditLog.count({ where: { tenantId: base.a.id, entity: "ConfigEnvios" } }), filasDeA);
});
