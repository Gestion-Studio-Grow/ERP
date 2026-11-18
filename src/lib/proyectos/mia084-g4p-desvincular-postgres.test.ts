// ============================================================================
// G4p (MIA-084, NO CUMPLE de la certificación de MIA-083): la cuenta OWNER con su ficha vinculada guardaba la ficha sin
// `vincular`, quedaba desvinculada y, ya sin «lo propio», se fijaba el sueldo base, editaba su liquidación y la publicaba
// (veredicto en Factory-GSG `00-ESTADO/certificacion/GSG-MIA-083-veredicto.md`, «G4p, el detalle de la sonda»).
// Decisión de ORQ-007 (18/11 00:37Z): las puertas quedan cerradas para todos, sin excepción OWNER.
//
// Contra Postgres de verdad (base efímera migrada, rol app_rls sin BYPASSRLS, Server Actions con sesión), con la cuenta
// OWNER del negocio A y su ficha en los dos estados: activa e inactiva. La sonda entera del veredicto, paso por paso:
// ninguna puerta se abre. Control: otra persona de Dirección sí puede desvincularla (lo hace otra persona, como el rol).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const SUELDO = 4_000_000;

async function preparar(t: import("node:test").TestContext, activa: boolean) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const owner = await duenio.user.findUniqueOrThrow({ where: { id: a.duenia.id }, select: { id: true, email: true, role: true } });
  assert.equal(owner.role, "OWNER", "la sonda es con la cuenta OWNER");

  // Una sola vez por base: la ficha de la dueña, otra persona de Dirección y una cuenta suelta (para pasarle la ficha).
  let ficha = await duenio.proyectoPersona.findFirst({ where: { tenantId: a.id, nombre: "Dueña" }, select: { id: true } });
  if (!ficha) {
    const cuenta = (nombre: string) => duenio.user.create({ data: { tenantId: a.id, name: nombre, email: `${nombre.toLowerCase()}@mia084.test`, passwordHash: "x", role: "RECEPTION" }, select: { id: true } });
    const dir = await cuenta("Dir");
    await cuenta("Suelta");
    await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: dir.id, nombre: "Dir", email: "dir@mia084.test", rol: "DIRECCION", sueldoBase: 5_000_000 } });
    ficha = await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: owner.id, nombre: "Dueña", email: owner.email, rol: "DIRECCION", sueldoBase: SUELDO }, select: { id: true } });
  }
  // Cada caso arranca igual: vinculada a la cuenta OWNER, con su sueldo, activa o no, y sin liquidaciones.
  await duenio.proyectoLiquidacion.deleteMany({ where: { tenantId: a.id } });
  await duenio.proyectoPersona.update({ where: { id: ficha.id }, data: { userId: owner.id, sueldoBase: SUELDO, activa } });
  const dir = await duenio.proyectoPersona.findFirstOrThrow({ where: { tenantId: a.id, nombre: "Dir" }, select: { userId: true } });

  const form = (c: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(c)) fd.set(k, v);
    return fd;
  };
  type R = { ok: boolean; error?: string };
  const como = async (userId: string, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: userId } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const gestion = await import("./acciones-gestion");
  const empresa = await import("./acciones-empresa");
  /** La ficha propia tal como la manda la pantalla de Equipo; sin `vincular`, la casilla de la cuenta va destildada. */
  const fichaPropia = (sueldoBase: number, extra: Record<string, string> = {}) =>
    form({ id: ficha.id, nombre: "Dueña", email: owner.email, rol: "DIRECCION", puesto: "", facturaA: "", sueldoBase: String(sueldoBase), ...extra });
  const estado = () => duenio.proyectoPersona.findUniqueOrThrow({ where: { id: ficha.id }, select: { userId: true, sueldoBase: true } });
  const liquidacion = (periodo: string, estadoL: "BORRADOR" | "PUBLICADA") =>
    duenio.proyectoLiquidacion.create({ data: { tenantId: a.id, personaId: ficha.id, periodo, base: SUELDO, total: SUELDO, estado: estadoL }, select: { id: true } });
  const fila = (id: string) => duenio.proyectoLiquidacion.findUniqueOrThrow({ where: { id }, select: { base: true, total: true, estado: true } });
  return { owner, dir: dir.userId!, gestion, empresa, form, como, fichaPropia, estado, liquidacion, fila };
}

for (const activa of [true, false]) {
  const cual = activa ? "activa" : "inactiva";

  test(`G4p · la cuenta OWNER con su ficha ${cual} no se desvincula ni pasa su ficha a otra cuenta, y ninguna puerta se abre`, async (t) => {
    const p = await preparar(t, activa);
    if (!p) return;
    const vinculada = { userId: p.owner.id, sueldoBase: SUELDO };

    // 1. Guardar la ficha propia sin `vincular` (mismo sueldo): era el paso que la desvinculaba.
    const sinVincular = await p.como(p.owner.id, () => p.gestion.guardarPersona(p.fichaPropia(SUELDO)));
    assert.equal(sinVincular.ok, false, `desvincularse: ${JSON.stringify(sinVincular)}`);
    assert.match(String(sinVincular.error), /tu ficha/i, "el rechazo dice por qué");
    assert.match(String(sinVincular.error), /otra persona de Dirección/, "y quién lo hace");
    assert.deepEqual(await p.estado(), vinculada, "la ficha sigue vinculada a la cuenta OWNER");

    // 2. Pasar la ficha propia a otra cuenta del negocio: también deja de ser «lo propio».
    const aOtra = await p.como(p.owner.id, () => p.gestion.guardarPersona(p.fichaPropia(SUELDO, { email: "suelta@mia084.test", vincular: "on" })));
    assert.equal(aOtra.ok, false, `pasarla a otra cuenta: ${JSON.stringify(aOtra)}`);
    assert.deepEqual(await p.estado(), vinculada, "la ficha sigue con la cuenta OWNER");

    // 3. El resto de la sonda, con la ficha todavía suya: el sueldo, editar, publicar y pagar lo propio, frenados.
    const sueldo = await p.como(p.owner.id, () => p.gestion.guardarPersona(p.fichaPropia(9_900_000)));
    assert.equal(sueldo.ok, false, `sueldo propio sin vincular: ${JSON.stringify(sueldo)}`);
    assert.deepEqual(await p.estado(), vinculada, "el sueldo sigue en 4.000.000");

    const borrador = await p.liquidacion("2026-10", "BORRADOR");
    const editar = await p.como(p.owner.id, () => p.empresa.editarExtrasLiquidacion({ id: borrador.id, base: "9900000", manuales: [{ nombre: "Bono", monto: "1000000" }] }));
    assert.equal(editar.ok, false, `editar la propia: ${JSON.stringify(editar)}`);
    const publicar = await p.como(p.owner.id, () => p.empresa.publicarBorradores(p.form({ periodo: "2026-10" })));
    assert.equal(publicar.ok, false, `publicar la propia: ${JSON.stringify(publicar)}`);
    assert.deepEqual(await p.fila(borrador.id), { base: SUELDO, total: SUELDO, estado: "BORRADOR" }, "la liquidación propia no cambió");

    const publicada = await p.liquidacion("2026-09", "PUBLICADA");
    const pagar = await p.como(p.owner.id, () => p.empresa.pagarLiquidacion(p.form({ id: publicada.id, medio: "TRANSFERENCIA", cuenta: "ninguna" })));
    assert.equal(pagar.ok, false, `pagar la propia: ${JSON.stringify(pagar)}`);
    assert.equal((await p.fila(publicada.id)).estado, "PUBLICADA", "sigue sin pagar");

    // 4. Guardar la ficha propia como corresponde (con su cuenta y el mismo sueldo) sigue andando.
    const bien = await p.como(p.owner.id, () => p.gestion.guardarPersona(p.fichaPropia(SUELDO, { vincular: "on" })));
    assert.equal(bien.ok, true, `la ficha propia con su cuenta se guarda: ${JSON.stringify(bien)}`);

    // Control: otra persona de Dirección sí la desvincula (lo propio lo toca otra persona, como el rol).
    const otraDir = await p.como(p.dir, () => p.gestion.guardarPersona(p.fichaPropia(SUELDO)));
    assert.equal(otraDir.ok, true, `otra persona de Dirección: ${JSON.stringify(otraDir)}`);
    assert.deepEqual(await p.estado(), { userId: null, sueldoBase: SUELDO }, "la desvinculó otra persona");
  });
}
