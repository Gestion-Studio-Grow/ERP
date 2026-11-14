// Alta web de Factoque — `pedirAlta` según el mail del SERVIDOR (fix 11/11: prod no tenía RESEND_* y la
// pantalla decía «revisá tu mail»). Sin base ni red: el Prisma y el correo son de mentira.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@/generated/prisma/client";
import { crearLimites, REGLAS_DEL_ALTA, RESPUESTA_DEL_PEDIDO } from "./alta-web-core";
import { MENSAJE_ACTIVAR_FACTOQUE, RESPUESTA_SIN_MAIL_WHATSAPP } from "./alta-web-form";
import { pedirAlta, type DepsAltaWeb } from "./alta-web.server";

const CUIT = "20123456786";
const EMAIL = "titular@ficticio.test";
const pedido = (extra: Partial<Record<string, string>> = {}) => ({
  nombre: "Kiosco Ficticio",
  cuit: CUIT,
  condicion: "monotributo",
  puntoVenta: "7",
  email: EMAIL,
  trampa: "",
  ...extra,
});

function preparar(extra: Partial<DepsAltaWeb>) {
  const mails: string[] = [];
  let consultas = 0;
  // CUIT libre: ningún negocio lo tiene.
  const tx = { $executeRaw: async () => 0, tenant: { findMany: async () => (consultas++, []) } };
  const deps: DepsAltaWeb = {
    prisma: { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) } as unknown as PrismaClient,
    correo: { enviar: async (m) => (mails.push(m.para), { sent: true }) },
    secreto: "secreto-de-prueba",
    ahora: () => Date.UTC(2026, 10, 11, 17),
    limites: crearLimites(REGLAS_DEL_ALTA, () => Date.UTC(2026, 10, 11, 17)),
    origenPublico: "https://factoque.erp.test",
    origenDelNegocio: (sub) => `https://${sub}.erp.test`,
    ...extra,
  };
  return { deps, mails, consultas: () => consultas };
}

const sinDatosDelPedido = (texto: string) => {
  assert.doesNotMatch(texto, /ficticio|titular|20123456786|20-12345678-6|Kiosco/i, "no lleva mail, CUIT ni nombre");
  assert.doesNotMatch(texto, /ya (existe|tiene|está)/i);
};

test("con el mail conectado: la respuesta de siempre, sin botón, y sale el mail", async () => {
  const p = preparar({ mailConectado: () => true, canalDeActivacion: () => ({ tipo: "whatsapp", base: "https://wa.me/5491100000000?text=" }) });
  const r = await pedirAlta(p.deps, pedido(), "1.1.1.1");
  assert.deepEqual(r, { ok: true, mensaje: RESPUESTA_DEL_PEDIDO });
  assert.deepEqual(p.mails, [EMAIL]);
});

test("sin mail conectado: no promete mail, manda a WhatsApp con un texto sin datos, y no toca la base", async () => {
  const p = preparar({ mailConectado: () => false, canalDeActivacion: () => ({ tipo: "whatsapp", base: "https://wa.me/5491100000000?text=" }) });
  const r = await pedirAlta(p.deps, pedido(), "1.1.1.2");
  assert.ok(r.ok && "mensaje" in r);
  assert.equal(r.mensaje, RESPUESTA_SIN_MAIL_WHATSAPP);
  assert.doesNotMatch(r.mensaje, /mail/i, "no dice «revisá tu mail»");
  assert.ok(r.ok && r.activacion);
  assert.equal(r.activacion.tipo, "whatsapp");
  assert.equal(r.activacion.enlace, `https://wa.me/5491100000000?text=${encodeURIComponent(MENSAJE_ACTIVAR_FACTOQUE)}`);
  sinDatosDelPedido(decodeURIComponent(r.activacion.enlace));
  sinDatosDelPedido(r.mensaje);
  assert.deepEqual(p.mails, [], "no intenta mandar el mail");
  assert.equal(p.consultas(), 0, "no consulta si el CUIT existe");
});

test("sin mail: la respuesta es la misma para cualquier CUIT o mail (anti-enumeración), y el robot recibe lo mismo", async () => {
  const p = preparar({ mailConectado: () => false, canalDeActivacion: () => ({ tipo: "whatsapp", base: "https://wa.me/5491100000000?text=" }) });
  const a = await pedirAlta(p.deps, pedido(), "2.2.2.1");
  const b = await pedirAlta(p.deps, pedido({ cuit: "27333444556", email: "otra@ficticio.test" }), "2.2.2.2");
  const robot = await pedirAlta(p.deps, pedido({ trampa: "http://spam.test" }), "2.2.2.3");
  assert.deepEqual(a, b);
  assert.deepEqual(a, robot);
});

test("sin mail y sin WhatsApp cargado: la casilla de GSG, nunca un número inventado", async () => {
  const p = preparar({ mailConectado: () => false, canalDeActivacion: () => ({ tipo: "mail", casilla: "gestionstudiogrow@gmail.com" }) });
  const r = await pedirAlta(p.deps, pedido(), "3.3.3.1");
  assert.ok(r.ok && r.activacion);
  assert.equal(r.activacion.tipo, "mail");
  assert.match(r.mensaje, /gestionstudiogrow@gmail\.com/);
  assert.match(r.activacion.enlace, /^mailto:gestionstudiogrow@gmail\.com\?/);
  sinDatosDelPedido(decodeURIComponent(r.activacion.enlace));
});

test("los errores de validación no cambian: sin mail igual se piden los datos que faltan", async () => {
  const p = preparar({ mailConectado: () => false });
  const r = await pedirAlta(p.deps, pedido({ email: "" }), "4.4.4.1");
  assert.equal(r.ok, false);
});
