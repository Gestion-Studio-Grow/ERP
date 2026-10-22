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
// Vuelta 2:
//   F-2  el JSON de textos y la marca de la Bienvenida no pierden escrituras simultáneas.
//   O-3c «no vino, no se cobra» con un comprobante por revisar → «no aplica», deja de esperar.
//   O-5b/c la hermana de cambio se rechaza aunque el alumno haya cancelado la vieja, con texto honesto.
//   O-9b el `guardarConfig(FormData)` legado ya no existe.
//   O-16 un choque que agotó los reintentos vuelve como «se ocupó», no como un 500.
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
  assert.equal(otro.motivoCancel, "Ya confirmaste otro horario para esa clase", "O-5c: el motivo dice la verdad");
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

test("O-5b — el alumno canceló la vieja antes de que el profe confirme: al confirmar un cambio, el otro igual se rechaza", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const al = await nuevoAlumno(c, "Bruno Bis");
  const link = { negocio: c.base.a, headers: ip() };
  const f = fechaEn(10);
  const vieja = await clase(c, al, f, "09:00", "CONFIRMADA");
  assert.ok(valor(await ejecutarAccion(link, () => c.alumno.cambiarHorarioDesdeLink(al.token, vieja, aLas(f, "12:00").toISOString()))).ok);
  assert.ok(valor(await ejecutarAccion(link, () => c.alumno.cambiarHorarioDesdeLink(al.token, vieja, aLas(f, "14:00").toISOString()))).ok);
  assert.ok(valor(await ejecutarAccion(link, () => c.alumno.cancelarDesdeLink(al.token, vieja))).ok);
  const [k1, k2] = await c.db.padelClase.findMany({ where: { tenantId: c.base.a.id, repiteDe: vieja, estado: "PEDIDA" }, orderBy: { empiezaEn: "asc" } });
  assert.ok(valor(await ejecutarAccion(duenia(c), () => c.profe.moverClase(k1.id, "confirmar"))).ok);
  assert.equal((await fila(c, k1.id)).estado, "CONFIRMADA");
  const k2d = await fila(c, k2.id);
  assert.equal(k2d.estado, "RECHAZADA", "no queda PEDIDA suelta");
  assert.equal(k2d.motivoCancel, "Ya confirmaste otro horario para esa clase");
  // Lo que ve el alumno en su link: el motivo honesto, no «no puede ese horario».
  const pub = valor(await ejecutarAccion({ negocio: c.base.a, headers: ip() }, () => c.datos.alumnoPublico(al.token)));
  assert.equal(pub!.alumno.clases.find((x) => x.id === k2.id)?.motivoCancel, "Ya confirmaste otro horario para esa clase");
});

test("O-3c — «no vino, no se cobra» con el comprobante por revisar: queda «no aplica», sale de la Bandeja, no es deuda ni plata", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const al = await nuevoAlumno(c, "Celia Comprobante");
  const ayer = fechaEn(-1);
  const rev = await clase(c, al, ayer, "16:00", "CONFIRMADA", { pagoEstado: "EN_REVISION", pagoMedio: "TRANSFERENCIA", comprobante: "data:image/png;base64,AAAA", comprobanteEnviadoEl: new Date() });
  await c.db.padelAviso.create({ data: { tenantId: c.base.a.id, destino: "PROFE", tipo: "comprobante", texto: "x", claseId: rev, alumnoId: al.id } });
  const r = valor(await ejecutarAccion(duenia(c), () => c.profe.marcarNoVino(rev, false)));
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal((r as { comprobanteNoAplica?: boolean }).comprobanteNoAplica, true, "la pantalla se entera");
  const f = await fila(c, rev);
  assert.equal(f.pagoEstado, "PENDIENTE");
  assert.match(f.pagoNota ?? "", /no se cobra/);
  assert.ok(f.comprobante, "la imagen queda (si transfirió, el profe tiene con qué devolver)");
  assert.ok((await c.db.padelAviso.findFirstOrThrow({ where: { tenantId: c.base.a.id, tipo: "comprobante", claseId: rev } })).leidoEl, "deja de esperar en la Bandeja");
  const fi = valor(await ejecutarAccion(duenia(c), () => c.datos.ficha(al.id)))!;
  assert.equal(fi.debe, 0);
  assert.equal(fi.aFavor, 0, "nunca se validó plata: no se acredita nada");
  assert.equal(fi.enRevision, 0);
  // Con «se cobra igual», el comprobante se sigue revisando como siempre.
  const rev2 = await clase(c, al, ayer, "18:00", "CONFIRMADA", { pagoEstado: "EN_REVISION", pagoMedio: "TRANSFERENCIA", comprobante: "data:image/png;base64,AAAA", comprobanteEnviadoEl: new Date() });
  assert.ok(valor(await ejecutarAccion(duenia(c), () => c.profe.marcarNoVino(rev2, true))).ok);
  assert.equal((await fila(c, rev2)).pagoEstado, "EN_REVISION");
});

test("F-2 — textos de WhatsApp y la marca de la Bienvenida guardados a la vez: no se pierde ninguno (20 rondas)", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const tenantId = c.base.a.id;
  const { bienvenidaVista } = await import("@/lib/padel/config-campos");
  const leer = async () => (await c.db.padelConfig.findUniqueOrThrow({ where: { tenantId } })).plantillas as Record<string, string> | null;
  const guardar = (clave: string, v: unknown) => ejecutarAccion(duenia(c), () => c.config.guardarCampoConfig(clave, v));
  let perdidos = 0;
  const detalle: string[] = [];
  try {
    for (let i = 0; i < 10; i++) {
      // Dos textos a la vez.
      await c.db.padelConfig.update({ where: { tenantId }, data: { plantillas: { _bienvenidaVista: "1" } } });
      const [a, b] = await Promise.all([guardar("plantilla.movida", `A${i} {nombre}`), guardar("plantilla.suspendida", `B${i} {nombre}`)]);
      assert.ok(valor(a).ok && valor(b).ok, `ronda ${i}: ${JSON.stringify([a, b])}`);
      const p = await leer();
      if (p?.movida !== `A${i} {nombre}`) (perdidos++, detalle.push(`movida ${i}`));
      if (p?.suspendida !== `B${i} {nombre}`) (perdidos++, detalle.push(`suspendida ${i}`));
      if (!bienvenidaVista(p)) (perdidos++, detalle.push(`marca ${i} (textos)`));
      // La marca y un texto a la vez («Ir a Hoy» mientras se guarda un texto).
      await c.db.padelConfig.update({ where: { tenantId }, data: { plantillas: {} } });
      const [m, e] = await Promise.all([guardar("bienvenidaVista", true), guardar("plantilla.confirmada", `C${i} {nombre}`)]);
      assert.ok(valor(m).ok && valor(e).ok, `ronda ${i}: ${JSON.stringify([m, e])}`);
      const q = await leer();
      if (!bienvenidaVista(q)) (perdidos++, detalle.push(`marca ${i}`));
      if (q?.confirmada !== `C${i} {nombre}`) (perdidos++, detalle.push(`confirmada ${i}`));
    }
    // Tres a la vez también.
    await c.db.padelConfig.update({ where: { tenantId }, data: { plantillas: {} } });
    const tres = await Promise.all([guardar("plantilla.movida", "M3 {nombre}"), guardar("plantilla.suspendida", "S3 {nombre}"), guardar("bienvenidaVista", true)]);
    for (const x of tres) assert.ok(valor(x).ok, JSON.stringify(x));
    const z = await leer();
    if (z?.movida !== "M3 {nombre}" || z?.suspendida !== "S3 {nombre}" || !bienvenidaVista(z)) (perdidos++, detalle.push("tres a la vez"));
  } finally {
    await c.db.padelConfig.update({ where: { tenantId }, data: { plantillas: {} } });
  }
  assert.deepEqual(detalle, [], `${perdidos} escrituras perdidas`);
});

test("O-9b — el `guardarConfig(FormData)` legado ya no es una acción: no hay cómo pisar el JSON desde un formulario", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  assert.equal("guardarConfig" in c.profe, false);
});

test("O-16 — un choque que siguió chocando después de los reintentos vuelve como «se ocupó» (error de negocio), no como un throw", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const { respuestaDeError, ErrorNegocio } = await import("@/lib/padel/acciones-compartido");
  const crudo = Object.assign(new Error("TransactionWriteConflict"), { name: "DriverAdapterError", cause: { originalCode: "40001", kind: "TransactionWriteConflict" } });
  assert.match(respuestaDeError(crudo)?.error ?? "", /Se ocupó recién/);
  assert.match(respuestaDeError(Object.assign(new Error("x"), { code: "P2034" }))?.error ?? "", /Se ocupó recién/);
  assert.deepEqual(respuestaDeError(new ErrorNegocio("Ese horario se acaba de ocupar. Elegí otro.")), { ok: false, error: "Ese horario se acaba de ocupar. Elegí otro." });
  // Lo que no es un choque sube (la pantalla lo muestra como corte, sin decir «se ocupó»).
  assert.equal(respuestaDeError(new Error("connect ECONNREFUSED")), null);
  assert.equal(respuestaDeError(Object.assign(new Error("dup"), { name: "DriverAdapterError", cause: { originalCode: "23505", kind: "UniqueConstraintViolation" } })), null);
});
