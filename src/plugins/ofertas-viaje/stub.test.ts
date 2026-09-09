// Tests del stub + registro de proveedores de ofertas. node:test, sin red.

import { test } from "node:test";
import assert from "node:assert/strict";
import { StubProveedorOfertas } from "./stub";
import { RegistroProveedoresOfertas, ProveedorOfertasDesconocidoError } from "./registry";
import { registroPorDefecto } from "./index";
import { UNIDADES_PRECIO } from "./port";

const AHORA = () => new Date("2026-09-09T12:00:00.000Z");

test("stub vuelos: determinístico, con capturadoEn y base en TODAS las ofertas", async () => {
  const s = new StubProveedorOfertas(AHORA);
  const b = { origen: "AEP", destino: "MAD", fechaIda: "2026-11-10", fechaVuelta: "2026-11-20", adultos: 2, ninos: 1 };
  const r1 = await s.buscarVuelos(b);
  const r2 = await s.buscarVuelos(b);
  assert.deepEqual(r1, r2);
  assert.equal(r1.proveedor, "stub");
  assert.equal(r1.desdeCache, false);
  assert.ok(r1.ofertas.length >= 1);
  for (const o of r1.ofertas) {
    assert.equal(o.precio.capturadoEn, "2026-09-09T12:00:00.000Z");
    assert.ok(UNIDADES_PRECIO.includes(o.precio.unidad));
    assert.equal(o.precio.unidad, "POR_PERSONA");
    assert.equal(o.tramos.length, 2); // ida y vuelta
    assert.equal(o.totalGrupo?.monto, o.precio.monto * 3);
  }
});

test("stub vuelos: solo ida = 1 tramo; respeta maxResultados", async () => {
  const s = new StubProveedorOfertas(AHORA);
  const r = await s.buscarVuelos({ origen: "AEP", destino: "COR", fechaIda: "2026-11-10", adultos: 1, maxResultados: 2 });
  assert.equal(r.ofertas.length, 2);
  assert.equal(r.ofertas[0].tramos.length, 1);
});

test("stub hoteles: noches correctas, precio POR_HABITACION_TOTAL con base doble y capturadoEn", async () => {
  const s = new StubProveedorOfertas(AHORA);
  const r = await s.buscarHoteles({ ciudad: "MAD", checkIn: "2026-11-11", checkOut: "2026-11-16", adultos: 2 });
  assert.ok(r.ofertas.length >= 1);
  for (const o of r.ofertas) {
    assert.equal(o.noches, 5);
    assert.equal(o.precio.unidad, "POR_HABITACION_TOTAL");
    assert.equal(o.precio.baseOcupacion, "DOBLE");
    assert.equal(o.precio.noches, 5);
    assert.equal(o.precio.capturadoEn, "2026-09-09T12:00:00.000Z");
    assert.ok(o.precio.monto > 0);
  }
});

test("registro: desconocido lanza; stub siempre operable", () => {
  const r = new RegistroProveedoresOfertas().registrar("stub", () => new StubProveedorOfertas());
  assert.throws(() => r.proveedorPara("nadie", "t1"), ProveedorOfertasDesconocidoError);
  assert.equal(r.proveedorPara("stub", "t1")?.clave, "stub");
  assert.deepEqual(r.proveedores(), ["stub"]);
});

test("registroPorDefecto: amadeus sin credenciales devuelve null (no opera); con credenciales opera", () => {
  const sin = registroPorDefecto({});
  assert.equal(sin.proveedorPara("amadeus", "t1"), null);
  assert.equal(sin.proveedorPara("stub", "t1")?.clave, "stub");
  const con = registroPorDefecto({ AMADEUS_CLIENT_ID: "id", AMADEUS_CLIENT_SECRET: "secret" });
  assert.equal(con.proveedorPara("amadeus", "t1")?.clave, "amadeus");
});
