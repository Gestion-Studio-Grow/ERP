// SEG-020 (servidor) CONTRA POSTGRES — el PIN de un dueño del club se verifica sólo en el servidor, con tope de
// intentos en la base, con las acciones REALES (estado-actions.ts, firma-del-duenio-actions.ts) y RLS encendido.
//   1. la foto que baja (OWNER y recepción) no trae credenciales de dueño (ni h1 ni h2);
//   2. tope de intentos: al 5.º fallo contra un dueño (con y sin usuario cuentan juntos) espera; durante la espera ni su PIN correcto pasa (ni «¿de qué
//      dueño es?»); otro dueño sigue firmando; un acierto limpia sólo los fallos de ese dueño, no el techo del negocio;
//   3. aislamiento: el tope y el pase de A no valen en B;
//   4. un código armado con `codigoAprobacion` del motor y lo guardado no aprueba; el del servidor sí;
//   5. guardar con la marca (recepción y OWNER) conserva el PIN; el re-hash h2 se aplica al guardar y sigue firmando.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@/generated/prisma/client";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import * as M from "./motor.mjs";
import { comprimir, descomprimir } from "./foto";
import { leerVigenteEnTx } from "./estado-repo";
import { MARCA_PIN_SERVIDOR, esPinFuerte, verificarPase } from "./pin-servidor";
import { ENTIDAD_PIN_FUERTE, ENTIDAD_PIN_INTENTO, clavePase } from "./tope-pin-servidor";

const laBase = baseEfimeraDelArchivo();
const HOY = "2026-10-17";
const AHORA = { fecha: HOY, min: 10 * 60 };
const PIN = { A: { rober: "4826", majo: "5937" }, B: { rober: "6152", majo: "7384" } };
const MAL = "9081";

type U = { id: string; rol: string; pin: string; pinLargo?: number };

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  await duenio.tenant.updateMany({ where: { id: { in: [base.a.id, base.b.id] } }, data: { modules: ["club", "clients", "pos"] } });
  // Cada test arranca con el club de cada negocio recién guardado y sin intentos anotados.
  await duenio.auditLog.deleteMany({ where: { entity: { in: ["ClubEstado", ENTIDAD_PIN_INTENTO, ENTIDAD_PIN_FUERTE] } } });
  const novedad: Record<string, { id: string; clienteId: string; fecha: string | null }> = {};
  const lu: Record<string, { id: string; pin: string }> = {};
  for (const [clave, negocio] of [["A", base.a], ["B", base.b]] as const) {
    const e = M.crearClubReal(HOY);
    assert.ok(M.definirPinInicial(e, "u-rober", PIN[clave].rober, AHORA).ok);
    assert.ok(M.definirPinInicial(e, "u-majo", PIN[clave].majo, AHORA).ok);
    const alta = M.altaUsuario(e, { nombre: "Lu", rol: "recepcion" }, { usuarioId: "u-rober", pin: PIN[clave].rober }, AHORA);
    assert.ok(alta.ok);
    lu[clave] = { id: alta.usuario.id, pin: alta.pin };
    const c = M.altaCliente(e, { nombre: "Cliente", tel: "1144445555" }, AHORA);
    assert.ok(c.ok);
    const n = M.solicitarCredito(e, { clienteId: c.cliente.id, tipo: "fiado", monto: 5000 }, { usuarioId: alta.usuario.id }, AHORA);
    assert.ok(n.ok);
    novedad[clave] = { id: n.novedad.id, clienteId: c.cliente.id, fecha: n.novedad.fecha };
    const g = await ejecutarAccion(comoDuenia(negocio), async () => {
      const { guardarFotoDelClub } = await import("@/app/admin/(dashboard)/club/estado-actions");
      return guardarFotoDelClub(await formFoto(JSON.stringify({ v: M.VERSION_ESTADO, estado: e, secuencia: 0 }), 0));
    });
    assert.ok(g.tipo === "respuesta" && g.valor.ok, JSON.stringify(g));
  }
  return { base, duenio, novedad, lu };
}

const comoDuenia = (n: NegocioDePrueba) => ({ negocio: n, usuario: n.duenia });
const comoRecepcion = (n: NegocioDePrueba) => ({ negocio: n, usuario: n.recepcion });

async function formFoto(texto: string, version: number) {
  const fd = new FormData();
  fd.set("foto", await comprimir(texto), "foto.json.gz");
  fd.set("version", String(version));
  return fd;
}

async function acciones() {
  return {
    ...(await import("@/app/admin/(dashboard)/club/estado-actions")),
    ...(await import("@/app/admin/(dashboard)/club/firma-del-duenio-actions")),
  };
}

function valor<R>(s: { tipo: string; valor?: R }): R {
  assert.equal(s.tipo, "respuesta");
  return s.valor as R;
}

async function leida(n: NegocioDePrueba, como: "duenia" | "recepcion") {
  const { leerFotoDelClub } = await acciones();
  const r = valor(await ejecutarAccion(como === "duenia" ? comoDuenia(n) : comoRecepcion(n), () => leerFotoDelClub()));
  assert.ok(r.ok && r.foto);
  return { texto: await descomprimir(r.foto.gzip), version: r.foto.version };
}

async function vigenteDe(duenio: PrismaClient, tenantId: string) {
  const v = await leerVigenteEnTx(duenio, tenantId);
  assert.ok(v);
  return { ...v, usuarios: (JSON.parse(v.texto) as { estado: { usuarios: U[] } }).estado.usuarios };
}

test("1 · la foto que baja, para OWNER y para recepción, no trae credenciales de dueño", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const v = await vigenteDe(duenio, base.a.id);
  const guardados = v.usuarios.filter((u) => u.rol === "duenio").map((u) => u.pin);
  assert.ok(guardados.every((g) => M.esPinConHash(g)));
  for (const como of ["duenia", "recepcion"] as const) {
    const { texto } = await leida(base.a, como);
    for (const g of guardados) assert.ok(!texto.includes(g), `${como}: baja un PIN guardado de dueño`);
    assert.ok(!texto.includes("h2:"));
    const us = (JSON.parse(texto) as { estado: { usuarios: U[] } }).estado.usuarios;
    for (const u of us.filter((x) => x.rol === "duenio")) assert.deepEqual([u.pin, u.pinLargo], [MARCA_PIN_SERVIDOR, 4]);
    assert.ok(us.some((u) => u.rol === "recepcion" && M.esPinConHash(u.pin)), "los PIN de recepción siguen bajando");
  }
});

test("2 · tope de intentos: 5 fallos contra un dueño (con y sin usuario cuentan juntos) y espera; su PIN correcto también espera; otro dueño sigue", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const { firmarComoDuenio } = await acciones();
  const firmar = (pedido: { usuarioId?: string; pin: string }) => ejecutarAccion(comoRecepcion(base.a), () => firmarComoDuenio(pedido)).then(valor);

  // Con y sin usuario cuentan juntos contra un mismo dueño: 3 contra Rober + 2 sin dueño y el 5.º ya espera.
  for (let i = 1; i <= 4; i++) {
    const r = await firmar(i % 2 ? { usuarioId: "u-rober", pin: MAL } : { pin: MAL });
    assert.equal(r.ok, false);
    assert.ok(!r.ok && !r.esperaS, `intento ${i} todavía no espera`);
  }
  const quinto = await firmar({ usuarioId: "u-rober", pin: MAL });
  assert.ok(!quinto.ok && quinto.esperaS === 30);
  for (const pedido of [{ usuarioId: "u-rober", pin: PIN.A.rober }, { pin: PIN.A.rober }]) {
    const r = await firmar(pedido);
    assert.ok(!r.ok && (r.esperaS ?? 0) > 0, "durante la espera no pasa ni el PIN correcto");
  }
  const otra = await firmar({ usuarioId: "u-majo", pin: PIN.A.majo });
  assert.ok(otra.ok, "otro dueño sigue firmando");
  const fila = await duenio.auditLog.findFirst({ where: { tenantId: base.a.id, entity: ENTIDAD_PIN_INTENTO, entityId: base.a.id } });
  assert.ok(fila);
  assert.ok(!JSON.stringify(fila.changes).includes(PIN.A.rober));

  // Pasada la espera (se adelanta en la base), el PIN correcto firma con un pase y limpia el tope.
  const vencido = { fallos: 5, tandas: 1, esperaHasta: 1, ultimoFallo: Date.now() };
  await duenio.auditLog.updateMany({ where: { id: fila.id }, data: { changes: { intentos: vencido, porDuenio: { "u-rober": vencido } } } });
  const ok = await firmar({ usuarioId: "u-rober", pin: PIN.A.rober });
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.equal(ok.usuarioId, "u-rober");
  const pase = verificarPase(ok.pase, clavePase(), Date.now(), { tenantId: base.a.id, uso: "firma" });
  assert.ok(pase.ok && pase.usuarioId === "u-rober");
  assert.ok(ok.vence > Date.now());
  // El acierto limpia los fallos de ese dueño; el techo del negocio no lo limpia ningún acierto.
  const limpio = (await duenio.auditLog.findFirst({ where: { tenantId: base.a.id, entity: ENTIDAD_PIN_INTENTO, entityId: base.a.id } }))?.changes as {
    intentos?: { fallos?: number };
    porDuenio?: Record<string, unknown>;
  } | null;
  assert.equal(limpio?.porDuenio?.["u-rober"], undefined);
  assert.equal(limpio?.intentos?.fallos, 5);
  // Ninguna respuesta lleva lo guardado.
  assert.ok(!JSON.stringify(ok).includes("h1:"));
});

test("3 · aislamiento: el tope de A no frena a B y el pase de A no vale en B", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base } = p;
  const { firmarComoDuenio } = await acciones();
  for (let i = 0; i < 5; i++) await ejecutarAccion(comoRecepcion(base.a), () => firmarComoDuenio({ pin: MAL }));
  const enA = valor(await ejecutarAccion(comoRecepcion(base.a), () => firmarComoDuenio({ pin: PIN.A.rober })));
  assert.ok(!enA.ok && (enA.esperaS ?? 0) > 0);
  // El PIN de A no es de nadie en B; el de B firma en B aunque A esté esperando.
  const conElDeA = valor(await ejecutarAccion(comoRecepcion(base.b), () => firmarComoDuenio({ pin: PIN.A.rober })));
  assert.equal(conElDeA.ok, false);
  const enB = valor(await ejecutarAccion(comoRecepcion(base.b), () => firmarComoDuenio({ usuarioId: "u-rober", pin: PIN.B.rober })));
  assert.ok(enB.ok, JSON.stringify(enB));
  assert.equal(verificarPase(enB.pase, clavePase(), Date.now(), { tenantId: base.a.id, uso: "firma" }).ok, false);
  assert.equal(verificarPase(enB.pase, clavePase(), Date.now(), { tenantId: base.b.id, uso: "firma" }).ok, true);
});

test("4 · aprobación: el código del motor con lo guardado no aprueba; el del servidor sí, sólo en su negocio", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio, novedad } = p;
  const { codigoParaAprobar, aprobarConCodigo } = await acciones();
  const n = novedad.A;
  const v = await vigenteDe(duenio, base.a.id);
  const sal = (JSON.parse(v.texto) as { estado: { salPin: string } }).estado.salPin;
  const rober = v.usuarios.find((u) => u.id === "u-rober")!;
  const viejo = M.codigoAprobacion({ pin: rober.pin, sal, novedadId: n.id, clienteId: n.clienteId, monto: 5000, fecha: n.fecha });
  const r1 = valor(await ejecutarAccion(comoRecepcion(base.a), () => aprobarConCodigo({ novedadId: n.id, codigo: viejo, monto: 5000 })));
  assert.equal(r1.ok, false);

  const sinPin = valor(await ejecutarAccion(comoDuenia(base.a), () => codigoParaAprobar({ novedadId: n.id, pin: MAL, monto: 5000 })));
  assert.equal(sinPin.ok, false);
  const c = valor(await ejecutarAccion(comoDuenia(base.a), () => codigoParaAprobar({ novedadId: n.id, pin: PIN.A.rober, monto: 5000, usuarioId: "u-rober" })));
  assert.ok(c.ok, JSON.stringify(c));
  assert.match(c.codigo, /^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  const otroMonto = valor(await ejecutarAccion(comoRecepcion(base.a), () => aprobarConCodigo({ novedadId: n.id, codigo: c.codigo, monto: 6000 })));
  assert.equal(otroMonto.ok, false);
  const enB = valor(await ejecutarAccion(comoRecepcion(base.b), () => aprobarConCodigo({ novedadId: novedad.B.id, codigo: c.codigo, monto: 5000 })));
  assert.equal(enB.ok, false);
  const ok = valor(await ejecutarAccion(comoRecepcion(base.a), () => aprobarConCodigo({ novedadId: n.id, codigo: c.codigo.toLowerCase(), monto: 5000 })));
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.equal(ok.usuarioId, "u-rober");
  const pase = verificarPase(ok.pase, clavePase(), Date.now(), { tenantId: base.a.id, uso: "aprobacion" });
  assert.ok(pase.ok);
  assert.equal(verificarPase(ok.pase, clavePase(), Date.now(), { tenantId: base.a.id, uso: "firma" }).ok, false);
});

test("5 · guardar con la marca conserva el PIN (recepción y OWNER); el h2 se aplica al guardar y sigue firmando", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const { guardarFotoDelClub, firmarComoDuenio } = await acciones();
  const antes = await vigenteDe(duenio, base.a.id);
  const pinDe = (us: U[], id: string) => us.find((u) => u.id === id)!.pin;

  for (const como of ["recepcion", "duenia"] as const) {
    const l = await leida(base.a, como);
    const g = valor(await ejecutarAccion(como === "duenia" ? comoDuenia(base.a) : comoRecepcion(base.a), async () => guardarFotoDelClub(await formFoto(l.texto, l.version))));
    assert.ok(g.ok, JSON.stringify(g));
    const v = await vigenteDe(duenio, base.a.id);
    for (const id of ["u-rober", "u-majo"]) assert.equal(pinDe(v.usuarios, id), pinDe(antes.usuarios, id), `${como} conserva ${id}`);
  }

  // Firmar con un PIN guardado h1 deja anotado su h2; el próximo guardado lo aplica (la foto no cambia al firmar).
  const f = valor(await ejecutarAccion(comoRecepcion(base.a), () => firmarComoDuenio({ usuarioId: "u-rober", pin: PIN.A.rober })));
  assert.ok(f.ok, JSON.stringify(f));
  assert.equal(await duenio.auditLog.count({ where: { tenantId: base.a.id, entity: ENTIDAD_PIN_FUERTE, entityId: "u-rober" } }), 1);
  const sinGuardar = await vigenteDe(duenio, base.a.id);
  assert.equal(pinDe(sinGuardar.usuarios, "u-rober"), pinDe(antes.usuarios, "u-rober"));

  const l = await leida(base.a, "recepcion");
  const g = valor(await ejecutarAccion(comoRecepcion(base.a), async () => guardarFotoDelClub(await formFoto(l.texto, l.version))));
  assert.ok(g.ok);
  const despues = await vigenteDe(duenio, base.a.id);
  assert.ok(esPinFuerte(pinDe(despues.usuarios, "u-rober")));
  assert.equal(despues.usuarios.find((u) => u.id === "u-rober")!.pinLargo, 4);
  assert.equal(pinDe(despues.usuarios, "u-majo"), pinDe(antes.usuarios, "u-majo"));
  assert.equal(await duenio.auditLog.count({ where: { tenantId: base.a.id, entity: ENTIDAD_PIN_FUERTE } }), 0, "el pendiente aplicado se borra");

  const otra = valor(await ejecutarAccion(comoRecepcion(base.a), () => firmarComoDuenio({ usuarioId: "u-rober", pin: PIN.A.rober })));
  assert.ok(otra.ok, JSON.stringify(otra));
  const l2 = await leida(base.a, "duenia");
  assert.ok(!l2.texto.includes("h2:"));
  // Y guardar otra vez desde el OWNER con la marca conserva el h2.
  const g2 = valor(await ejecutarAccion(comoDuenia(base.a), async () => guardarFotoDelClub(await formFoto(l2.texto, l2.version))));
  assert.ok(g2.ok);
  assert.equal(pinDe((await vigenteDe(duenio, base.a.id)).usuarios, "u-rober"), pinDe(despues.usuarios, "u-rober"));
});

test("6 · «Cambiar mi PIN» de un dueño (sesión OWNER) cuenta en el tope de ese dueño desde OWNER; no traba la firma desde recepción", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base } = p;
  const { cambiarMiPinDelClub } = await import("@/app/admin/(dashboard)/club/pin-del-club-actions");
  const { firmarComoDuenio } = await acciones();
  for (let i = 0; i < 5; i++) {
    const r = valor(await ejecutarAccion(comoDuenia(base.a), () => cambiarMiPinDelClub({ usuarioId: "u-rober", pinActual: MAL, pinNuevo: "3719" })));
    assert.equal(r.ok, false);
  }
  const espera = valor(await ejecutarAccion(comoDuenia(base.a), () => cambiarMiPinDelClub({ usuarioId: "u-rober", pinActual: PIN.A.rober, pinNuevo: "3719" })));
  assert.ok(!espera.ok && /esperá/.test(espera.error));
  const desdeOwner = valor(await ejecutarAccion(comoDuenia(base.a), () => firmarComoDuenio({ usuarioId: "u-rober", pin: PIN.A.rober })));
  assert.ok(!desdeOwner.ok && (desdeOwner.esperaS ?? 0) > 0, "desde OWNER, el mismo carril espera");
  // SEG-024: el carril de la recepción es otro: los fallos desde OWNER no la traban.
  for (const pedido of [{ usuarioId: "u-rober", pin: PIN.A.rober }, { pin: PIN.A.majo }]) {
    const firma = valor(await ejecutarAccion(comoRecepcion(base.a), () => firmarComoDuenio(pedido)));
    assert.ok(firma.ok, JSON.stringify(firma));
  }
});

// SEG-024: el techo de fallos desde la recepción (límite conocido de la versión publicada) ya no traba la firma ni la
// aprobación del dueño desde su sesión OWNER.
test("7 · fallos tipeados en la recepción (hasta el techo del negocio) no traban la firma del dueño desde su sesión", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio, novedad } = p;
  const { firmarComoDuenio, codigoParaAprobar } = await acciones();
  for (let i = 0; i < 5; i++) await ejecutarAccion(comoRecepcion(base.a), () => firmarComoDuenio({ pin: MAL }));
  const trabada = valor(await ejecutarAccion(comoRecepcion(base.a), () => firmarComoDuenio({ usuarioId: "u-rober", pin: PIN.A.rober })));
  assert.ok(!trabada.ok && (trabada.esperaS ?? 0) > 0 && /esperá hasta las/.test(trabada.error), "la recepción espera");
  // El techo de 20 en espera (se escribe en la base: 20 fallos reales los frena antes el tope por instancia).
  const enEspera = { fallos: 20, tandas: 1, esperaHasta: 4_102_444_800_000, ultimoFallo: 4_102_444_000_000 };
  const n = await duenio.auditLog.updateMany({ where: { tenantId: base.a.id, entity: ENTIDAD_PIN_INTENTO, entityId: base.a.id }, data: { changes: { intentos: enEspera, sinUsuario: enEspera } } });
  assert.equal(n.count, 1);
  for (const pedido of [{ usuarioId: "u-rober", pin: PIN.A.rober }, { pin: PIN.A.majo }]) {
    const firma = valor(await ejecutarAccion(comoDuenia(base.a), () => firmarComoDuenio(pedido)));
    assert.ok(firma.ok, `desde OWNER firma: ${JSON.stringify(firma)}`);
  }
  const codigo = valor(await ejecutarAccion(comoDuenia(base.a), () => codigoParaAprobar({ novedadId: novedad.A.id, pin: PIN.A.rober, monto: 5000 })));
  assert.ok(codigo.ok, JSON.stringify(codigo));
  assert.ok(!valor(await ejecutarAccion(comoRecepcion(base.a), () => firmarComoDuenio({ pin: PIN.A.rober }))).ok, "la recepción sigue en espera");
});

const pinMalDe = (pin: string) => (pin === "11" ? "22" : "11");

test("8 · «Mi PIN» de recepción: 5 PIN actuales mal y espera, por persona; no toca la firma del dueño; la fila no lleva el PIN", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio, lu } = p;
  const { cambiarMiPinDelClub } = await import("@/app/admin/(dashboard)/club/pin-del-club-actions");
  const { firmarComoDuenio } = await acciones();
  const cambiar = (pinActual: string) => ejecutarAccion(comoRecepcion(base.a), () => cambiarMiPinDelClub({ usuarioId: lu.A.id, pinActual, pinNuevo: "73" })).then(valor);
  const guardadoDeLu = async () => (await vigenteDe(duenio, base.a.id)).usuarios.find((u) => u.id === lu.A.id)?.pin;
  const antes = await guardadoDeLu();
  for (let i = 1; i <= 4; i++) {
    const r = await cambiar(pinMalDe(lu.A.pin));
    assert.ok(!r.ok && /PIN actual no es ese/.test(r.error), `intento ${i}`);
  }
  const quinto = await cambiar(pinMalDe(lu.A.pin));
  assert.ok(!quinto.ok && /esperá hasta las/.test(quinto.error), "el 5.º avisa la espera");
  const conElBueno = await cambiar(lu.A.pin);
  assert.ok(!conElBueno.ok && /esperá hasta las/.test(conElBueno.error), "durante la espera ni el PIN correcto pasa");
  assert.equal(await guardadoDeLu(), antes, "su PIN no cambió");
  // Los dueños siguen firmando en los dos carriles; otra persona (de B) no se entera.
  for (const como of [comoRecepcion(base.a), comoDuenia(base.a)]) {
    const firma = valor(await ejecutarAccion(como, () => firmarComoDuenio({ usuarioId: "u-rober", pin: PIN.A.rober })));
    assert.ok(firma.ok, JSON.stringify(firma));
  }
  const enB = valor(await ejecutarAccion(comoRecepcion(base.b), () => cambiarMiPinDelClub({ usuarioId: lu.B.id, pinActual: lu.B.pin, pinNuevo: lu.B.pin === "73" ? "58" : "73" })));
  assert.ok(enB.ok, JSON.stringify(enB));
  const fila = await duenio.auditLog.findFirst({ where: { tenantId: base.a.id, entity: ENTIDAD_PIN_INTENTO, entityId: `${base.a.id}:equipo` } });
  assert.ok(fila);
  const c = fila.changes as { porDuenio?: Record<string, { fallos?: number }>; intentos?: { fallos?: number } };
  assert.equal(c.porDuenio?.[lu.A.id]?.fallos, 5);
  assert.ok(!c.intentos?.fallos, "sin techo del negocio en el equipo");
  assert.ok(!JSON.stringify(fila.changes).includes(`"${lu.A.pin}"`));
});

test("9 · carrera: 12 «Mi PIN» mal a la vez no saltean el tope — se evalúan exactamente 5", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio, lu } = p;
  const { cambiarMiPinDelClub } = await import("@/app/admin/(dashboard)/club/pin-del-club-actions");
  await duenio.auditLog.deleteMany({ where: { tenantId: base.a.id, action: "club_cambiar_pin:rechazo" } }); // los de tests anteriores
  const respuestas = await Promise.all(
    Array.from({ length: 12 }, () => ejecutarAccion(comoRecepcion(base.a), () => cambiarMiPinDelClub({ usuarioId: lu.A.id, pinActual: pinMalDe(lu.A.pin), pinNuevo: "73" })).then(valor)),
  );
  assert.ok(respuestas.every((r) => !r.ok));
  const rechazos = await duenio.auditLog.findMany({ where: { tenantId: base.a.id, action: "club_cambiar_pin:rechazo", entityId: lu.A.id }, select: { changes: true } });
  const codigos = rechazos.map((r) => (r.changes as { codigo?: string }).codigo);
  assert.equal(codigos.filter((x) => x === "pin-actual").length, 5, `evaluados: ${codigos.join(",")}`);
  assert.equal(codigos.filter((x) => x === "espera").length, 7);
  const fila = await duenio.auditLog.findFirst({ where: { tenantId: base.a.id, entity: ENTIDAD_PIN_INTENTO, entityId: `${base.a.id}:equipo` } });
  assert.equal((fila?.changes as { porDuenio?: Record<string, { fallos?: number; tandas?: number }> }).porDuenio?.[lu.A.id]?.fallos, 5);
  // Y con el PIN correcto, en la espera, tampoco.
  const bueno = valor(await ejecutarAccion(comoRecepcion(base.a), () => cambiarMiPinDelClub({ usuarioId: lu.A.id, pinActual: lu.A.pin, pinNuevo: "73" })));
  assert.ok(!bueno.ok && /esperá hasta las/.test(bueno.error));
});
