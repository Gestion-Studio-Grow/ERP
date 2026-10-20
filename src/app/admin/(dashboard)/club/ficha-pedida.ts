// La paleta (Ctrl+K) pide abrir la ficha de un cliente. Se anota acá (módulo chico: ClientesDelClub se carga diferido)
// y la solapa la toma al montarse, o en el acto si ya estaba abierta (evento `club:ficha`).
let pedida: string | null = null;

export function pedirFichaDeCliente(id: string): void {
  pedida = id;
  window.dispatchEvent(new CustomEvent("club:ficha", { detail: id }));
}

export function tomarFichaPedida(): string | null {
  const id = pedida;
  pedida = null;
  return id;
}
