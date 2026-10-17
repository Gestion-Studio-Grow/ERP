// Filtro del BuscadorCombo, puro para poder testearlo sin DOM.
//
// Se busca como tipea la gente en el mostrador: sin tildes ("lomo" encuentra "Lomó"), sin
// mayúsculas, y por PALABRAS en cualquier orden ("vac lomo" encuentra "Lomo al vacío").
// Los que empiezan con lo tipeado van primero: es el que casi siempre se quería.

export interface OpcionBuscador {
  id: string;
  etiqueta: string;
  /** Segunda línea: precio, stock, teléfono. También se busca por ella. */
  detalle?: string;
}

export const normalizarBusqueda = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// ── PERFORMANCE (docs/producto/PERFORMANCE-TERMINALES.md, ronda 2) ─────────────────────────────
// Antes, cada tecla normalizaba la etiqueta y el detalle de TODAS las opciones (NFD + sacar tildes
// + minúsculas): con 20.000 productos eran ~18 ms por tecla en una PC normal y ~90 ms en una
// lenta. Ahora:
//   · lo normalizado de cada opción se arma UNA vez por lista (la lista la memoiza quien llama:
//     Vender con `useMemo`) y se guarda en un WeakMap atado a ESA lista (se va con ella);
//   · si el texto nuevo empieza con el anterior (se sigue tipeando), sólo se revisan las que ya
//     coincidían: una palabra más larga sólo puede achicar el resultado;
//   · se deja de recorrer cuando ya hay `max` que EMPIEZAN con lo tipeado: ésas van primero y en
//     el orden de la lista, así que nada de lo que sigue puede entrar (y se anota hasta dónde se
//     revisó, para seguir desde ahí con la tecla siguiente);
//   · lo que falta recorrer se busca con un `indexOf` sobre el texto de todas las opciones juntas
//     (la palabra más larga), y sólo se revisan las opciones donde aparece;
//   · el orden (las que empiezan con lo tipeado, después las que lo contienen en la etiqueta,
//     después el resto, cada grupo en el orden de la lista) sale de tres grupos, sin ordenar.
// El resultado y el orden son EXACTAMENTE los de antes (buscador-filtro.test.ts los compara con la
// versión anterior en miles de búsquedas). Si alguien cambia la lista en el lugar (otra opción en
// una posición), se nota comparando las referencias y se vuelve a armar; cambiar el texto de una
// opción sin cambiar el objeto no se detecta (en React las listas no se mutan).
type IndiceDeOpciones = {
  fuente: OpcionBuscador[];
  etiquetas: string[];
  todos: string[];
  /** Todos los `todos` en un solo texto separado por "\n", y dónde empieza cada uno en él. */
  junto: string;
  inicio: Int32Array;
  /**
   * La última búsqueda en esta lista y sus coincidencias (posiciones, en orden) entre las
   * opciones `0..hasta-1`: hasta ahí se revisó (se corta cuando el primer grupo ya está lleno).
   */
  ultimaQ: string | null;
  ultimas: number[];
  hasta: number;
};
const INDICES = new WeakMap<OpcionBuscador[], IndiceDeOpciones>();

function mismaLista(a: OpcionBuscador[], b: OpcionBuscador[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function indiceDe(opciones: OpcionBuscador[]): IndiceDeOpciones {
  const previo = INDICES.get(opciones);
  if (previo && mismaLista(previo.fuente, opciones)) return previo;
  const etiquetas = new Array<string>(opciones.length);
  const todos = new Array<string>(opciones.length);
  for (let i = 0; i < opciones.length; i++) {
    const o = opciones[i];
    const etiqueta = normalizarBusqueda(o.etiqueta);
    etiquetas[i] = etiqueta;
    todos[i] = `${etiqueta} ${normalizarBusqueda(o.detalle ?? "")}`;
  }
  const inicio = new Int32Array(opciones.length + 1);
  for (let i = 0, pos = 0; i < opciones.length; i++) {
    inicio[i] = pos;
    pos += todos[i].length + 1;
    inicio[i + 1] = pos;
  }
  const indice: IndiceDeOpciones = { fuente: opciones.slice(), etiquetas, todos, junto: todos.join("\n"), inicio, ultimaQ: null, ultimas: [], hasta: 0 };
  INDICES.set(opciones, indice);
  return indice;
}

export function filtrarOpciones(opciones: OpcionBuscador[], texto: string, max = 8): OpcionBuscador[] {
  const q = normalizarBusqueda(texto);
  if (q === "") return opciones.slice(0, max);
  const palabras = q.split(/\s+/).filter(Boolean);
  const ix = indiceDe(opciones);
  // Los tres grupos del orden de siempre; ninguno necesita más de `max` (con un `max` raro, sin
  // tope: el `slice` del final hace lo mismo que antes).
  const tope = max >= 0 ? max : Number.POSITIVE_INFINITY;
  const empiezan: OpcionBuscador[] = [];
  const contienen: OpcionBuscador[] = [];
  const resto: OpcionBuscador[] = [];
  const coinciden: number[] = [];
  /** ¿Coincide la opción `i`? La anota en su grupo. Devuelve true cuando ya no hace falta seguir. */
  const revisar = (i: number): boolean => {
    const todo = ix.todos[i];
    for (const w of palabras) if (!todo.includes(w)) return false;
    coinciden.push(i);
    const etiqueta = ix.etiquetas[i];
    const grupo = etiqueta.startsWith(q) ? empiezan : etiqueta.includes(q) ? contienen : resto;
    if (grupo.length < tope) grupo.push(opciones[i]);
    // Con el primer grupo lleno, lo que venga después no entra: las que empiezan con lo tipeado
    // van primero, y en el orden de la lista.
    return empiezan.length >= tope;
  };
  // Se revisó todo lo de antes de `hasta`; si el texto sigue al anterior, alcanza con mirar las
  // que coincidían ahí y seguir desde `hasta`.
  const sigue = ix.ultimaQ !== null && q.startsWith(ix.ultimaQ);
  let hasta = opciones.length;
  let cortado = false;
  if (sigue) {
    for (const i of ix.ultimas) {
      if (revisar(i)) {
        hasta = i + 1;
        cortado = true;
        break;
      }
    }
  }
  if (!cortado) {
    // El resto, sin pasar por cada opción: se busca la palabra más larga en el texto de todas
    // juntas (`indexOf` nativo) y sólo se revisan las opciones donde aparece. Una palabra no
    // tiene espacios, así que nunca cruza el "\n" que separa una opción de la siguiente: toda
    // opción que la contiene aparece acá, en orden. `revisar` confirma con todas las palabras.
    const larga = palabras.reduce((a, b) => (b.length > a.length ? b : a));
    let i = sigue ? ix.hasta : 0;
    let desde = ix.inicio[i];
    while (i < opciones.length) {
      const pos = ix.junto.indexOf(larga, desde);
      if (pos === -1) break;
      while (ix.inicio[i + 1] <= pos) i++;
      if (revisar(i)) {
        hasta = i + 1;
        break;
      }
      i++;
      desde = ix.inicio[i];
    }
  }
  ix.ultimaQ = q;
  ix.ultimas = coinciden;
  ix.hasta = hasta;
  return empiezan.concat(contienen, resto).slice(0, max);
}
