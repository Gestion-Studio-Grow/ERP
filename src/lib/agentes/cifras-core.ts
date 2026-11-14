// ============================================================================
// EQUIPO DE AGENTES · control de cifras y de atribución (03 §4.2, §13). PURO.
// ============================================================================
// Toda cifra que quede en la prosa del modelo tiene que ser una cifra leída (o un total que calculó el
// código) y, si el renglón nombra a un cliente, evento o concepto, tiene que ser de ESE renglón: el
// modelo no puede atribuirle a un cliente el importe de otro. Si no pasa, el pedido no sale con esa
// prosa (queda «necesita una persona»).

import type { Cifra, Fila } from "./tipos";

export interface Problema {
  cifra: string;
  motivo: "inventada" | "de_otra_entidad";
  linea: string;
}

export interface ControlDeCifras {
  ok: boolean;
  problemas: Problema[];
}

/** "1.234,56" → 1234.56; "1234" → 1234; "12,5" → 12.5. */
export function numeroDesdeTexto(s: string): number | null {
  const limpio = s.replace(/[^\d.,]/g, "");
  if (!/\d/.test(limpio)) return null;
  const n = Number(limpio.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Importe con moneda, o con separador de miles, o con decimales, o un entero de 4+ cifras; porcentajes; fechas.
const CIFRA = /(?:US\$|U\$S|USD|ARS|\$)\s?\d[\d.]*(?:,\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+,\d+|\d{4,}|\d+(?:,\d+)?\s?%|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g;

function normalizar(s: string): string {
  return s
    .toLocaleLowerCase("es-AR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function coincide(valor: number, c: Cifra): boolean {
  return Math.abs(c.valor - valor) < 0.005;
}

function esFecha(s: string): boolean {
  return /^\d{1,2}\/\d{1,2}/.test(s);
}

function cifraDeFila(token: string, f: Fila): boolean {
  if (esFecha(token)) return f.cifras.some((c) => c.tipo === "fecha" && c.texto.includes(token));
  const v = numeroDesdeTexto(token);
  return v !== null && f.cifras.some((c) => coincide(v, c));
}

/**
 * `extras` son cifras que calculó el código fuera de las filas (totales, cantidades de renglones,
 * métricas del buzón): también son legítimas, pero no son de ninguna entidad.
 */
export function controlarCifras(texto: string, filas: readonly Fila[], extras: readonly Cifra[] = []): ControlDeCifras {
  const problemas: Problema[] = [];
  for (const linea of texto.split(/\n|(?<=[.;!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/)) {
    const tokens = linea.match(CIFRA) ?? [];
    if (tokens.length === 0) continue;
    const ln = normalizar(linea);
    // Renglones cuya entidad se nombra en la línea.
    const nombradas = filas.filter((f) => f.etiquetas.some((e) => e.trim().length >= 3 && ln.includes(normalizar(e.trim()))));
    for (const token of tokens) {
      const t = token.trim();
      const v = numeroDesdeTexto(t);
      const deAlgunaFila = filas.filter((f) => cifraDeFila(t, f));
      const esExtra = !esFecha(t) && v !== null && extras.some((c) => coincide(v, c));
      if (deAlgunaFila.length === 0 && !esExtra) {
        problemas.push({ cifra: t, motivo: "inventada", linea });
        continue;
      }
      // Atribución: si la línea nombra entidades, la cifra tiene que ser de una de ellas (o un extra).
      if (nombradas.length > 0 && !esExtra && !nombradas.some((f) => cifraDeFila(t, f))) {
        problemas.push({ cifra: t, motivo: "de_otra_entidad", linea });
      }
    }
  }
  return { ok: problemas.length === 0, problemas };
}

/** Total por moneda de las cifras de importe de las filas (lo calcula el código, nunca el modelo). */
export function totalesPorMoneda(filas: readonly Fila[]): Map<string, number> {
  const t = new Map<string, number>();
  for (const f of filas) {
    for (const c of f.cifras) {
      if (c.tipo !== "importe") continue;
      const m = c.moneda ?? "ARS";
      t.set(m, Math.round(((t.get(m) ?? 0) + c.valor) * 100) / 100);
    }
  }
  return t;
}

/** "$ 1.234,56" / "US$ 1.234,56", con el formato de Argentina. */
export function textoImporte(valor: number, moneda = "ARS"): string {
  const n = valor.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${moneda === "USD" ? "US$" : "$"} ${n}`;
}
