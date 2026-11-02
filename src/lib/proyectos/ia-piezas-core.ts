// El agente propone las PIEZAS que un proyecto necesita mostrarle al cliente (renders, planos, vistas, gráfica…). Puro: el esquema, las
// instrucciones y la lectura de la respuesta se prueban sin red. La persona elige cuáles crear: el agente propone, no crea.

export const MAX_PIEZAS_PROPUESTAS = 8;

export const ESQUEMA_PIEZAS = {
  type: "object",
  properties: {
    piezas: {
      type: "array",
      description: `Entre 3 y ${MAX_PIEZAS_PROPUESTAS} piezas.`,
      items: {
        type: "object",
        properties: {
          nombre: { type: "string", description: "Nombre corto de la pieza, por ejemplo «Render de la entrada»." },
          especificacion: { type: "string", description: "Qué tiene que mostrar y en qué formato, concreto y sin inventar medidas que el brief no tenga." },
        },
        required: ["nombre", "especificacion"],
        additionalProperties: false,
      },
    },
    nota: { type: "string", description: "Una línea: por qué estas piezas y qué falta saber para definirlas mejor." },
  },
  required: ["piezas", "nota"],
  additionalProperties: false,
} as const;

export const INSTRUCCIONES_PIEZAS = `Proponé las piezas que este proyecto necesita mostrarle al cliente para que las apruebe: renders, vistas, plano de distribución, gráfica, presentación, según el tipo de evento, la idea y el stand que ya existen en los datos. Es lo que necesita el equipo de diseño para entregar.
No repitas las piezas que ya figuran en los datos. Cada una con un nombre corto y una especificación concreta de qué tiene que mostrar y en qué formato. No inventes medidas, marcas ni datos que no estén en los datos. Entre 3 y ${MAX_PIEZAS_PROPUESTAS} piezas, ordenadas de lo más importante a lo menos.`;

export interface PiezaPropuesta {
  nombre: string;
  especificacion: string;
}

const clave = (t: string): string =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Lee lo que devolvió la IA: recorta, descarta lo vacío, lo repetido y lo que ya existe en el proyecto. null si no se pudo leer. */
export function leerPiezasPropuestas(texto: string, existentes: readonly string[]): { piezas: PiezaPropuesta[]; nota: string } | null {
  let j: unknown;
  try {
    j = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!j || typeof j !== "object" || !Array.isArray((j as { piezas?: unknown }).piezas)) return null;
  const vistas = new Set(existentes.map(clave));
  const piezas: PiezaPropuesta[] = [];
  for (const crudo of (j as { piezas: unknown[] }).piezas) {
    const p = crudo as { nombre?: unknown; especificacion?: unknown } | null;
    const nombre = typeof p?.nombre === "string" ? p.nombre.trim().slice(0, 120) : "";
    const especificacion = typeof p?.especificacion === "string" ? p.especificacion.trim().slice(0, 300) : "";
    if (!nombre || vistas.has(clave(nombre))) continue;
    vistas.add(clave(nombre));
    piezas.push({ nombre, especificacion });
    if (piezas.length >= MAX_PIEZAS_PROPUESTAS) break;
  }
  if (piezas.length === 0) return null;
  const nota = typeof (j as { nota?: unknown }).nota === "string" ? (j as { nota: string }).nota.trim().slice(0, 300) : "";
  return { piezas, nota };
}
