// Ficha completa del servicio — núcleo PURO (sin Prisma, sin reloj, testeable con node:test).
//
// Lo que el dueño de CH pidió poder cargar en cada servicio además de nombre, categoría,
// descripción, precio y duración: precio a definir, tiempo que ocupa en la agenda, seña en
// porcentaje, modalidad, tipo y una aclaración que viaja en el recordatorio. Vive en
// `ServiceDetail` (1 a 1 con Service, migración 20261104123000_servicio_completo); sin fila,
// valen los valores por defecto de `FICHA_VACIA` y todo se comporta como antes.

import { porcentajeDe } from "@/lib/dinero/redondeo";

export const MODALIDADES = ["PRESENCIAL", "ONLINE", "DOMICILIO"] as const;
export type Modalidad = (typeof MODALIDADES)[number];
export const MODALIDAD_ETIQUETA: Record<Modalidad, string> = {
  PRESENCIAL: "En el local",
  ONLINE: "Online",
  DOMICILIO: "A domicilio",
};

export const TIPOS = ["REGULAR", "CUPOS", "RECURRENTE"] as const;
export type TipoDeServicio = (typeof TIPOS)[number];
export const TIPO_ETIQUETA: Record<TipoDeServicio, string> = {
  REGULAR: "Turno común",
  CUPOS: "Con cupos",
  RECURRENTE: "Se repite",
};
export const TIPO_AYUDA: Record<TipoDeServicio, string> = {
  REGULAR: "La clienta elige día y horario.",
  CUPOS: "Fecha que vos fijás, con lugares limitados.",
  RECURRENTE: "Se repite cada semana o cada mes.",
};

export const TOPE_NOTA = 280;
export const MAX_FOTOS_SERVICIO = 4;
/** Lado mayor de una foto del servicio, en píxeles (se achica en el navegador antes de subir). */
export const LADO_FOTO_SERVICIO = 1600;
/** Tope del data URL de una foto (≈ 525 KB de imagen). */
export const MAX_FOTO_SERVICIO = 700_000;
/** Un día: más que eso en la agenda es un error de tipeo. */
export const TOPE_MINUTOS = 1440;

export interface FichaDelServicio {
  priceToDefine: boolean;
  calendarMin: number | null;
  depositPercent: number | null;
  modality: Modalidad;
  kind: TipoDeServicio;
  reminderNote: string | null;
}

export const FICHA_VACIA: FichaDelServicio = {
  priceToDefine: false,
  calendarMin: null,
  depositPercent: null,
  modality: "PRESENCIAL",
  kind: "REGULAR",
  reminderNote: null,
};

/** Minutos que el servicio BLOQUEA en la agenda: `calendarMin` si está y no es menor que la duración. */
export function minutosEnAgenda(durationMin: number, calendarMin: number | null | undefined): number {
  if (calendarMin == null || !Number.isFinite(calendarMin) || calendarMin < durationMin) return durationMin;
  return Math.round(calendarMin);
}

/** Seña en porcentaje, redondeada al centavo: round(precio × % / 100). Fuera de 1-100 o sin precio → 0. */
export function seniaPorPorcentaje(precio: number, porcentaje: number | null | undefined): number {
  if (porcentaje == null || !Number.isFinite(porcentaje) || porcentaje <= 0 || porcentaje > 100) return 0;
  if (!Number.isFinite(precio) || precio <= 0) return 0;
  return porcentajeDe(precio, porcentaje, "centavo");
}

/**
 * ¿El precio de este turno está «a definir»? Un servicio con precio a definir se guarda con
 * `price = 0` (antes de esta ficha el catálogo no aceptaba precio 0), así que se reconoce sin
 * leer la ficha: catálogo en 0 y el turno sin precio fijado. Un cupón del 100 % deja el turno
 * en 0 pero el servicio tiene precio: ese no es «a definir».
 */
export function precioADefinir(precioDelServicio: number, precioDelTurno?: number | null): boolean {
  return precioDelServicio <= 0 && (precioDelTurno == null || precioDelTurno <= 0);
}

/** El precio para mostrar: «A definir» o el que arme quien llama. */
export function textoDelPrecio(precioDelServicio: number, conPrecio: (p: number) => string, precioDelTurno?: number | null): string {
  return precioADefinir(precioDelServicio, precioDelTurno) ? "A definir" : conPrecio(precioDelTurno ?? precioDelServicio);
}

/** La aclaración limpia: sin espacios de más, sin saltos múltiples, con tope. Vacía → null. */
export function limpiarNota(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const t = valor.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
  return t ? t.slice(0, TOPE_NOTA) : null;
}

/** La línea que se suma al WhatsApp de confirmación o recordatorio. Sin nota, nada. */
export function lineaDeAclaracion(nota: string | null | undefined): string {
  const t = limpiarNota(nota);
  return t ? `\n\n📝 ${t}` : "";
}

export type LecturaDeFicha =
  | { ok: true; ficha: FichaDelServicio; precio: number; depositAmount: number | null }
  | { ok: false; error: string };

function entero(v: FormDataEntryValue | null): number | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : NaN;
}

/**
 * Lee y valida la ficha del formulario. `precio` y `depositAmount` son los que ya leyó la acción
 * (NaN/null si vinieron vacíos); devuelve los que se GUARDAN en Service: con precio a definir el
 * precio es 0 y no hay seña; con seña en porcentaje el monto fijo se guarda calculado (así todo
 * lo que hoy lee `depositAmount` —agenda, cobro, pedido de seña— ya cobra el porcentaje).
 */
export function leerFicha(form: FormData, entrada: { precio: number; depositAmount: number | null; durationMin: number }): LecturaDeFicha {
  const priceToDefine = form.get("priceToDefine") === "on" || form.get("priceToDefine") === "1";
  const modalidad = String(form.get("modality") ?? "PRESENCIAL");
  const tipo = String(form.get("kind") ?? "REGULAR");
  if (!(MODALIDADES as readonly string[]).includes(modalidad)) return { ok: false, error: "Elegí cómo se presta el servicio." };
  if (!(TIPOS as readonly string[]).includes(tipo)) return { ok: false, error: "Elegí el tipo de servicio." };

  const calendarMin = entero(form.get("calendarMin"));
  if (calendarMin !== null) {
    if (Number.isNaN(calendarMin) || calendarMin <= 0 || calendarMin > TOPE_MINUTOS) {
      return { ok: false, error: "El tiempo en la agenda va en minutos enteros." };
    }
    if (calendarMin < entrada.durationMin) {
      return { ok: false, error: "El tiempo en la agenda no puede ser menor que la duración del servicio." };
    }
  }

  const nota = form.get("reminderNote");
  if (typeof nota === "string" && nota.trim().length > TOPE_NOTA) {
    return { ok: false, error: `La aclaración para el recordatorio tiene un tope de ${TOPE_NOTA} caracteres.` };
  }

  const tipoDeSenia = String(form.get("depositKind") ?? "monto");
  let depositPercent: number | null = null;
  let depositAmount = entrada.depositAmount;
  let precio = entrada.precio;

  if (priceToDefine) {
    // El precio se fija al cobrar: sin precio no hay de dónde sacar la seña.
    precio = 0;
    depositAmount = null;
  } else {
    if (!Number.isFinite(precio) || precio <= 0) return { ok: false, error: "Cargá el precio o marcá «Precio a definir»." };
    if (tipoDeSenia === "porcentaje") {
      const p = entero(form.get("depositPercent"));
      if (p !== null) {
        if (Number.isNaN(p) || p < 0 || p > 100) return { ok: false, error: "El porcentaje de seña va de 0 a 100." };
        depositPercent = p;
        const monto = seniaPorPorcentaje(precio, p);
        depositAmount = monto > 0 ? monto : null;
      } else {
        depositAmount = null;
      }
    }
  }

  return {
    ok: true,
    precio,
    depositAmount,
    ficha: {
      priceToDefine,
      calendarMin: calendarMin !== null && calendarMin > entrada.durationMin ? calendarMin : null,
      depositPercent: priceToDefine ? null : depositPercent,
      modality: modalidad as Modalidad,
      kind: tipo as TipoDeServicio,
      reminderNote: limpiarNota(nota),
    },
  };
}

/** ¿Es una foto aceptable para guardar? Sólo JPEG/WebP en data URL y dentro del tope. */
export function esFotoDeServicioValida(datos: unknown): datos is string {
  return (
    typeof datos === "string" &&
    datos.length <= MAX_FOTO_SERVICIO &&
    /^data:image\/(?:jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(datos)
  );
}

export const rutaDeFotoDeServicio = (id: string): string => `/servicios/foto/${id}`;
