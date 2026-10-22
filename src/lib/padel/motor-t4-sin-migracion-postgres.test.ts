// ============================================================================
// TANDA 4 — la app SIN la migración 20261023120000_padel_reingenieria (como producción hoy, Gate 2).
// ============================================================================
//
// Base efímera migrada con todo MENOS esa carpeta (ERP_TEST_SIN_MIGRACIONES) y el cliente de Prisma
// nuevo (que ya conoce las columnas y tablas de la T4). Lo que se prueba:
//   · toda acción nueva contesta «Esta función se habilita cuando se active la actualización de la
//     base», sin tirar y sin escribir nada;
//   · las lecturas nuevas dicen `disponible: false` (o vacío) y las de siempre andan (config con las
//     reglas de fábrica, turnero, ficha);
//   · lo de la T1-T3 que se tocó en la T4 (agendar, dar, cobrar, avisar que no voy) se porta como antes.
// La suite entera de la T1-T3 en esta misma condición: correrla con
//   ERP_TEST_SIN_MIGRACIONES=20261023120000_padel_reingenieria node --import tsx --test src/lib/padel/*-postgres.test.ts
//
//   node --import tsx --test src/lib/padel/motor-t4-sin-migracion-postgres.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { MIGRACION_T4, OMITIR_COLUMNAS_T4, SIN_ACTUALIZACION } from "@/lib/padel/modelo";

const laBase = baseEfimeraDelArchivo({ ...process.env, ERP_TEST_SIN_MIGRACIONES: MIGRACION_T4 });
const H = 3_600_000;
const fechaEn = (n: number) => new Date(Date.now() - 3 * H + n * 86_400_000).toISOString().slice(0, 10);
const aLas = (fecha: string, h: string) => new Date(`${fecha}T${h}:00-03:00`);

function valor<R>(r: { tipo: string; valor?: R }): R {
  assert.equal(r.tipo, "respuesta", JSON.stringify(r));
  return r.valor as R;
}

test("sin la migración: la sonda dice que no; cada acción nueva contesta «se habilita cuando…» sin tirar ni escribir; lo de siempre anda igual", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const db = await prismaComoDuenio(base, { omit: OMITIR_COLUMNAS_T4 });
  // De verdad no está: ni la tabla ni la columna.
  const tablas = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'PadelClub'`;
  assert.equal(tablas[0].n, 0);
  const cols = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'PadelClase' AND column_name = 'pagado'`;
  assert.equal(cols[0].n, 0);

  const tenantId = base.a.id;
  await db.padelConfig.create({ data: { tenantId, duracionMin: 60, precioIndividual: 25_000, precioGrupal: 12_000, anticipacionMin: 120 }, select: { id: true } });
  await db.padelDisponibilidad.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ tenantId, diaSemana: d, desde: "08:00", hasta: "22:00", tipo: "DA" })) });
  const cl = await db.client.create({ data: { tenantId, name: "Juan Viejo", phone: "1156660001" }, select: { id: true } });
  const al = await db.padelAlumno.create({ data: { tenantId, clientId: cl.id, token: "TokenSinMigracionJuan0001" }, select: { id: true } });
  const ayer = fechaEn(-1);
  const dada = (await db.padelClase.create({ data: { tenantId, alumnoId: al.id, clientId: cl.id, empiezaEn: aLas(ayer, "10:00"), terminaEn: aLas(ayer, "11:00"), estado: "CONFIRMADA", confirmadaEl: new Date(), origen: "PROFE", precio: 25_000 }, select: { id: true } })).id;

  const [modelo, profe, alumno, datos, datosModelo, { modeloT4 }] = await Promise.all([
    import("@/lib/padel/acciones-modelo"),
    import("@/lib/padel/acciones"),
    import("@/lib/padel/acciones-alumno"),
    import("@/lib/padel/datos.server"),
    import("@/lib/padel/datos-modelo.server"),
    import("@/lib/padel/modelo.server"),
  ]);
  const duenia = { negocio: base.a, usuario: base.a.duenia };
  const comoA = <R>(fn: () => Promise<R>) => ejecutarAccion(duenia, fn).then(valor);
  assert.equal(await comoA(() => modeloT4()), false);

  const fd = new FormData();
  for (const [k, v] of Object.entries({ fecha: fechaEn(4), hora: "18:00", alumnoId: al.id, clubId: "club-x", tipo: "INDIVIDUAL" })) fd.set(k, v);
  const nuevas: [string, () => Promise<unknown>][] = [
    ["crearClub", () => modelo.crearClub({ nombre: "Club Norte" })],
    ["editarClub", () => modelo.editarClub("x", { nombre: "Club Norte" })],
    ["asignarClubATramo", () => modelo.asignarClubATramo(2, "08:00", "22:00", null)],
    ["chequearTraslado", () => modelo.chequearTraslado(fechaEn(4), "18:00", "x")],
    ["crearSerie", () => modelo.crearSerie({ alumnoId: al.id, diaSemana: 2, hora: "19:00" })],
    ["pausarSerie", () => modelo.pausarSerie("x", fechaEn(10))],
    ["cortarSerie", () => modelo.cortarSerie("x")],
    ["generarSemana", () => modelo.generarSemana()],
    ["avisarSemana", () => modelo.avisarSemana(al.id, fechaEn(3))],
    ["aprobarSerie", () => modelo.aprobarSerie(dada)],
    ["crearPaquete", () => modelo.crearPaquete({ nombre: "Pack 4", clases: 4, precio: 90_000, venceDias: 30 })],
    ["editarPaquete", () => modelo.editarPaquete("x", { nombre: "Pack 4", clases: 4, precio: 90_000, venceDias: 30 })],
    ["venderPaquete", () => modelo.venderPaquete(al.id, "x", "EFECTIVO", "clave-sin-migracion-1")],
    ["cobrarPaquete", () => modelo.cobrarPaquete("x", "EFECTIVO")],
    ["extenderPaquete", () => modelo.extenderPaquete("x", 7)],
    ["cobrarParcial", () => modelo.cobrarParcial(dada, "EFECTIVO", 10_000)],
    ["sumarParticipante", () => modelo.sumarParticipante(dada, { nombre: "Amigo" })],
    ["quitarParticipante", () => modelo.quitarParticipante("x")],
    ["cobrarParticipante", () => modelo.cobrarParticipante("x", "EFECTIVO")],
    ["abrirGrupo", () => modelo.abrirGrupo(dada, 4)],
    ["avisarParticipantes", () => modelo.avisarParticipantes(dada)],
    ["guardarRegla", () => modelo.guardarRegla("tardiaSeCobra", true)],
    ["agendarClase con club", () => profe.agendarClase(fd)],
  ];
  for (const [nombre, fn] of nuevas) {
    const r = (await comoA(fn)) as { ok: boolean; error?: string };
    assert.deepEqual(r, { ok: false, error: SIN_ACTUALIZACION }, nombre);
  }
  const link = { negocio: base.a, headers: { "x-forwarded-for": "198.51.100.77" } };
  const publicas: [string, () => Promise<unknown>][] = [
    ["sumarmeAGrupal", () => alumno.sumarmeAGrupal({ token: "TokenSinMigracionJuan0001" }, dada)],
    ["pedirSerie", () => alumno.pedirSerie("TokenSinMigracionJuan0001", dada)],
  ];
  for (const [nombre, fn] of publicas) {
    assert.deepEqual(await ejecutarAccion(link, fn).then(valor), { ok: false, error: SIN_ACTUALIZACION }, nombre);
  }

  // Las lecturas nuevas: «no disponible», sin tirar.
  assert.deepEqual(await comoA(() => datosModelo.clubes()), { disponible: false, clubes: [] });
  assert.equal((await comoA(() => datosModelo.paquetes())).disponible, false);
  assert.equal((await comoA(() => datosModelo.paquetesDelAlumno(al.id))).disponible, false);
  assert.equal((await comoA(() => datosModelo.series())).disponible, false);
  assert.equal((await comoA(() => datosModelo.participantesDeClase(dada))).disponible, false);
  assert.equal((await comoA(() => datosModelo.cuentasConClubes(aLas(ayer, "00:00"), aLas(fechaEn(30), "00:00")))).disponible, false);
  assert.deepEqual(await ejecutarAccion(link, () => datosModelo.grupalesAbiertas(tenantId)).then(valor), []);

  // Lo de siempre: config con las reglas de fábrica, turnero, agendar sin club, dar, cobrar, avisar que no voy.
  const cfg = await comoA(() => datos.configPadel(tenantId));
  assert.equal(cfg.modeloT4, false);
  assert.deepEqual(cfg.reglas, { ausenteSeCobra: false, tardiaSeCobra: false, confirmarConocidos: true, cierreAutoHoras: 0, recordatorioHora: null, trasladoMinDefault: 0 });
  assert.ok((await ejecutarAccion(link, () => datos.agendaPublica(tenantId)).then(valor)).length > 0, "el turnero anda");
  const sinClub = new FormData();
  for (const [k, v] of Object.entries({ fecha: fechaEn(4), hora: "18:00", alumnoId: al.id, tipo: "INDIVIDUAL" })) sinClub.set(k, v);
  assert.equal(((await comoA(() => profe.agendarClase(sinClub))) as { ok: boolean }).ok, true, "agendar sin club, como siempre");
  assert.equal(((await comoA(() => profe.moverClase(dada, "dar"))) as { ok: boolean }).ok, true);
  assert.equal((await comoA(() => datos.ficha(al.id)))!.debe, 25_000);
  assert.equal(((await comoA(() => profe.cobrar(dada, "EFECTIVO"))) as { ok: boolean }).ok, true);
  assert.equal((await comoA(() => datos.ficha(al.id)))!.debe, 0);
  const hoy = await comoA(() => datos.hoy());
  assert.equal(hoy.config.modeloT4, false);
  const pronto = (await db.padelClase.create({
    data: { tenantId, alumnoId: al.id, clientId: cl.id, empiezaEn: new Date(Date.now() + H), terminaEn: new Date(Date.now() + 2 * H), estado: "CONFIRMADA", confirmadaEl: new Date(), origen: "PROFE", precio: 25_000 },
    select: { id: true },
  })).id;
  const noVoy = await ejecutarAccion(link, () => alumno.avisarNoVoy("TokenSinMigracionJuan0001", pronto)).then(valor);
  assert.deepEqual(noVoy, { ok: true, yaAvisado: false }, "sin la regla (no hay columna): sólo avisa, como antes");
  // Nada de lo nuevo se escribió.
  assert.equal(await db.padelAviso.count({ where: { tenantId, tipo: { in: ["semana", "serie-pedida", "grupal"] } } }), 0);
});
