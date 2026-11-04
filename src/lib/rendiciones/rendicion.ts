/**
 * RENDÍ — rendición de un gasto: cuadratura contra el anticipo y máquina de estados (Core, PURO).
 *
 * Recorte para MIA de `origin/frente/rendiciones:src/lib/rendiciones/rendicion.ts`: estados
 * `borrador → enviada → (devuelta | rechazada) → aprobada → reintegrada`, sin control/contabilización/cierre.
 * `aplicarAccion` es un reducer puro con guardias: nunca muta, devuelve una copia con el evento agregado.
 * Una acción que no corresponde al estado es un error (un segundo `aprobar` se rechaza).
 */

import { motivoNoAprueba, ROLES_APROBADORES } from "./aprobacion";
import { formatearPesosCorto, sumar } from "./dinero";
import type {
  AccionRendicion,
  Anticipo,
  Centavos,
  ContextoTransicion,
  Cuadratura,
  EstadoRendicion,
  EventoRendicion,
  Rendicion,
  ResultadoTransicion,
} from "./tipos";

/** Estados que cuentan como gasto justificado: aprobado por Dirección/Administración (y, si era propio, ya pagado). */
const JUSTIFICADA: readonly EstadoRendicion[] = ["aprobada", "reintegrada"];
/** Todavía en manos de quien rinde o de quien revisa. */
const EN_REVISION: readonly EstadoRendicion[] = ["borrador", "enviada", "devuelta"];

/**
 * Cuadratura de un anticipo contra las rendiciones de quien lo recibió.
 * - rendido: gastos pagados con ESE anticipo y aprobados (aprobada o reintegrada). Un borrador no justifica nada.
 * - pendiente: los de ese anticipo que esperan revisión (informativo; no cuadra con ellos).
 * - deSuBolsillo: gastos propios APROBADOS y no reintegrados (lo reintegrado ya se pagó: no se vuelve a sumar).
 * - diferencia = anticipado + reintegrado − rendido − devuelto. > 0 sobra (a devolver), < 0 falta (a reintegrar).
 *   El faltante ya reintegrado (`anticipo.reintegradoCentavos`) entra sumando: no se paga dos veces.
 */
export function calcularCuadratura(
  anticipo: Anticipo | null,
  rendiciones: readonly Rendicion[],
  tolerancia: Centavos,
): Cuadratura {
  const anticipado = anticipo?.montoCentavos ?? 0;
  const devuelto = anticipo?.devueltoCentavos ?? 0;
  const reintegrado = anticipo?.reintegradoCentavos ?? 0;
  const delAnticipo = anticipo ? rendiciones.filter((r) => r.medio === "ANTICIPO" && r.anticipoId === anticipo.id) : [];
  const rendido = sumar(...delAnticipo.filter((r) => JUSTIFICADA.includes(r.estado)).map((r) => r.montoCentavos));
  const pendiente = sumar(...delAnticipo.filter((r) => EN_REVISION.includes(r.estado)).map((r) => r.montoCentavos));
  const deSuBolsillo = sumar(...rendiciones.filter((r) => r.medio === "PROPIO" && r.estado === "aprobada").map((r) => r.montoCentavos));
  const diferencia = anticipado + reintegrado - rendido - devuelto;
  const dentro = Math.abs(diferencia) <= tolerancia;
  const aDevolver = dentro ? 0 : Math.max(0, diferencia);
  const aReintegrar = deSuBolsillo + (dentro ? 0 : Math.max(0, -diferencia));

  const f = formatearPesosCorto;
  let mensaje: string;
  if (anticipado === 0 && rendido === 0 && devuelto === 0) {
    mensaje =
      deSuBolsillo > 0
        ? `No hay anticipo: te reintegramos ${f(deSuBolsillo)} que pagaste de tu bolsillo.`
        : "No hay anticipo ni gastos para reintegrar.";
  } else if (dentro) {
    mensaje = `Cuadra: recibiste ${f(anticipado)} y justificaste todo.`;
  } else if (diferencia > 0) {
    mensaje = `Recibiste ${f(anticipado)} y rendiste ${f(rendido)}. Te quedan ${f(diferencia)} para devolver.`;
  } else {
    mensaje = `Gastaste ${f(-diferencia)} más que el anticipo: te lo reintegramos.`;
  }
  if (pendiente > 0) mensaje += ` Hay ${f(pendiente)} esperando revisión: cuentan cuando se aprueben.`;
  return { anticipado, rendido, pendiente, devuelto, reintegrado, diferencia, aDevolver, aReintegrar, cuadra: dentro, mensaje };
}

// ─────────────────────────────────────────────────────────────────────────────
// Máquina de estados
// ─────────────────────────────────────────────────────────────────────────────

const VERBO: Record<AccionRendicion, string> = {
  enviar: "enviar",
  aprobar: "aprobar",
  devolver: "devolver",
  rechazar: "rechazar",
  reintegrar: "reintegrar",
};

const ESTADO: Record<EstadoRendicion, string> = {
  borrador: "en borrador",
  enviada: "enviada",
  devuelta: "devuelta",
  rechazada: "rechazada",
  aprobada: "aprobada",
  reintegrada: "ya reintegrada",
};

const DESDE: Record<AccionRendicion, readonly EstadoRendicion[]> = {
  enviar: ["borrador", "devuelta"],
  aprobar: ["enviada"],
  devolver: ["enviada"],
  rechazar: ["enviada"],
  reintegrar: ["aprobada"],
};

const DESTINO: Record<AccionRendicion, EstadoRendicion> = {
  enviar: "enviada",
  aprobar: "aprobada",
  devolver: "devuelta",
  rechazar: "rechazada",
  reintegrar: "reintegrada",
};

function pasarA(r: Rendicion, accion: AccionRendicion, ctx: ContextoTransicion): ResultadoTransicion {
  const comentario = ctx.comentario?.trim();
  const ev: EventoRendicion = { fecha: ctx.fecha, actorId: ctx.actorId, accion, ...(comentario ? { comentario } : {}) };
  return { ok: true, rendicion: { ...r, estado: DESTINO[accion], eventos: [...r.eventos, ev] } };
}

/** Aplica una acción sobre la rendición (reducer puro, con guardias de estado y de separación de funciones). */
export function aplicarAccion(r: Rendicion, accion: AccionRendicion, ctx: ContextoTransicion): ResultadoTransicion {
  if (!DESDE[accion].includes(r.estado)) {
    return { ok: false, motivo: `No se puede ${VERBO[accion]} una rendición ${ESTADO[r.estado]}` };
  }
  const importeValido = Number.isInteger(r.montoCentavos) && r.montoCentavos > 0;
  // Aprobar o reintegrar un importe roto (no entero, cero o negativo) movería plata mal: se frena en todo el camino.
  if ((accion === "aprobar" || accion === "reintegrar") && !importeValido) {
    return { ok: false, motivo: "El importe de esta rendición no es válido: devolvela o rechazala" };
  }
  const tieneComentario = (ctx.comentario ?? "").trim() !== "";
  const esSuya = ctx.actorId === r.rindeId;

  switch (accion) {
    case "enviar": {
      if (!esSuya) return { ok: false, motivo: "Sólo quien pagó el gasto puede enviar su rendición" };
      if (!importeValido) {
        return { ok: false, motivo: "Todavía no se puede enviar: el importe tiene que ser mayor a cero" };
      }
      if (r.medio === "ANTICIPO" && !r.anticipoId) {
        return { ok: false, motivo: "Todavía no se puede enviar: elegí con qué anticipo lo pagaste" };
      }
      return pasarA(r, accion, ctx);
    }
    case "aprobar":
    case "devolver":
    case "rechazar": {
      const motivo = motivoNoAprueba(ctx.rolActor, ctx.actorId, r.rindeId);
      if (motivo) return { ok: false, motivo };
      if (accion === "devolver" && !tieneComentario) {
        return { ok: false, motivo: "Para devolver, escribí un comentario que diga qué hay que corregir" };
      }
      if (accion === "rechazar" && !tieneComentario) return { ok: false, motivo: "Para rechazar, escribí el motivo" };
      return pasarA(r, accion, ctx);
    }
    case "reintegrar": {
      if (r.medio !== "PROPIO") {
        return { ok: false, motivo: "Lo pagado con un anticipo no se reintegra: se cierra con la cuadratura del anticipo" };
      }
      if (esSuya) return { ok: false, motivo: "Nadie se reintegra lo propio: esta rendición es tuya" };
      if (!ROLES_APROBADORES.includes(ctx.rolActor)) {
        return { ok: false, motivo: "Sólo Dirección o Administración reintegran rendiciones" };
      }
      return pasarA(r, accion, ctx);
    }
  }
}
