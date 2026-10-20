import { test } from "node:test";
import assert from "node:assert/strict";
import { armarEtiquetaDeBalanza, FORMATO_BALANZA_POR_DEFECTO, leerEtiquetaDeBalanza, problemaDelFormato, MENSAJE_VERIFICADOR_BALANZA } from "./balanza";
import { PRESETS_BALANZA, presetDelFormato, presetPorId, presetQueCalza, probarEtiqueta } from "./balanza-presets";

test("cada preset es un formato válido para la caja", () => {
  for (const p of PRESETS_BALANZA) assert.equal(problemaDelFormato(p.formato), null, p.id);
});

test("los ids no se repiten y ningún preset es igual a otro", () => {
  const ids = PRESETS_BALANZA.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of PRESETS_BALANZA) assert.equal(presetDelFormato(p.formato), p.id);
});

test("una etiqueta de ejemplo por preset se lee bien con su formato", () => {
  for (const p of PRESETS_BALANZA) {
    const valor = p.formato.contenido === "peso" ? 1.25 : 4520;
    const codigo = armarEtiquetaDeBalanza(p.formato, "123", valor);
    const l = leerEtiquetaDeBalanza(codigo, p.formato);
    assert.ok(l.ok, p.id);
    assert.equal(l.plu, "123".padStart(p.formato.digitosProducto, "0"), p.id);
    if (l.contenido === "peso") assert.equal(l.peso, 1.25, p.id);
    else assert.equal(l.importe, 4520, p.id);
    assert.ok(presetQueCalza(codigo).includes(p.id), `${p.id} calza con su propia etiqueta`);
  }
});

test("presetQueCalza: el prefijo descarta a los que no lo imprimen", () => {
  const systel = presetPorId("systel")!;
  // Prefijo 21 (Systel, venta por unidad): Kretz (sólo 20) no la lee; Systel y las de 20 a 29 sí.
  const codigo = armarEtiquetaDeBalanza(systel.formato, "123", 4520, "21");
  const calzan = presetQueCalza(codigo);
  assert.ok(!calzan.includes("kretz-importe"));
  assert.ok(calzan.includes("systel"));
  // Prefijo 25: sólo los presets "del 20 al 29".
  const moretti = presetPorId("moretti")!;
  const otro = armarEtiquetaDeBalanza(moretti.formato, "77", 123456, "25");
  assert.deepEqual(presetQueCalza(otro).sort(), ["gs1-importe", "gs1-peso", "moretti"]);
});

test("las etiquetas del relevamiento (docs/producto/balanzas-relevamiento.md) se leen con su preset", () => {
  // Systel Cuora: 20 · 0123 · 004550 → producto 0123, $4.550.
  assert.deepEqual(leerEtiquetaDeBalanza("2001230045500", presetPorId("systel")!.formato), { ok: true, plu: "0123", contenido: "importe", importe: 4550 });
  // Kretz 2-5-5: 20 · 00123 · 01250 → 1,250 kg.
  assert.deepEqual(leerEtiquetaDeBalanza("2000123012506", presetPorId("kretz-peso")!.formato), { ok: true, plu: "00123", contenido: "peso", peso: 1.25 });
  // CAS: el UPC-A llega con un 0 adelante, como "02-IIIII-PPPPP-C".
  const cas = presetPorId("cas")!.formato;
  const upc = armarEtiquetaDeBalanza(cas, "1234", 4520);
  assert.deepEqual(leerEtiquetaDeBalanza(`0${upc}`, cas), { ok: true, plu: "01234", contenido: "importe", importe: 4520 });
  assert.ok(presetQueCalza(`0${upc}`).includes("cas"));
});

test("presetQueCalza: un código roto o que no es de balanza no calza con ninguno", () => {
  const bueno = armarEtiquetaDeBalanza(FORMATO_BALANZA_POR_DEFECTO, "123", 1.25);
  const roto = bueno.slice(0, 12) + String((Number(bueno[12]) + 1) % 10);
  assert.deepEqual(presetQueCalza(roto), []);
  assert.deepEqual(presetQueCalza("7790001234561"), []);
  assert.deepEqual(presetQueCalza(""), []);
  // Lo que manda el lector con espacios o guiones se limpia antes de probar.
  assert.ok(presetQueCalza(` ${bueno.slice(0, 6)}-${bueno.slice(6)}\t`).includes("gs1-peso"));
});

test("presetDelFormato: el formato de fábrica es el preset genérico de peso; uno a mano no es ninguno", () => {
  assert.equal(presetDelFormato(FORMATO_BALANZA_POR_DEFECTO), "gs1-peso");
  // Los prefijos desordenados o repetidos no cambian el formato.
  assert.equal(presetDelFormato({ prefijos: ["21", "20", "20"], digitosProducto: 4, contenido: "importe", decimales: 0 }), "systel");
  assert.equal(presetDelFormato({ prefijos: ["28"], digitosProducto: 6, contenido: "peso", decimales: 2 }), null);
  assert.equal(presetPorId("no-existe"), null);
});

test("probarEtiqueta: vacío, letras, largo, prefijo, verificador y lectura correcta", () => {
  const f = presetPorId("kretz-peso")!.formato;
  assert.deepEqual(probarEtiqueta("   ", f), { estado: "vacio" });
  assert.equal(probarEtiqueta("20ABC", f).estado, "aviso");

  const corto = probarEtiqueta("200012301", f);
  assert.equal(corto.estado, "aviso");
  assert.match((corto as { mensaje: string }).mensaje, /13 dígitos y acá hay 9/);

  const otroPrefijo = probarEtiqueta(armarEtiquetaDeBalanza(f, "123", 1.25, "22"), f);
  assert.equal(otroPrefijo.estado, "aviso");
  assert.match((otroPrefijo as { mensaje: string }).mensaje, /Empieza con 22/);

  const bueno = armarEtiquetaDeBalanza(f, "123", 1.25);
  const roto = bueno.slice(0, 12) + String((Number(bueno[12]) + 1) % 10);
  assert.deepEqual(probarEtiqueta(roto, f), { estado: "aviso", codigo: roto, mensaje: MENSAJE_VERIFICADOR_BALANZA });

  assert.deepEqual(probarEtiqueta(bueno, f), {
    estado: "leida",
    codigo: bueno,
    lectura: { ok: true, plu: "00123", contenido: "peso", peso: 1.25 },
  });
});

test("probarEtiqueta: el mismo código se lee como importe con el preset de importe", () => {
  const codigo = armarEtiquetaDeBalanza(FORMATO_BALANZA_POR_DEFECTO, "123", 4.52);
  const r = probarEtiqueta(codigo, presetPorId("gs1-importe")!.formato);
  assert.equal(r.estado, "leida");
  assert.deepEqual((r as { lectura: unknown }).lectura, { ok: true, plu: "00123", contenido: "importe", importe: 4520 });
});
