// ============================================================================
// «¿CUÁL TE CONVIENE?» — tres preguntas y un puntaje por reglas. Nada de «IA».
// ============================================================================
//
// Patrón del recomendador de Qué Bien Olés: determinista y explicable. Responde con LA PAREJA (el pádel
// se juega de a dos y se compra de a dos): una pala y una zapatilla.
//
//   · pala: la forma y el balance de su ficha contra el juego, el nivel de la ficha contra el de la
//     persona, y el precio contra el tope. Una pala sin ficha puntúa sólo por precio y dibujo, y el
//     porqué lo dice («ficha a confirmar»);
//   · zapatilla: no hay ficha de zapatillas (el dueño no la cargó), así que se elige por PRESUPUESTO y
//     nivel, y el porqué no inventa agarre ni amortiguación.
//
// Siempre devuelve una pareja si el catálogo tiene al menos una pala y una zapatilla (test).

import type { Item } from "./catalogo";
import { NOMBRE_FORMA, ORDEN_NIVEL, type Forma, type Juego } from "./palas";

export type NivelDeJuego = "empiezo" | "seguido" | "compito";
export type Tope = "hasta" | "sin-tope";
export type Respuestas = { nivel: NivelDeJuego; juego: Juego; tope: Tope };

export const PREGUNTAS = {
  nivel: [
    { id: "empiezo", texto: "Empiezo" },
    { id: "seguido", texto: "Juego seguido" },
    { id: "compito", texto: "Compito" },
  ],
  juego: [
    { id: "control", texto: "Control" },
    { id: "equilibrio", texto: "Equilibrio" },
    { id: "potencia", texto: "Potencia" },
  ],
} as const;

/** La mediana de precios de las palas: el «hasta $X» de la tercera pregunta. */
export function topeDePalas(palas: readonly Item[]): number {
  const p = palas.map((x) => x.precio).filter((n) => n > 0).sort((a, b) => a - b);
  if (p.length === 0) return 0;
  const m = Math.floor(p.length / 2);
  return p.length % 2 ? p[m] : Math.round((p[m - 1] + p[m]) / 2);
}

const FORMA_IDEAL: Record<Juego, Forma> = { control: "redonda", equilibrio: "lagrima", potencia: "diamante" };
const NIVEL_IDEAL: Record<NivelDeJuego, number> = { empiezo: 0.5, seguido: 1.5, compito: 2.5 };

function puntajePala(p: Item, r: Respuestas, tope: number): number {
  let s = 0;
  const forma = p.vista.forma;
  if (forma === FORMA_IDEAL[r.juego]) s += 4;
  else if (forma === "lagrima" || FORMA_IDEAL[r.juego] === "lagrima") s += 1.5;
  const f = p.vista.ficha;
  if (f) {
    if (f.juego === r.juego) s += 3;
    s += 3 - Math.abs(ORDEN_NIVEL[f.nivel] - NIVEL_IDEAL[r.nivel]) * 1.5;
    const balanceAlto = /alto/i.test(f.balance);
    const balanceBajo = /bajo/i.test(f.balance);
    if (r.juego === "potencia" && balanceAlto) s += 1;
    if (r.juego === "control" && (balanceBajo || /medio/i.test(f.balance))) s += 1;
  }
  if (r.tope === "hasta" && tope > 0) s += p.precio <= tope ? 3 : -4;
  // Quien empieza no necesita la más cara: a igual puntaje, la más barata.
  if (r.nivel === "empiezo") s -= p.precio / 1_000_000;
  else s += p.precio / 10_000_000;
  if (p.disponibilidad === "sin-stock") s -= 10;
  return s;
}

function porqueDePala(p: Item, r: Respuestas): string {
  const f = p.vista.ficha;
  if (!f) return `Su ficha técnica está a confirmar: preguntanos antes de pedirla.`;
  const forma = NOMBRE_FORMA[f.forma];
  const balance = f.balance.split(" ")[0];
  if (r.juego === "control") return `${forma} y balance ${balance}: la bola sale donde la ponés, sin pedirte brazo.`;
  if (r.juego === "potencia") return `${forma} y balance ${balance}: el peso arriba hace que la bola salga con pegada.`;
  return `${forma} y balance ${balance}: te da control sin perder salida de bola.`;
}

export type Pareja = {
  pala: Item | null;
  zapatilla: Item | null;
  porquePala: string;
  porqueZapatilla: string;
};

export function recomendar(items: readonly Item[], r: Respuestas): Pareja {
  const palas = items.filter((x) => x.vista.seccion === "palas" && x.precio > 0);
  const zapas = items.filter((x) => x.vista.seccion === "calzado" && x.precio > 0);
  const tope = topeDePalas(palas);
  const pala =
    palas
      .map((p, i) => ({ p, s: puntajePala(p, r, tope), i }))
      .sort((a, b) => b.s - a.s || a.i - b.i)[0]?.p ?? null;

  // La zapatilla: con stock primero; quien empieza o tiene tope, la más accesible; quien compite, la de
  // más arriba de la línea; quien juega seguido, la del medio.
  const conStock = zapas.filter((z) => z.disponibilidad !== "sin-stock");
  const base = (conStock.length ? conStock : zapas).slice().sort((a, b) => a.precio - b.precio);
  const zapatilla =
    base.length === 0
      ? null
      : r.nivel === "empiezo" || r.tope === "hasta"
        ? base[0]
        : r.nivel === "compito"
          ? base[base.length - 1]
          : base[Math.floor((base.length - 1) / 2)];
  const porqueZapatilla =
    r.nivel === "empiezo" || r.tope === "hasta"
      ? "La más accesible de la línea, para cuidar el presupuesto. El talle te lo confirmamos antes de cobrar."
      : r.nivel === "compito"
        ? "La de más arriba de la línea, para el que juega todas las semanas. El talle te lo confirmamos antes de cobrar."
        : "La del medio de la línea, para jugar seguido sin irte de presupuesto. El talle te lo confirmamos antes de cobrar.";
  return { pala, zapatilla, porquePala: pala ? porqueDePala(pala, r) : "", porqueZapatilla: zapatilla ? porqueZapatilla : "" };
}
