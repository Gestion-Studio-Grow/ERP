// PEDIDOS A LA CUADRILLA · reglas puras (GSG-MIA-062, criterio 8: «servicio, no Claude suelto»).
//
// Cada mensaje de una persona en el hilo de un agente es un PEDIDO, con un tope de esfuerzo fijado acá, en la
// consola (minutos y turnos del agente), no en el manual. El agente cierra el pedido por una de cuatro salidas:
//   · HECHO: lo hizo dentro de su puesto.
//   · NEGADO (salida AJENO): ajeno al servicio («haceme un juego completo»). Se contesta con amabilidad, con lo
//     que sí puede hacer, y queda guardado con la REGLA del manual que lo justifica («<puesto> §n»).
//   · ESCALADO (salida OPORTUNIDAD): puede ser un servicio de GSG. En el hilo va SIEMPRE el texto fijo de
//     traspaso (el agente no escribe nada: no promete precio ni plazo ni contacta a nadie) y entra a la cola
//     «Oportunidades» con dueño COM y fecha.
//   · ESCALADO (salida TOPE): llegó al tope de minutos o de turnos. Se frena; no se sigue.
// PURO: sin base. La escritura vive en `pedidos-core.ts`.

export const ESTADOS_PEDIDO = ["ABIERTO", "HECHO", "NEGADO", "ESCALADO"] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];
export const SALIDAS_PEDIDO = ["AJENO", "OPORTUNIDAD", "TOPE"] as const;
export type SalidaPedido = (typeof SALIDAS_PEDIDO)[number];

/** Dueño de la cola «Oportunidades»: el frente comercial de GSG. */
export const DUENIO_OPORTUNIDADES = "COM";

/** Topes por pedido, fijados en la consola al pedir. */
export const TOPE = {
  minutos: { min: 5, max: 240, porDefecto: 30 },
  turnos: { min: 1, max: 50, porDefecto: 10 },
} as const;

/** Lo único que se le contesta a un pedido que puede ser un servicio de GSG. Sin precio, sin plazo. */
export const RESPUESTA_OPORTUNIDAD =
  "Tu pedido fue traspasado al equipo correspondiente de GSG. Nos vamos a contactar con el área.";

/** La regla cita el manual del puesto: «<puesto> §n» (p. ej. «verificador §2.1»), igual que el registro de turno. */
export const REGLA = /^[\p{L}][\p{L} _-]*\s*§\s*\d+(\.\d+)*\b/u;

export function respuestaNegado(regla: string, queSi: string): string {
  return `Gracias por el pedido. Eso queda fuera de lo que hago (${regla}), así que no lo voy a hacer. Lo que sí puedo hacer: ${queSi}`;
}

/** Un número del formulario dentro del rango; fuera de rango o vacío, el valor por defecto. */
export function topeDe(valor: unknown, rango: { min: number; max: number; porDefecto: number }): number {
  const n = typeof valor === "number" ? valor : Number(String(valor ?? "").trim());
  if (!Number.isInteger(n) || n < rango.min || n > rango.max) return rango.porDefecto;
  return n;
}

export type PedidoTope = { createdAt: Date; topeMinutos: number; topeTurnos: number; turnosUsados: number };

/** ¿Se pasó de algún tope? Por minutos desde que se pidió, o por turnos ya usados. */
export function pasoElTope(p: PedidoTope, ahora: Date = new Date()): "minutos" | "turnos" | null {
  if (ahora.getTime() - p.createdAt.getTime() >= p.topeMinutos * 60_000) return "minutos";
  if (p.turnosUsados >= p.topeTurnos) return "turnos";
  return null;
}

export type CierrePedido =
  | { salida: "HECHO"; respuesta: string }
  | { salida: "AJENO"; regla: string; queSi: string }
  | { salida: "OPORTUNIDAD" };

/**
 * Valida el cierre y devuelve lo que se guarda y lo que se contesta en el hilo, o el motivo en criollo.
 * La respuesta de OPORTUNIDAD es SIEMPRE el texto fijo: lo que mande el formulario se ignora.
 */
export function armarCierre(c: CierrePedido):
  | { ok: true; estado: EstadoPedido; salida: SalidaPedido | null; regla: string | null; duenio: string | null; respuesta: string }
  | { ok: false; motivo: string } {
  if (c.salida === "HECHO") {
    const respuesta = c.respuesta.trim().slice(0, 2000);
    if (!respuesta) return { ok: false, motivo: "Contá qué hiciste antes de darlo por terminado." };
    return { ok: true, estado: "HECHO", salida: null, regla: null, duenio: null, respuesta };
  }
  if (c.salida === "AJENO") {
    const regla = c.regla.trim().slice(0, 120);
    const queSi = c.queSi.trim().slice(0, 600);
    if (!REGLA.test(regla)) return { ok: false, motivo: "La regla tiene que citar tu manual: «<puesto> §n» (por ejemplo «verificador §2»)." };
    if (queSi.length < 10) return { ok: false, motivo: "Decí qué sí podés hacer: es parte de contestar con amabilidad." };
    return { ok: true, estado: "NEGADO", salida: "AJENO", regla, duenio: null, respuesta: respuestaNegado(regla, queSi) };
  }
  return { ok: true, estado: "ESCALADO", salida: "OPORTUNIDAD", regla: null, duenio: DUENIO_OPORTUNIDADES, respuesta: RESPUESTA_OPORTUNIDAD };
}

/** Filtro de la lista de pedidos en la consola. */
export const VISTAS_PEDIDOS = ["abiertos", "negados", "oportunidades", "topes", "todos"] as const;
export type VistaPedidos = (typeof VISTAS_PEDIDOS)[number];

export function dondeDeLaVista(v: VistaPedidos): { estado?: EstadoPedido; salida?: SalidaPedido } {
  switch (v) {
    case "abiertos":
      return { estado: "ABIERTO" };
    case "negados":
      return { estado: "NEGADO" };
    case "oportunidades":
      return { estado: "ESCALADO", salida: "OPORTUNIDAD" };
    case "topes":
      return { estado: "ESCALADO", salida: "TOPE" };
    default:
      return {};
  }
}
