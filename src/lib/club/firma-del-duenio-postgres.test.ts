// SEG-020 (servidor) CONTRA POSTGRES — el PIN de un dueño del club se verifica sólo en el servidor, con tope de
// intentos en la base, con las acciones REALES (estado-actions.ts, firma-del-duenio-actions.ts) y RLS encendido.
//   1. la foto que baja (OWNER y recepción) no trae credenciales de dueño (ni h1 ni h2);
//   2. tope de intentos: al 5.º fallo espera; durante la espera ni el PIN correcto pasa; «con» y «sin» usuario
//      cuentan juntos;
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
  for (const [clave, negocio] of [["A", base.a], ["B", base.b]] as const) {
    const e = M.crearClubReal(HOY);
    assert.ok(M.definirPinInicial(e, "u-rober", PIN[clave].rober, AHORA).ok);
    assert.ok(M.definirPinInicial(e, "u-majo", PIN[clave].majo, AHORA).ok);
    const alta = M.altaUsuario(e, { nombre: "Lu", rol: "recepcion" }, { usuarioId: "u-rober", pin: PIN[clave].rober }, AHORA);
    assert.ok(alta.ok);
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
  return { base, duenio, novedad };
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

test("2 · tope de intentos: 5 fallos y espera; el PIN correcto también espera; con y sin usuario cuentan juntos", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const { firmarComoDuenio } = await acciones();
  const firmar = (pedido: { usuarioId?: string; pin: string }) => ejecutarAccion(comoRecepcion(base.a), () => firmarComoDuenio(pedido)).then(valor);

  for (let i = 1; i <= 4; i++) {
    const r = await firmar(i % 2 ? { usuarioId: "u-rober", pin: MAL } : { pin: MAL });
    assert.equal(r.ok, false);
    assert.ok(!r.ok && !r.esperaS, `intento ${i} todavía no espera`);
  }
  const quinto = await firmar({ pin: MAL });
  assert.ok(!quinto.ok && quinto.esperaS === 30);
  for (const pedido of [{ usuarioId: "u-rober", pin: PIN.A.rober }, { pin: PIN.A.majo }]) {
    const r = await firmar(pedido);
    assert.ok(!r.ok && (r.esperaS ?? 0) > 0, "durante la espera no pasa ni el PIN correcto");
  }
  const fila = await duenio.auditLog.findFirst({ where: { tenantId: base.a.id, entity: ENTIDAD_PIN_INTENTO } });
  assert.ok(fila);
  assert.ok(!JSON.stringify(fila.changes).includes(PIN.A.rober));

  // Pasada la espera (se adelanta en la base), el PIN correcto firma con un pase y limpia el tope.
  await duenio.auditLog.updateMany({ where: { id: fila.id }, data: { changes: { intentos: { fallos: 5, tandas: 1, esperaHasta: 1, ultimoFallo: Date.now() } } } });
  const ok = await firmar({ pin: PIN.A.majo });
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.equal(ok.usuarioId, "u-majo");
  const pase = verificarPase(ok.pase, clavePase(), Date.now(), { tenantId: base.a.id, uso: "firma" });
  assert.ok(pase.ok && pase.usuarioId === "u-majo");
  assert.ok(ok.vence > Date.now());
  const limpio = await duenio.auditLog.findFirst({ where: { tenantId: base.a.id, entity: ENTIDAD_PIN_INTENTO } });
  assert.equal((limpio?.changes as { intentos?: { fallos?: number } } | null)?.intentos?.fallos ?? 0, 0);
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

test("6 · «Cambiar mi PIN» de un dueño cuenta en el mismo tope del negocio", async (t) => {
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
  const firma = valor(await ejecutarAccion(comoRecepcion(base.a), () => firmarComoDuenio({ usuarioId: "u-majo", pin: PIN.A.majo })));
  assert.ok(!firma.ok && (firma.esperaS ?? 0) > 0);
});
