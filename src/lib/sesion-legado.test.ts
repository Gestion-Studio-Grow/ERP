// Excepción única al corte del token viejo (orden del dueño, 08/11/2026): sólo Macarena Arias en beauty-spa canjea
// su token viejo por uno v2; los demás quedan afuera ya. La decisión sale del usuario CARGADO DE LA BASE.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { authSecret, createSessionToken, idDelTokenLegadoParaCanje, readSessionToken, VIGENCIA_SESION_MS } from "./auth";
import {
  canjearTokenLegado,
  CORTE_LEGADO_V1,
  destinoDeRenovar,
  FIN_LEGADO_V1,
  planDeRenovacion,
  usuariosConLegadoV1,
  type DependenciasDelCanje,
  type UsuarioParaCanje,
} from "./sesion-legado";

const CH = "tenant-ch";
const MACA: UsuarioParaCanje = { id: "cmmacarena0000001", email: "macarenaarias21@gmail.com", tenantId: CH };
const OTRA: UsuarioParaCanje = { id: "cmrecepcion000001", email: "recepcion@chestetica.test", tenantId: CH };
const LISTA = usuariosConLegadoV1({});

const tokenViejo = (userId: string) => `${userId}.${createHmac("sha256", authSecret()).update(userId).digest("hex")}`;

/**
 * La base de prueba: usuarios por (id, negocio), cuántas veces se la consultó, y `lastLoginAt` por id. `reclamarCanje`
 * imita el UPDATE condicional de la ruta: compara y escribe sin ceder el turno (atómico, como la fila bloqueada).
 */
function base(usuarios: UsuarioParaCanje[]) {
  const llamadas: string[] = [];
  const ultimo = new Map<string, Date | null>(usuarios.map((u) => [u.id, u.lastLoginAt ?? null]));
  return {
    llamadas,
    ultimo,
    cargarUsuario: async (id: string, tenantId: string) => {
      llamadas.push(id);
      const u = usuarios.find((x) => x.id === id && x.tenantId === tenantId);
      return u ? { ...u, lastLoginAt: ultimo.get(id) ?? null } : null;
    },
    reclamarCanje: async (id: string, tenantId: string, ahora: number, corte: number) => {
      if (!usuarios.some((x) => x.id === id && x.tenantId === tenantId)) return false;
      const l = ultimo.get(id) ?? null;
      if (l && !(l.getTime() < corte)) return false;
      ultimo.set(id, new Date(ahora));
      return true;
    },
  };
}

const deps = (b: Pick<DependenciasDelCanje, "cargarUsuario" | "reclamarCanje">, extra: Partial<Parameters<typeof canjearTokenLegado>[1]> = {}) => ({
  slugDelPedido: "beauty-spa",
  tenantIdDelPedido: CH,
  cargarUsuario: b.cargarUsuario,
  reclamarCanje: b.reclamarCanje,
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
  assert.equal(await canjearTokenLegado(tokenViejo(MACA.id), deps({ cargarUsuario: async () => deMagra, reclamarCanje: async () => true })), null);
});

test("falla cerrada: usuario inactivo/borrado (la base no lo devuelve), base caída, lista vacía", async () => {
  assert.equal(await canjearTokenLegado(tokenViejo(MACA.id), deps(base([]))), null);
  const caida = { cargarUsuario: async (): Promise<UsuarioParaCanje | null> => { throw new Error("db"); } };
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

// ── Cert 5: una sola vez, fecha tope, destino y GET cruzado ──────────────────────────────────────────────────────

test("UNA VEZ: el segundo canje de la misma copia del token viejo se rechaza", async () => {
  const b = base([{ ...MACA, lastLoginAt: new Date(CORTE_LEGADO_V1 - 86_400_000) }]);
  assert.ok(await canjearTokenLegado(tokenViejo(MACA.id), deps(b)));
  assert.ok((b.ultimo.get(MACA.id)?.getTime() ?? 0) >= CORTE_LEGADO_V1, "el canje marca lastLoginAt");
  assert.equal(await canjearTokenLegado(tokenViejo(MACA.id), deps(b)), null);
});

test("UNA VEZ: canjes simultáneos → uno solo pasa", async () => {
  const b = base([MACA]);
  const rs = await Promise.all(Array.from({ length: 8 }, () => canjearTokenLegado(tokenViejo(MACA.id), deps(b))));
  assert.equal(rs.filter(Boolean).length, 1);
});

test("UNA VEZ: si entró con su clave después del corte, el token viejo ya no se canjea", async () => {
  const b = base([{ ...MACA, lastLoginAt: new Date(CORTE_LEGADO_V1 + 1) }]);
  assert.equal(await canjearTokenLegado(tokenViejo(MACA.id), deps(b)), null);
});

test("falla cerrada: sin reclamarCanje, o si tira, no hay canje", async () => {
  const b = base([MACA]);
  assert.equal(await canjearTokenLegado(tokenViejo(MACA.id), { ...deps(b), reclamarCanje: undefined }), null);
  const tira = async () => { throw new Error("db"); };
  assert.equal(await canjearTokenLegado(tokenViejo(MACA.id), deps(b, { reclamarCanje: tira })), null);
});

test("FECHA TOPE: desde el 08/12/2026 (hora argentina) no se canjea; antes del corte tampoco", async () => {
  assert.equal(FIN_LEGADO_V1, Date.parse("2026-12-08T03:00:00Z"));
  assert.ok(await canjearTokenLegado(tokenViejo(MACA.id), deps(base([MACA]), { ahora: FIN_LEGADO_V1 - 1 })));
  assert.equal(await canjearTokenLegado(tokenViejo(MACA.id), deps(base([MACA]), { ahora: FIN_LEGADO_V1 })), null);
  assert.equal(await canjearTokenLegado(tokenViejo(MACA.id), deps(base([MACA]), { ahora: CORTE_LEGADO_V1 - 1 })), null);
  assert.equal(await canjearTokenLegado(tokenViejo(MACA.id), deps(base([MACA]), { ahora: Number.NaN })), null);
});

test("ATAQUE: next con tab/CR/LF, //, \\ o absoluto → /admin; ruta interna se respeta", () => {
  for (const evil of ["/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "//evil.com", "/\\evil.com", "https://evil.com", "", null]) {
    assert.equal(destinoDeRenovar(evil), "/admin", JSON.stringify(evil));
  }
  assert.equal(destinoDeRenovar("/admin/turnos?d=1"), "/admin/turnos?d=1");
});

test("ATAQUE: GET cruzado con una sesión v2 válida no borra la cookie ni consulta la base", async () => {
  const v2 = await createSessionToken(MACA.id);
  let cargas = 0;
  const plan = await planDeRenovacion(v2, "/\t/evil.com", async () => { cargas++; return deps(base([MACA])); });
  assert.deepEqual(plan, { tipo: "seguir", next: "/admin" });
  assert.equal(cargas, 0);
});

test("renovar: v1 no canjeable → borra; basura o v2 vencido → no borra; v1 de Macarena → canjeado", async () => {
  const b = base([MACA, OTRA]);
  assert.deepEqual(await planDeRenovacion(tokenViejo(OTRA.id), "/admin", async () => deps(b)), { tipo: "vencida", next: "/admin", borrarCookie: true });
  assert.deepEqual(await planDeRenovacion("basura", "/admin", async () => deps(b)), { tipo: "vencida", next: "/admin", borrarCookie: false });
  const vencido = await createSessionToken(MACA.id, Date.now() - VIGENCIA_SESION_MS - 1);
  assert.deepEqual(await planDeRenovacion(vencido, "/admin", async () => deps(b)), { tipo: "vencida", next: "/admin", borrarCookie: false });
  const tira = async () => { throw new Error("sin negocio"); };
  assert.deepEqual(await planDeRenovacion(tokenViejo(MACA.id), null, tira), { tipo: "vencida", next: "/admin", borrarCookie: true });
  const ok = await planDeRenovacion(tokenViejo(MACA.id), "/admin/caja", async () => deps(b));
  assert.equal(ok.tipo, "canjeado");
});
