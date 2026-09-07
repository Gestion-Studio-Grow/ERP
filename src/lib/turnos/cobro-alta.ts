// QUÉ SE COBRA AL DAR DE ALTA UN TURNO — regla pura.
//
// El mismo formulario se usa en dos lugares que quieren cosas distintas:
//   · AGENDA: se está RESERVANDO para más adelante. Lo que corresponde cobrar es la seña,
//     si el servicio tiene una definida; si no tiene, no se cobra nada todavía.
//   · MOSTRADOR: la clienta está en el local y el servicio se cobra entero. Antes esto no
//     se podía hacer: el bloque de cobro sólo aparecía cuando el servicio tenía seña
//     cargada, así que un servicio sin seña no se podía cobrar al darlo de alta.
//
// Es una PROPUESTA, no una regla que trabe: la persona puede cambiarla siempre. Vive acá
// y no dentro del componente porque decide sobre plata, y sobre plata se escriben tests.

export type OrigenAlta = "agenda" | "mostrador";
export type ModoCobro = "nada" | "senia" | "total" | "otro";

/** Qué proponer cobrar al elegir el servicio. */
export function cobroPropuestoAlAlta(input: { origen: OrigenAlta; senia: number }): ModoCobro {
  if (input.origen === "mostrador") return "total";
  return input.senia > 0 ? "senia" : "nada";
}

/**
 * Monto que corresponde al modo elegido. `otro` viene del input de texto (puede traer
 * coma decimal, vacío o basura): todo lo que no sea un número usable vale 0, y con 0 el
 * servidor rechaza el cobro — nunca cobra un monto inventado.
 */
export function montoDelCobro(input: {
  modo: ModoCobro;
  senia: number;
  precio: number;
  otro?: string;
}): number {
  switch (input.modo) {
    case "senia":
      return sano(input.senia);
    case "total":
      return sano(input.precio);
    case "otro": {
      const n = Number(String(input.otro ?? "").trim().replace(",", "."));
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    default:
      return 0;
  }
}

function sano(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** ¿Este cobro deja el turno saldado? Sirve para avisarlo antes de guardar. */
export function quedaSaldado(input: { monto: number; precio: number }): boolean {
  return input.precio > 0 && input.monto >= input.precio;
}
