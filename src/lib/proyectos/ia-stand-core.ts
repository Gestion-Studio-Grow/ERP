// El agente propone el stand como DATO (el mismo que edita el armador 3D). Puro: el esquema, las instrucciones y la lectura de la
// respuesta se prueban sin red. Lo que vuelve de la IA se valida entero con normalizarDiseno: un borrador roto no llega a la base.

import { ACABADOS_PISO, normalizarDiseno, PIEZAS, TIPOS_STAND, TIPO_STAND_LABEL, type DisenoStand } from "./stand";

const numero = (descripcion: string) => ({ type: "number", description: descripcion });
const color = (descripcion: string) => ({ type: "string", description: `${descripcion} Hexadecimal de 6 dígitos con #, por ejemplo #E3E1D4.` });

export const ESQUEMA_STAND = {
  type: "object",
  properties: {
    tipo: { type: "string", enum: [...TIPOS_STAND], description: "Tipo de lote según cuántos lados dan al pasillo." },
    ancho: numero("Frente del lote, en metros, entre 2 y 30."),
    fondo: numero("Profundidad del lote, en metros, entre 2 y 30."),
    altoPared: numero("Alto de las paredes, en metros, entre 2,2 y 6."),
    colorPared: color("Color de las paredes."),
    colorAcento: color("Color de acento: cenefa y detalles."),
    piso: { type: "string", enum: Object.keys(ACABADOS_PISO), description: "Acabado del piso." },
    tarimaPiso: { type: "boolean", description: "Si el piso va sobre tarima." },
    textoMarca: { type: "string", description: "Nombre de la marca del cliente para pintar en las paredes, hasta 40 caracteres. Vacío si el brief no lo dice." },
    piezas: {
      type: "array",
      description: "Piezas del stand, hasta 15.",
      items: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: Object.keys(PIEZAS) },
          x: numero("Centro de la pieza hacia la derecha (+) o izquierda (−) del centro del lote, en metros."),
          z: numero("Centro de la pieza hacia el pasillo (+) o hacia la pared del fondo (−), en metros."),
          giro: { type: "integer", description: "Cuartos de vuelta, de 0 a 3." },
        },
        required: ["tipo", "x", "z", "giro"],
        additionalProperties: false,
      },
    },
    notas: { type: "string", description: "En pocas líneas: qué se propuso y por qué, y qué hay que confirmar con el cliente. No inventes medidas ni datos que el brief no tenga." },
  },
  required: ["tipo", "ancho", "fondo", "altoPared", "colorPared", "colorAcento", "piso", "tarimaPiso", "textoMarca", "piezas", "notas"],
  additionalProperties: false,
} as const;

const catalogo = Object.entries(PIEZAS)
  .map(([k, p]) => `${k} (${p.label}: ${p.ancho} × ${p.fondo} × ${p.alto} m)`)
  .join("; ");
const tipos = TIPOS_STAND.map((t) => `${t} = ${TIPO_STAND_LABEL[t]}`).join("; ");

export const INSTRUCCIONES_STAND = `Armá un primer borrador del stand para este evento, como datos para el armador 3D. Es un punto de partida: el equipo lo va a ajustar.
Medidas en metros. El centro del lote es (0, 0): x positivo va a la derecha; z positivo va hacia el pasillo (el frente) y z negativo hacia la pared del fondo.
Tipos de lote: ${tipos}. Las paredes están del lado que NO da al pasillo.
Piezas disponibles: ${catalogo}.
Si el brief trae las medidas del lote, usalas tal cual. Si no, proponé un lote razonable y anotá en «notas» que las medidas hay que confirmarlas.
Las piezas tienen que quedar adentro del lote y sin superponerse; dejá pasillos de circulación libres. Hasta 15 piezas. Las pantallas y los tótems van contra una pared; el mostrador, cerca del frente.
Usá colores que combinen con la marca del cliente sólo si el brief los menciona; si no, neutros. No inventes la marca ni datos del cliente.`;

export function leerStandPropuesto(texto: string): { diseno: DisenoStand; notas: string } | null {
  let j: unknown;
  try {
    j = JSON.parse(texto);
  } catch {
    return null;
  }
  const diseno = normalizarDiseno(j);
  if (!diseno || diseno.piezas.length === 0) return null;
  const notas = typeof (j as { notas?: unknown }).notas === "string" ? (j as { notas: string }).notas.trim().slice(0, 800) : "";
  return { diseno, notas };
}
