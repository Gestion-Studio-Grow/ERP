/**
 * Demo ejecutable del corazón de Kudos: input → output.
 *
 * Correr (offline, sin API key ni npm install):
 *   npx tsx src/examples.ts
 *
 * Muestra el ruteo distinto para 1★ vs 5★, el escalado de temas sensibles, y los guardarraíles.
 */
import type { BrandVoice, Review } from "./types.js";
import { MockLLM } from "./llm.js";
import { responderResena } from "./reviewResponder.js";

// --- Kit de voz de marca de ejemplo (se armaría en el onboarding pago) ---
const vozDonCiro: BrandVoice = {
  localId: "local_don_ciro",
  version: 3,
  nombreMarca: "Pizzería Don Ciro",
  rubro: "pizzería de barrio",
  tono: "cercano-informal",
  trato: "voseo",
  firma: "El equipo de Don Ciro 🍕",
  frasesMarca: ["¡Gracias totales!", "Te esperamos con la mesa lista"],
  prohibiciones: ["no mencionar competidores"],
  permiteCompensacion: false,
  emojis: "pocos",
  longitudMax: 400,
  datosContacto: "hola@donciro.com",
  idiomaBase: "es",
};

// --- Reseñas de ejemplo, una por cada camino del corazón ---
const reviews: Review[] = [
  {
    id: "r1",
    localId: "local_don_ciro",
    source: "google",
    autor: "Marcela",
    rating: 5,
    texto: "¡La mejor muzza del barrio! Atención de diez y la masa espectacular. Volvemos seguro.",
    fecha: "2026-07-01",
  },
  {
    id: "r2",
    localId: "local_don_ciro",
    source: "google",
    autor: "Diego",
    rating: 3,
    texto: "Rica la pizza pero tardó bastante el delivery. La próxima ojalá más rápido.",
    fecha: "2026-07-02",
  },
  {
    id: "r3",
    localId: "local_don_ciro",
    source: "google",
    autor: "Sofía",
    rating: 1,
    texto: "Muy fría llegó la pizza y encima faltaba una. Un desastre, no vuelvo más.",
    fecha: "2026-07-03",
  },
  {
    id: "r4",
    localId: "local_don_ciro",
    source: "google",
    autor: "Roberto",
    rating: 1,
    texto:
      "Me intoxiqué después de comer acá, terminé en el hospital. Voy a hacer la denuncia con mi abogado.",
    fecha: "2026-07-04",
  },
  {
    id: "r5",
    localId: "local_don_ciro",
    source: "mercadolibre",
    autor: "Ana",
    rating: 5,
    texto: "Todo perfecto, aunque me pareció que me cobraron de más en el total. ¿Pueden revisar?",
    fecha: "2026-07-05",
  },
];

async function main() {
  const llm = new MockLLM();
  console.log("=== Kudos · demo del generador de respuestas (MockLLM) ===\n");

  for (const review of reviews) {
    const res = await responderResena(review, vozDonCiro, llm);
    console.log(`── Reseña ${review.id} · ${review.rating}★ · ${review.autor}`);
    console.log(`   "${review.texto}"`);
    console.log(`   → estado:   ${res.estado.toUpperCase()}  (bucket: ${res.bucket})`);
    if (res.categoriaSensible) console.log(`   → sensible: ${res.categoriaSensible}`);
    console.log(`   → motivo:   ${res.motivo}`);
    if (res.respuesta) console.log(`   → RESPUESTA: ${res.respuesta}`);
    else console.log(`   → RESPUESTA: (ninguna — la redacta un humano)`);
    if (res.advertencias.length) console.log(`   → advertencias: ${res.advertencias.join(" | ")}`);
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
