// PRESETS de prompt por rubro/tenant — config-sobre-código (coherente con los
// blueprints de ADR-074 y la detección de marca RFC-004). Un mapa `rubro → estilo
// base` que se COMPONE con el pedido específico para alimentar el hero/onboarding
// de cualquier tenant sin reescribir código por cliente.
//
// El estilo base NO es el sujeto de la foto: es la "dirección de arte" (paleta,
// clima, iluminación, terminación) que hace que la estética se vea sobria y
// editorial y que MAGRA se vea carbón+oro, aunque el pedido puntual sea el mismo.
// PURO y testeable: sin red, sin DB, sin estado.

import type { AspectRatio } from "./types";

// Dirección de arte de un rubro. Se serializa a texto y se antepone al pedido.
export interface EstiloBase {
  // Rubros/blueprints que comparten este estilo (ids reales de src/blueprints).
  rubros: string[];
  // Paleta y materialidad ("tonos tierra y teal sereno, superficies mate").
  paleta: string;
  // Clima/emoción ("sereno, cálido, editorial, premium accesible").
  mood: string;
  // Iluminación ("luz natural difusa de mañana, sombras suaves").
  iluminacion: string;
  // Lente/encuadre sugerido ("50mm, profundidad de campo media").
  camara: string;
}

// Estilo genérico comodín: se usa cuando el rubro no matchea ninguno. Neutro y
// profesional, nunca "gritón". Espeja el rol del blueprint "generico".
export const ESTILO_GENERICO: EstiloBase = {
  rubros: ["generico"],
  paleta: "paleta neutra y equilibrada, tonos naturales, superficies limpias",
  mood: "profesional, sobrio, confiable, premium accesible",
  iluminacion: "luz natural suave y pareja, contraste medio",
  camara: "50mm, encuadre limpio, profundidad de campo media",
};

// Catálogo de estilos. Cada entrada cubre varios rubros afines. Alineado con los
// ids de blueprint reales (agenda/retail/gastronomía/oficios) y con la identidad
// visual ya curada en theme-packs (estética=sereno editorial; MAGRA=carbón+oro).
export const ESTILOS: EstiloBase[] = [
  {
    // Estética, spa, peluquería, consultorio: tierra + teal, sereno, foto-first.
    rubros: ["estetica", "peluqueria", "spa", "consultorio", "servicios", "veterinaria"],
    paleta: "tonos tierra cálidos con acentos teal petróleo, hueso y arena, superficies mate",
    mood: "sereno, cálido, editorial, femenino y premium accesible, aire y calma",
    iluminacion: "luz natural difusa de mañana entrando de costado, sombras suaves",
    camara: "85mm, foco selectivo, profundidad de campo baja, terminación editorial",
  },
  {
    // MAGRA y afines (carnicería, fiambrería): carbón + oro, producto protagonista.
    rubros: ["carniceria", "fiambreria", "rotiseria"],
    paleta: "carbón profundo y negro mate con acentos oro/latón, rojo carne natural",
    mood: "premium, artesanal, masculino sobrio, boutique de barrio de alta gama",
    iluminacion: "luz lateral dramática de bajo perfil, alto contraste, fondo oscuro",
    camara: "60mm macro, textura marcada, foco nítido sobre el producto",
  },
  {
    // Velas, deco, dietética: cera cálida, natural, hecho a mano.
    rubros: ["velas", "dietetica", "indumentaria"],
    paleta: "tonos cera y crema, madera clara, lino y verde salvia apagado",
    mood: "cálido, natural, hecho a mano, calmo y aspiracional",
    iluminacion: "luz dorada de hora mágica, tibia, halos suaves",
    camara: "50mm, bokeh cremoso, composición minimalista con aire negativo",
  },
  {
    // Pádel y deporte/retail activo: energía, contraste, dinámico.
    rubros: ["padel", "kiosco"],
    paleta: "azul eléctrico y verde césped con negro deportivo, acentos neón medidos",
    mood: "dinámico, enérgico, joven, competitivo pero prolijo",
    iluminacion: "luz de estadio limpia, contraste alto, colores saturados con control",
    camara: "35mm, sensación de movimiento congelado, encuadre amplio",
  },
  {
    // Gastronomía (panadería, pizzería, cafetería, etc.): apetecible, cálido.
    rubros: ["panaderia", "pizzeria", "cafeteria", "restaurante", "heladeria", "verduleria"],
    paleta: "tonos horneados dorados y terracota, madera, blanco cálido",
    mood: "apetecible, casero, acogedor, fresco",
    iluminacion: "luz de ventana cálida, vapor sutil, sombras suaves",
    camara: "50mm cenital o 45°, food styling natural, foco en textura",
  },
];

// Índice rubro→estilo, construido una vez. Rubro en minúsculas.
const INDICE: Map<string, EstiloBase> = (() => {
  const m = new Map<string, EstiloBase>();
  for (const estilo of ESTILOS) {
    for (const r of estilo.rubros) m.set(r.toLowerCase(), estilo);
  }
  return m;
})();

// Devuelve el estilo base de un rubro, o el genérico si no hay match / no se pasó.
export function estiloParaRubro(rubro?: string): EstiloBase {
  if (!rubro) return ESTILO_GENERICO;
  return INDICE.get(rubro.trim().toLowerCase()) ?? ESTILO_GENERICO;
}

// Serializa un estilo base a una frase de dirección de arte.
export function estiloATexto(e: EstiloBase): string {
  return `Estilo: ${e.mood}. Paleta: ${e.paleta}. Iluminación: ${e.iluminacion}. Cámara: ${e.camara}.`;
}

// Sugerencias de terminación por aspect ratio (ayudan a encuadrar el hero). El
// ratio se nombra explícito porque algunos proveedores (Gemini) toman la relación
// desde el propio texto del prompt, no por parámetro.
function pistaAspecto(aspectRatio: AspectRatio): string {
  switch (aspectRatio) {
    case "16:9":
    case "5:4":
    case "4:3":
      return `Composición horizontal (${aspectRatio}) apta para banner/hero, con zona de aire para texto.`;
    case "9:16":
    case "3:4":
    case "4:5":
      return `Composición vertical (${aspectRatio}) apta para mobile/story/hero editorial.`;
    default:
      return "Composición cuadrada (1:1) equilibrada.";
  }
}

// COMPONE el prompt final: dirección de arte del rubro + pedido específico +
// pista de encuadre + barandas de calidad. `estiloOverride` pisa al preset.
// Recibe el pedido ya sanitizado (index.ts valida antes de llamar acá).
export function componerPrompt(args: {
  prompt: string;
  rubro?: string;
  aspectRatio: AspectRatio;
  estiloOverride?: string;
}): string {
  const { prompt, rubro, aspectRatio, estiloOverride } = args;
  const direccion = estiloOverride?.trim()
    ? `Estilo: ${estiloOverride.trim()}.`
    : estiloATexto(estiloParaRubro(rubro));

  return [
    prompt.trim(),
    direccion,
    pistaAspecto(aspectRatio),
    "Fotografía profesional, alta resolución, realista, sin texto ni logos, sin marcas de agua, sin deformaciones.",
  ].join(" ");
}
