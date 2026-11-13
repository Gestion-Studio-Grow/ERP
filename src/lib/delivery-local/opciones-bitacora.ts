// ============================================================================
// PEDÍ LOCAL · LAS OPCIONES DE BITÁCORA CAFÉ — tamaños, leches, sabores y combos. DATOS.
// ============================================================================
//
// Fuente: el mapeo de su carta en Fudo (13/11/2026). En Fudo hay 0 opciones: lo que NO dice «real»
// es una propuesta PROVISIONAL A CONFIRMAR con el local (nombres y recargos). Lo real: los sabores de
// gaseosa y agua saborizada, el gas, los estilos de cerveza (salen de las descripciones de Fudo) y
// el recargo de $3.000 del combo almuerzo («Diferencia combo almuerzo» en Fudo).
// El producto se busca por nombre sin tildes ni mayúsculas (opciones.ts → gruposDelProducto): los
// nombres coinciden con la carta (carta-bitacora.ts). Recargos en pesos enteros; el servidor los
// recalcula desde acá (opciones.ts), el navegador sólo dice qué eligió.
// Un grupo «unico» sin «obligatorio» (Leche) puede quedar sin elegir: se entiende leche entera.

import type { GrupoDeOpciones, OpcionesDeProducto } from "./opciones";

// provisional a confirmar: Fudo no muestra tamaños; si el local no los trabaja, se quita el grupo
const TAMANO_CAFE: GrupoDeOpciones = {
  id: "tamano",
  nombre: "Tamaño",
  tipo: "unico",
  obligatorio: true,
  opciones: [
    { id: "chico", nombre: "Chico", recargo: 0 }, // base: el precio de la carta · provisional a confirmar
    { id: "mediano", nombre: "Mediano", recargo: 500 }, // provisional a confirmar
    { id: "grande", nombre: "Grande", recargo: 900 }, // provisional a confirmar
  ],
};
// provisional a confirmar
const LECHE: GrupoDeOpciones = {
  id: "leche",
  nombre: "Leche",
  tipo: "unico",
  opciones: [
    { id: "entera", nombre: "Entera", recargo: 0 }, // sin cargo; confirmar que el local lo ofrece · provisional a confirmar
    { id: "descremada", nombre: "Descremada", recargo: 0 }, // sin cargo; confirmar que el local lo ofrece · provisional a confirmar
    { id: "deslactosada", nombre: "Deslactosada", recargo: 0 }, // sin cargo; confirmar que el local lo ofrece · provisional a confirmar
    { id: "almendras", nombre: "De almendras", recargo: 700 }, // provisional a confirmar
    { id: "avena", nombre: "De avena", recargo: 700 }, // provisional a confirmar
  ],
};
// provisional a confirmar
const EXTRAS_CAFE: GrupoDeOpciones = {
  id: "extras",
  nombre: "Extras",
  tipo: "multiple",
  opciones: [
    { id: "shot", nombre: "Shot extra de café", recargo: 800 }, // provisional a confirmar
    { id: "sirope", nombre: "Sirope (vainilla o caramelo)", recargo: 600 }, // provisional a confirmar
    { id: "crema", nombre: "Crema batida", recargo: 700 }, // provisional a confirmar
    { id: "canela", nombre: "Canela", recargo: 0 }, // sin cargo; confirmar que el local lo ofrece · provisional a confirmar
  ],
};
// nombres reales de la carta; el recargo sale de la diferencia de carta ($5.500 − $3.500) y es provisional a confirmar, igual que qué cafés entran en el combo
const CAFE_DEL_COMBO: GrupoDeOpciones = {
  id: "cafe",
  nombre: "¿Qué café?",
  tipo: "unico",
  obligatorio: true,
  opciones: [
    { id: "espresso", nombre: "Espresso", recargo: 0 }, // incluido · provisional a confirmar
    { id: "cortado", nombre: "Cortado", recargo: 0 }, // incluido · provisional a confirmar
    { id: "americano", nombre: "Americano", recargo: 0 }, // incluido · provisional a confirmar
    { id: "cafe-con-leche", nombre: "Café con leche", recargo: 0 }, // incluido · provisional a confirmar
    { id: "lagrima", nombre: "Lágrima", recargo: 2000 }, // provisional a confirmar
    { id: "capuccino", nombre: "Capuccino", recargo: 2000 }, // provisional a confirmar
    { id: "latte", nombre: "Latte", recargo: 2000 }, // provisional a confirmar
    { id: "flat-white", nombre: "Flat white", recargo: 2000 }, // provisional a confirmar
  ],
};
// provisional a confirmar: Fudo dice «a elección en mostrador»; las variedades son de ejemplo
const VARIEDAD_TE: GrupoDeOpciones = {
  id: "variedad",
  nombre: "Variedad",
  tipo: "unico",
  obligatorio: true,
  opciones: [
    { id: "negro", nombre: "Negro", recargo: 0 }, // ejemplo · provisional a confirmar
    { id: "verde", nombre: "Verde", recargo: 0 }, // ejemplo · provisional a confirmar
    { id: "frutos-rojos", nombre: "Frutos rojos", recargo: 0 }, // ejemplo · provisional a confirmar
    { id: "manzanilla", nombre: "Manzanilla", recargo: 0 }, // ejemplo · provisional a confirmar
  ],
};
// sabores reales (descripción en Fudo)
const SABOR_GASEOSA: GrupoDeOpciones = {
  id: "sabor",
  nombre: "¿Cuál?",
  tipo: "unico",
  obligatorio: true,
  opciones: [
    { id: "coca", nombre: "Coca-Cola", recargo: 0 }, // real, sin cargo
    { id: "coca-sin-azucar", nombre: "Coca-Cola sin azúcar", recargo: 0 }, // real, sin cargo
    { id: "fanta", nombre: "Fanta", recargo: 0 }, // real, sin cargo
    { id: "sprite", nombre: "Sprite", recargo: 0 }, // real, sin cargo
    { id: "schweppes-pomelo", nombre: "Schweppes pomelo", recargo: 0 }, // real, sin cargo
    { id: "schweppes-tonica", nombre: "Schweppes tónica", recargo: 0 }, // real, sin cargo
  ],
};
// sabores reales (descripción en Fudo)
const SABOR_AGUA_SABORIZADA: GrupoDeOpciones = {
  id: "sabor",
  nombre: "Sabor",
  tipo: "unico",
  obligatorio: true,
  opciones: [
    { id: "pera", nombre: "Pera", recargo: 0 }, // real, sin cargo
    { id: "manzana", nombre: "Manzana", recargo: 0 }, // real, sin cargo
    { id: "pomelo", nombre: "Pomelo", recargo: 0 }, // real, sin cargo
    { id: "pomelo-rosado", nombre: "Pomelo rosado", recargo: 0 }, // real, sin cargo
    { id: "naranja", nombre: "Naranja", recargo: 0 }, // real, sin cargo
  ],
};
// real (nombre del producto en Fudo)
const GAS: GrupoDeOpciones = {
  id: "gas",
  nombre: "¿Con o sin gas?",
  tipo: "unico",
  obligatorio: true,
  opciones: [
    { id: "sin-gas", nombre: "Sin gas", recargo: 0 }, // real, sin cargo
    { id: "con-gas", nombre: "Con gas", recargo: 0 }, // real, sin cargo
  ],
};
// estilos reales (descripción en Fudo)
const ESTILO_CERVEZA: GrupoDeOpciones = {
  id: "estilo",
  nombre: "Estilo",
  tipo: "unico",
  obligatorio: true,
  opciones: [
    { id: "ipa", nombre: "IPA", recargo: 0 }, // real, sin cargo
    { id: "apa", nombre: "APA", recargo: 0 }, // real, sin cargo
    { id: "roja", nombre: "Roja", recargo: 0 }, // real, sin cargo
    { id: "negra", nombre: "Negra", recargo: 0 }, // real, sin cargo
    { id: "golden", nombre: "Golden", recargo: 0 }, // real, sin cargo
    { id: "honey", nombre: "Honey", recargo: 0 }, // real, sin cargo
  ],
};
// provisional a confirmar: Fudo no trae sabores; son de ejemplo
const SABOR_BATIDO: GrupoDeOpciones = {
  id: "sabor",
  nombre: "Sabor",
  tipo: "unico",
  obligatorio: true,
  opciones: [
    { id: "frutilla", nombre: "Frutilla", recargo: 0 }, // ejemplo · provisional a confirmar
    { id: "banana", nombre: "Banana", recargo: 0 }, // ejemplo · provisional a confirmar
    { id: "frutos-rojos", nombre: "Frutos rojos", recargo: 0 }, // ejemplo · provisional a confirmar
  ],
};
// recargo real: en Fudo figura «Diferencia combo almuerzo» a $3.000. Qué incluye (bebida, café o postre) es provisional a confirmar
const COMBO_ALMUERZO: GrupoDeOpciones = {
  id: "combo",
  nombre: "Hacelo combo",
  tipo: "multiple",
  opciones: [
    { id: "combo", nombre: "Combo almuerzo (qué incluye: provisional a confirmar)", recargo: 3000 }, // precio real de Fudo; contenido provisional a confirmar
  ],
};
// provisional a confirmar
const EXTRAS_TOSTADO: GrupoDeOpciones = {
  id: "extras",
  nombre: "Extras",
  tipo: "multiple",
  opciones: [
    { id: "huevo", nombre: "Huevo", recargo: 900 }, // provisional a confirmar
    { id: "palta", nombre: "Palta", recargo: 1500 }, // provisional a confirmar
    { id: "doble-queso", nombre: "Doble queso", recargo: 1000 }, // provisional a confirmar
  ],
};

export const OPCIONES_BITACORA: readonly OpcionesDeProducto[] = [
  { producto: "Espresso", grupos: [EXTRAS_CAFE] },
  { producto: "Ristretto", grupos: [EXTRAS_CAFE] },
  { producto: "Americano", grupos: [TAMANO_CAFE, EXTRAS_CAFE] },
  { producto: "Ice americano", grupos: [TAMANO_CAFE, EXTRAS_CAFE] },
  { producto: "Cortado", grupos: [LECHE, EXTRAS_CAFE] },
  { producto: "Café con leche", grupos: [TAMANO_CAFE, LECHE, EXTRAS_CAFE] },
  { producto: "Lágrima", grupos: [LECHE, EXTRAS_CAFE] },
  { producto: "Flat white", grupos: [LECHE, EXTRAS_CAFE] },
  { producto: "Capuccino", grupos: [TAMANO_CAFE, LECHE, EXTRAS_CAFE] },
  { producto: "Latte", grupos: [TAMANO_CAFE, LECHE, EXTRAS_CAFE] },
  { producto: "Latte macchiato", grupos: [TAMANO_CAFE, LECHE, EXTRAS_CAFE] },
  { producto: "Caramel macchiato", grupos: [LECHE, EXTRAS_CAFE] },
  { producto: "Moccacino", grupos: [LECHE, EXTRAS_CAFE] },
  { producto: "Ice latte", grupos: [TAMANO_CAFE, LECHE, EXTRAS_CAFE] },
  { producto: "Ice caramel latte", grupos: [LECHE, EXTRAS_CAFE] },
  { producto: "Submarino", grupos: [LECHE] },
  { producto: "Té", grupos: [VARIEDAD_TE] },
  { producto: "Gaseosa", grupos: [SABOR_GASEOSA] },
  { producto: "Agua saborizada", grupos: [SABOR_AGUA_SABORIZADA] },
  { producto: "Agua con o sin gas", grupos: [GAS] },
  { producto: "Cerveza artesanal", grupos: [ESTILO_CERVEZA] },
  { producto: "Smoothie", grupos: [SABOR_BATIDO] },
  { producto: "Milkshake", grupos: [SABOR_BATIDO] },
  { producto: "Tostado de jamón y queso", grupos: [EXTRAS_TOSTADO] },
  { producto: "Avocado toast", grupos: [EXTRAS_TOSTADO] },
  { producto: "Café con 2 medialunas", grupos: [CAFE_DEL_COMBO, LECHE] },
  { producto: "Café con alfajor", grupos: [CAFE_DEL_COMBO, LECHE] },
  { producto: "Café con chipa", grupos: [CAFE_DEL_COMBO, LECHE] },
  { producto: "Café con cookie", grupos: [CAFE_DEL_COMBO, LECHE] },
  { producto: "Café con roll de canela", grupos: [CAFE_DEL_COMBO, LECHE] },
  { producto: "Café con lemon pie", grupos: [CAFE_DEL_COMBO, LECHE] },
  { producto: "Café con torta de ricota", grupos: [CAFE_DEL_COMBO, LECHE] },
  { producto: "Sándwich primavera", grupos: [COMBO_ALMUERZO] },
  { producto: "Sándwich de bondiola", grupos: [COMBO_ALMUERZO] },
  { producto: "Sándwich de pulled pork", grupos: [COMBO_ALMUERZO] },
  { producto: "Sándwich de pollo y cheddar", grupos: [COMBO_ALMUERZO] },
  { producto: "Sándwich de atún", grupos: [COMBO_ALMUERZO] },
  { producto: "Quiche lorraine de jamón y queso", grupos: [COMBO_ALMUERZO] },
  { producto: "Quiche lorraine de zucchini", grupos: [COMBO_ALMUERZO] },
  { producto: "Ensalada Caesar", grupos: [COMBO_ALMUERZO] },
];
