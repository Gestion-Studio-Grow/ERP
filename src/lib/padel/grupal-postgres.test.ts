// ============================================================================
// PADEL-CLASES · E7 (grupal con integrantes) contra Postgres efímero con RLS.
// ============================================================================
//
// Las Server Actions REALES como pedidos de Next al host de cada negocio, con la base como en
// producción (app_rls, RLS enforced). Dos negocios, A y B.
//
//   · Aislamiento: B no cobra, no quita, no suma ni devuelve un integrante de A aunque sepa el id;
//     las filas nacen con el tenant de A.
//   · Plata: dos «Cobré» a la vez sobre la misma parte cobran UNA vez; «Cobrar todo» suma la parte
//     del integrante vinculado; cancelar deja lo pagado a favor de cada integrante (su saldo).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const fechaEn = (n: number) => new Date(Date.now() - 3 * 3_600_000 + n * DIA).toISOString().slice(0, 10);

type Sembrado = Awaited<ReturnType<typeof sembrar>>;
let sembrado: Sembrado | null = null;

async function sembrar(base: BaseEfimera) {
  const db = await prismaComoDuenio(base);
  for (const tenantId of [base.a.id, base.b.id]) {
    await db.padelConfig.create({ data: { tenantId, duracionMin: 60, precioIndividual: 25_000, precioGrupal: 12_000, anticipacionMin: 0, diasAdelante: 14, maxPendientesPorTel: 2 } });
    await db.padelDisponibilidad.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ tenantId, diaSemana: d, desde: "08:00", hasta: "22:00", tipo: "DA" })) });
  }
  const alumno = async (tenantId: string, nombre: string, phone: string, token: string) => {
    const c = await db.client.create({ data: { tenantId, name: nombre, phone } });
    const a = await db.padelAlumno.create({ data: { tenantId, clientId: c.id, token } });
    return { id: a.id, clientId: c.id };
  };
  return {
    db,
    juan: await alumno(base.a.id, "Juan Pérez", "1151111111", "TokenDeJuanGrupalA000001"),
    lucia: await alumno(base.a.id, "Lucía Gómez", "1152222222", "TokenDeLuciaGrupalA00001"),
    pedro: await alumno(base.b.id, "Pedro B", "1153333333", "TokenDePedroGrupalB00001"),
  };
}

async function preparar(t: Parameters<typeof laBase>[0]) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  if (!sembrado) sembrado = await sembrar(base);
  return {
    base,
    s: sembrado,
    profe: await import("@/lib/padel/acciones"),
    grupal: await import("@/lib/padel/acciones-grupal"),
    datos: await import("@/lib/padel/datos.server"),
  };
}

function valor<R>(r: { tipo: string; valor?: R }): R {
  assert.equal(r.tipo, "respuesta", JSON.stringify(r));
  return r.valor as R;
}

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

test("grupal: agendar con integrantes, y B no toca nada de A aunque sepa los ids", async (t) => {
  const ctx = await preparar(t);
  if (!ctx) return;
  const { base, s, profe, grupal } = ctx;
  const enA = { negocio: base.a, usuario: base.a.duenia };
  const enB = { negocio: base.b, usuario: base.b.duenia };

  const integrantes = JSON.stringify([{ alumnoId: s.lucia.id }, { nombre: "Ana Nueva", telefono: "1154444444" }, { nombre: "Beto" }]);
  const r = valor(await ejecutarAccion(enA, () => profe.agendarClase(fd({ fecha: fechaEn(2), hora: "10:00", alumnoId: s.juan.id, tipo: "GRUPAL", integrantes }))));
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.ok && r.integrantes?.length, 3);
  const clase = await s.db.padelClase.findFirstOrThrow({ where: { tenantId: base.a.id, alumnoId: s.juan.id }, include: { integrantes: true } });
  assert.equal(clase.personas, 4);
  assert.equal(Number(clase.precio), 12_000, "el titular paga su parte");
  assert.equal(clase.integrantes.length, 3);
  assert.ok(clase.integrantes.every((i) => i.tenantId === base.a.id && Number(i.monto) === 12_000 && i.pagoEstado === "PENDIENTE"));
  const ana = clase.integrantes.find((i) => i.nombre === "Ana Nueva")!;
  assert.ok(ana.alumnoId, "con celular queda vinculada a un alumno nuevo de A");
  assert.equal((await s.db.padelAlumno.findUniqueOrThrow({ where: { id: ana.alumnoId! } })).tenantId, base.a.id);
  assert.equal(clase.integrantes.find((i) => i.nombre === "Beto")!.alumnoId, null);

  // El titular no puede ser integrante; un alumno de B tampoco entra en una clase de A.
  const titular = valor(await ejecutarAccion(enA, () => profe.agendarClase(fd({ fecha: fechaEn(2), hora: "12:00", alumnoId: s.juan.id, tipo: "GRUPAL", integrantes: JSON.stringify([{ alumnoId: s.juan.id }]) }))));
  assert.equal(titular.ok, false);
  const ajeno = valor(await ejecutarAccion(enA, () => profe.agendarClase(fd({ fecha: fechaEn(2), hora: "13:00", alumnoId: s.juan.id, tipo: "GRUPAL", integrantes: JSON.stringify([{ alumnoId: s.pedro.id }]) }))));
  assert.equal(ajeno.ok, false);

  // B no cobra, no quita, no suma, no avisa ni devuelve en A.
  const lucia = clase.integrantes.find((i) => i.alumnoId === s.lucia.id)!;
  await s.db.padelClase.update({ where: { id: clase.id }, data: { estado: "DADA" } });
  assert.equal(valor(await ejecutarAccion(enB, () => grupal.cobrarIntegrante(lucia.id, "EFECTIVO"))).ok, false);
  assert.equal(valor(await ejecutarAccion(enB, () => grupal.quitarIntegrante(lucia.id))).ok, false);
  assert.equal(valor(await ejecutarAccion(enB, () => grupal.agregarIntegrante(clase.id, { nombre: "Intruso", telefono: "" }))).ok, false);
  assert.equal(valor(await ejecutarAccion(enB, () => grupal.avisarIntegrante(lucia.id))).ok, false);
  assert.equal(valor(await ejecutarAccion(enB, () => grupal.devolverParteIntegrante(lucia.id))).ok, false);
  assert.equal(valor(await ejecutarAccion(enB, () => profe.cobrarTodo(s.lucia.id, "EFECTIVO"))).ok, false);
  const despues = await s.db.padelIntegrante.findUniqueOrThrow({ where: { id: lucia.id } });
  assert.equal(despues.pagoEstado, "PENDIENTE");
  assert.equal(await s.db.padelIntegrante.count({ where: { claseId: clase.id } }), 3);
  assert.equal(await s.db.padelIntegrante.count({ where: { tenantId: base.b.id } }), 0);
});

test("grupal: doble cobro a la vez cobra una vez; Cobrar todo suma la parte; cancelar deja a favor", async (t) => {
  const ctx = await preparar(t);
  if (!ctx) return;
  const { base, s, profe, grupal, datos } = ctx;
  const enA = { negocio: base.a, usuario: base.a.duenia };

  const r = valor(await ejecutarAccion(enA, () => profe.agendarClase(fd({ fecha: fechaEn(3), hora: "18:00", alumnoId: s.juan.id, tipo: "GRUPAL", integrantes: JSON.stringify([{ alumnoId: s.lucia.id }, { nombre: "Carla" }]) }))));
  assert.ok(r.ok, JSON.stringify(r));
  const clase = await s.db.padelClase.findFirstOrThrow({ where: { tenantId: base.a.id, empiezaEn: { gt: new Date(Date.now() + 2.5 * DIA) } }, include: { integrantes: true } });
  const carla = clase.integrantes.find((i) => i.nombre === "Carla")!;
  const lucia = clase.integrantes.find((i) => i.alumnoId === s.lucia.id)!;

  // Dos «Cobré» a la vez sobre la parte de Carla: una sola vez.
  const dos = await Promise.all([
    ejecutarAccion(enA, () => grupal.cobrarIntegrante(carla.id, "EFECTIVO")),
    ejecutarAccion(enA, () => grupal.cobrarIntegrante(carla.id, "TRANSFERENCIA")),
  ]);
  const oks = dos.map((x) => valor(x)).filter((x) => x.ok);
  assert.equal(oks.length, 1, JSON.stringify(dos));
  const carlaPaga = await s.db.padelIntegrante.findUniqueOrThrow({ where: { id: carla.id } });
  assert.equal(carlaPaga.pagoEstado, "PAGADO");
  // Un tercero, ya pagada: no cambia el medio.
  assert.equal(valor(await ejecutarAccion(enA, () => grupal.cobrarIntegrante(carla.id, "MERCADO_PAGO"))).ok, false);
  assert.equal((await s.db.padelIntegrante.findUniqueOrThrow({ where: { id: carla.id } })).pagoMedio, carlaPaga.pagoMedio);
  // Quitar a quien pagó: no.
  assert.equal(valor(await ejecutarAccion(enA, () => grupal.quitarIntegrante(carla.id))).ok, false);

  // Dada: la parte de Lucía es deuda suya; «Cobrar todo» de Lucía la cobra (y dos a la vez, una).
  await s.db.padelClase.update({ where: { id: clase.id }, data: { estado: "DADA" } });
  const deudores = valor(await ejecutarAccion(enA, () => datos.deudores()));
  // Debe dos partes: ésta y la de la grupal del test anterior (también dada, sin pagar).
  assert.equal(deudores.find((d) => d.alumnoId === s.lucia.id)?.total, 24_000);
  const todo = await Promise.all([ejecutarAccion(enA, () => profe.cobrarTodo(s.lucia.id, "EFECTIVO")), ejecutarAccion(enA, () => profe.cobrarTodo(s.lucia.id, "EFECTIVO"))]);
  const okTodo = todo.map((x) => valor(x)).filter((x) => x.ok);
  assert.equal(okTodo.length, 1, JSON.stringify(todo));
  assert.equal(okTodo[0].ok && okTodo[0].total, 24_000);
  assert.equal(okTodo[0].ok && okTodo[0].cantidad, 2);
  assert.equal((await s.db.padelIntegrante.findUniqueOrThrow({ where: { id: lucia.id } })).pagoEstado, "PAGADO");

  // Otra grupal confirmada con Lucía pagada: se cancela → su parte queda a favor (su saldo).
  const r2 = valor(await ejecutarAccion(enA, () => profe.agendarClase(fd({ fecha: fechaEn(4), hora: "18:00", alumnoId: s.juan.id, tipo: "GRUPAL", integrantes: JSON.stringify([{ alumnoId: s.lucia.id }]) }))));
  assert.ok(r2.ok, JSON.stringify(r2));
  const c2 = await s.db.padelClase.findFirstOrThrow({ where: { tenantId: base.a.id, empiezaEn: { gt: new Date(Date.now() + 3.5 * DIA) } }, include: { integrantes: true } });
  assert.ok(valor(await ejecutarAccion(enA, () => grupal.cobrarIntegrante(c2.integrantes[0].id, "TRANSFERENCIA"))).ok);
  const saldoAntes = valor(await ejecutarAccion(enA, () => datos.saldoDelAlumno(base.a.id, s.lucia.id)));
  const cancel = valor(await ejecutarAccion(enA, () => profe.cancelarConMotivo(c2.id, "LLUVIA")));
  assert.ok(cancel.ok, JSON.stringify(cancel));
  assert.equal(cancel.ok && cancel.aFavorIntegrantes, 12_000);
  assert.equal((await s.db.padelIntegrante.findUniqueOrThrow({ where: { id: c2.integrantes[0].id } })).pagoEstado, "ACREDITADO");
  assert.equal(valor(await ejecutarAccion(enA, () => datos.saldoDelAlumno(base.a.id, s.lucia.id))), saldoAntes + 12_000);
  // «Le devolví» esa parte: sale del saldo, una sola vez.
  const dev = await Promise.all([ejecutarAccion(enA, () => profe.devolverSaldo(c2.integrantes[0].id)), ejecutarAccion(enA, () => profe.devolverSaldo(c2.integrantes[0].id))]);
  assert.equal(dev.map((x) => valor(x)).filter((x) => x.ok).length, 1, JSON.stringify(dev));
  assert.equal(valor(await ejecutarAccion(enA, () => datos.saldoDelAlumno(base.a.id, s.lucia.id))), saldoAntes);
});
