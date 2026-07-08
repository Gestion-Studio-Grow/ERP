import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TARIFAS,
  ROUTING,
  costoLlamada,
  desglosarCogs,
  COSTO_IMAGEN_IA_USD,
} from "./routing.ts";
import type { UsoLLM } from "./tipos.ts";

test("routing manda ideación a Haiku y copy a Sonnet (blindaje de margen)", () => {
  assert.equal(ROUTING.ideacion, "haiku");
  assert.equal(ROUTING.hashtags, "haiku");
  assert.equal(ROUTING.copyFinal, "sonnet");
});

test("tarifas: lectura cacheada es 0,1x del input en los tres modelos", () => {
  for (const m of ["haiku", "sonnet", "opus"] as const) {
    assert.equal(TARIFAS[m].cachePorMTok, Number((TARIFAS[m].inputPorMTok * 0.1).toFixed(2)));
  }
});

test("costoLlamada aplica la tarifa del modelo del uso", () => {
  const uso: UsoLLM = { modelo: "sonnet", inputUncached: 1_000_000, inputCached: 0, output: 0 };
  // 1M input uncached en Sonnet = US$3
  assert.equal(costoLlamada(uso), 3.0);

  const cacheado: UsoLLM = { modelo: "sonnet", inputUncached: 0, inputCached: 1_000_000, output: 0 };
  assert.equal(costoLlamada(cacheado), 0.3); // 0,1x
});

test("Haiku es más barato que Sonnet para el mismo uso (por eso hace el volumen)", () => {
  const uso = { inputUncached: 2500, inputCached: 0, output: 200 };
  const haiku = costoLlamada({ modelo: "haiku", ...uso });
  const sonnet = costoLlamada({ modelo: "sonnet", ...uso });
  assert.ok(haiku < sonnet);
});

test("desglosarCogs suma por modelo y total", () => {
  const usos: UsoLLM[] = [
    { modelo: "haiku", inputUncached: 0, inputCached: 2500, output: 150 },
    { modelo: "sonnet", inputUncached: 0, inputCached: 2500, output: 200 },
  ];
  const d = desglosarCogs(usos);
  assert.equal(d.llamadas, 2);
  assert.ok(d.porModelo.haiku > 0);
  assert.ok(d.porModelo.sonnet > 0);
  assert.equal(
    Number(d.costoUsd.toFixed(8)),
    Number((d.porModelo.haiku + d.porModelo.sonnet).toFixed(8)),
  );
});

test("COGS de texto por posteo (ideación Haiku + copy Sonnet, Kit cacheado) queda en centavos", () => {
  const usos: UsoLLM[] = [
    { modelo: "haiku", inputUncached: 300, inputCached: 2500, output: 150 },
    { modelo: "sonnet", inputUncached: 200, inputCached: 2500, output: 200 },
  ];
  const d = desglosarCogs(usos);
  assert.ok(d.costoUsd < 0.02, `COGS/post=${d.costoUsd} debería ser < US$0,02`);
});

test("costo de imagen IA está definido (add-on medido, nunca bundle ilimitado)", () => {
  assert.ok(COSTO_IMAGEN_IA_USD > 0);
});
