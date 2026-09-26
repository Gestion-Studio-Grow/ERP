// ============================================================================
// «¿DE QUÉ RED?» CON OTRO CUIT — la prueba en seco y el alta dicen lo mismo (QA vuelta 7, bloqueante 2)
// ============================================================================
//
// En el asistente de alta, con la casa Distribuidora Del Plata (30-71843225-8) y el CUIT 30-71843266-5
// escrito en «¿De qué red?», la prueba en seco respondía «✓ Va a la red…» y «Dar de alta» creaba el
// negocio activo, con usuario y contraseña; recién después la red lo rechazaba por «no es del mismo
// CUIT» y quedaba un negocio suelto (qa-7/p2x-otro-cuit.txt). Acá se ejecutan las acciones reales de
// la consola (sesión de operador de verdad) contra una base efímera con RLS:
//   1. la revisión del paso rechaza otro CUIT con el porqué, y acepta el de la casa;
//   2. el commit con otro CUIT NO crea nada: ni negocio, ni usuario, ni marca.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const CUIT_CASA = "30718432258"; // 30-71843225-8 (Distribuidora Del Plata, QA vuelta 7)
const OTRO_CUIT = "30-71843266-5";

test("la regla del alta en la red, pura: otro CUIT, casa sin CUIT y un local que no puede ser local se rechazan ANTES de crear", async () => {
  const { decidirAltaEnRed } = await import("./multilocal-core");
  const casa = { id: "casa", name: "Distribuidora Del Plata SA", slug: "delplata", modules: ["multilocal"], arcaCuit: CUIT_CASA };
  const local = { name: "Del Plata Otro CUIT", slug: "otrocuit", modules: ["arca"] };
  const base = { casa, casasDeLaCasa: [], requiereOk: () => false, local };

  const otro = decidirAltaEnRed({ ...base, pedido: { cuit: OTRO_CUIT, puntoVenta: "5" } });
  assert.equal(otro.ok, false);
  assert.match(otro.ok ? "" : otro.motivo, /30-71843266-5 no es el de «Distribuidora Del Plata SA» \(30-71843225-8\)/);
  assert.match(otro.ok ? "" : otro.motivo, /No se crea nada/);

  assert.deepEqual(decidirAltaEnRed({ ...base, pedido: { cuit: "", puntoVenta: "5" } }), {
    ok: true,
    casa: "Distribuidora Del Plata SA",
    cuit: CUIT_CASA,
    puntoVenta: 5,
  });
  assert.equal(decidirAltaEnRed({ ...base, pedido: { cuit: "30-71843225-8", puntoVenta: "" } }).ok, true, "el mismo CUIT escrito con guiones");

  const sinCuit = decidirAltaEnRed({ ...base, casa: { ...casa, arcaCuit: null }, pedido: { cuit: "", puntoVenta: "" } });
  assert.match(sinCuit.ok ? "" : sinCuit.motivo, /no tiene CUIT cargado/);

  const estudio = decidirAltaEnRed({ ...base, local: { ...local, modules: ["cartera"] }, pedido: { cuit: "", puntoVenta: "5" } });
  assert.match(estudio.ok ? "" : estudio.motivo, /panel del contador/);

  const casaDeOtra = decidirAltaEnRed({ ...base, casasDeLaCasa: [{ id: "x", name: "Otra red" }], pedido: { cuit: "", puntoVenta: "5" } });
  assert.match(casaDeOtra.ok ? "" : casaDeOtra.motivo, /es local de la red de «Otra red»/);
});

test("QA vuelta 7 · con otro CUIT, la prueba en seco dice que no y «Dar de alta» no crea ningún negocio", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const e = process.env as Record<string, string | undefined>;
  const antes = { AUTH_SECRET: e.AUTH_SECRET, OPERATOR_SECRET: e.OPERATOR_SECRET, OPERADOR_DUENIO: e.OPERADOR_DUENIO };
  Object.assign(e, { AUTH_SECRET: "secreto-de-auth-qa7", OPERATOR_SECRET: "secreto-de-consola-qa7", OPERADOR_DUENIO: "tomas" });
  t.after(() => {
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete e[k];
      else e[k] = v;
    }
  });
  prepararAccionesDeServidor();

  const { operatorPrisma } = await import("@/lib/operator-db");
  const { createOperatorToken } = await import("@/lib/operator-auth");
  const { revisarAltaEnRedAction } = await import("@/lib/operador/red-locales-actions");
  const { commitTenantAction } = await import("@/lib/operator-provisioning-actions");
  base.alBorrar(() => operatorPrisma.$disconnect());

  // La casa: con la red, inscripta, CUIT de Del Plata y su punto de venta 3.
  await operatorPrisma.tenant.update({
    where: { id: base.a.id },
    data: { modules: ["arca", "clients", "reports", "multilocal"], arcaCuit: CUIT_CASA, arcaPuntoVenta: 3, arcaCondicionIva: "RESPONSABLE_INSCRIPTO" },
  });
  const pedido = { cookies: { operator_session: await createOperatorToken("tomas") } };
  const revisar = async (cuit: string, puntoVenta: string) => {
    const fd = new FormData();
    fd.set("casaId", base.a.id);
    fd.set("cuit", cuit);
    fd.set("puntoVenta", puntoVenta);
    fd.set("nombre", "Del Plata Otro CUIT");
    const s = await ejecutarAccion(pedido, () => revisarAltaEnRedAction(fd));
    assert.equal(s.tipo, "respuesta");
    return (s as Extract<typeof s, { tipo: "respuesta" }>).valor;
  };

  // 1. La prueba en seco del paso: con otro CUIT, NO (antes decía «✓ Va a la red…»).
  const conOtro = await revisar(OTRO_CUIT, "5");
  assert.equal(conOtro.ok, false, JSON.stringify(conOtro));
  assert.match(conOtro.ok ? "" : conOtro.motivo, /30-71843266-5 no es el de «/);
  // Con el de la casa (vacío = el de la casa), sí, y con el punto de venta libre.
  assert.deepEqual(await revisar("", "5"), { ok: true, casa: (await operatorPrisma.tenant.findUniqueOrThrow({ where: { id: base.a.id } })).name, cuit: CUIT_CASA, puntoVenta: 5 });
  // El punto de venta de la casa sigue rechazado.
  assert.equal((await revisar("", "3")).ok, false);

  // 2. «Dar de alta» con otro CUIT: el servidor repite la revisión ANTES de crear y no crea nada.
  const slug = "delplata-otrocuit-qa7";
  const negociosAntes = await operatorPrisma.tenant.count();
  const usuariosAntes = await operatorPrisma.user.count();
  const s = await ejecutarAccion(pedido, () =>
    commitTenantAction({
      name: "Del Plata Otro CUIT",
      slug,
      ownerEmail: "otrocuit@delplata.ejemplo.test",
      edicion: "comercio",
      sinCatalogo: true,
      redCasaId: base.a.id,
      redCuit: OTRO_CUIT,
      redPuntoVenta: "5",
    }),
  );
  assert.equal(s.tipo, "respuesta");
  const r = (s as Extract<typeof s, { tipo: "respuesta" }>).valor;
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.match(r.error ?? "", /No se creó ningún negocio/);
  assert.match(r.error ?? "", /30-71843266-5 no es el de «/);
  assert.equal(r.tenantId, undefined);
  assert.equal(await operatorPrisma.tenant.count({ where: { slug } }), 0, "no quedó un negocio suelto");
  assert.equal(await operatorPrisma.tenant.count(), negociosAntes);
  assert.equal(await operatorPrisma.user.count(), usuariosAntes, "ni un usuario con contraseña temporal");

  // 3. Control: con el CUIT de la casa (vacío) el mismo alta SÍ se crea y entra a la red en la corrida.
  const { sumarAltaALaRedAction } = await import("@/lib/operador/red-locales-actions");
  const bien = await ejecutarAccion(pedido, () =>
    commitTenantAction({
      name: "Del Plata Quilmes",
      slug: "delplata-quilmes-qa7",
      ownerEmail: "quilmes@delplata.ejemplo.test",
      edicion: "comercio",
      sinCatalogo: true,
      redCasaId: base.a.id,
      redCuit: "",
      redPuntoVenta: "5",
    }),
  );
  const creado = (bien as Extract<typeof bien, { tipo: "respuesta" }>).valor;
  assert.equal(creado.ok, true, JSON.stringify(creado.error ?? creado.outcome?.failure));
  const fd = new FormData();
  fd.set("casaId", base.a.id);
  fd.set("localId", creado.tenantId!);
  fd.set("alias", "Quilmes");
  fd.set("cuit", "");
  fd.set("puntoVenta", "5");
  const red = await ejecutarAccion(pedido, () => sumarAltaALaRedAction(fd));
  const enRed = (red as Extract<typeof red, { tipo: "respuesta" }>).valor;
  assert.equal(enRed.ok, true, JSON.stringify(enRed));
  const local = await operatorPrisma.tenant.findUniqueOrThrow({ where: { id: creado.tenantId! }, select: { arcaCuit: true, arcaPuntoVenta: true } });
  assert.deepEqual(local, { arcaCuit: CUIT_CASA, arcaPuntoVenta: 5 });
});
