// Validación de la configuración de envíos — la misma regla en la pantalla y en el servidor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { configPorDefecto, partirFranjas, validarConfigEnvios, MAX_ZONAS } from "./modelo";

const zona = (o: Record<string, unknown> = {}) => ({ id: "barrios", nombre: "Canning – barrios cerrados", costo: 4000, gratisDesde: 60000, franjas: [], ...o });
const base = (o: Record<string, unknown> = {}) => ({ ...configPorDefecto(), zonas: [zona()], ...o });

test("acepta la configuración de Envíos de §2.3 y lee los importes escritos a mano («4.000», «$ 60.000»)", () => {
  const v = validarConfigEnvios({
    retiroEnLocal: true,
    horarioRetiro: "  Lun a sáb   9–19 ",
    pedidoMinimoEnvio: "20.000",
    zonas: [
      { id: "barrios", nombre: "Canning – barrios cerrados", costo: "4.000", gratisDesde: "$ 60.000", franjas: "L-S 11-13; L-S 17-19" },
      { nombre: "Ezeiza / Monte Grande", costo: "6000", gratisDesde: "", franjas: ["Ma, Vi 17-19"] },
    ],
    franjasRetiro: "Hoy mañana 10-13\nHoy tarde 17-20",
    tiendaPausada: null,
  });
  assert.ok(v.ok, v.ok ? "" : v.error);
  assert.deepEqual(v.config, {
    retiroEnLocal: true,
    horarioRetiro: "Lun a sáb 9–19",
    pedidoMinimoEnvio: 20000,
    zonas: [
      { id: "barrios", nombre: "Canning – barrios cerrados", costo: 4000, gratisDesde: 60000, franjas: ["L-S 11-13", "L-S 17-19"] },
      // Sin id: se le asigna uno estable. La coma no parte la franja: «Ma, Vi 17-19» es una.
      { id: "zona-2", nombre: "Ezeiza / Monte Grande", costo: 6000, gratisDesde: null, franjas: ["Ma, Vi 17-19"] },
    ],
    franjasRetiro: ["Hoy mañana 10-13", "Hoy tarde 17-20"],
    tiendaPausada: null,
  });
});

test("la configuración por defecto (lo de hoy) es válida", () => {
  const v = validarConfigEnvios(configPorDefecto());
  assert.ok(v.ok);
  assert.deepEqual(v.config, configPorDefecto());
});

test("rechaza con el motivo y el nombre de la zona", () => {
  const casos: [unknown, RegExp][] = [
    [null, /incompleta/],
    [base({ zonas: [zona({ nombre: "  " })] }), /fila 1 le falta el nombre/],
    [base({ zonas: [zona({ costo: "" })] }), /costo del envío a la zona «Canning – barrios cerrados»/],
    [base({ zonas: [zona({ costo: -1 })] }), /costo del envío/],
    [base({ zonas: [zona({ costo: "12,3456" })] }), /costo del envío/], // cuatro decimales: no es plata
    [base({ zonas: [zona({ costo: 12.345 })] }), /costo del envío/], // tercer decimal en número, tampoco
    [base({ zonas: [zona({ gratisDesde: "mucho" })] }), /«Gratis desde» de la zona/],
    [base({ zonas: [zona(), zona({ id: "otra", nombre: "canning – BARRIOS cerrados" })] }), /dos zonas que se llaman/],
    [base({ pedidoMinimoEnvio: "abc" }), /pedido mínimo/],
    [base({ pedidoMinimoEnvio: 80000 }), /es menor que el pedido mínimo/],
    [base({ zonas: Array.from({ length: MAX_ZONAS + 1 }, (_, i) => zona({ id: `z${i}`, nombre: `Zona ${i}` })) }), /muchas zonas/],
    [base({ zonas: [zona({ franjas: Array.from({ length: 13 }, (_, i) => `F${i}`) })] }), /muchas franjas/],
    [base({ franjasRetiro: ["x".repeat(41)] }), /Franjas para retiro: .*muy larga/],
    [base({ tiendaPausada: { mensaje: "x".repeat(201) } }), /mensaje de la tienda pausada/],
    [{ ...configPorDefecto(), retiroEnLocal: false }, /al menos una zona/],
  ];
  for (const [entrada, re] of casos) {
    const v = validarConfigEnvios(entrada);
    assert.ok(!v.ok && re.test(v.error), `${JSON.stringify(entrada)?.slice(0, 80)} → ${v.ok ? "aceptó" : v.error}`);
  }
});

test("normaliza: ids repetidos o inválidos se renumeran, «gratis desde» 0 y mínimo 0 son «sin»", () => {
  const v = validarConfigEnvios(
    base({ pedidoMinimoEnvio: 0, zonas: [zona({ id: "A B" }), zona({ id: "zona-1", nombre: "Centro", gratisDesde: 0 })] }),
  );
  assert.ok(v.ok, v.ok ? "" : v.error);
  assert.equal(v.config.pedidoMinimoEnvio, null);
  assert.deepEqual(v.config.zonas.map((z) => z.id), ["zona-1", "zona-2"]);
  assert.equal(v.config.zonas[1].gratisDesde, null);
  assert.deepEqual(validarConfigEnvios(base({ tiendaPausada: { mensaje: "  Hoy  no  " } })), {
    ok: true,
    config: { ...base(), tiendaPausada: { mensaje: "Hoy no" } },
  });
});

test("partirFranjas: punto y coma o renglón (la coma queda adentro); sin vacíos ni repetidas", () => {
  assert.deepEqual(partirFranjas("L-S 11-13; Ma, Vi 17-19;; L-S 11-13\n  Sáb  9-12 "), ["L-S 11-13", "Ma, Vi 17-19", "Sáb 9-12"]);
  assert.deepEqual(partirFranjas(""), []);
});
