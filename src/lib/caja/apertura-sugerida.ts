// ============================================================================
// ABRIR LA CAJA DESDE VENDER — lo que dice la tarjeta (Magra, tanda 2 · 2D; E21 · MG-057). PURO.
// ============================================================================
//
// La tarjeta «Abrí la caja: ayer quedaron $X en el cajón» (vender/AbrirCajaEnLinea.tsx) recibe de
// `getAperturaEnVender` (caja-actions.ts) el fondo sugerido —el efectivo que el libro dice que hay
// en el cajón, el MISMO número contra el que cuenta `openCashSession`— y el último día cerrado.
// Acá se decide qué dice, sin base ni React, para probarlo con datos.

import { round2 } from "@/lib/round";
import { dayOfWeekForDate } from "@/lib/datetime";
import { textoPlata } from "@/lib/cobro/pie-de-cobro-core";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function diasEntre(desde: string, hasta: string): number {
  const dia = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
  return Math.round((dia(hasta) - dia(desde)) / 86_400_000);
}

/** «ayer» · «el sábado» (en la última semana) · «el 12/10». Los días son del negocio. PURA. */
export function cuandoFueElCierre(ultimoCierre: string, hoy: string): string {
  const d = diasEntre(ultimoCierre, hoy);
  if (d <= 1) return "ayer";
  if (d < 7) return `el ${DIAS[dayOfWeekForDate(ultimoCierre)]}`;
  return `el ${ultimoCierre.slice(8, 10)}/${ultimoCierre.slice(5, 7)}`;
}

export type TarjetaDeApertura = {
  /** La primera línea, la que se lee de lejos. */
  titulo: string;
  /** ¿Se ofrece «Abrir con $X» de un toque? (No con el libro en rojo: no hay fondo que sugerir.) */
  conSugerido: boolean;
  /** El fondo sugerido, al centavo (0 o más). */
  sugerido: number;
};

/** Lo que dice la tarjeta. PURA. */
export function tarjetaDeApertura(p: { esperado: number; ultimoCierre: string | null; hoy: string; aCiegas?: boolean }): TarjetaDeApertura {
  // A ciegas (interruptor «arqueo-ciego»): ni el número ni «Abrir con $X». Se cuenta primero.
  if (p.aCiegas) return { titulo: "Abrí la caja: contá lo que hay en el cajón", conSugerido: false, sugerido: 0 };
  const esperado = Number.isFinite(p.esperado) ? round2(p.esperado) : 0;
  if (esperado < 0) {
    return {
      titulo: `Abrí la caja: el libro da el cajón en rojo (${textoPlata(esperado)}). Contá lo que hay y abrila con eso.`,
      conSugerido: false,
      sugerido: 0,
    };
  }
  const plata = textoPlata(esperado);
  const titulo = p.ultimoCierre
    ? `Abrí la caja: ${cuandoFueElCierre(p.ultimoCierre, p.hoy)} quedaron ${plata} en el cajón`
    : esperado > 0
      ? `Abrí la caja: según el libro hay ${plata} en el cajón`
      : "Abrí la caja: contá lo que hay en el cajón";
  return { titulo, conSugerido: true, sugerido: esperado };
}

/**
 * El fondo como viaja en el formulario de `openCashSession`, que lo lee con `leerImporte` (la
 * coma es el decimal): 48000 → "48000", 48000.5 → "48000,5". PURA.
 */
export function fondoParaElFormulario(n: number): string {
  return String(round2(n)).replace(".", ",");
}

// ── Apertura a ciegas y motivo de la diferencia (N2 · M1-C3) ─────────────────
//
// Con el interruptor «arqueo-ciego» el cajero cuenta ANTES de ver el esperado: el primer envío va
// sin `esperadoConfirmado`. Si cuadra, abre. Si no, `openCashSession` no graba nada y contesta con
// el esperado (recién ahí se ve) y pide el motivo, como el cierre del turno: un faltante sin porqué
// es lo que después nadie explica. El segundo envío trae el esperado visto y el motivo, y la
// diferencia se asienta UNA vez (transacción Serializable + «ya hay una caja abierta»).

/** Lo más largo que se guarda del motivo (va en el detalle del asiento). */
export const MOTIVO_APERTURA_MAX = 300;

/** El motivo tal como se guarda: sin espacios de más, recortado. `null` si no hay. PURA. */
export function leerMotivoDeApertura(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MOTIVO_APERTURA_MAX) : "";
  return s || null;
}

/**
 * ¿Hay que pedir el motivo antes de abrir? Con diferencia y sin motivo, cuando la regla lo exige
 * (a ciegas). PURA. `diferencia` = contado − libro, ya redondeada.
 */
export function aperturaPideMotivo(p: { diferencia: number; motivo: string | null; exigido: boolean }): boolean {
  return p.exigido && p.diferencia !== 0 && !p.motivo;
}

/** El texto que acompaña el pedido de motivo: lo contado, lo que dice el libro y la diferencia. PURA. */
export function textoDelMotivoDeApertura(contado: number, esperado: number): string {
  const d = round2(contado - esperado);
  const que = d < 0 ? `faltan ${textoPlata(-d)}` : `sobran ${textoPlata(d)}`;
  return `Contaste ${textoPlata(contado)} y el libro dice ${textoPlata(esperado)}: ${que}. Anotá por qué para abrir; la diferencia queda asentada una vez, con tu nombre.`;
}

/** El detalle del asiento de la diferencia, con el motivo si lo hay. PURA. */
export function detalleConMotivo(detalle: string, motivo: string | null): string {
  return motivo ? `${detalle}. Motivo: ${motivo}` : detalle;
}
