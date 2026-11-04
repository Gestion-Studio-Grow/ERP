// Contenido — detección del tipo y extracción de campos desde el texto del negocio (PURO).
// Reglas rioplatenses deterministas; sin IA. Si la regla falla, el tipo se cambia a mano en la pantalla.
import type { Canal, Deteccion, Extraccion, TipoDeContenido } from "./tipos";

/** Minúsculas y sin tildes, para comparar. */
export function normalizar(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

interface Regla {
  tipo: TipoDeContenido;
  patron: RegExp;
  peso: number;
}

// Los patrones corren sobre el texto normalizado (sin tildes, minúsculas).
const REGLAS: readonly Regla[] = [
  // promo: lo que lleva precio o descuento manda.
  { tipo: "promo", patron: /\b\d+\s*x\s*\d+\b/, peso: 4 },
  { tipo: "promo", patron: /\d+\s*%(\s*off)?/, peso: 4 },
  { tipo: "promo", patron: /\$\s*\d[\d.,]*/, peso: 3 },
  { tipo: "promo", patron: /\b(descuentos?|promos?|promocion|ofertas?|rebajas?|liquidacion|sale)\b/, peso: 3 },
  { tipo: "promo", patron: /\b(cuotas sin interes|gratis|bonificad[oa]s?|2 por 1)\b/, peso: 2 },
  // horario
  { tipo: "horario", patron: /\b(de )?lunes a (viernes|sabados?|domingos?)\b/, peso: 2 },
  { tipo: "horario", patron: /\bde \d{1,2}([:.]\d{2})?\s*(hs?\.?\s*)?a \d{1,2}([:.]\d{2})?\b/, peso: 1.5 },
  { tipo: "horario", patron: /\b(feriados?|horarios?|cerrad[oa]s?|cerramos|abrimos|abierto|atendemos|vacaciones)\b/, peso: 3 },
  // evento
  { tipo: "evento", patron: /\b(torneos?|inscripcion(es)?|inscribite|anotate|anotarte)\b/, peso: 4 },
  { tipo: "evento", patron: /\b(eventos?|taller(es)?|clase abierta|charla|sorteo|copa|fiesta|show|degustacion|feria|premios?|cupos?)\b/, peso: 2.5 },
  // servicio
  { tipo: "servicio", patron: /\b(nuevo servicio|nuevos servicios|ahora hacemos|ahora tambien|ahora ofrecemos)\b/, peso: 5 },
  { tipo: "servicio", patron: /\b(sumamos|incorporamos|nuevo tratamiento|te ofrecemos|ya podes reservar|envios a domicilio|delivery)\b/, peso: 3 },
  // novedad (también es el respaldo)
  { tipo: "novedad", patron: /\b(novedad(es)?|llego|llegaron|lanzamos|nueva coleccion|nuevos?|nuevas?|ya esta|estrenamos)\b/, peso: 1 },
];

/** Orden de desempate: lo más específico primero. */
const PRIORIDAD: readonly TipoDeContenido[] = ["promo", "evento", "servicio", "horario", "novedad"];

/** Detecta el tipo de contenido por palabras y patrones. Sin pistas → «novedad» con confianza baja. */
export function detectarTipo(texto: string): Deteccion {
  const t = normalizar(texto);
  const puntos: Record<TipoDeContenido, number> = { promo: 0, horario: 0, evento: 0, novedad: 0, servicio: 0 };
  const pistas: Record<TipoDeContenido, string[]> = { promo: [], horario: [], evento: [], novedad: [], servicio: [] };
  for (const r of REGLAS) {
    const m = t.match(r.patron);
    if (!m) continue;
    puntos[r.tipo] += r.peso;
    pistas[r.tipo].push(m[0].trim());
  }
  const orden = [...PRIORIDAD].sort((a, b) => puntos[b] - puntos[a] || PRIORIDAD.indexOf(a) - PRIORIDAD.indexOf(b));
  const mejor = orden[0];
  const total = PRIORIDAD.reduce((s, k) => s + puntos[k], 0);
  if (puntos[mejor] === 0) return { tipo: "novedad", confianza: 0.3, pistas: [] };
  const confianza = Math.round((puntos[mejor] / total) * Math.min(1, puntos[mejor] / 4) * 100) / 100;
  return { tipo: mejor, confianza: Math.max(0.3, confianza), pistas: pistas[mejor] };
}

const CTA: Readonly<Record<TipoDeContenido, Record<Canal, string>>> = Object.freeze({
  promo: { instagram: "Aprovechala", historia: "Respondé y reservá", whatsapp: "Respondé este mensaje y te la reservamos" },
  horario: { instagram: "Te esperamos", historia: "Te esperamos", whatsapp: "Cualquier consulta, respondé este mensaje" },
  evento: { instagram: "Inscribite ya", historia: "Respondé y te anotamos", whatsapp: "Anotate respondiendo este mensaje" },
  novedad: { instagram: "Enterate más", historia: "Escribinos", whatsapp: "Respondé este mensaje y te contamos" },
  servicio: { instagram: "Reservá tu turno", historia: "Respondé y reservá", whatsapp: "Pedí tu turno respondiendo este mensaje" },
});

/** El llamado a la acción según el tipo y el canal. */
export const ctaPara = (tipo: TipoDeContenido, canal: Canal = "instagram"): string => CTA[tipo][canal];

const TOPE_TITULO = 60;
const TOPE_BAJADA = 160;

/** Corta en el último espacio antes del tope y agrega «…». */
function recortar(texto: string, tope: number): string {
  if (texto.length <= tope) return texto;
  const corte = texto.slice(0, tope - 1);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > tope * 0.5 ? corte.slice(0, espacio) : corte).replace(/[\s,;:.-]+$/, "")}…`;
}

const sinPuntoFinal = (s: string) => s.trim().replace(/[.;:,]+$/, "").trim();

/** Primer precio o descuento del texto (original). */
function buscarPrecio(texto: string): { valor: string; crudo: string } | undefined {
  const nxm = texto.match(/\b(\d+)\s*[xX]\s*(\d+)\b/);
  if (nxm) return { valor: `${nxm[1]}x${nxm[2]}`, crudo: nxm[0] };
  const pct = texto.match(/(\d+)\s*%(\s*off)?/i);
  if (pct) return { valor: `${pct[1]}%${pct[2] ? " OFF" : ""}`, crudo: pct[0] };
  const pesos = texto.match(/\$\s*(\d[\d.]*(?:,\d+)?)/);
  if (pesos) return { valor: `$ ${pesos[1].replace(/\.$/, "")}`, crudo: pesos[0] };
  return undefined;
}

function buscarFecha(texto: string): string | undefined {
  for (const m of texto.matchAll(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(?:\d{4}|\d{2}))?(?![\d/])/g)) {
    const d = Number(m[1]);
    const mes = Number(m[2]);
    if (d >= 1 && d <= 31 && mes >= 1 && mes <= 12) return `${String(d).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
  }
  return undefined;
}

const hm = (h: string, m?: string) => (m ? `${Number(h)}:${m}` : String(Number(h)));

function buscarHora(texto: string): string | undefined {
  const rango = texto.match(/\bde\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:hs?\.?\s*)?a\s+(\d{1,2})(?:[:.](\d{2}))?(?:\s*hs?\b\.?)?/i);
  if (rango && Number(rango[1]) <= 24 && Number(rango[3]) <= 24) return `de ${hm(rango[1], rango[2])} a ${hm(rango[3], rango[4])}`;
  const exacta = texto.match(/(?<![\d/])([01]?\d|2[0-3])[:.]([0-5]\d)(?![\d/])/);
  if (exacta) return `${exacta[1].padStart(2, "0")}:${exacta[2]}`;
  const alas = texto.match(/\ba\s+las\s+([01]?\d|2[0-3])\b(?![:.]\d)/i);
  if (alas) return `${alas[1].padStart(2, "0")}:00`;
  return undefined;
}

/** Saca título, bajada, CTA (según tipo y canal), fecha, hora y precio del texto. */
export function extraer(texto: string, opciones: { tipo?: TipoDeContenido; canal?: Canal } = {}): Extraccion {
  const limpio = String(texto ?? "").replace(/\r/g, "").trim();
  const tipo = opciones.tipo ?? detectarTipo(limpio).tipo;
  const renglones = limpio.split("\n").map((r) => r.trim()).filter(Boolean);
  let titulo = "";
  let resto = "";
  if (renglones.length) {
    const primero = renglones[0];
    if (primero.length <= TOPE_TITULO) {
      titulo = sinPuntoFinal(primero);
      resto = renglones.slice(1).join(" ");
    } else {
      // Primera oración del renglón; si igual es larga, se recorta en una palabra.
      const oracion = primero.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? primero;
      titulo = oracion.length <= TOPE_TITULO ? sinPuntoFinal(oracion) : recortar(sinPuntoFinal(oracion), TOPE_TITULO);
      resto = [primero.slice(oracion.length).trim(), ...renglones.slice(1)].filter(Boolean).join(" ");
      if (oracion.length > TOPE_TITULO && !resto) resto = primero;
    }
  }
  const precio = buscarPrecio(limpio);
  const sinPrecio = precio ? limpio.replace(precio.crudo, " ") : limpio;
  const out: Extraccion = {
    titulo,
    bajada: recortar(resto.replace(/\s+/g, " ").trim(), TOPE_BAJADA),
    cta: ctaPara(tipo, opciones.canal ?? "instagram"),
  };
  const fecha = buscarFecha(sinPrecio);
  const hora = buscarHora(sinPrecio);
  if (fecha) out.fecha = fecha;
  if (hora) out.hora = hora;
  if (precio) out.precio = precio.valor;
  return out;
}
