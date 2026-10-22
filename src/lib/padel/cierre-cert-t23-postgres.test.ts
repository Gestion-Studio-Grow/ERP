// ============================================================================
// CIERRE DE LA CERT MATÍAS T2+T3 — las observaciones, con las ACCIONES REALES contra Postgres + RLS.
// ============================================================================
//
// Base efímera (migraciones + RLS + dos negocios A y B), acciones de servidor reales con la sesión de
// la dueña o con el link del alumno. Cada test es una observación cerrada:
//   O-2  `cobrar` no deja cobrar una PEDIDA (el motor; la pantalla ya no lo ofrecía).
//   O-3  «No vino → no se cobra» sobre una clase YA pagada: la plata queda a favor del alumno.
//   O-5  dos pedidos de cambio de la misma clase: al confirmar uno, el otro se rechaza (no queda suelto).
//   O-9  «Ya vio la Bienvenida»: la marca se guarda, sobrevive a editar un texto y Hoy no rebota.
//   O-10 el freno de 3 por celular no cuenta los pedidos que fallan por «se ocupó».
//   O-11 `cancelarDesdeLink` frena por IP como el resto de las acciones del link.
//   O-12 `recordarVarios` no reusa un recordatorio con el link viejo.
//
//   node --import tsx --test src/lib/padel/cierre-cert-t23-postgres.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const H = 3_600_000;
const fechaEn = (n: number) => new Date(Date.now() - 3 * H + n * DIA).toISOString().slice(0, 10);
const aLas = (fecha: string, h: string) => new Date(`${fecha}T${h}:00-03:00`);

let sembrado: Awaited<ReturnType<typeof sembrar>> | null = null;

async function sembrar(base: BaseEfimera) {
  const db = await prismaComoDuenio(base);
  for (const tenantId of [base.a.id, base.b.id]) {
    await db.padelConfig.create({ data: { tenantId, duracionMin: 60, precioIndividual: 25_000, precioGrupal: 12_000, anticipacionMin: 120, diasAdelante: 14, maxPendientesPorTel: 2 } });
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
  const alumno = await import("@/lib/padel/acciones-alumno");
  const profe = await import("@/lib/padel/acciones");
  const config = await import("@/lib/padel/acciones-config");
  const datos = await import("@/lib/padel/datos.server");
  return { base, db: sembrado.db, alumno, profe, config, datos };
}
type Ctx = NonNullable<Awaited<ReturnType<typeof preparar>>>;

function valor<R>(r: { tipo: string; valor?: R }): R {
  assert.equal(r.tipo, "respuesta", JSON.stringify(r));
  return r.valor as R;
}
const err = (v: unknown) => (v as { ok: false; error: string }).error;
let n = 0;
const ip = () => ({ "x-forwarded-for": `198.51.100.${(n++ % 250) + 1}` });
const duenia = (c: Ctx) => ({ negocio: c.base.a, usuario: c.base.a.duenia });

let alumnos = 0;
/** Un alumno nuevo de A con su token (cada test el suyo, para que no se mezclen saldos ni topes). */
async function nuevoAlumno(c: Ctx, nombre: string) {
  alumnos++;
  const cl = await c.db.client.create({ data: { tenantId: c.base.a.id, name: nombre, phone: `11590${String(10000 + alumnos)}` } });
  const token = `TokenCierreT23Alumno${String(alumnos).padStart(6, "0")}`;
  const a = await c.db.padelAlumno.create({ data: { tenantId: c.base.a.id, clientId: cl.id, token } });
  return { id: a.id, clientId: cl.id, token, telefono: cl.phone };
}

async function clase(c: Ctx, al: { id: string; clientId: string }, fecha: string, h: string, estado: string, extra: Record<string, unknown> = {}) {
  return (await c.db.padelClase.create({
    data: { tenantId: c.base.a.id, alumnoId: al.id, clientId: al.clientId, empiezaEn: aLas(fecha, h), terminaEn: new Date(aLas(fecha, h).getTime() + H), estado, origen: "PROFE", precio: 25_000, ...(estado !== "PEDIDA" ? { confirmadaEl: new Date() } : {}), ...extra },
    select: { id: true },
  })).id;
}
const fila = (c: Ctx, id: string) => c.db.padelClase.findUniqueOrThrow({ where: { id } });

test("O-2 — cobrar una PEDIDA no se puede; confirmada, sí", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const al = await nuevoAlumno(c, "Pedro Pedido");
  const pedida = await clase(c, al, fechaEn(6), "10:00", "PEDIDA");
  const r = valor(await ejecutarAccion(duenia(c), () => c.profe.cobrar(pedida, "EFECTIVO")));
  assert.equal(r.ok, false);
  assert.match(err(r), /no se puede cobrar/);
  assert.equal((await fila(c, pedida)).pagoEstado, "PENDIENTE", "nada cambió");
  assert.ok(valor(await ejecutarAccion(duenia(c), () => c.profe.moverClase(pedida, "confirmar"))).ok);
  assert.ok(valor(await ejecutarAccion(duenia(c), () => c.profe.cobrar(pedida, "EFECTIVO"))).ok);
  assert.equal((await fila(c, pedida)).pagoEstado, "PAGADO");
});

test("O-3 — «No vino → no se cobra» sobre una pagada deja la plata a favor; «se cobra» la deja pagada; con saldo, el saldo vuelve", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const al = await nuevoAlumno(c, "Ana Ausente");
  const ayer = fechaEn(-1);
  const pagada = await clase(c, al, ayer, "10:00", "CONFIRMADA", { pagoEstado: "PAGADO", pagoMedio: "EFECTIVO", pagoValidadoEl: new Date() });
  const pagadaSeCobra = await clase(c, al, ayer, "12:00", "CONFIRMADA", { pagoEstado: "PAGADO", pagoMedio: "TRANSFERENCIA", pagoValidadoEl: new Date() });
  const antes = valor(await ejecutarAccion(duenia(c), () => c.datos.ficha(al.id)))!;
  assert.equal(antes.aFavor, 0);

  const r = valor(await ejecutarAccion(duenia(c), () => c.profe.marcarNoVino(pagada, false)));
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal((r as { aFavor?: number }).aFavor, 25_000, "la pantalla se entera de lo que quedó a favor");
  const f1 = await fila(c, pagada);
  assert.equal(f1.estado, "AUSENTE");
  assert.equal(f1.motivoCancel, "AUSENTE_NO_SE_COBRA");
  assert.equal(f1.pagoEstado, "ACREDITADO", "coherente con cancelar una pagada");
  assert.ok(valor(await ejecutarAccion(duenia(c), () => c.profe.marcarNoVino(pagadaSeCobra, true))).ok);
  assert.equal((await fila(c, pagadaSeCobra)).pagoEstado, "PAGADO", "si se cobra igual, lo pagado se queda pagado");

  const despues = valor(await ejecutarAccion(duenia(c), () => c.datos.ficha(al.id)))!;
  assert.equal(despues.aFavor, 25_000, "el saldo a favor la cuenta");
  assert.equal(despues.debe, 0, "y no aparece ninguna deuda");

  // La pagada CON saldo a favor y «no se cobra»: vuelve a PENDIENTE sin medio y el saldo que usó le vuelve.
  const conSaldo = await clase(c, al, ayer, "14:00", "CONFIRMADA", { pagoEstado: "PAGADO", pagoMedio: "SALDO_A_FAVOR", pagoValidadoEl: new Date() });
  assert.equal(valor(await ejecutarAccion(duenia(c), () => c.datos.ficha(al.id)))!.aFavor, 0, "el saldo se usó en esa clase");
  assert.ok(valor(await ejecutarAccion(duenia(c), () => c.profe.marcarNoVino(conSaldo, false))).ok);
  const f3 = await fila(c, conSaldo);
  assert.equal(f3.pagoEstado, "PENDIENTE");
  assert.equal(f3.pagoMedio, null);
  assert.equal(valor(await ejecutarAccion(duenia(c), () => c.datos.ficha(al.id)))!.aFavor, 25_000, "el saldo vuelve, sin contarse dos veces");
});

test("O-5 — dos pedidos de cambio de la misma clase: al confirmar uno, el otro se rechaza; un «la semana que viene igual» no se toca", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const al = await nuevoAlumno(c, "Nico Nuevo");
  const link = { negocio: c.base.a, headers: ip() };
  const f = fechaEn(9);
  const vieja = await clase(c, al, f, "10:00", "CONFIRMADA");
  assert.ok(valor(await ejecutarAccion(link, () => c.alumno.cambiarHorarioDesdeLink(al.token, vieja, aLas(f, "15:00").toISOString()))).ok);
  assert.ok(valor(await ejecutarAccion(link, () => c.alumno.cambiarHorarioDesdeLink(al.token, vieja, aLas(f, "17:00").toISOString()))).ok);
  const [n1, n2] = await c.db.padelClase.findMany({ where: { tenantId: c.base.a.id, repiteDe: vieja, estado: "PEDIDA" }, orderBy: { empiezaEn: "asc" } });
  assert.ok(n1 && n2, "hay dos pedidos de cambio");
  // Un «la semana que viene igual» de la misma clase (repiteDe, sin aviso de cambio): no es un pedido de cambio.
  const repetida = await clase(c, al, fechaEn(9 + 7), "10:00", "PEDIDA", { repiteDe: vieja, origen: "ALUMNO_LINK" });

  const conf = valor(await ejecutarAccion(duenia(c), () => c.profe.moverClase(n1.id, "confirmar")));
  assert.ok(conf.ok, JSON.stringify(conf));
  assert.equal((await fila(c, vieja)).estado, "CANCELADA");
  assert.equal((await fila(c, n1.id)).estado, "CONFIRMADA");
  const otro = await fila(c, n2.id);
  assert.equal(otro.estado, "RECHAZADA", "el segundo pedido de cambio no queda suelto");
  assert.equal(otro.motivoCancel, "Ya la pasó a otro horario");
  const avisoOtro = await c.db.padelAviso.findFirstOrThrow({ where: { tenantId: c.base.a.id, destino: "PROFE", tipo: "cambio-pedido", claseId: n2.id } });
  assert.ok(avisoOtro.leidoEl, "su aviso deja de esperar en la bandeja");
  assert.equal((await fila(c, repetida)).estado, "PEDIDA", "la repetida sigue su curso");
});

test("O-9 — «ya vio la Bienvenida»: se guarda, sobrevive a editar un texto, Hoy no rebota; B no se entera; un valor raro no pasa", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const { necesitaBienvenida } = await import("@/app/admin/(dashboard)/clases/bienvenida/necesita");
  // Un profe sin precio ni horarios (se borran los de A para este caso y se vuelven a poner al final).
  const tenantId = c.base.a.id;
  await c.db.padelConfig.update({ where: { tenantId }, data: { precioIndividual: 0 } });
  const franjasA = await c.db.padelDisponibilidad.findMany({ where: { tenantId } });
  await c.db.padelDisponibilidad.deleteMany({ where: { tenantId } });
  try {
    const leer = async () => {
      const cfg = valor(await ejecutarAccion(duenia(c), () => c.datos.configPadel(tenantId)));
      return necesitaBienvenida({ vista: cfg.bienvenidaVista, precioIndividual: cfg.precioIndividual, franjas: [] });
    };
    assert.equal(await leer(), true, "sin precio ni horarios y sin haberla visto: Bienvenida");
    assert.equal(valor(await ejecutarAccion(duenia(c), () => c.config.guardarCampoConfig("bienvenidaVista", "sí"))).ok, false, "sólo `true`");
    assert.ok(valor(await ejecutarAccion(duenia(c), () => c.config.guardarCampoConfig("bienvenidaVista", true))).ok);
    assert.equal(await leer(), false, "«Ir a Hoy» ya no rebota");
    // Editar un texto de WhatsApp no borra la marca (mismo JSON).
    assert.ok(valor(await ejecutarAccion(duenia(c), () => c.config.guardarCampoConfig("plantilla.recordatorio", "Hola {nombre}! Mañana {hora}. {link}"))).ok);
    assert.equal(await leer(), false, "sigue vista después de editar un texto");
    const cfg = valor(await ejecutarAccion(duenia(c), () => c.datos.configPadel(tenantId)));
    assert.equal(cfg.plantillas.recordatorio, "Hola {nombre}! Mañana {hora}. {link}");
    // La de B no se enteró.
    const enB = valor(await ejecutarAccion({ negocio: c.base.b, usuario: c.base.b.duenia }, () => c.datos.configPadel(c.base.b.id)));
    assert.equal(enB.bienvenidaVista, false);
  } finally {
    await c.db.padelConfig.update({ where: { tenantId }, data: { precioIndividual: 25_000, plantillas: {} } });
    await c.db.padelDisponibilidad.createMany({ data: franjasA.map(({ id: _id, ...f }) => f) });
  }
});

test("O-10 — el freno de 3 por celular no cuenta los pedidos que fallan por «se ocupó»", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const f = fechaEn(11);
  const ocupante = await nuevoAlumno(c, "Oscar Ocupa");
  for (const h of ["09:00", "10:00", "11:00"]) await clase(c, ocupante, f, h, "CONFIRMADA");
  const tel = "11 5800 4242";
  const pedir = (h: string) => ejecutarAccion({ negocio: c.base.a, headers: ip() }, () => c.alumno.pedirClase({ hora: aLas(f, h).toISOString(), nombre: "Lola", telefono: tel, tipo: "INDIVIDUAL", personas: 1 }));
  for (const h of ["09:00", "10:00", "11:00"]) {
    const salida = await pedir(h);
    const r = valor(salida);
    assert.equal(r.ok, false);
    assert.match(err(r), /ocupar/, `a las ${h} se ocupó`);
  }
  const cuarto = valor(await pedir("12:00"));
  assert.ok(cuarto.ok, `el 4º intento con una hora libre entra: ${JSON.stringify(cuarto)}`);
  // El freno sigue existiendo para los pedidos que sí cuentan: dos más (el tope de 2 pendientes rechaza
  // el siguiente) y el siguiente, frenado.
  assert.ok(valor(await pedir("13:00")).ok);
  assert.match(err(valor(await pedir("14:00"))), /esperando que el profe confirme/);
  assert.match(err(valor(await pedir("15:00"))), /muchos pedidos seguidos/);
});

test("O-11 — cancelarDesdeLink frena por IP (el 31º desde la misma IP), como el resto del link", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const al = await nuevoAlumno(c, "Iván IP");
  const mismaIp = { "x-forwarded-for": "203.0.113.211" };
  for (let i = 0; i < 30; i++) {
    const r = valor(await ejecutarAccion({ negocio: c.base.a, headers: mismaIp }, () => c.alumno.cancelarDesdeLink(al.token, "no-existe")));
    assert.match(err(r), /No encontramos esa clase/, `intento ${i + 1} todavía no frenado`);
  }
  const r31 = valor(await ejecutarAccion({ negocio: c.base.a, headers: mismaIp }, () => c.alumno.cancelarDesdeLink(al.token, "no-existe")));
  assert.match(err(r31), /muchos pedidos seguidos/);
  // Desde otra IP, el alumno cancela su clase sin problema.
  const suya = await clase(c, al, fechaEn(12), "10:00", "CONFIRMADA");
  assert.ok(valor(await ejecutarAccion({ negocio: c.base.a, headers: ip() }, () => c.alumno.cancelarDesdeLink(al.token, suya))).ok);
});

test("O-12 — recordarVarios no reusa un recordatorio con el link viejo: pone el vigente (también en el aviso guardado)", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const al = await nuevoAlumno(c, "Rita Recordada");
  const manana = await clase(c, al, fechaEn(1), "20:00", "CONFIRMADA");
  const primero = valor(await ejecutarAccion(duenia(c), () => c.profe.recordarVarios([manana])));
  assert.ok(primero.ok);
  const aviso = await c.db.padelAviso.findFirstOrThrow({ where: { tenantId: c.base.a.id, destino: "ALUMNO", tipo: "recordatorio", claseId: manana } });
  assert.ok(aviso.texto.includes(`/alumno/${al.token}`), aviso.texto);
  // El link se renueva entre medio (el profe lo regeneró).
  const nuevo = "TokenRenovadoDeRitaABCDEF01";
  await c.db.padelAlumno.update({ where: { id: al.id }, data: { token: nuevo } });
  const segundo = valor(await ejecutarAccion(duenia(c), () => c.profe.recordarVarios([manana])));
  assert.ok(segundo.ok);
  const [a] = segundo.avisos;
  assert.equal(a.avisoId, aviso.id, "reusa el mismo aviso (no se duplica)");
  const wa = decodeURIComponent(a.wa ?? "");
  assert.ok(wa.includes(`/alumno/${nuevo}`) && !wa.includes(al.token), wa);
  const guardado = await c.db.padelAviso.findUniqueOrThrow({ where: { id: aviso.id } });
  assert.ok(guardado.texto.includes(`/alumno/${nuevo}`) && !guardado.texto.includes(al.token));
});
