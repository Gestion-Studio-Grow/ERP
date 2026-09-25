/**
 * RENDÍ — rendición: cuadratura contra el anticipo y máquina de estados (Core, PURO).
 *
 * `aplicarAccion` es un reducer puro con guardias: nunca muta la rendición, devuelve una copia con el
 * evento agregado al historial (la bitácora sólo crece). Plan §6.3 (estados) y §6.4 (aprobación).
 */

import { puedeAprobar } from "./aprobacion";
import { convertirAPesos, formatearPesosCorto, sumar } from "./dinero";
import type {
  AccionRendicion,
  Anticipo,
  Centavos,
  Comprobante,
  ContextoTransicion,
  Cuadratura,
  EstadoRendicion,
  Evaluacion,
  EventoRendicion,
  Rendicion,
  ResultadoTransicion,
} from "./tipos";

/**
 * Los comprobantes que HOY están en la rendición: los que ella lista en `comprobanteIds`, en ese orden.
 * `Comprobante.rendicionId` dice dónde se cargó; si la línea se quitó o pasó a Cuentas a Pagar, sigue
 * cargada en la empresa (cuenta para duplicados y conciliación) pero ya no es de la rendición.
 */
export function comprobantesDeRendicion(r: Rendicion, comprobantes: Comprobante[]): Comprobante[] {
  const porId = new Map(comprobantes.map((c) => [c.id, c] as const));
  return r.comprobanteIds.map((id) => porId.get(id)).filter((c): c is Comprobante => c !== undefined);
}

function totalEnPesos(c: Comprobante): Centavos {
  return convertirAPesos(c.datos.total, c.datos.moneda, c.datos.cotizacion);
}

/** Suma de los totales (en pesos) de los comprobantes. */
export function totalRendicion(comprobantes: Comprobante[]): Centavos {
  return sumar(...comprobantes.map(totalEnPesos));
}

/**
 * Las líneas que no se rinden: una bloqueada no justifica nada y una derivada a Cuentas a Pagar se paga
 * por otro circuito. Ninguna de las dos cuenta como rendida ni se reintegra por la rendición. Es la
 * misma regla para la cuadratura y para Haberes. Sin evaluaciones, no excluye nada (compatibilidad).
 */
export function lineasQueNoSeRinden(evaluaciones?: Evaluacion[]): Set<string> {
  return new Set(
    (evaluaciones ?? []).filter((e) => e.bloqueado || e.carril === "cuentas_a_pagar").map((e) => e.comprobanteId),
  );
}

/**
 * Cuadratura contra el anticipo.
 * - anticipado: anticipos de `r.anticipoIds`.
 * - rendido: comprobantes pagados con el anticipo (efectivo o recargable).
 * - aReintegrar: lo pagado de su bolsillo + lo que gastó de más.
 * - diferencia = anticipado − rendido − devuelto; cuadra si está dentro de la tolerancia o es negativa.
 * - Con `evaluaciones`, las líneas bloqueadas o derivadas no cuentan (ver `lineasQueNoSeRinden`).
 */
export function calcularCuadratura(
  r: Rendicion,
  anticipos: Anticipo[],
  comprobantes: Comprobante[],
  tolerancia: Centavos,
  evaluaciones?: Evaluacion[],
): Cuadratura {
  const anticipado = sumar(...anticipos.filter((a) => r.anticipoIds.includes(a.id)).map((a) => a.importe));
  const noSeRinde = lineasQueNoSeRinden(evaluaciones);
  const suyos = comprobantesDeRendicion(r, comprobantes).filter((c) => !noSeRinde.has(c.id));
  const conElAnticipo = suyos.filter(
    (c) => c.imputacion.medioPago.tipo === "efectivo_anticipo" || c.imputacion.medioPago.tipo === "recargable",
  );
  const rendido = sumar(...conElAnticipo.map(totalEnPesos));
  const deSuBolsillo = sumar(
    ...suyos.filter((c) => c.imputacion.medioPago.tipo === "propio_a_reintegrar").map(totalEnPesos),
  );
  const devuelto = r.devolucionDeclarada;
  const diferencia = anticipado - rendido - devuelto;
  const aReintegrar = deSuBolsillo + Math.max(0, rendido - anticipado + devuelto);
  const cuadra = Math.abs(diferencia) <= tolerancia || diferencia < 0;

  const f = formatearPesosCorto;
  let mensaje: string;
  if (anticipado === 0 && rendido === 0 && devuelto === 0) {
    mensaje =
      deSuBolsillo > 0
        ? `No hay anticipo: te reintegramos ${f(deSuBolsillo)} que pagaste de tu bolsillo.`
        : "No hay anticipo ni gastos para reintegrar.";
  } else if (Math.abs(diferencia) <= tolerancia) {
    mensaje = `Cuadra: recibiste ${f(anticipado)} y justificaste todo.`;
  } else if (diferencia > 0) {
    mensaje =
      devuelto > 0
        ? `Recibiste ${f(anticipado)}, rendiste ${f(rendido)} y declaraste devolver ${f(devuelto)}. Faltan justificar ${f(diferencia)}.`
        : `Recibiste ${f(anticipado)} y rendiste ${f(rendido)}. Faltan justificar ${f(diferencia)}.`;
  } else if (devuelto > 0) {
    mensaje = `Con lo rendido y lo que declaraste devolver te pasás ${f(-diferencia)} del anticipo: revisá la devolución o te reintegramos la diferencia.`;
  } else {
    mensaje = `Gastaste ${f(-diferencia)} más que el anticipo: te lo reintegramos.`;
  }

  return { anticipado, rendido, devuelto, diferencia, aReintegrar, cuadra, mensaje };
}

// ─────────────────────────────────────────────────────────────────────────────
// Máquina de estados
// ─────────────────────────────────────────────────────────────────────────────

const VERBO: Record<AccionRendicion, string> = {
  enviar: "enviar",
  aprobar: "aprobar",
  devolver: "devolver",
  rechazar: "rechazar",
  tomar_control: "pasar a control",
  contabilizar: "contabilizar",
  cerrar: "cerrar",
};

const ESTADO: Record<EstadoRendicion, string> = {
  borrador: "en borrador",
  en_aprobacion: "en aprobación",
  devuelta: "devuelta",
  rechazada: "rechazada",
  aprobada: "aprobada",
  en_control: "en control",
  contabilizada: "contabilizada",
  cerrada: "cerrada",
};

const DESDE: Record<AccionRendicion, EstadoRendicion[]> = {
  enviar: ["borrador", "devuelta"],
  aprobar: ["en_aprobacion"],
  devolver: ["en_aprobacion", "en_control"],
  rechazar: ["en_aprobacion"],
  tomar_control: ["aprobada"],
  contabilizar: ["en_control"],
  cerrar: ["contabilizada"],
};

function evento(r: Rendicion, accion: AccionRendicion, ctx: ContextoTransicion, conNivel: boolean): EventoRendicion {
  const comentario = ctx.comentario?.trim();
  return {
    fecha: ctx.fecha,
    actorLegajo: ctx.actorLegajo,
    accion,
    ...(comentario ? { comentario } : {}),
    ...(ctx.comprobanteIds && ctx.comprobanteIds.length > 0 ? { comprobanteIds: [...ctx.comprobanteIds] } : {}),
    ...(conNivel ? { nivel: r.nivelActual } : {}),
  };
}

function pasarA(r: Rendicion, estado: EstadoRendicion, nivelActual: number, ev: EventoRendicion): ResultadoTransicion {
  return {
    ok: true,
    rendicion: {
      ...r,
      anticipoIds: [...r.anticipoIds],
      comprobanteIds: [...r.comprobanteIds],
      estado,
      nivelActual,
      historial: [...r.historial, ev],
    },
  };
}

function motivoNoAprueba(actor: string, r: Rendicion, niveles: string[][]): string {
  if (actor === r.legajo) return "Nadie aprueba lo propio: esta rendición es tuya";
  if ((niveles[r.nivelActual] ?? []).length === 0) return "Este nivel no tiene aprobador: avisale a Administración";
  return `No sos aprobador del nivel ${r.nivelActual + 1} de esta rendición`;
}

function cuantosBloqueados(n: number): string {
  return n === 1 ? "Hay 1 comprobante bloqueado" : `Hay ${n} comprobantes bloqueados`;
}

function cuantosSinConstatar(n: number): string {
  return n === 1 ? "hay 1 comprobante sin constatar en ARCA" : `hay ${n} comprobantes sin constatar en ARCA`;
}

/** Acciones de Tesorería: con `rolesActor`, sólo las puede hacer quien tiene el rol "tesoreria". */
const DE_TESORERIA: ReadonlySet<AccionRendicion> = new Set(["tomar_control", "contabilizar", "cerrar"]);

/**
 * Aplica una acción sobre la rendición (reducer puro). Guardias (CONTRATO.md) más separación de
 * funciones: devolver o rechazar en aprobación exige ser aprobador del nivel en curso, y quien rinde
 * no puede devolver, pasar a control, contabilizar ni cerrar su propia rendición. Contabilizar exige
 * además que nada esté bloqueado ni sin constatar en ARCA (regla 4).
 */
export function aplicarAccion(r: Rendicion, accion: AccionRendicion, ctx: ContextoTransicion): ResultadoTransicion {
  if (!DESDE[accion].includes(r.estado)) {
    return { ok: false, motivo: `No se puede ${VERBO[accion]} una rendición ${ESTADO[r.estado]}` };
  }
  if (DE_TESORERIA.has(accion) && ctx.rolesActor !== undefined && !ctx.rolesActor.includes("tesoreria")) {
    return { ok: false, motivo: `Sólo Tesorería puede ${VERBO[accion]} una rendición` };
  }
  const bloqueados = ctx.evaluaciones.filter((e) => e.bloqueado).length;
  const tieneComentario = (ctx.comentario ?? "").trim() !== "";
  const esSuya = ctx.actorLegajo === r.legajo;

  switch (accion) {
    case "enviar": {
      const faltas: string[] = [];
      if (!ctx.cuadratura.cuadra) faltas.push(ctx.cuadratura.mensaje);
      if (bloqueados > 0) faltas.push(`${cuantosBloqueados(bloqueados)}: resolvelos antes de enviar.`);
      if (faltas.length > 0) return { ok: false, motivo: `Todavía no se puede enviar. ${faltas.join(" ")}` };
      return pasarA(r, "en_aprobacion", 0, evento(r, accion, ctx, false));
    }
    case "aprobar": {
      if (!puedeAprobar(ctx.actorLegajo, r, ctx.niveles)) {
        return { ok: false, motivo: motivoNoAprueba(ctx.actorLegajo, r, ctx.niveles) };
      }
      const ev = evento(r, accion, ctx, true);
      const siguiente = r.nivelActual + 1;
      return siguiente < ctx.niveles.length
        ? pasarA(r, "en_aprobacion", siguiente, ev)
        : pasarA(r, "aprobada", r.nivelActual, ev);
    }
    case "devolver": {
      if (!tieneComentario) return { ok: false, motivo: "Para devolver, escribí un comentario que diga qué hay que corregir" };
      if (r.estado === "en_aprobacion" && !puedeAprobar(ctx.actorLegajo, r, ctx.niveles)) {
        return { ok: false, motivo: motivoNoAprueba(ctx.actorLegajo, r, ctx.niveles) };
      }
      if (esSuya) return { ok: false, motivo: "Nadie controla lo propio: esta rendición es tuya" };
      return pasarA(r, "devuelta", r.nivelActual, evento(r, accion, ctx, r.estado === "en_aprobacion"));
    }
    case "rechazar": {
      if (!tieneComentario) return { ok: false, motivo: "Para rechazar, escribí el motivo" };
      if (!puedeAprobar(ctx.actorLegajo, r, ctx.niveles)) {
        return { ok: false, motivo: motivoNoAprueba(ctx.actorLegajo, r, ctx.niveles) };
      }
      return pasarA(r, "rechazada", r.nivelActual, evento(r, accion, ctx, true));
    }
    case "tomar_control":
    case "contabilizar":
    case "cerrar": {
      if (esSuya) return { ok: false, motivo: "Nadie controla lo propio: esta rendición es tuya" };
      if (accion === "contabilizar" && bloqueados > 0) {
        return {
          ok: false,
          motivo: `No se puede contabilizar: ${cuantosBloqueados(bloqueados).toLowerCase()}. Devolvé la rendición o sacá esas líneas.`,
        };
      }
      if (accion === "contabilizar") {
        const sinConstatar = ctx.evaluaciones.filter((e) =>
          e.validaciones.some((v) => v.codigo === "R4_CONSTATACION_PENDIENTE"),
        ).length;
        if (sinConstatar > 0) {
          return {
            ok: false,
            motivo: `No se puede contabilizar: ${cuantosSinConstatar(sinConstatar)}. Esperá la respuesta y volvé a intentar.`,
          };
        }
      }
      const destino: EstadoRendicion =
        accion === "tomar_control" ? "en_control" : accion === "contabilizar" ? "contabilizada" : "cerrada";
      return pasarA(r, destino, r.nivelActual, evento(r, accion, ctx, false));
    }
  }
}
