// PIN de desbloqueo de la sesión (orden del dueño, 08/11/2026). Base en memoria con la misma semántica que el UPDATE
// condicional de sesion-pin.server.ts; el hash es el scrypt real de auth-password.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, leerSesion } from "./auth";
import { hashPassword, verifyPassword } from "./auth-password";
import {
  desbloquearConPin,
  MAX_INTENTOS_PIN,
  normalizarPin,
  problemaDelPinNuevo,
  puedeDefinirPin,
  VENTANA_DEFINIR_PIN_MS,
  type DependenciasDelPin,
  type PinGuardado,
} from "./sesion-pin";

const UID = "cmusuariopin000001";
const T = "tenant-ch";
const MIN = 60_000;
const DIA = 24 * 60 * MIN;
const AHORA = Date.UTC(2026, 10, 9, 15);

type Fila = PinGuardado & { tenantId: string };

async function base(opciones: { pin?: string | null; fallos?: number; activo?: boolean } = {}) {
  const filas = new Map<string, Fila>();
  if (opciones.pin !== null) {
    filas.set(UID, { tenantId: T, pinHash: await hashPassword(opciones.pin ?? "4826"), fallos: opciones.fallos ?? 0 });
  }
  let comparaciones = 0;
  const deps = (extra: Partial<DependenciasDelPin> = {}): DependenciasDelPin => ({
    tenantIdDelPedido: T,
    ahora: AHORA,
    usuarioActivo: async (id, tenantId) => id === UID && tenantId === T && opciones.activo !== false,
    cargarPin: async (id, tenantId) => {
      const f = filas.get(id);
      return f && f.tenantId === tenantId ? { pinHash: f.pinHash, fallos: f.fallos } : null;
    },
    reservarIntento: async (id, tenantId, max) => {
      const f = filas.get(id);
      if (!f || f.tenantId !== tenantId || !(f.fallos < max)) return false;
      f.fallos += 1;
      return true;
    },
    reiniciarFallos: async (id) => {
      const f = filas.get(id);
      if (f) f.fallos = 0;
    },
    verificar: async (pin, hash) => {
      comparaciones++;
      return verifyPassword(pin, hash);
    },
    ...extra,
  });
  return { filas, deps, comparaciones: () => comparaciones };
}

const bloqueado = (ingreso = AHORA - 2 * 60 * MIN) => createSessionToken(UID, AHORA - 20 * MIN, ingreso);

test("BLOQUEO + PIN correcto: destraba sin contraseña, actividad en ahora, mismo ingreso, fallos en 0", async () => {
  const b = await base({ fallos: 2 });
  const ingreso = AHORA - 3 * DIA;
  const r = await desbloquearConPin(await bloqueado(ingreso), "4826", b.deps());
  assert.equal(r.tipo, "desbloqueada");
  if (r.tipo !== "desbloqueada") return;
  const s = await leerSesion(r.tokenNuevo, { ahora: AHORA });
  assert.deepEqual(s, { estado: "activa", userId: UID, ingreso, actividad: AHORA });
  assert.equal(b.filas.get(UID)!.fallos, 0);
});

test("PIN errado: dice cuántos intentos quedan; con 5 errados seguidos pide la contraseña y borra la cookie", async () => {
  const b = await base();
  const token = await bloqueado();
  for (let i = 1; i < MAX_INTENTOS_PIN; i++) {
    assert.deepEqual(await desbloquearConPin(token, "1111", b.deps()), { tipo: "errado", quedan: MAX_INTENTOS_PIN - i });
  }
  assert.deepEqual(await desbloquearConPin(token, "1111", b.deps()), {
    tipo: "contrasenia",
    motivo: "sin-intentos",
    borrarCookie: true,
  });
  // Ni el PIN correcto destraba ya (otra copia de la cookie, otra pestaña): contraseña.
  const despues = await desbloquearConPin(token, "4826", b.deps());
  assert.equal(despues.tipo, "contrasenia");
  assert.equal(b.comparaciones(), MAX_INTENTOS_PIN, "el sexto ni se compara");
});

test("ATAQUE: 20 pedidos en paralelo comparan como mucho 5 PIN (la reserva va antes de comparar)", async () => {
  const b = await base();
  const token = await bloqueado();
  const pins = Array.from({ length: 20 }, (_, i) => String(1000 + i));
  const rs = await Promise.all(pins.map((p) => desbloquearConPin(token, p, b.deps())));
  assert.ok(b.comparaciones() <= MAX_INTENTOS_PIN, `comparó ${b.comparaciones()}`);
  assert.ok(rs.every((r) => r.tipo !== "desbloqueada"));
});

test("ATAQUE: PIN mal formado gasta un intento y nunca se compara", async () => {
  const b = await base();
  const r = await desbloquearConPin(await bloqueado(), "48a6", b.deps());
  assert.deepEqual(r, { tipo: "errado", quedan: MAX_INTENTOS_PIN - 1 });
  assert.equal(b.comparaciones(), 0);
});

test("7 DÍAS sin uso: el PIN no sirve, contraseña completa (y se borra la cookie)", async () => {
  const b = await base();
  const token = await createSessionToken(UID, AHORA - 7 * DIA - 1000);
  assert.deepEqual(await desbloquearConPin(token, "4826", b.deps()), { tipo: "contrasenia", motivo: "vencida", borrarCookie: true });
  assert.equal(b.comparaciones(), 0);
});

test("USUARIO SIN PIN (o tabla sin migrar): contraseña, sin borrar la cookie ni gastar nada", async () => {
  const b = await base({ pin: null });
  assert.deepEqual(await desbloquearConPin(await bloqueado(), "4826", b.deps()), { tipo: "contrasenia", motivo: "sin-pin", borrarCookie: false });
});

test("sesión activa: no hay nada que destrabar; sin cookie o firma mala: contraseña", async () => {
  const b = await base();
  assert.deepEqual(await desbloquearConPin(await createSessionToken(UID, AHORA - MIN), "0000", b.deps()), { tipo: "activa" });
  assert.equal((await desbloquearConPin(undefined, "4826", b.deps())).tipo, "contrasenia");
  const t = await bloqueado();
  assert.equal((await desbloquearConPin(`${t.slice(0, -1)}0`, "4826", b.deps())).tipo, "contrasenia");
  assert.equal(b.comparaciones(), 0);
});

test("ATAQUE: usuario dado de baja, otro negocio o la base que falla → contraseña, nunca destraba", async () => {
  const baja = await base({ activo: false });
  assert.equal((await desbloquearConPin(await bloqueado(), "4826", baja.deps())).tipo, "contrasenia");
  const b = await base();
  assert.equal((await desbloquearConPin(await bloqueado(), "4826", b.deps({ tenantIdDelPedido: "otro" }))).tipo, "contrasenia");
  const rota = await desbloquearConPin(await bloqueado(), "4826", b.deps({ reservarIntento: async () => { throw new Error("db"); } }));
  assert.equal(rota.tipo, "contrasenia");
});

test("ingreso con contraseña reciente habilita definir el PIN; el canje (ingreso 0), una sesión vieja o bloqueada, no", async () => {
  assert.equal(await puedeDefinirPin(await createSessionToken(UID, AHORA), AHORA + MIN), UID);
  assert.equal(await puedeDefinirPin(await createSessionToken(UID, AHORA, 0), AHORA), null);
  const usadoPeroViejo = await createSessionToken(UID, AHORA, AHORA - VENTANA_DEFINIR_PIN_MS);
  assert.equal(await puedeDefinirPin(usadoPeroViejo, AHORA), null);
  assert.equal(await puedeDefinirPin(await createSessionToken(UID, AHORA - 20 * MIN), AHORA), null);
});

test("PIN nuevo: 4 números, ni repetidos ni escaleras, y la confirmación igual", () => {
  assert.equal(normalizarPin(" 48 26 "), "4826");
  assert.equal(normalizarPin("482"), null);
  assert.equal(normalizarPin("48261"), null);
  assert.equal(normalizarPin(4826), null);
  assert.equal(problemaDelPinNuevo("4826", "4826"), null);
  assert.match(problemaDelPinNuevo("7777", "7777")!, /repetido/);
  assert.match(problemaDelPinNuevo("1234", "1234")!, /escalera/);
  assert.match(problemaDelPinNuevo("6543", "6543")!, /escalera/);
  assert.match(problemaDelPinNuevo("4826", "4827")!, /no coinciden/);
  assert.match(problemaDelPinNuevo(null, null)!, /4 números/);
});

test("el PIN se guarda con scrypt como la contraseña (nunca en claro)", async () => {
  const h = await hashPassword("4826");
  assert.match(h, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.ok(!h.includes("4826"));
});
