/**
 * Demo end-to-end del pipeline Testigo.
 *
 *   node --loader ts-node/esm ejemplo/demo.ts          (real: usa ANTHROPIC_API_KEY / perfil ant)
 *   TESTIGO_MOCK=1 node --loader ts-node/esm ejemplo/demo.ts   (mock: sin llamar al modelo)
 *
 * Muestra el flujo completo:
 *   1) input del operario (STT+visión ya hechos)  -> núcleo -> parte con campos PENDIENTE
 *   2) el pipeline NO emite: genera la repregunta de WhatsApp
 *   3) el operario responde -> se completan los datos regulatorios
 *   4) parte completo -> render HTML -> se guarda parte-ejemplo.html (listo para PDF)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { procesarParte } from "../src/pipeline.js";
import { renderParteHTML } from "../src/plantilla-pdf.js";
import { normalizarPendientes } from "../src/estructurar.js";
import type { EntradaOperario, ConfigContratista } from "../src/tipos.js";
import type { TParteEstructurado } from "../src/esquema-parte.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const { entrada, config } = JSON.parse(readFileSync(join(aqui, "input.json"), "utf8")) as {
  entrada: EntradaOperario;
  config: ConfigContratista;
};

async function main() {
  console.log("── Testigo · demo control de plagas ──\n");
  console.log("OPERARIO dijo:\n  \"" + entrada.transcripcion + "\"\n");

  let parte: TParteEstructurado;

  if (process.env.TESTIGO_MOCK) {
    // Modo mock: usa la salida esperada, sin gastar tokens. Sirve para probar el render offline.
    const esperada = JSON.parse(readFileSync(join(aqui, "salida-esperada.json"), "utf8"));
    parte = normalizarPendientes(esperada.parte);
    console.log("[MOCK] Núcleo simulado desde salida-esperada.json.");
    if (esperada.requiereRepregunta) console.log("\nPASO 2 · Repregunta a WhatsApp:\n" + esperada.repreguntaWhatsApp);
  } else {
    // Modo real: llama a Claude Sonnet.
    const r1 = await procesarParte(entrada, config);
    parte = r1.parte;
    console.log("PASO 1 · Núcleo → parte estructurado. Estado:", r1.estado);
    if (r1.estado === "pendiente_revision") {
      console.log("\nPASO 2 · Repregunta a WhatsApp:\n" + r1.repregunta);
    }
  }

  // PASO 3: el operario responde la repregunta con los datos regulatorios.
  console.log("\nPASO 3 · Operario responde: \"Es Brodifacoum 0.005%, registro SENASA 12.345, un bloque de 100g por estación.\"");
  const p = parte.productosAplicados[0];
  if (p) {
    if (p.principioActivo.startsWith("PENDIENTE")) p.principioActivo = "Brodifacoum 0.005%";
    if (p.numeroRegistro.startsWith("PENDIENTE")) p.numeroRegistro = "SENASA 12.345";
    if (p.dosis.startsWith("PENDIENTE")) p.dosis = "1 bloque de 100 g por estación";
  }
  const completo = normalizarPendientes(parte);
  completo.camposPendientes = []; // ya resueltos

  // PASO 4: parte completo -> render HTML (listo para htmlAPDF()).
  const html = renderParteHTML(completo, config);
  const salida = join(aqui, "parte-ejemplo.html");
  writeFileSync(salida, html, "utf8");
  console.log("\nPASO 4 · Parte completo → HTML renderizado en:\n  " + salida);
  console.log("  (en producción: htmlAPDF(html) → PDF → despacho por WhatsApp/e-mail)\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
