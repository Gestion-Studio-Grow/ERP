// ============================================================================
// LA FICHA NUEVA («Renglón») — lo que se dice arriba, en palabras. Puro, sin framework.
// ============================================================================
//
// El momento: la recepcionista atiende el teléfono y abre la ficha de quien llama. Antes de hablar
// necesita cuatro cosas, en este orden: si tiene turno, si debe plata, si falta sin avisar y si
// pidió que no le escriban. Eso va en UNA línea de estado bajo el nombre (no en cuatro tarjetas).
//
// Acá no se calcula plata: `debe` llega sumado igual que en la ficha única (saldo de turnos +
// fiado, `FichaUnica.tsx`), y sólo se decide qué se dice, en qué orden y con qué tono.

export type EntradaEstadoFicha = {
  /** Rubro de servicios (turnos) o de mostrador (pedidos). */
  servicios: boolean;
  /** El próximo turno ya escrito («vie 25/09 10:30 · Hidratación facial con Marina»), o null. */
  proximoTurno: string | null;
  /** «hace 12 días», o null si nunca vino / nunca compró. */
  ultimaVezHace: string | null;
  debe: number;
  /** El fiado no se pudo leer: lo que debe es sólo lo de los turnos. */
  fiadoIlegible: boolean;
  faltazos: number;
  faltazosParaAviso: number;
  pedidos: number;
  /** Pedidos de la lista de abajo que no están anulados ni cobrados (se cuentan, no se suman). */
  pedidosSinCobrar: number;
  noQuiere: boolean;
};

export type DatoFicha =
  | { tipo: "texto"; clave: string; texto: string; tono?: "peligro" | "atencion" }
  | { tipo: "debe"; clave: "debe"; monto: number; aclaracion: string | null };

/** Los datos de la línea de estado, en el orden en que se leen antes de atender. */
export function estadoDeLaFicha(e: EntradaEstadoFicha): DatoFicha[] {
  const datos: DatoFicha[] = [];
  if (e.servicios) {
    datos.push(
      e.proximoTurno
        ? { tipo: "texto", clave: "turno", texto: `Turno ${e.proximoTurno}` }
        : { tipo: "texto", clave: "turno", texto: "Sin turno reservado" },
    );
  }
  if (e.debe > 0) {
    datos.push({ tipo: "debe", clave: "debe", monto: e.debe, aclaracion: e.fiadoIlegible ? "sin contar el fiado, que no se pudo leer" : null });
  } else {
    datos.push({ tipo: "texto", clave: "debe", texto: textoAlDia(e) });
  }
  if (e.servicios && e.faltazos > 0) {
    const veces = e.faltazos === 1 ? "1 vez" : `${e.faltazos} veces`;
    datos.push(
      e.faltazos >= e.faltazosParaAviso
        ? { tipo: "texto", clave: "faltazos", texto: `Faltó ${veces} sin avisar: pedile seña`, tono: "atencion" }
        : { tipo: "texto", clave: "faltazos", texto: `Faltó ${veces} sin avisar` },
    );
  }
  if (!e.servicios && e.pedidos > 0) {
    datos.push({ tipo: "texto", clave: "pedidos", texto: e.pedidos === 1 ? "1 pedido" : `${e.pedidos} pedidos` });
  }
  if (!e.servicios && e.pedidosSinCobrar > 0) {
    const n = e.pedidosSinCobrar;
    datos.push({ tipo: "texto", clave: "sin-cobrar", texto: n === 1 ? "1 pedido sin cobrar" : `${n} pedidos sin cobrar`, tono: "atencion" });
  }
  datos.push({
    tipo: "texto",
    clave: "ultima",
    texto: e.ultimaVezHace
      ? `${e.servicios ? "Vino" : "Compró"} por última vez ${e.ultimaVezHace}`
      : e.servicios
        ? "Todavía no vino"
        : "Todavía no compró",
  });
  if (e.noQuiere) datos.push({ tipo: "texto", clave: "no-quiere", texto: "No quiere mensajes", tono: "peligro" });
  return datos;
}

/**
 * «Al día» sin decir de qué, al lado de un pedido sin cobrar, se lee como que no debe nada. En
 * mostrador la cifra de arriba es la cuenta corriente (el fiado): se nombra. Los pedidos sin cobrar
 * van aparte, contados (estadoDeLaFicha), porque no son deuda de cuenta corriente.
 */
function textoAlDia(e: Pick<EntradaEstadoFicha, "servicios" | "fiadoIlegible">): string {
  if (e.servicios) return e.fiadoIlegible ? "No debe turnos (el fiado no se pudo leer)" : "Está al día";
  return e.fiadoIlegible ? "La cuenta corriente no se pudo leer" : "Cuenta corriente al día";
}

/** Misma regla que el renglón del pedido: ni anulado ni cobrado. */
export function pedidoSinCobrar(p: { status: string; paid: boolean }): boolean {
  return p.status !== "CANCELLED" && !p.paid;
}

/** Lo que dice el renglón «Debe» del bloque de la plata cuando no debe nada (la cifra no cambia). */
export function detalleSinDeuda(e: { servicios: boolean; fiadoIlegible: boolean; pedidosSinCobrar: number }): string {
  if (e.fiadoIlegible) return "el fiado no se pudo leer";
  if (e.servicios) return "está al día";
  if (e.pedidosSinCobrar === 0) return "cuenta corriente al día";
  const pedidos = e.pedidosSinCobrar === 1 ? "1 pedido sin cobrar" : `${e.pedidosSinCobrar} pedidos sin cobrar`;
  return `cuenta corriente al día; ${pedidos}, abajo en «Pedidos»`;
}

/** Lo mínimo de la evaluación del CRM que hace falta para contar cómo viene (sin importar el tipo). */
export type RitmoFicha = {
  diasSinVenir: number | null;
  cantidadVisitas: number;
  ciclo: { dias: number; fuente: "propio" | "servicio" | "defecto" };
};

/**
 * «Cómo viene» en mostrador. El ciclo por defecto del CRM (y el «por servicio») salen de la
 * estética: en una carnicería no hay «ciclo de 45 días». Sólo se dice cada cuánto compra cuando
 * sale de SUS compras; si no, se dice cuándo compró por última vez y nada más.
 * En servicios la ficha sigue con el texto del CRM (explicarSegmento + explicarCiclo).
 */
export function comoVieneMostrador(r: RitmoFicha | null): string {
  if (!r || r.diasSinVenir === null || r.cantidadVisitas === 0) return "Todavía no compró.";
  const compras = r.cantidadVisitas === 1 ? "1 compra" : `${r.cantidadVisitas} compras`;
  const ultima = r.diasSinVenir === 0 ? "Última compra hoy" : `Última compra hace ${r.diasSinVenir} ${r.diasSinVenir === 1 ? "día" : "días"}`;
  if (r.ciclo.fuente === "propio") return `${ultima}. Suele comprar cada ${r.ciclo.dias} días (según sus ${compras}).`;
  return `${ultima} (${compras} en total).`;
}

/** La nota del bloque «Sus datos»: en mostrador no hay «visitas». */
export function notaDelRitmo(etiqueta: string, segmento: string, servicios: boolean): string {
  if (!servicios && segmento === "sin-visitas") return "Sin compras";
  return etiqueta;
}

/**
 * La tecla principal de la ficha: una sola. En servicios, darle un turno si quien mira puede y no
 * tiene uno reservado; si ya tiene, escribirle (para confirmar o avisar). En mostrador, escribirle.
 * Si no se le puede escribir (no quiere, o no hay celular), no hay tecla principal: la ficha no
 * inventa una acción que no existe.
 */
export function teclaPrincipal(e: {
  servicios: boolean;
  puedeDarTurno: boolean;
  tieneTurno: boolean;
  puedeEscribirle: boolean;
}): "turno" | "whatsapp" | null {
  if (e.servicios && e.puedeDarTurno && !e.tieneTurno) return "turno";
  if (e.puedeEscribirle) return "whatsapp";
  if (e.servicios && e.puedeDarTurno) return "turno";
  return null;
}
