// Tests del caché + cuota del conector de ofertas (puros, sin red). node:test.
// Foco: la misma búsqueda no vuelve al proveedor dentro del TTL, y la cuota frena
// ANTES de llamar (no se gasta lo que no hay).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  claveBusqueda,
  CuotaAgotadaError,
  diaDe,
  MemoriaCacheOfertas,
  MemoriaControlDeCuota,
  ProveedorConCache,
} from "./cache";
import { StubProveedorOfertas } from "./stub";
import type { BusquedaVuelos, ProveedorOfertas } from "./port";

const BUSQUEDA: BusquedaVuelos = { origen: "AEP", destino: "MAD", fechaIda: "2026-11-10", fechaVuelta: "2026-11-20", adultos: 2 };

function contador(): { proveedor: ProveedorOfertas; llamadas: () => number } {
  const stub = new StubProveedorOfertas(() => new Date("2026-09-09T12:00:00Z"));
  let n = 0;
  const proveedor: ProveedorOfertas = {
    clave: "stub",
    buscarVuelos: (b) => (n++, stub.buscarVuelos(b)),
    buscarHoteles: (b) => (n++, stub.buscarHoteles(b)),
  };
  return { proveedor, llamadas: () => n };
}

test("claveBusqueda: estable e insensible al orden de claves y a undefined", () => {
  const a = claveBusqueda("VUELO", { origen: "AEP", destino: "MAD", fechaIda: "2026-11-10", adultos: 2, ninos: undefined });
  const b = claveBusqueda("VUELO", { adultos: 2, fechaIda: "2026-11-10", destino: "MAD", origen: "AEP" });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("claveBusqueda: cambia con el tipo y con cualquier parámetro", () => {
  const base = claveBusqueda("VUELO", BUSQUEDA);
  assert.notEqual(base, claveBusqueda("HOTEL", BUSQUEDA));
  assert.notEqual(base, claveBusqueda("VUELO", { ...BUSQUEDA, adultos: 3 }));
});

test("ProveedorConCache: la segunda búsqueda igual sale del caché y NO llama al proveedor", async () => {
  const { proveedor, llamadas } = contador();
  let t = Date.parse("2026-09-09T12:00:00Z");
  const p = new ProveedorConCache(proveedor, "t1", {
    cache: new MemoriaCacheOfertas(),
    cuota: new MemoriaControlDeCuota(10),
    ahora: () => new Date(t),
  });
  const r1 = await p.buscarVuelos(BUSQUEDA);
  t += 60_000;
  const r2 = await p.buscarVuelos(BUSQUEDA);
  assert.equal(llamadas(), 1);
  assert.equal(r1.desdeCache, false);
  assert.equal(r2.desdeCache, true);
  assert.deepEqual(r2.ofertas, r1.ofertas);
  // El capturadoEn del resultado cacheado es el ORIGINAL (no se rejuvenece el precio).
  assert.equal(r2.capturadoEn, r1.capturadoEn);
});

test("ProveedorConCache: vencido el TTL vuelve a llamar", async () => {
  const { proveedor, llamadas } = contador();
  let t = Date.parse("2026-09-09T12:00:00Z");
  const p = new ProveedorConCache(proveedor, "t1", {
    cache: new MemoriaCacheOfertas(),
    cuota: new MemoriaControlDeCuota(10),
    ttlVuelosMs: 1_000,
    ahora: () => new Date(t),
  });
  await p.buscarVuelos(BUSQUEDA);
  t += 2_000;
  const r = await p.buscarVuelos(BUSQUEDA);
  assert.equal(llamadas(), 2);
  assert.equal(r.desdeCache, false);
});

test("ProveedorConCache: el caché es POR TENANT (otro tenant no ve la búsqueda ajena)", async () => {
  const { proveedor, llamadas } = contador();
  const cache = new MemoriaCacheOfertas();
  const cuota = new MemoriaControlDeCuota(10);
  await new ProveedorConCache(proveedor, "t1", { cache, cuota }).buscarVuelos(BUSQUEDA);
  await new ProveedorConCache(proveedor, "t2", { cache, cuota }).buscarVuelos(BUSQUEDA);
  assert.equal(llamadas(), 2);
});

test("CUOTA: al agotarse lanza CuotaAgotadaError ANTES de llamar al proveedor", async () => {
  const { proveedor, llamadas } = contador();
  const p = new ProveedorConCache(proveedor, "t1", { cache: new MemoriaCacheOfertas(), cuota: new MemoriaControlDeCuota(1) });
  await p.buscarVuelos(BUSQUEDA);
  await assert.rejects(p.buscarVuelos({ ...BUSQUEDA, adultos: 3 }), CuotaAgotadaError);
  assert.equal(llamadas(), 1);
});

test("CUOTA: las búsquedas cacheadas NO consumen cuota", async () => {
  const { proveedor } = contador();
  const cuota = new MemoriaControlDeCuota(1);
  const p = new ProveedorConCache(proveedor, "t1", { cache: new MemoriaCacheOfertas(), cuota });
  await p.buscarVuelos(BUSQUEDA);
  await p.buscarVuelos(BUSQUEDA); // cacheada, no cuenta
  const d = await cuota.consumir("t1", "stub", new Date());
  assert.equal(d.ok, false);
});

test("CUOTA: es por día, tenant y proveedor", async () => {
  const cuota = new MemoriaControlDeCuota(1);
  const d1 = new Date("2026-09-09T23:00:00Z");
  const d2 = new Date("2026-09-10T01:00:00Z");
  assert.equal((await cuota.consumir("t1", "amadeus", d1)).ok, true);
  assert.equal((await cuota.consumir("t1", "amadeus", d1)).ok, false);
  assert.equal((await cuota.consumir("t1", "amadeus", d2)).ok, true); // otro día
  assert.equal((await cuota.consumir("t2", "amadeus", d1)).ok, true); // otro tenant
  assert.equal((await cuota.consumir("t1", "stub", d1)).ok, true); // otro proveedor
  assert.equal(diaDe(d1), "2026-09-09");
});

test("CUOTA: límite 0 = proveedor bloqueado", async () => {
  const cuota = new MemoriaControlDeCuota(0);
  assert.equal((await cuota.consumir("t1", "amadeus", new Date())).ok, false);
  assert.throws(() => new MemoriaControlDeCuota(-1));
});
