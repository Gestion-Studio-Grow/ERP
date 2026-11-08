// Excepción única al corte del token viejo (orden del dueño, 08/11/2026): sólo Macarena Arias en beauty-spa canjea
// su token viejo por uno v2; los demás quedan afuera ya. La decisión sale del usuario CARGADO DE LA BASE.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { authSecret, idDelTokenLegadoParaCanje, readSessionToken, VIGENCIA_SESION_MS } from "./auth";
import { canjearTokenLegado, usuariosConLegadoV1, type UsuarioParaCanje } from "./sesion-legado";

const CH = "tenant-ch";
const MACA: UsuarioParaCanje = { id: "cmmacarena0000001", email: "macarenaarias21@gmail.com", tenantId: CH };
const OTRA: UsuarioParaCanje = { id: "cmrecepcion000001", email: "recepcion@chestetica.test", tenantId: CH };
const LISTA = usuariosConLegadoV1({});

const tokenViejo = (userId: string) => `${userId}.${createHmac("sha256", authSecret()).update(userId).digest("hex")}`;

/** La base de prueba: usuarios por (id, negocio), y cuántas veces se la consultó. */
function base(usuarios: UsuarioParaCanje[]) {
  const llamadas: string[] = [];
  return {
    llamadas,
    cargarUsuario: async (id: string, tenantId: string) => {
      llamadas.push(id);
      return usuarios.find((u) => u.id === id && u.tenantId === tenantId) ?? null;
    },
  };
}

const deps = (b: ReturnType<typeof base>, extra: Partial<Parameters<typeof canjearTokenLegado>[1]> = {}) => ({
  slugDelPedido: "beauty-spa",
  tenantIdDelPedido: CH,
  cargarUsuario: b.cargarUsuario,
  lista: LISTA,
  ...extra,
});

test("el token viejo de Macarena se acepta y se re-emite como v2 de 8 h", async () => {
  const ahora = Date.now();
  const r = await canjearTokenLegado(tokenViejo(MACA.id), deps(base([MACA, OTRA]), { ahora }));
  assert.ok(r);
  assert.equal(r.userId, MACA.id);
  assert.match(r.tokenNuevo, /^v2\|cmmacarena0000001\|\d{13}\|\d{13}\.[0-9a-f]{64}$/);
  assert.equal(await readSessionToken(r.tokenNuevo), MACA.id);
  // Sin renovación deslizante: a las 8 h del canje vence como cualquier v2.
  assert.equal(await readSessionToken(r.tokenNuevo, { ahora: ahora + VIGENCIA_SESION_MS }), null);
});

test("ATAQUE: el token viejo de cualquier otro usuario se rechaza ya (aunque esté activo en CH)", async () => {
  assert.equal(await canjearTokenLegado(tokenViejo(OTRA.id), deps(base([MACA, OTRA]))), null);
});

test("ATAQUE: un token viejo falsificado con el id de Macarena se rechaza sin consultar la base", async () => {
  const b = base([MACA]);
  assert.equal(await canjearTokenLegado(`${MACA.id}.${"a".repeat(64)}`, deps(b)), null);
  assert.equal(await canjearTokenLegado(`${MACA.id}.${createHmac("sha256", "otra-clave").update(MACA.id).digest("hex")}`, deps(b)), null);
  assert.equal(await canjearTokenLegado(MACA.id, deps(b)), null);
  assert.deepEqual(b.llamadas, []);
});

test("ATAQUE: otro negocio se rechaza (por el pedido o porque el usuario no es del negocio)", async () => {
  const deMagra = { ...MACA, tenantId: "tenant-magra" };
  // El pedido viene de otro negocio, aunque el usuario tenga el mismo email.
  assert.equal(await canjearTokenLegado(tokenViejo(MACA.id), deps(base([deMagra]), { slugDelPedido: "magra", tenantIdDelPedido: "tenant-magra" })), null);
  // El pedido es de CH pero el usuario es de otro negocio: la base no lo encuentra en CH.
  assert.equal(await canjearTokenLegado(tokenViejo(MACA.id), deps(base([deMagra]))), null);
  // Sin negocio resuelto (sandbox): falla cerrada.
  assert.equal(await canjearTokenLegado(tokenViejo(MACA.id), deps(base([MACA]), { slugDelPedido: null })), null);
  // Una base que devuelve un usuario de otro negocio tampoco pasa.
  assert.equal(await canjearTokenLegado(tokenViejo(MACA.id), deps({ llamadas: [], cargarUsuario: async () => deMagra })), null);
});

test("falla cerrada: usuario inactivo/borrado (la base no lo devuelve), base caída, lista vacía", async () => {
  assert.equal(await canjearTokenLegado(tokenViejo(MACA.id), deps(base([]))), null);
  const caida = { llamadas: [], cargarUsuario: async () => { throw new Error("db"); } };
  assert.equal(await canjearTokenLegado(tokenViejo(MACA.id), deps(caida)), null);
  assert.equal(await canjearTokenLegado(tokenViejo(MACA.id), deps(base([MACA]), { lista: new Set() })), null);
  // Un token v2 no es «viejo»: no se canjea.
  assert.equal(await idDelTokenLegadoParaCanje(`v2|${MACA.id}|0|0.${"a".repeat(64)}`), null);
});

test("la lista se compara contra el email de la BASE, sin distinguir mayúsculas", async () => {
  const conMayus = { ...MACA, email: "  MacarenaArias21@Gmail.com " };
  assert.ok(await canjearTokenLegado(tokenViejo(MACA.id), deps(base([conMayus]))));
  // Si en la base el email cambió, la excepción ya no lo cubre aunque el id firmado sea el suyo.
  const cambiado = { ...MACA, email: "carolina@chestetica.test" };
  assert.equal(await canjearTokenLegado(tokenViejo(MACA.id), deps(base([cambiado]))), null);
});

test("LEGADO_V1_USUARIOS reemplaza la lista por defecto; `ninguno` la vacía", () => {
  assert.deepEqual([...usuariosConLegadoV1({})], ["macarenaarias21@gmail.com"]);
  assert.deepEqual([...usuariosConLegadoV1({ LEGADO_V1_USUARIOS: "Maca@CH.test, otra@ch.test" })], ["maca@ch.test", "otra@ch.test"]);
  assert.equal(usuariosConLegadoV1({ LEGADO_V1_USUARIOS: "ninguno" }).size, 0);
  assert.equal(usuariosConLegadoV1({ LEGADO_V1_USUARIOS: "sin-arroba" }).size, 0);
});

test("ATAQUE: un payload viejo que no es un id (con | o vacío) no se canjea", async () => {
  for (const raro of ["op|d|duenio|1700000000000", "a b", "x/../y"]) {
    assert.equal(await idDelTokenLegadoParaCanje(tokenViejo(raro)), null, raro);
  }
});
