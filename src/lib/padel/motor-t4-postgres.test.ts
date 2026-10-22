// ============================================================================
// TANDA 4 — el modelo nuevo con las ACCIONES REALES contra Postgres + RLS, CON la migración
// 20261023120000_padel_reingenieria aplicada (base efímera; nunca Neon).
// ============================================================================
//
// Dos negocios A y B en la misma base, rol app_rls (RLS forzado) y la sesión de la dueña o el link del
// alumno. Cada test es un criterio de aceptación de la T4 (matias-DISENO.md §5.5):
//   M-113 RLS: B no ve clubes, series, paquetes ni participantes de A (ni por la base ni por acciones).
//   M-115/116/117/130 turnos fijos · M-118/119 paquetes · M-120/121/122 grupales · M-123 traslado ·
//   M-124 pago parcial · M-125 tardía se cobra · la cuenta con el club y el margen.
// La misma app SIN la migración: `motor-t4-sin-migracion-postgres.test.ts`.
//
//   node --import tsx --test src/lib/padel/motor-t4-postgres.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const H = 3_600_000;
const hoyAr = () => new Date(Date.now() - 3 * H).toISOString().slice(0, 10);
const fechaEn = (n: number) => new Date(Date.now() - 3 * H + n * DIA).toISOString().slice(0, 10);
const aLas = (fecha: string, h: string) => new Date(`${fecha}T${h}:00-03:00`);
const diaDe = (f: string) => new Date(`${f}T12:00:00Z`).getUTCDay();
/** El próximo `dia` (0 = domingo) a 3 días o más (lejos de la anticipación de 2 h). */
const proximo = (dia: number) => {
  for (let n = 3; n < 11; n++) if (diaDe(fechaEn(n)) === dia) return fechaEn(n);
  throw new Error("sin fecha");
};

let sembrado: Awaited<ReturnType<typeof sembrar>> | null = null;

async function sembrar(base: BaseEfimera) {
  const db = await prismaComoDuenio(base);
  for (const tenantId of [base.a.id, base.b.id]) {
    await db.padelConfig.create({ data: { tenantId, duracionMin: 60, precioIndividual: 25_000, precioGrupal: 12_000, anticipacionMin: 120, diasAdelante: 14, maxPendientesPorTel: 5 }, select: { id: true } });
    await db.padelDisponibilidad.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ tenantId, diaSemana: d, desde: "08:00", hasta: "22:00", tipo: "DA" })) });
  }
  return { db };
}

async function preparar(t: Parameters<typeof laBase>[0]) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env, { DB_CONNECTION_LIMIT: "6", DB_CONNECT_TIMEOUT_MS: "5000" });
  if (!sembrado) sembrado = await sembrar(base);
  const [alumno, profe, modelo, datos, datosModelo] = await Promise.all([
    import("@/lib/padel/acciones-alumno"),
    import("@/lib/padel/acciones"),
    import("@/lib/padel/acciones-modelo"),
    import("@/lib/padel/datos.server"),
    import("@/lib/padel/datos-modelo.server"),
  ]);
  return { base, db: sembrado.db, alumno, profe, modelo, datos, datosModelo };
}
type Ctx = NonNullable<Awaited<ReturnType<typeof preparar>>>;

function valor<R>(r: { tipo: string; valor?: R }): R {
  assert.equal(r.tipo, "respuesta", JSON.stringify(r));
  return r.valor as R;
}
type Res = { ok: boolean; error?: string };
/** La acción salió bien: devuelve la rama `ok: true` (con sus campos). */
function ok<R extends { ok: boolean }>(r: R, msg?: string): Extract<R, { ok: true }> {
  assert.equal(r.ok, true, msg ?? JSON.stringify(r));
  return r as Extract<R, { ok: true }>;
}
const falla = (r: { ok: boolean }, re: RegExp) => (assert.equal(r.ok, false, JSON.stringify(r)), assert.match(String((r as { error?: string }).error), re));
let n = 0;
const ip = () => ({ "x-forwarded-for": `198.51.100.${(n++ % 250) + 1}` });
const duenia = (c: Ctx) => ({ negocio: c.base.a, usuario: c.base.a.duenia });
const dueniaB = (c: Ctx) => ({ negocio: c.base.b, usuario: c.base.b.duenia });
const comoA = <R>(c: Ctx, fn: () => Promise<R>) => ejecutarAccion(duenia(c), fn).then(valor);
const link = (c: Ctx) => ({ negocio: c.base.a, headers: ip() });

let alumnos = 0;
async function nuevoAlumno(c: Ctx, nombre: string, tenantId = c.base.a.id) {
  alumnos++;
  const cl = await c.db.client.create({ data: { tenantId, name: nombre, phone: `11570${String(10000 + alumnos)}` }, select: { id: true, phone: true } });
  const token = `TokenMotorT4Alumno${String(alumnos).padStart(8, "0")}`;
  const a = await c.db.padelAlumno.create({ data: { tenantId, clientId: cl.id, token }, select: { id: true } });
  return { id: a.id, clientId: cl.id, token, telefono: cl.phone };
}

async function clase(c: Ctx, al: { id: string; clientId: string }, fecha: string, h: string, estado: string, extra: Record<string, unknown> = {}) {
  return (await c.db.padelClase.create({
    data: { tenantId: c.base.a.id, alumnoId: al.id, clientId: al.clientId, empiezaEn: aLas(fecha, h), terminaEn: new Date(aLas(fecha, h).getTime() + H), estado, origen: "PROFE", precio: 25_000, ...(estado !== "PEDIDA" ? { confirmadaEl: new Date() } : {}), ...extra },
    select: { id: true },
  })).id;
}
const fila = (c: Ctx, id: string) =>
  c.db.padelClase.findUniqueOrThrow({ where: { id }, select: { estado: true, pagoEstado: true, pagoMedio: true, precio: true, pagado: true, paqueteAlumnoId: true, motivoCancel: true, seCobra: true, clubId: true, costoCancha: true, serieId: true, pagoValidadoEl: true } });

/** Cuenta filas de una tabla de A con el rol de la app (RLS forzado) y el negocio `como` puesto. */
async function contarComo(base: BaseEfimera, tabla: string, como: string, dueno: string): Promise<number> {
  const cli = new pg.Client({ connectionString: base.urlApp });
  await cli.connect();
  try {
    await cli.query("BEGIN");
    await cli.query("SELECT set_config('app.current_tenant_id', $1, true)", [como]);
    const r = await cli.query(`SELECT count(*)::int AS n FROM "${tabla}" WHERE "tenantId" = $1`, [dueno]);
    await cli.query("ROLLBACK");
    return r.rows[0].n as number;
  } finally {
    await cli.end();
  }
}

test("M-113 (en la base): la sonda ve la migración; B no ve clubes, series, paquetes ni participantes de A — ni por RLS ni por las acciones", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const { modeloT4 } = await import("@/lib/padel/modelo.server");
  assert.equal(await ejecutarAccion(duenia(c), () => modeloT4()).then(valor), true);
  const juan = await nuevoAlumno(c, "Juan Aislado");
  const club = ok(await comoA(c, () => c.modelo.crearClub({ nombre: "Club Norte A", trasladoMin: 20, costoCancha: 8_000, modoCobroClub: "por-hora" })));
  const paq = ok(await comoA(c, () => c.modelo.crearPaquete({ nombre: "Pack 4", clases: 4, precio: 90_000, venceDias: 30 })));
  const venta = ok(await comoA(c, () => c.modelo.venderPaquete(juan.id, paq.paqueteId, "EFECTIVO", "clave-aislada-0001")));
  const serie = ok(await comoA(c, () => c.modelo.crearSerie({ alumnoId: juan.id, diaSemana: 3, hora: "20:00" })));
  const f = proximo(5);
  const grupal = await clase(c, juan, f, "10:00", "CONFIRMADA", { tipo: "GRUPAL", personas: 2 });
  ok(await comoA(c, () => c.modelo.sumarParticipante(grupal, { nombre: "Amigo" })));

  // RLS (rol app_rls, sin ser dueño): con el negocio de B puesto, cero filas de A; con el de A, las ve.
  for (const tabla of ["PadelClub", "PadelSerie", "PadelPaquete", "PadelPaqueteAlumno", "PadelParticipante"]) {
    assert.equal(await contarComo(c.base, tabla, c.base.b.id, c.base.a.id), 0, `${tabla}: B no ve nada de A`);
    assert.ok((await contarComo(c.base, tabla, c.base.a.id, c.base.a.id)) > 0, `${tabla}: A sí`);
  }
  // Y el WITH CHECK: con el negocio de B puesto no se puede escribir una fila de A.
  const cli = new pg.Client({ connectionString: c.base.urlApp });
  await cli.connect();
  try {
    await cli.query("BEGIN");
    await cli.query("SELECT set_config('app.current_tenant_id', $1, true)", [c.base.b.id]);
    await assert.rejects(cli.query(`INSERT INTO "PadelClub" (id, "tenantId", nombre) VALUES ('club-colado', $1, 'Colado')`, [c.base.a.id]), /row-level security/);
    await cli.query("ROLLBACK");
  } finally {
    await cli.end();
  }

  // Las acciones y lecturas de la dueña de B, con los ids de A: nada.
  const enB = <R>(fn: () => Promise<R>) => ejecutarAccion(dueniaB(c), fn).then(valor);
  assert.deepEqual((await enB(() => c.datosModelo.clubes())).clubes, []);
  assert.deepEqual((await enB(() => c.datosModelo.paquetesDelAlumno(juan.id))).paquetes, []);
  assert.deepEqual((await enB(() => c.datosModelo.series())).series, []);
  assert.deepEqual((await enB(() => c.datosModelo.participantesDeClase(grupal))).participantes, []);
  falla(await enB(() => c.modelo.editarClub(club.clubId, { nombre: "Robado" })), /No encontramos/);
  falla(await enB(() => c.modelo.pausarSerie(serie.serieId, fechaEn(20))), /No encontramos/);
  falla(await enB(() => c.modelo.extenderPaquete(venta.paqueteAlumnoId, 10)), /No encontramos/);
  falla(await enB(() => c.modelo.sumarParticipante(grupal, { nombre: "X" })), /No encontramos/);
  falla(await enB(() => c.modelo.venderPaquete(juan.id, paq.paqueteId, null, "clave-aislada-0002")), /No encontramos/);
  const sinTocar = await c.db.padelClub.findUniqueOrThrow({ where: { id: club.clubId }, select: { nombre: true } });
  assert.equal(sinTocar.nombre, "Club Norte A");
  // Sin agenda:manage (el alumno, sin sesión): afuera.
  const sinSesion = await ejecutarAccion({ negocio: c.base.a }, () => c.modelo.crearClub({ nombre: "Sin permiso" }));
  assert.notEqual(sinSesion.tipo, "respuesta", "sin sesión no hay respuesta: redirige al login");
});

test("M-116/M-117/M-130: el turno fijo reserva su hora; generarSemana crea la semana una sola vez y deja «Avisar a Juan su semana: mar 19 y jue 19»; pausar libera", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const juan = await nuevoAlumno(c, "Juan Fijo");
  const martes = proximo(2);
  const { semanaDesdeLunes, sumarDias } = await import("@/lib/padel/core");
  const lunes = semanaDesdeLunes(martes);
  const jueves = sumarDias(lunes, 3);
  const sM = ok(await comoA(c, () => c.modelo.crearSerie({ alumnoId: juan.id, diaSemana: 2, hora: "19:00", desde: lunes })));
  ok(await comoA(c, () => c.modelo.crearSerie({ alumnoId: juan.id, diaSemana: 4, hora: "19:00", desde: lunes })));
  assert.match(String(sM.resumen), /todos los mar 19:00/);
  // Otro turno fijo encima: no.
  const otro = await nuevoAlumno(c, "Otro Fijo");
  falla(await comoA(c, () => c.modelo.crearSerie({ alumnoId: otro.id, diaSemana: 2, hora: "19:30" })), /turno fijo de Juan/);

  // M-116: la clase de esa semana todavía no existe y 19:00 igual NO se ofrece.
  const libres = async (f: string) => (await ejecutarAccion(link(c), () => c.datos.libresDelDia(c.base.a.id, f)).then(valor)).libres;
  assert.equal((await libres(martes)).includes(aLas(martes, "19:00").toISOString()), false, "M-116: 19:00 del martes reservado");
  assert.ok((await libres(martes)).includes(aLas(martes, "18:00").toISOString()));
  const agenda = await ejecutarAccion(link(c), () => c.datos.agendaPublica(c.base.a.id)).then(valor);
  assert.equal(agenda.find((d) => d.fecha === martes)?.horas.includes(aLas(martes, "19:00").toISOString()), false, "ni en el turnero");

  // M-117: dos corridas, la segunda no crea nada.
  // (generarSemana es del negocio entero: también genera los turnos fijos de otros tests; se mira a Juan.)
  const g1 = ok(await comoA(c, () => c.modelo.generarSemana(lunes)));
  assert.deepEqual(g1.avisos.find((a) => a.alumnoId === juan.id), { alumnoId: juan.id, nombre: "Juan Fijo", detalle: "mar 19 y jue 19", clases: 2 });
  const g2 = ok(await comoA(c, () => c.modelo.generarSemana(lunes)));
  assert.equal(g2.creadas, 0, "idempotente");
  const generadas = await c.db.padelClase.findMany({ where: { tenantId: c.base.a.id, alumnoId: juan.id, serieId: { not: null } }, select: { estado: true, empiezaEn: true } });
  assert.equal(generadas.length, 2);
  assert.ok(generadas.every((x) => x.estado === "CONFIRMADA"));
  const avisos = await c.db.padelAviso.findMany({ where: { tenantId: c.base.a.id, destino: "PROFE", tipo: "semana", alumnoId: juan.id }, select: { texto: true } });
  assert.equal(avisos.length, 1, "un solo aviso aunque corra dos veces");
  assert.equal(avisos[0].texto, "Avisar a Juan su semana: mar 19 y jue 19.");
  const wa = ok(await comoA(c, () => c.modelo.avisarSemana(juan.id, lunes)));
  assert.equal(wa.detalle, "mar 19 y jue 19");
  assert.match(decodeURIComponent(String(wa.wa)), /mar 19 y jue 19/);
  // Las dos corridas a la vez tampoco duplican.
  const otraSemana = sumarDias(lunes, 7);
  const [a, b] = await Promise.all([comoA(c, () => c.modelo.generarSemana(otraSemana)), comoA(c, () => c.modelo.generarSemana(otraSemana))]);
  ok(a);
  ok(b);
  assert.equal(await c.db.padelClase.count({ where: { tenantId: c.base.a.id, alumnoId: juan.id, serieId: { not: null } } }), 4);

  // M-130: pausar el martes libera esa hora (la clase generada sin plata se cancela).
  const p = ok(await comoA(c, () => c.modelo.pausarSerie(sM.serieId, martes, martes)));
  assert.equal(p.canceladas, 1);
  assert.ok((await libres(martes)).includes(aLas(martes, "19:00").toISOString()), "M-130: libre en el turnero");
  assert.equal((await libres(jueves)).includes(aLas(jueves, "19:00").toISOString()), false, "el jueves sigue");
  assert.equal(ok(await comoA(c, () => c.modelo.generarSemana(lunes))).creadas, 0, "pausada: no la vuelve a crear");
  // Cortar el jueves: deja de reservar desde ese día.
  const series = (await comoA(c, () => c.datosModelo.series({ alumnoId: juan.id }))).series;
  const sJ = series.find((s) => s.diaSemana === 4)!;
  ok(await comoA(c, () => c.modelo.cortarSerie(sJ.id, sumarDias(otraSemana, 3))));
  assert.ok((await libres(sumarDias(otraSemana, 10))).includes(aLas(sumarDias(otraSemana, 10), "19:00").toISOString()), "cortada: la semana siguiente el jueves está libre");
});

test("M-118/M-119: Pack 4 · $ 90.000 — vender es idempotente; «Dada» descuenta (Pagada con paquete, quedan 3); la última ofrece renovar; vencido no descuenta y se extiende", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const ana = await nuevoAlumno(c, "Ana Paquete");
  const paq = ok(await comoA(c, () => c.modelo.crearPaquete({ nombre: "Pack 4", clases: 4, precio: 90_000, venceDias: 30 })));
  const [v1, v2] = await Promise.all([
    comoA(c, () => c.modelo.venderPaquete(ana.id, paq.paqueteId, "TRANSFERENCIA", "clave-venta-ana-001")),
    comoA(c, () => c.modelo.venderPaquete(ana.id, paq.paqueteId, "TRANSFERENCIA", "clave-venta-ana-001")),
  ]);
  assert.equal(ok(v1).paqueteAlumnoId, ok(v2).paqueteAlumnoId, "doble toque: la MISMA venta");
  assert.equal(await c.db.padelPaqueteAlumno.count({ where: { alumnoId: ana.id } }), 1, "nunca se vende ni se cobra dos veces");
  const ayer = fechaEn(-1);
  const ids = [await clase(c, ana, ayer, "09:00", "CONFIRMADA"), await clase(c, ana, ayer, "10:00", "CONFIRMADA"), await clase(c, ana, ayer, "11:00", "CONFIRMADA"), await clase(c, ana, ayer, "12:00", "CONFIRMADA"), await clase(c, ana, ayer, "13:00", "CONFIRMADA")];
  const r1 = ok(await comoA(c, () => c.profe.moverClase(ids[0], "dar")));
  assert.deepEqual({ usado: r1.paquete?.usado, quedan: r1.paquete?.quedan }, { usado: true, quedan: 3 });
  const f1 = await fila(c, ids[0]);
  assert.deepEqual({ e: f1.estado, p: f1.pagoEstado, m: f1.pagoMedio, precio: Number(f1.precio), validada: f1.pagoValidadoEl }, { e: "DADA", p: "PAGADO", m: "PAQUETE", precio: 22_500, validada: null }, "Pagada con paquete (no suma a «cobrado» de nuevo)");
  ok(await comoA(c, () => c.profe.moverClase(ids[1], "dar")));
  ok(await comoA(c, () => c.profe.moverClase(ids[2], "dar")));
  const r4 = ok(await comoA(c, () => c.profe.moverClase(ids[3], "dar")));
  assert.equal(r4.paquete?.quedan, 0);
  assert.equal(r4.paquete?.ofrecerRenovar, true, "M-118: «Ofrecele renovar»");
  assert.match(decodeURIComponent(String(r4.paquete?.renovar?.wa)), /Usaste la última clase de tu Pack 4.*\$ 90\.000/);
  const r5 = ok(await comoA(c, () => c.profe.moverClase(ids[4], "dar")));
  assert.equal(r5.paquete, undefined, "sin clases: se cobra como siempre");
  assert.equal((await fila(c, ids[4])).pagoEstado, "PENDIENTE");
  const ficha = await comoA(c, () => c.datos.ficha(ana.id));
  assert.equal(ficha!.debe, 25_000, "sólo la quinta es deuda");

  // M-119: vencido con 1 clase → no descuenta, «1 clase vencida», y se extiende.
  const beto = await nuevoAlumno(c, "Beto Vencido");
  const vb = ok(await comoA(c, () => c.modelo.venderPaquete(beto.id, paq.paqueteId, "EFECTIVO", "clave-venta-beto-01")));
  await c.db.padelPaqueteAlumno.update({ where: { id: vb.paqueteAlumnoId }, data: { clasesUsadas: 3, venceEl: new Date(Date.now() - DIA) }, select: { id: true } });
  const cb = await clase(c, beto, ayer, "15:00", "CONFIRMADA");
  const rb = ok(await comoA(c, () => c.profe.moverClase(cb, "dar")));
  assert.deepEqual(rb.paquete, { usado: false, quedan: undefined, ofrecerRenovar: undefined, vencidas: 1 });
  assert.equal((await fila(c, cb)).pagoEstado, "PENDIENTE", "no descontó");
  const pb = await comoA(c, () => c.datosModelo.paquetesDelAlumno(beto.id));
  assert.equal(pb.paquetes[0].texto, "1 clase vencida");
  ok(await comoA(c, () => c.modelo.extenderPaquete(vb.paqueteAlumnoId, 7)));
  const cb2 = await clase(c, beto, ayer, "16:00", "CONFIRMADA");
  const rb2 = ok(await comoA(c, () => c.profe.moverClase(cb2, "dar")));
  assert.equal(rb2.paquete?.usado, true, "extendido, vuelve a servir");
  // Dos «Dada» a la vez con 1 clase en el paquete: una usa el paquete y la otra queda a cobrar.
  const caro = await nuevoAlumno(c, "Caro Carrera");
  const vc = ok(await comoA(c, () => c.modelo.venderPaquete(caro.id, paq.paqueteId, "EFECTIVO", "clave-venta-caro-01")));
  await c.db.padelPaqueteAlumno.update({ where: { id: vc.paqueteAlumnoId }, data: { clasesUsadas: 3 }, select: { id: true } });
  const x1 = await clase(c, caro, ayer, "17:00", "CONFIRMADA");
  const x2 = await clase(c, caro, ayer, "18:00", "CONFIRMADA");
  await Promise.all([comoA(c, () => c.profe.moverClase(x1, "dar")), comoA(c, () => c.profe.moverClase(x2, "dar"))]);
  const conPaquete = [await fila(c, x1), await fila(c, x2)].filter((f) => f.pagoMedio === "PAQUETE").length;
  assert.equal(conPaquete, 1, "la última clase del paquete se usa UNA vez");
  assert.equal((await c.db.padelPaqueteAlumno.findUniqueOrThrow({ where: { id: vc.paqueteAlumnoId }, select: { clasesUsadas: true } })).clasesUsadas, 4);
});

test("M-120/M-121: grupal de 3 a $ 12.000 — cada uno su parte, su pago y su WhatsApp; «1 de 3 pagaron» y Ana debe $ 12.000, no $ 36.000", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const [ana, beto, caro] = [await nuevoAlumno(c, "Ana Grupal"), await nuevoAlumno(c, "Beto Grupal"), await nuevoAlumno(c, "Caro Grupal")];
  const f = proximo(6);
  const g = await clase(c, ana, f, "11:00", "PEDIDA", { tipo: "GRUPAL", personas: 3, precio: 36_000 });
  ok(await comoA(c, () => c.modelo.sumarParticipante(g, { alumnoId: beto.id })));
  const s3 = ok(await comoA(c, () => c.modelo.sumarParticipante(g, { alumnoId: caro.id })));
  assert.equal(s3.tomados, 3);
  falla(await comoA(c, () => c.modelo.sumarParticipante(g, { alumnoId: caro.id })), /Ya está/);
  ok(await comoA(c, () => c.profe.moverClase(g, "confirmar")));
  const fg = await fila(c, g);
  assert.deepEqual({ p: fg.pagoEstado, precio: Number(fg.precio) }, { p: "POR_PARTICIPANTE", precio: 36_000 });
  const av = ok(await comoA(c, () => c.modelo.avisarParticipantes(g)));
  assert.equal(av.avisos.length, 3, "M-120: un WhatsApp por persona");
  for (const a of av.avisos) assert.match(decodeURIComponent(String(a.wa)), /Tu parte es \$ 12\.000/);
  const ps = await comoA(c, () => c.datosModelo.participantesDeClase(g));
  assert.deepEqual(ps.participantes.map((p) => [p.nombre, p.precio, p.pagoEstado]), [["Ana Grupal", 12_000, "PENDIENTE"], ["Beto Grupal", 12_000, "PENDIENTE"], ["Caro Grupal", 12_000, "PENDIENTE"]]);
  const pBeto = ps.participantes.find((p) => p.alumnoId === beto.id)!;
  const [c1, c2] = await Promise.all([comoA(c, () => c.modelo.cobrarParticipante(pBeto.id, "EFECTIVO")), comoA(c, () => c.modelo.cobrarParticipante(pBeto.id, "EFECTIVO"))]);
  assert.equal([c1, c2].filter((x) => x.ok).length, 1, "la parte de Beto se cobra UNA vez");
  ok(await comoA(c, () => c.profe.moverClase(g, "dar")));
  const r = (await comoA(c, () => c.datosModelo.participantesDeClase(g))).resumen!;
  assert.equal(r.texto, "1 de 3 pagaron");
  assert.deepEqual(r.deben.map((p) => [p.nombre, p.precio]), [["Ana Grupal", 12_000], ["Caro Grupal", 12_000]]);
  // La clase entera NO es deuda de Ana ($ 36.000) ni se cobra de una.
  assert.equal((await comoA(c, () => c.datos.ficha(ana.id)))!.debe, 0);
  falla(await comoA(c, () => c.profe.cobrar(g, "EFECTIVO")), /no se puede cobrar/);
  assert.equal((await fila(c, g)).pagoEstado, "POR_PARTICIPANTE");
  // Sacar a quien ya pagó: no.
  falla(await comoA(c, () => c.modelo.quitarParticipante(pBeto.id)), /Ya pagó/);
});

test("M-122: grupo abierto cupo 4 con 2 → el alumno se suma con su link y queda 1; completo no se ofrece; la franja no se ofrece como individual", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const [ana, beto, caro, dani, eli] = [await nuevoAlumno(c, "Ana Abierta"), await nuevoAlumno(c, "Beto Abierto"), await nuevoAlumno(c, "Caro Abierta"), await nuevoAlumno(c, "Dani Abierto"), await nuevoAlumno(c, "Eli Abierta")];
  const f = proximo(0);
  const g = await clase(c, ana, f, "10:00", "CONFIRMADA", { tipo: "GRUPAL", personas: 2, precio: 24_000 });
  ok(await comoA(c, () => c.modelo.sumarParticipante(g, { alumnoId: beto.id })));
  assert.equal(ok(await comoA(c, () => c.modelo.abrirGrupo(g, 4))).libres, 2);
  const abiertas = () => ejecutarAccion(link(c), () => c.datosModelo.grupalesAbiertas(c.base.a.id)).then(valor);
  assert.equal((await abiertas()).find((x) => x.claseId === g)?.quedan, 2);
  assert.equal(JSON.stringify(await abiertas()).includes("Beto"), false, "M-141: nunca nombres ni celulares de los anotados");
  const s1 = ok(await ejecutarAccion(link(c), () => c.alumno.sumarmeAGrupal({ token: caro.token }, g)).then(valor));
  assert.equal(s1.quedan, 1, "M-122: queda 1 lugar");
  assert.equal(s1.precio, 12_000);
  const libres = (await ejecutarAccion(link(c), () => c.datos.libresDelDia(c.base.a.id, f)).then(valor)).libres;
  assert.equal(libres.includes(aLas(f, "10:00").toISOString()), false, "la franja no se ofrece como individual");
  // Los dos últimos a la vez por el último lugar: entra uno.
  const [x, y] = await Promise.all([
    ejecutarAccion(link(c), () => c.alumno.sumarmeAGrupal({ token: dani.token }, g)).then(valor),
    ejecutarAccion(link(c), () => c.alumno.sumarmeAGrupal({ token: eli.token }, g)).then(valor),
  ]);
  assert.equal([x, y].filter((z) => z.ok).length, 1);
  assert.match(String([x, y].find((z) => !z.ok)?.error), /se llenó/);
  assert.equal((await abiertas()).some((z) => z.claseId === g), false, "completo: no se ofrece");
  assert.equal(await c.db.padelParticipante.count({ where: { claseId: g } }), 4);
  assert.equal((await fila(c, g)).precio.toString(), "48000");
  // Un token de A en el dominio de B no se suma a nada.
  const enB = await ejecutarAccion({ negocio: c.base.b, headers: ip() }, () => c.alumno.sumarmeAGrupal({ token: ana.token }, g)).then(valor);
  falla(enB, /link no es válido/);
});

test("M-123: 18:00 en Norte y 19:00 en Sur a 30 min → «No llegás: Club Sur queda a 30 min»; la cancha queda congelada en la clase; cuenta con el club y margen", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const juan = await nuevoAlumno(c, "Juan Clubes");
  const norte = ok(await comoA(c, () => c.modelo.crearClub({ nombre: "Club Norte", trasladoMin: 20, costoCancha: 8_000, modoCobroClub: "por-hora" })));
  const sur = ok(await comoA(c, () => c.modelo.crearClub({ nombre: "Club Sur", trasladoMin: 30, costoCancha: 10_000, modoCobroClub: "por-clase", techada: true })));
  falla(await comoA(c, () => c.modelo.crearClub({ nombre: "Club Raro", costoCancha: 1, modoCobroClub: "por-dia" })), /por hora, por clase o mensual/);
  const f = proximo(1);
  const fd = (hora: string, clubId: string, extra: Record<string, string> = {}) => {
    const x = new FormData();
    for (const [k, v] of Object.entries({ fecha: f, hora, alumnoId: juan.id, clubId, tipo: "INDIVIDUAL", ...extra })) x.set(k, v);
    return x;
  };
  ok(await comoA(c, () => c.profe.agendarClase(fd("18:00", norte.clubId))));
  const r = await comoA(c, () => c.profe.agendarClase(fd("19:00", sur.clubId)));
  falla(r, /^No llegás: Club Sur queda a 30 min$/);
  const ch = ok(await comoA(c, () => c.modelo.chequearTraslado(f, "19:00", sur.clubId)));
  assert.equal(ch.noLlega, "No llegás: Club Sur queda a 30 min");
  assert.equal(ok(await comoA(c, () => c.modelo.chequearTraslado(f, "19:30", sur.clubId))).noLlega, null);
  ok(await comoA(c, () => c.profe.agendarClase(fd("19:00", sur.clubId, { aunqueNoLlegue: "1" }))), "el profe lo puede agendar igual");
  const clases = await c.db.padelClase.findMany({ where: { tenantId: c.base.a.id, alumnoId: juan.id }, orderBy: { empiezaEn: "asc" }, select: { id: true, clubId: true, costoCancha: true } });
  assert.deepEqual(clases.map((x) => [x.clubId, Number(x.costoCancha)]), [[norte.clubId, 8_000], [sur.clubId, 10_000]], "costo congelado al agendar");
  // Se dan las dos: cuenta con cada club y margen.
  for (const x of clases) await c.db.padelClase.update({ where: { id: x.id }, data: { estado: "DADA" }, select: { id: true } });
  const cuentas = await comoA(c, () => c.datosModelo.cuentasConClubes(aLas(f, "00:00"), aLas(fechaEn(40), "00:00")));
  assert.equal(cuentas.disponible, true);
  const porClub = Object.fromEntries(cuentas.clubes.map((x) => [x.nombre, x.total]));
  assert.equal(porClub["Club Norte"], 8_000);
  assert.equal(porClub["Club Sur"], 10_000);
  assert.deepEqual(cuentas.margen, { ingreso: 50_000, costo: 18_000, margen: 32_000, sinCosto: 0 });
  // Un club de otro negocio no sirve para agendar en éste.
  const enB = ok(await ejecutarAccion(dueniaB(c), () => c.modelo.crearClub({ nombre: "Club de B" })).then(valor));
  falla(await comoA(c, () => c.profe.agendarClase(fd("21:00", String(enB.clubId)))), /No encontramos ese club/);
  // Club por tramo de la grilla (M-126, para la T5).
  ok(await comoA(c, () => c.modelo.asignarClubATramo(2, "08:00", "22:00", norte.clubId)));
  const fr = await ejecutarAccion(link(c), () => c.datos.franjas(c.base.a.id)).then(valor);
  assert.equal(fr.find((x) => x.diaSemana === 2)?.clubId, norte.clubId);
});

test("M-124: pago parcial $ 20.000 sobre $ 25.000 → pagado 20.000, debe $ 5.000 en la ficha, en «Te deben» y en el link; dos cobros a la vez no suman dos veces", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const al = await nuevoAlumno(c, "Pía Parcial");
  const ayer = fechaEn(-1);
  const id = await clase(c, al, ayer, "08:00", "DADA", { dadaEl: new Date() });
  const r = ok(await comoA(c, () => c.modelo.cobrarParcial(id, "EFECTIVO", 20_000)));
  assert.deepEqual({ pagado: r.pagado, resto: r.resto }, { pagado: 20_000, resto: 5_000 });
  const f1 = await fila(c, id);
  assert.deepEqual({ pagado: Number(f1.pagado), p: f1.pagoEstado }, { pagado: 20_000, p: "PENDIENTE" });
  assert.equal((await comoA(c, () => c.datos.ficha(al.id)))!.debe, 5_000);
  const quien = (await comoA(c, () => c.datos.deudores())).find((d) => d.alumnoId === al.id);
  assert.equal(quien?.total, 5_000, "«Te deben» suma $ 5.000");
  const pub = await ejecutarAccion(link(c), () => c.datos.alumnoPublico(al.token)).then(valor);
  assert.equal(pub!.alumno.debe, 5_000, "el alumno ve lo mismo");
  falla(await comoA(c, () => c.modelo.cobrarParcial(id, "EFECTIVO", 6_000)), /más de lo que falta/);
  const [a, b] = await Promise.all([comoA(c, () => c.modelo.cobrarParcial(id, "EFECTIVO", 5_000)), comoA(c, () => c.modelo.cobrarParcial(id, "TRANSFERENCIA", 5_000))]);
  assert.equal([a, b].filter((x) => x.ok).length, 1, "el resto se cobra UNA vez");
  const f2 = await fila(c, id);
  assert.deepEqual({ pagado: Number(f2.pagado), p: f2.pagoEstado }, { pagado: 25_000, p: "PAGADO" });
  // Una confirmada con $ 10.000 a cuenta que se cancela: esos $ 10.000 quedan a favor (ni un peso se pierde).
  const fut = await clase(c, al, fechaEn(5), "08:00", "CONFIRMADA");
  ok(await comoA(c, () => c.modelo.cobrarParcial(fut, "EFECTIVO", 10_000)));
  const canc = ok(await comoA(c, () => c.profe.moverClase(fut, "cancelar")));
  assert.equal(canc.aFavor, 10_000);
  const f3 = await fila(c, fut);
  assert.deepEqual({ p: f3.pagoEstado, precio: Number(f3.precio) }, { p: "ACREDITADO", precio: 10_000 });
  assert.equal((await comoA(c, () => c.datos.ficha(al.id)))!.aFavor, 10_000);
  // «Cobrar todo» de una con pago parcial cobra lo que falta.
  const otra = await clase(c, al, ayer, "09:00", "DADA", { dadaEl: new Date() });
  ok(await comoA(c, () => c.modelo.cobrarParcial(otra, "EFECTIVO", 15_000)));
  const todo = ok(await comoA(c, () => c.profe.cobrarTodo(al.id, "EFECTIVO")));
  assert.equal(todo.total, 10_000);
});

test("M-125: con «tardía se cobra», avisar tarde deja «Cancelada tarde · debe $ 25.000» y suma a la deuda de los dos lados; sin la regla, sólo avisa", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const al = await nuevoAlumno(c, "Tito Tarde");
  // Sin la regla (de fábrica): avisa y la clase sigue.
  const pronto = new Date(Date.now() + 60 * 60_000);
  const crearPronto = async (min: number) =>
    (await c.db.padelClase.create({
      data: { tenantId: c.base.a.id, alumnoId: al.id, clientId: al.clientId, empiezaEn: new Date(pronto.getTime() + min * 60_000), terminaEn: new Date(pronto.getTime() + (min + 60) * 60_000), estado: "CONFIRMADA", confirmadaEl: new Date(), origen: "PROFE", precio: 25_000 },
      select: { id: true },
    })).id;
  const c1 = await crearPronto(0);
  const sin = ok(await ejecutarAccion(link(c), () => c.alumno.avisarNoVoy(al.token, c1)).then(valor));
  assert.equal(sin.seCobra, undefined);
  assert.equal((await fila(c, c1)).estado, "CONFIRMADA");
  // Con la regla.
  ok(await comoA(c, () => c.modelo.guardarRegla("tardiaSeCobra", true)));
  falla(await comoA(c, () => c.modelo.guardarRegla("cualquiera", true)), /no existe/);
  falla(await comoA(c, () => c.modelo.guardarRegla("cierreAutoHoras", 500)), /de 0 a 72/);
  try {
    const c2 = await crearPronto(30);
    const con = ok(await ejecutarAccion(link(c), () => c.alumno.avisarNoVoy(al.token, c2)).then(valor));
    assert.equal(con.seCobra, true);
    const f = await fila(c, c2);
    assert.deepEqual({ e: f.estado, m: f.motivoCancel, s: f.seCobra }, { e: "CANCELADA", m: "TARDIA_SE_COBRA", s: true });
    const { etiquetaTardia } = await import("@/lib/padel/core");
    assert.equal(etiquetaTardia({ estado: f.estado, pagoEstado: f.pagoEstado, precio: Number(f.precio), motivoCancel: f.motivoCancel }), "Cancelada tarde · debe $ 25.000");
    assert.equal((await comoA(c, () => c.datos.ficha(al.id)))!.debe, 25_000, "lado del profe");
    const pub = await ejecutarAccion(link(c), () => c.datos.alumnoPublico(al.token)).then(valor);
    assert.equal(pub!.alumno.debe, 25_000, "lado del alumno");
    assert.equal((await comoA(c, () => c.datos.deudores())).find((d) => d.alumnoId === al.id)?.total, 25_000);
    // La franja quedó libre (se canceló) y el aviso le dice al profe qué pasó.
    const aviso = await c.db.padelAviso.findFirstOrThrow({ where: { claseId: c2, tipo: "no-voy" }, select: { texto: true } });
    assert.match(aviso.texto, /Cancelada tarde · debe \$ 25\.000/);
    ok(await comoA(c, () => c.profe.cobrar(c2, "EFECTIVO")));
    assert.equal((await fila(c, c2)).pagoEstado, "PAGADO");
  } finally {
    ok(await comoA(c, () => c.modelo.guardarRegla("tardiaSeCobra", false)));
  }
  const cfg = await comoA(c, () => c.datos.configPadel(c.base.a.id));
  assert.equal(cfg.modeloT4, true);
  assert.equal(cfg.reglas.tardiaSeCobra, false);
  assert.equal(cfg.reglas.confirmarConocidos, true);
});

test("M-142 (motor): con «confirmar a todos», el conocido que reserva desde su link nace PEDIDA; pedir turno fijo deja UN aviso y el profe lo aprueba", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const al = await nuevoAlumno(c, "Lalo Conocido");
  await clase(c, al, fechaEn(-7), "08:00", "DADA", { dadaEl: new Date() });
  ok(await comoA(c, () => c.modelo.guardarRegla("confirmarConocidos", false)));
  try {
    const f = proximo(3);
    const r = ok(await ejecutarAccion(link(c), () => c.alumno.reservarDesdeLink(al.token, aLas(f, "08:00").toISOString())).then(valor));
    assert.equal(r.estado, "PEDIDA");
    const p1 = ok(await ejecutarAccion(link(c), () => c.alumno.pedirSerie(al.token, String(r.claseId))).then(valor));
    const p2 = ok(await ejecutarAccion(link(c), () => c.alumno.pedirSerie(al.token, String(r.claseId))).then(valor));
    assert.equal(p1.yaPedido, false);
    assert.equal(p2.yaPedido, true);
    assert.match(String(p1.texto), /^Lalo Conocido pide turno fijo \S+ 08:00$/);
    assert.equal(await c.db.padelAviso.count({ where: { claseId: String(r.claseId), tipo: "serie-pedida" } }), 1);
    const ap = ok(await comoA(c, () => c.modelo.aprobarSerie(String(r.claseId))));
    assert.match(String(ap.resumen), /08:00/);
  } finally {
    ok(await comoA(c, () => c.modelo.guardarRegla("confirmarConocidos", true)));
  }
  assert.equal(hoyAr().length, 10);
});
