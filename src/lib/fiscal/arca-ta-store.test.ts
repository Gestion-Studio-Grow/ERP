import { test } from "node:test";
import assert from "node:assert/strict";

import { leerTicketAcceso, guardarTicketAcceso, type ArcaTaStoreDeps } from "./arca-ta-store";
import { sealSecret, type MasterKey } from "./cert-crypto";
import type { TicketAcceso } from "@/plugins/arca";

const master = (): MasterKey => ({ key: Buffer.alloc(32, 7), id: "test:v1" });
const AHORA = new Date("2026-07-05T12:00:00Z");

interface FilaTicket {
  kekId: string;
  wrappedDek: string;
  sealed: string;
  expiration: string;
}

/** Deps en memoria: simulan la tabla `ArcaAuthTicket` sin DB. */
function depsFake(opts: {
  existe?: boolean;
  fila?: FilaTicket | null;
}): { deps: ArcaTaStoreDeps; upserts: Array<{ tenantId: string; fila: FilaTicket }> } {
  const upserts: Array<{ tenantId: string; fila: FilaTicket }> = [];
  const deps: ArcaTaStoreDeps = {
    tablaExiste: async () => opts.existe ?? true,
    leerFila: async () => opts.fila ?? null,
    upsertFila: async (tenantId, _servicio, fila) => {
      upserts.push({ tenantId, fila });
    },
    master,
    ahora: () => AHORA,
  };
  return { deps, upserts };
}

/** Construye una fila cifrada con un TA (para el camino de lectura). */
function filaConTicket(ta: TicketAcceso): FilaTicket {
  const sobre = sealSecret(JSON.stringify({ token: ta.token, sign: ta.sign }), master());
  return { kekId: sobre.kekId, wrappedDek: sobre.wrappedDek, sealed: sobre.sealed, expiration: ta.expiration };
}

const TA_VIGENTE: TicketAcceso = {
  token: "TOKEN-ABC",
  sign: "SIGN-XYZ",
  expiration: "2026-07-06T02:00:00.000-03:00", // futuro respecto de AHORA
};

test("leerTicketAcceso: tabla ausente (Gate 2 sin aplicar) → undefined (degrada, no rompe)", async () => {
  const { deps } = depsFake({ existe: false });
  assert.equal(await leerTicketAcceso("t-1", deps), undefined);
});

test("leerTicketAcceso: sin fila → undefined", async () => {
  const { deps } = depsFake({ existe: true, fila: null });
  assert.equal(await leerTicketAcceso("t-1", deps), undefined);
});

test("leerTicketAcceso: fila vigente → descifra y devuelve el TA", async () => {
  const { deps } = depsFake({ existe: true, fila: filaConTicket(TA_VIGENTE) });
  const ta = await leerTicketAcceso("t-1", deps);
  assert.deepEqual(ta, TA_VIGENTE);
});

test("leerTicketAcceso: TA vencido → undefined SIN descifrar (expiration en claro)", async () => {
  const vencido: TicketAcceso = { ...TA_VIGENTE, expiration: "2026-07-04T00:00:00.000Z" };
  const { deps } = depsFake({ existe: true, fila: filaConTicket(vencido) });
  assert.equal(await leerTicketAcceso("t-1", deps), undefined);
});

test("leerTicketAcceso: sobre corrupto / master equivocada → undefined (no rompe la emisión)", async () => {
  const fila = filaConTicket(TA_VIGENTE);
  // Corromper el ciphertext del payload.
  const [iv, tag, ct] = fila.sealed.split(".");
  const buf = Buffer.from(ct, "base64");
  buf[0] ^= 0xff;
  const corrupta = { ...fila, sealed: `${iv}.${tag}.${buf.toString("base64")}` };
  const { deps } = depsFake({ existe: true, fila: corrupta });
  assert.equal(await leerTicketAcceso("t-1", deps), undefined);
});

test("guardarTicketAcceso: tabla ausente → no-op (no upsert)", async () => {
  const { deps, upserts } = depsFake({ existe: false });
  await guardarTicketAcceso("t-1", TA_VIGENTE, deps);
  assert.equal(upserts.length, 0);
});

test("guardarTicketAcceso: persiste el TA CIFRADO (token/sign no aparecen en claro)", async () => {
  const { deps, upserts } = depsFake({ existe: true });
  await guardarTicketAcceso("t-1", TA_VIGENTE, deps);
  assert.equal(upserts.length, 1);
  const { tenantId, fila } = upserts[0];
  assert.equal(tenantId, "t-1");
  assert.equal(fila.expiration, TA_VIGENTE.expiration);
  const serial = JSON.stringify(fila);
  assert.ok(!serial.includes("TOKEN-ABC"), "el token no debe persistirse en claro");
  assert.ok(!serial.includes("SIGN-XYZ"), "el sign no debe persistirse en claro");
});

test("guardar → leer: round-trip por el store (mismo master)", async () => {
  const { deps, upserts } = depsFake({ existe: true });
  await guardarTicketAcceso("t-1", TA_VIGENTE, deps);
  // Releer usando la fila que se persistió.
  const { deps: deps2 } = depsFake({ existe: true, fila: upserts[0].fila });
  assert.deepEqual(await leerTicketAcceso("t-1", deps2), TA_VIGENTE);
});
