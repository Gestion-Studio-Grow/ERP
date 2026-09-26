// ============================================================================
// LAS GUARDAS DE LA CONSOLA QUE MIRAN OTROS NEGOCIOS, con la conexión de producción (RLS).
// ============================================================================
//
// Una guarda de la consola que decide mirando OTRO negocio y que, con RLS, lee 0 filas no avisa:
// queda desactivada. El ejemplo caro es la red de locales: si la consola no viera que un local ya
// está en la red de otra casa, lo dejaría entrar a dos redes y dos dueñas leerían sus ventas.
// En producción la consola está sujeta a RLS (26/09/2026). Acá la consola es `app_rls`, se
// ejecutan las guardas de verdad (la Server Action de vincular con sesión de operador, y los
// lectores de la ficha) y se mira desde afuera como dueño:
//   · vincular un local que ya está en otra red se rechaza, y no queda escrito nada;
//   · `candidatosEnOtraRed` marca al local de otra red en el formulario;
//   · `leerRedDeLaFicha` ve los locales de la casa y a qué red pertenece un local;
//   · `leerNegocioParaActivar` cuenta los vínculos (el candado de "Mis locales");
//   · `leerFichaDelPase` cuenta los comprobantes de prueba de ESE negocio (la sexta condición);
//   · el cockpit lista todos los negocios (lee sólo `Tenant`, que no tiene RLS).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("guardas de la consola que miran otros negocios, con la consola sujeta a RLS: no quedan desactivadas", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  const antes = { ...env };
  Object.assign(env, {
    // Como producción: la consola NO es la dueña de las tablas.
    OPERATOR_DATABASE_URL: base.urlApp,
    OPERATOR_SECRET: "secreto-de-operador-qa",
    AUTH_SECRET: "secreto-de-auth-qa",
    OPERADOR_DUENIO: "tomas",
    ARCA_MODO: "",
  });
  t.after(() => {
    for (const k of ["OPERATOR_DATABASE_URL", "OPERATOR_SECRET", "AUTH_SECRET", "OPERADOR_DUENIO", "ARCA_MODO"]) {
      if (antes[k] === undefined) delete env[k];
      else env[k] = antes[k];
    }
  });
  prepararAccionesDeServidor();

  const duenio = await prismaComoDuenio(base);
  const { operatorPrisma } = await import("@/lib/operator-db");
  const { createOperatorToken } = await import("@/lib/operator-auth");
  const { vincularLocalAction } = await import("@/lib/operador/red-locales-actions");
  const { candidatosEnOtraRed, leerRedDeLaFicha, leerNegocioParaActivar } = await import(
    "@/app/operador/(console)/tenants/[id]/negocio.server"
  );
  const { leerFichaDelPase } = await import("@/lib/operador/pase-a-real.server");
  const { cargarCockpit } = await import("@/lib/cockpit/datos");
  const { createInvoice } = await import("@/lib/invoice-core");
  const { modoDesdeEnv } = await import("@/plugins/arca");
  const operador = { cookies: { operator_session: await createOperatorToken("tomas") } };
  assert.equal(await operatorPrisma.user.count(), 0, "la conexión de la consola tiene que estar sujeta a RLS");

  // A es la casa de una red; C, otra casa; B, el local.
  const [A, B] = [base.a, base.b];
  await duenio.tenant.update({ where: { id: A.id }, data: { modules: ["multilocal"] } });
  const C = await duenio.tenant.create({ data: { name: "Casa C (prueba)", slug: "casa-c-qa", subdomain: "casa-c", modules: ["multilocal"] } });
  const vincular = (casaId: string, localId: string) => {
    const fd = new FormData();
    fd.set("casaId", casaId);
    fd.set("localId", localId);
    fd.set("alias", "Local B");
    return ejecutarAccion(operador, () => vincularLocalAction(fd));
  };
  const avisoDe = (r: Awaited<ReturnType<typeof vincular>>) => {
    assert.equal(r.tipo, "redireccion", `la acción vuelve a la ficha: ${JSON.stringify(r)}`);
    const q = new URL(r.tipo === "redireccion" ? r.destino : "/", "http://erp.test").searchParams;
    return { ok: q.get("ok"), error: q.get("error") };
  };
  const filasDeLaRed = () =>
    duenio.carteraCliente.findMany({ where: { clienteTenantId: B.id }, select: { tenantId: true, estado: true } });

  await t.test("vincular un local que ya está en otra red se rechaza y no escribe nada", async () => {
    const primero = avisoDe(await vincular(A.id, B.id));
    assert.match(primero.ok ?? "", /es local de/, `sin error: ${primero.error}`);
    assert.deepEqual(await filasDeLaRed(), [{ tenantId: A.id, estado: "activa" }]);
    const auditoriasAntes = await duenio.auditLog.count({ where: { tenantId: { in: [B.id, C.id] } } });

    const segundo = avisoDe(await vincular(C.id, B.id));
    assert.equal(segundo.ok, null);
    assert.match(segundo.error ?? "", /ya es local de «Negocio A \(prueba\)»/);
    assert.deepEqual(await filasDeLaRed(), [{ tenantId: A.id, estado: "activa" }], "el local sigue en UNA sola red");
    assert.equal(await duenio.auditLog.count({ where: { tenantId: { in: [B.id, C.id] } } }), auditoriasAntes);
  });

  await t.test("el formulario marca al local de otra red; la ficha ve la red de la casa y la del local", async () => {
    assert.deepEqual([...(await candidatosEnOtraRed([B.id], C.id))], [[B.id, "Negocio A (prueba)"]]);

    const deLaCasa = await leerRedDeLaFicha(A.id);
    assert.equal(deLaCasa.estado, "ok");
    if (deLaCasa.estado !== "ok") return;
    assert.deepEqual(
      deLaCasa.red.locales.map((l) => ({ id: l.localTenantId, estado: l.estado })),
      [{ id: B.id, estado: "activa" }],
    );
    assert.equal(deLaCasa.red.vinculosActivos, 1);

    const delLocal = await leerRedDeLaFicha(B.id);
    assert.equal(delLocal.estado, "ok");
    if (delLocal.estado !== "ok") return;
    assert.deepEqual(delLocal.red.esLocalDe, [{ id: A.id, name: "Negocio A (prueba)" }]);

    // El candado de "Mis locales": la casa tiene un vínculo activo.
    assert.equal((await leerNegocioParaActivar(A.id))?.vinculosActivos, 1);
    assert.equal((await leerNegocioParaActivar(C.id))?.vinculosActivos, 0);
  });

  await t.test("la ficha del pase a real cuenta los comprobantes de prueba de ESE negocio", async () => {
    await createInvoice({
      tenantId: B.id,
      concepto: 1,
      fecha: "20260924",
      emisor: { cuit: 20111111112, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: 1000,
      iva: [{ alicuotaId: 5, base: 1000, importe: 210 }],
      total: 1210,
      ivaPorProducto: true,
      vencimientoPago: "20260924",
      origin: { type: "MP_PAYMENT" as const, id: "mp_guardas_1" },
    });
    const deB = await leerFichaDelPase(B.id, modoDesdeEnv());
    assert.equal(deB?.comprobantesDePrueba.esperandoCae, 1);
    assert.equal(deB?.comprobantesDePrueba.enviosAbiertos, 1);
    const deA = await leerFichaDelPase(A.id, modoDesdeEnv());
    assert.equal(deA?.comprobantesDePrueba.esperandoCae, 0);
    assert.equal(deA?.comprobantesDePrueba.enviosAbiertos, 0);
  });

  await t.test("el cockpit lista todos los negocios", async () => {
    const cockpit = await cargarCockpit();
    const ids = new Set(cockpit.tenants.map((x) => x.id));
    for (const id of [A.id, B.id, C.id]) assert.ok(ids.has(id), `falta ${id} en el cockpit`);
  });
});
