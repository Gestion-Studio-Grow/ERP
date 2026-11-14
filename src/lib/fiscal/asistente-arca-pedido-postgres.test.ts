// ============================================================================
// PEDIDO DE CERTIFICADO DE ARCA — doble clic y descarte del pedido de otra clave, en Postgres con RLS.
// ============================================================================
//
// Seguimiento del #147 (Factoque):
//   · Doble clic al generar: queda UN pedido y es el PRIMERO que se guarda. Antes el segundo, si
//     llegaba después de que el primero terminara, borraba el del primero y dejaba el suyo (dos filas
//     de auditoría, y el .csr que la persona quizá ya bajó dejaba de servir). Se prueba sin relojes
//     ni azar en la decisión: los dos pedidos se PREPARAN (leen «no hay») antes de guardar ninguno.
//   · El operador puede descartar un pedido cerrado con OTRA clave maestra (el asistente lo bloquea
//     y el cliente queda trabado): con confirmación tipeada, auditoría y sin material en ningún lado.
//     Un pedido que abre (aunque cambie la etiqueta), uno dañado o ninguno: no se descarta.
//   · Sólo con sesión de consola: la dueña del negocio con su panel va al login y nada se borra.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { sealSecret, type MasterKey } from "@/lib/fiscal/cert-crypto";

const laBase = baseEfimeraDelArchivo();

const CLAVE_ACTUAL = Buffer.alloc(32, 7);
const KEK_ACTUAL = "kek:actual";
const CLAVE_VIEJA: MasterKey = { key: Buffer.alloc(32, 9), id: "kek:vieja" };
const CREADO_EN = "2026-11-01T12:00:00.000Z";

async function preparar(t: Parameters<typeof laBase>[0]) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  const previo = {
    FISCAL_MASTER_KEY: process.env.FISCAL_MASTER_KEY,
    FISCAL_MASTER_KEY_ID: process.env.FISCAL_MASTER_KEY_ID,
    AUTH_SECRET: process.env.AUTH_SECRET,
    OPERADORES: process.env.OPERADORES,
    OPERADOR_DUENIO: process.env.OPERADOR_DUENIO,
  };
  process.env.FISCAL_MASTER_KEY = CLAVE_ACTUAL.toString("base64");
  process.env.FISCAL_MASTER_KEY_ID = KEK_ACTUAL;
  const { valorDeClave } = await import("@/lib/operador/clave-operador");
  process.env.AUTH_SECRET = "secreto-de-auth-qa";
  process.env.OPERADORES = `soporte-qa=${await valorDeClave("clave larga de soporte qa", new Uint8Array(16).fill(5))}`;
  delete process.env.OPERADOR_DUENIO;
  t.after(() => {
    for (const [k, v] of Object.entries(previo)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  prepararAccionesDeServidor();
  const srv = await import("./asistente-arca.server");
  const pura = await import("./asistente-arca");
  const { operatorPrisma } = await import("@/lib/operator-db");
  base.alBorrar(() => operatorPrisma.$disconnect());
  const comoDuenio = await prismaComoDuenio(base);
  for (const n of [base.a, base.b]) {
    await comoDuenio.tenant.update({ where: { id: n.id }, data: { arcaCuit: "20123456786", arcaRazonSocial: `Negocio ${n.slug}` } });
  }
  return { base, srv, pura, comoDuenio };
}

type Ctx = NonNullable<Awaited<ReturnType<typeof preparar>>>;

const huella = (tenantId: string) => `pedido-csr:${tenantId}`;

function filasDelPedido(c: Ctx, tenantId: string) {
  return c.comoDuenio.arcaAuthTicket.findMany({
    where: { tenantId, certHuella: huella(tenantId), service: c.srv.SERVICIO_PEDIDO },
    select: { id: true, kekId: true, sealed: true },
  });
}

function auditoria(c: Ctx, tenantId: string, action: string) {
  return c.comoDuenio.auditLog.findMany({ where: { tenantId, action }, select: { actor: true, changes: true } });
}

async function limpiar(c: Ctx, b: BaseEfimera) {
  for (const id of [b.a.id, b.b.id]) {
    await c.comoDuenio.arcaAuthTicket.deleteMany({ where: { tenantId: id, service: c.srv.SERVICIO_PEDIDO } });
    await c.comoDuenio.auditLog.deleteMany({ where: { tenantId: id, action: { in: [c.srv.ACCION_PEDIDO_CSR, c.srv.ACCION_PEDIDO_DESCARTADO] } } });
  }
}

async function sembrarPedido(c: Ctx, tenantId: string, master: MasterKey, kekId = master.id) {
  const sobre = sealSecret(JSON.stringify({ keyPem: "clave-de-prueba", csrPem: "csr-de-prueba" }), master);
  await c.comoDuenio.arcaAuthTicket.create({
    data: { tenantId, certHuella: huella(tenantId), service: c.srv.SERVICIO_PEDIDO, ...sobre, kekId, expiration: CREADO_EN },
  });
}

test("doble clic: el segundo que llega después NO pisa al primero (queda uno, el primero)", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const { base, srv, pura } = c;
  await limpiar(c, base);
  const a = await srv.prepararPedidoDelNegocio(base.a.id);
  const b = await srv.prepararPedidoDelNegocio(base.a.id);
  assert.ok(a.ok && b.ok, "los dos leyeron «no hay pedido»");
  const ra = await srv.guardarPedidoDelNegocio(a.pedido, "user:primero");
  assert.equal(ra.ok, true, JSON.stringify(ra));
  const rb = await srv.guardarPedidoDelNegocio(b.pedido, "user:segundo");
  assert.deepEqual(rb, { ok: false, motivo: pura.MOTIVO_PEDIDO_EN_CURSO });
  const filas = await filasDelPedido(c, base.a.id);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].sealed, a.pedido.sobre.sealed, "queda el del primero");
  const audit = await auditoria(c, base.a.id, srv.ACCION_PEDIDO_CSR);
  assert.deepEqual(audit.map((f) => f.actor), ["user:primero"]);
});

test("doble clic simultáneo: queda uno solo, el del pedido que respondió bien", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const { base, srv, pura } = c;
  await limpiar(c, base);
  const a = await srv.prepararPedidoDelNegocio(base.a.id);
  const b = await srv.prepararPedidoDelNegocio(base.a.id);
  assert.ok(a.ok && b.ok);
  const [ra, rb] = await Promise.all([
    srv.guardarPedidoDelNegocio(a.pedido, "user:a"),
    srv.guardarPedidoDelNegocio(b.pedido, "user:b"),
  ]);
  const oks = [ra, rb].filter((r) => r.ok);
  assert.equal(oks.length, 1, JSON.stringify([ra, rb]));
  const perdio = ra.ok ? rb : ra;
  assert.deepEqual(perdio, { ok: false, motivo: pura.MOTIVO_PEDIDO_EN_CURSO });
  const filas = await filasDelPedido(c, base.a.id);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].sealed, (ra.ok ? a : b).pedido.sobre.sealed);
  assert.equal((await auditoria(c, base.a.id, srv.ACCION_PEDIDO_CSR)).length, 1);
});

test("generar otro pedido a propósito sigue reemplazando; uno preparado antes del reemplazo, no", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const { base, srv, pura } = c;
  await limpiar(c, base);
  const primero = await srv.generarPedidoDelNegocio(base.a.id, "user:a");
  assert.equal(primero.ok, true, JSON.stringify(primero));
  const viejo = await srv.prepararPedidoDelNegocio(base.a.id);
  const nuevo = await srv.prepararPedidoDelNegocio(base.a.id);
  assert.ok(viejo.ok && nuevo.ok);
  assert.equal((await srv.guardarPedidoDelNegocio(nuevo.pedido, "user:a")).ok, true);
  assert.deepEqual(await srv.guardarPedidoDelNegocio(viejo.pedido, "user:a"), { ok: false, motivo: pura.MOTIVO_PEDIDO_EN_CURSO });
  const filas = await filasDelPedido(c, base.a.id);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].sealed, nuevo.pedido.sobre.sealed);
});

test("descartar el pedido de otra clave: con confirmación, auditado, sin material, sólo en ese negocio", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const { base, srv, pura } = c;
  await limpiar(c, base);
  await sembrarPedido(c, base.a.id, CLAVE_VIEJA);
  await sembrarPedido(c, base.b.id, CLAVE_VIEJA);
  assert.equal((await srv.leerPedidoPendiente(base.a.id)).estado, "otra-clave");

  for (const conf of [undefined, "", "si", "DESCARTA"]) {
    const r = await srv.descartarPedidoDeOtraClave(base.a.id, "operator:soporte-qa", conf);
    assert.equal(r.ok, false, JSON.stringify(conf));
  }
  assert.equal((await filasDelPedido(c, base.a.id)).length, 1, "sin confirmación no se borra nada");

  const r = await srv.descartarPedidoDeOtraClave(base.a.id, "operator:soporte-qa", ` ${pura.PALABRA_DEL_DESCARTE.toLowerCase()} `);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal((await filasDelPedido(c, base.a.id)).length, 0);
  assert.equal((await filasDelPedido(c, base.b.id)).length, 1, "el de otro negocio queda");
  assert.equal((await srv.leerPedidoPendiente(base.a.id)).estado, "ninguno");
  const audit = await auditoria(c, base.a.id, srv.ACCION_PEDIDO_DESCARTADO);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actor, "operator:soporte-qa");
  assert.deepEqual(audit[0].changes, { motivo: "otra-clave", kekIdDelPedido: CLAVE_VIEJA.id, creadoEn: CREADO_EN });
  // Ya se puede generar uno nuevo.
  assert.equal((await srv.generarPedidoDelNegocio(base.a.id, "user:a")).ok, true);
});

test("descartar: no se descarta lo que abre, lo dañado ni lo que no existe", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const { base, srv, pura } = c;
  const actual: MasterKey = { key: CLAVE_ACTUAL, id: KEK_ACTUAL };
  const palabra = pura.PALABRA_DEL_DESCARTE;

  await limpiar(c, base);
  assert.equal((await srv.descartarPedidoDeOtraClave(base.a.id, "operator:x", palabra)).ok, false, "no hay pedido");

  // Otra etiqueta pero la misma clave: abre, es «pendiente» (sólo cambió FISCAL_MASTER_KEY_ID).
  await sembrarPedido(c, base.a.id, actual, "kek:etiqueta-vieja");
  assert.equal((await srv.descartarPedidoDeOtraClave(base.a.id, "operator:x", palabra)).ok, false);
  assert.equal((await filasDelPedido(c, base.a.id)).length, 1);

  // Misma etiqueta, no abre: «dañado» (el cliente ya puede generar otro; no es de otra clave).
  await limpiar(c, base);
  await sembrarPedido(c, base.a.id, CLAVE_VIEJA, KEK_ACTUAL);
  assert.equal((await srv.leerPedidoPendiente(base.a.id)).estado, "dañado");
  assert.equal((await srv.descartarPedidoDeOtraClave(base.a.id, "operator:x", palabra)).ok, false);
  assert.equal((await filasDelPedido(c, base.a.id)).length, 1);
  assert.equal((await auditoria(c, base.a.id, srv.ACCION_PEDIDO_DESCARTADO)).length, 0);
});

test("descartar desde la consola: sin sesión de operador va al login y no borra; con sesión, borra", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const { base, srv, pura } = c;
  await limpiar(c, base);
  await sembrarPedido(c, base.a.id, CLAVE_VIEJA);
  const { descartarPedidoCertificadoArca } = await import("@/lib/operator-actions");
  const { createOperatorToken } = await import("@/lib/operator-auth");
  const form = () => {
    const f = new FormData();
    f.set("tenantId", base.a.id);
    f.set("confirmacion", pura.PALABRA_DEL_DESCARTE);
    return f;
  };
  for (const pedido of [{ negocio: base.a, usuario: base.a.duenia }, { cookies: { operator_session: "op|d|duenio|0000000000000.firma-falsa" } }]) {
    const s = await ejecutarAccion(pedido, () => descartarPedidoCertificadoArca(form()));
    assert.equal(s.tipo, "redireccion", JSON.stringify(s));
    assert.match((s as { destino: string }).destino, /\/operador\/login/);
  }
  assert.equal((await filasDelPedido(c, base.a.id)).length, 1, "sin consola no se borra");

  const s = await ejecutarAccion({ cookies: { operator_session: await createOperatorToken("soporte-qa") } }, () =>
    descartarPedidoCertificadoArca(form()),
  );
  assert.equal(s.tipo, "redireccion", JSON.stringify(s));
  assert.match((s as { destino: string }).destino, /pestana=fiscal&ok=/);
  assert.equal((await filasDelPedido(c, base.a.id)).length, 0);
  const audit = await auditoria(c, base.a.id, srv.ACCION_PEDIDO_DESCARTADO);
  assert.deepEqual(audit.map((f) => f.actor), ["operator:soporte-qa"]);
});
