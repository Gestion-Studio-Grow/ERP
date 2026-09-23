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

export function filtrarOpciones(opciones: OpcionBuscador[], texto: string, max = 8): OpcionBuscador[] {
  const q = normalizarBusqueda(texto);
  if (q === "") return opciones.slice(0, max);
  const palabras = q.split(/\s+/).filter(Boolean);
  const conPuntaje: { o: OpcionBuscador; p: number; i: number }[] = [];
  opciones.forEach((o, i) => {
    const etiqueta = normalizarBusqueda(o.etiqueta);
    const todo = `${etiqueta} ${normalizarBusqueda(o.detalle ?? "")}`;
    if (!palabras.every((w) => todo.includes(w))) return;
    conPuntaje.push({ o, p: etiqueta.startsWith(q) ? 0 : etiqueta.includes(q) ? 1 : 2, i });
  });
  return conPuntaje
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .slice(0, max)
    .map((x) => x.o);
}
