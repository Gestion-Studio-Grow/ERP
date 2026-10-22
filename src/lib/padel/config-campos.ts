// ============================================================================
// PADEL-CLASES — qué se puede guardar de a un campo desde Ajustes (Tanda 3B). PURO.
// ============================================================================
//
// `guardarCampoConfig(clave, valor)` (acciones-config.ts) guarda UN campo por vez: el profe sale
// del campo y queda guardado (M-077), sin un «Guardar» al final de un formulario largo. Por eso la
// clave viene de la pantalla, y una pantalla es del lado del cliente: NUNCA se escribe una clave
// que no esté en esta lista blanca, y cada una tiene su propia validación (los mismos topes que
// tenía `guardarConfig`, acciones.ts:1026-1056). Lo que no está acá, no se guarda.
//
// Tres formas:
// - Un campo de PadelConfig (precio, duración, alias, reglas…).
// - Un texto de WhatsApp: `plantilla.<clave>` con <clave> de CLAVES_PLANTILLA. Vacío o igual al de
//   fábrica = «Restaurar original» (se borra del JSON y vuelve el de fábrica).
// - `horarios`: la grilla semanal entera, en UN guardado (M-079: «Copiar a…» deja 4 días con 8–12
//   de una). Reemplaza las franjas semanales, igual que `guardarHorarios`.

import { leerImporte } from "@/lib/dinero/leer";
import { CLAVES_PLANTILLA, PLANTILLAS_DEFAULT, horaValida, telefonoAlumno, type ClavePlantilla } from "./core";

export const CAMPOS_CONFIG = [
  "precioIndividual",
  "precioGrupal",
  "duracionMin",
  "aliasCbu",
  "titularCuenta",
  "whatsappProfe",
  "anticipacionMin",
  "diasAdelante",
  "maxPendientesPorTel",
] as const;
export type CampoConfig = (typeof CAMPOS_CONFIG)[number];

export type ClaveConfig = CampoConfig | `plantilla.${ClavePlantilla}` | "horarios" | "bienvenidaVista";

/**
 * «El profe ya vio la Bienvenida» (O-9 de la CERT T2+T3): si la saltea sin cargar horarios ni precio
 * y toca «Ir a Hoy», Hoy no lo tiene que rebotar. Sin migración: es una marca dentro del JSON de
 * `PadelConfig.plantillas` con una clave que ningún texto usa (empieza con «_»). TODO(T4): columna
 * propia (`PadelConfig.bienvenidaVista Boolean`) cuando haya migración; se llena desde esta marca.
 */
export const MARCA_BIENVENIDA = "_bienvenidaVista";

/** ¿El JSON de plantillas guardado trae la marca de «ya vio la Bienvenida»? */
export const bienvenidaVista = (guardadas: unknown): boolean =>
  Boolean(guardadas && typeof guardadas === "object" && !Array.isArray(guardadas) && (guardadas as Record<string, unknown>)[MARCA_BIENVENIDA] === "1");

/** Un tramo semanal: 0 = domingo … 6 = sábado, «08:00»–«12:00». */
export type TramoSemanal = { diaSemana: number; desde: string; hasta: string };

export type CampoValidado =
  | { tipo: "campo"; campo: CampoConfig; valor: number | string | null }
  | { tipo: "plantilla"; clave: ClavePlantilla; texto: string | null }
  | { tipo: "horarios"; tramos: TramoSemanal[] }
  | { tipo: "bienvenida" };

export type Validacion = { ok: true; v: CampoValidado } | { ok: false; error: string };

/** Tope de precio: un número de diez cifras es un dedo que se quedó apretado, no una clase. */
export const PRECIO_MAXIMO = 10_000_000;
/** Lo que entra por día (mañana, tarde y algo más) y en la semana. */
const TRAMOS_POR_DIA = 6;

const ok = (v: CampoValidado): Validacion => ({ ok: true, v });
const mal = (error: string): Validacion => ({ ok: false, error });

/** Sin caracteres de control (un alias pegado de un chat trae de todo). */
const textoLimpio = (raw: unknown, max: number): string =>
  String(raw ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

function entero(raw: unknown, min: number, max: number): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function importe(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 && raw <= PRECIO_MAXIMO ? Math.round(raw * 100) / 100 : null;
  const l = leerImporte(String(raw ?? ""));
  if (l.estado === "vacio") return 0;
  if (l.estado !== "ok" || l.valor < 0 || l.valor > PRECIO_MAXIMO) return null;
  return l.valor;
}

const esClavePlantilla = (k: string): k is ClavePlantilla => (CLAVES_PLANTILLA as readonly string[]).includes(k);
const esCampo = (k: string): k is CampoConfig => (CAMPOS_CONFIG as readonly string[]).includes(k);

/** Minutos desde las 00:00 de «HH:MM». */
const minutos = (h: string): number => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

/**
 * El problema de un tramo, en criollo, o null si está bien (M-080). Los compara con los otros
 * tramos del MISMO día: dos que se pisan no se guardan (el turnero ofrecería la misma hora dos
 * veces).
 */
export function errorDeTramo(t: { desde: string; hasta: string }, otros: readonly { desde: string; hasta: string }[] = []): string | null {
  if (!horaValida(t.desde) || !horaValida(t.hasta)) return "Elegí desde y hasta qué hora.";
  if (minutos(t.hasta) <= minutos(t.desde)) return "Termina antes de empezar";
  const pisa = otros.some((o) => horaValida(o.desde) && horaValida(o.hasta) && minutos(t.desde) < minutos(o.hasta) && minutos(o.desde) < minutos(t.hasta));
  return pisa ? "Se pisa con otro horario del mismo día" : null;
}

/** La grilla entera (horarios): cada tramo bien, sin pisarse, sin repetir. */
export function validarTramos(raw: unknown): { ok: true; tramos: TramoSemanal[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "No entendimos los horarios. Actualizá la pantalla." };
  if (raw.length > 7 * TRAMOS_POR_DIA) return { ok: false, error: `Como mucho ${TRAMOS_POR_DIA} horarios por día.` };
  const tramos: TramoSemanal[] = [];
  for (const x of raw) {
    const o = (x ?? {}) as Record<string, unknown>;
    const diaSemana = entero(o.diaSemana, 0, 6);
    const desde = String(o.desde ?? "");
    const hasta = String(o.hasta ?? "");
    if (diaSemana === null) return { ok: false, error: "No entendimos los horarios. Actualizá la pantalla." };
    const delDia = tramos.filter((t) => t.diaSemana === diaSemana);
    if (delDia.length >= TRAMOS_POR_DIA) return { ok: false, error: `Como mucho ${TRAMOS_POR_DIA} horarios por día.` };
    const e = errorDeTramo({ desde, hasta }, delDia);
    if (e) return { ok: false, error: `${DIA_NOMBRE[diaSemana]} ${desde}–${hasta}: ${e.toLowerCase()}.` };
    tramos.push({ diaSemana, desde, hasta });
  }
  return { ok: true, tramos: tramos.sort((a, b) => a.diaSemana - b.diaSemana || a.desde.localeCompare(b.desde)) };
}

export const DIA_NOMBRE = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;

/**
 * La lista blanca. Devuelve qué escribir (ya normalizado) o el error para mostrar debajo del
 * campo. Una clave desconocida NUNCA pasa.
 */
export function validarCampoConfig(clave: unknown, valor: unknown): Validacion {
  if (typeof clave !== "string" || clave.length > 40) return mal("Ese ajuste no existe.");

  if (clave === "bienvenidaVista") return valor === true ? ok({ tipo: "bienvenida" }) : mal("Ese ajuste no existe.");

  if (clave === "horarios") {
    const r = validarTramos(valor);
    return r.ok ? ok({ tipo: "horarios", tramos: r.tramos }) : mal(r.error);
  }

  if (clave.startsWith("plantilla.")) {
    const k = clave.slice("plantilla.".length);
    if (!esClavePlantilla(k)) return mal("Ese texto no existe.");
    const texto = String(valor ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim();
    if (texto.length > 600) return mal("Es muy largo: como mucho 600 letras.");
    // Vacío o igual al de fábrica: se borra lo editado y vuelve el original.
    return ok({ tipo: "plantilla", clave: k, texto: texto && texto !== PLANTILLAS_DEFAULT[k] ? texto : null });
  }

  if (!esCampo(clave)) return mal("Ese ajuste no existe.");
  switch (clave) {
    case "precioIndividual":
    case "precioGrupal": {
      const n = importe(valor);
      return n === null ? mal("Poné el precio en pesos, por ejemplo 25000.") : ok({ tipo: "campo", campo: clave, valor: n });
    }
    case "duracionMin": {
      const n = entero(valor, 30, 180);
      return n === null || n % 15 !== 0 ? mal("Elegí cuánto dura la clase.") : ok({ tipo: "campo", campo: clave, valor: n });
    }
    case "anticipacionMin": {
      const n = entero(valor, 0, 48 * 60);
      return n === null ? mal("Elegí con cuánta anticipación te pueden pedir.") : ok({ tipo: "campo", campo: clave, valor: n });
    }
    case "diasAdelante": {
      const n = entero(valor, 1, 60);
      return n === null ? mal("Elegí cuántos días muestra el turnero (de 1 a 60).") : ok({ tipo: "campo", campo: clave, valor: n });
    }
    case "maxPendientesPorTel": {
      const n = entero(valor, 1, 10);
      return n === null ? mal("Elegí cuántas clases puede pedir sin que respondas (de 1 a 10).") : ok({ tipo: "campo", campo: clave, valor: n });
    }
    case "aliasCbu":
      return ok({ tipo: "campo", campo: clave, valor: textoLimpio(valor, 60) || null });
    case "titularCuenta":
      return ok({ tipo: "campo", campo: clave, valor: textoLimpio(valor, 80) || null });
    case "whatsappProfe": {
      const raw = textoLimpio(valor, 40);
      if (!raw) return ok({ tipo: "campo", campo: clave, valor: null });
      const t = telefonoAlumno(raw);
      return t ? ok({ tipo: "campo", campo: clave, valor: t }) : mal("El celular tiene que ser argentino, con código de área (ej. 11 5555-1234).");
    }
  }
}

/**
 * Los textos de WhatsApp guardados después de editar UNO: el JSON de la base trae sólo los que el
 * profe tocó; `null` borra esa clave (vuelve el de fábrica). Lo que no es un texto conocido se cae.
 */
export function plantillasConCambio(guardadas: unknown, clave: ClavePlantilla, texto: string | null): Record<string, string> {
  const base = guardadas && typeof guardadas === "object" && !Array.isArray(guardadas) ? (guardadas as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const k of CLAVES_PLANTILLA) {
    const v = base[k];
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  if (texto === null) delete out[clave];
  else out[clave] = texto;
  // La marca de la Bienvenida viaja en el mismo JSON: editar un texto no la borra (O-9).
  if (bienvenidaVista(base)) out[MARCA_BIENVENIDA] = "1";
  return out;
}

/** Las plantillas guardadas (sólo las claves válidas) más la marca «ya vio la Bienvenida». */
export function plantillasConBienvenida(guardadas: unknown): Record<string, string> {
  const base = guardadas && typeof guardadas === "object" && !Array.isArray(guardadas) ? (guardadas as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const k of CLAVES_PLANTILLA) {
    const v = base[k];
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  out[MARCA_BIENVENIDA] = "1";
  return out;
}
