/**
 * FACTURITA · Alta self-serve — lógica PURA del asistente de /facturita/alta.
 *
 * Qué hace hoy (y por qué): el asistente junta CUIT, condición frente al IVA y punto de venta,
 * explica cómo delegar el servicio en ARCA, y termina armando un MENSAJE que la persona manda por
 * WhatsApp para que GSG le active la cuenta en el día. NO crea un negocio ni guarda nada en el
 * servidor: la fábrica de tenants (ADR-074) todavía no tiene una puerta pública segura para
 * Facturita, y el ciclo demo → venta → inversión (ADR-030) prohíbe persistir datos reales sin
 * ese circuito. Lo que la persona tipea vive sólo en su navegador mientras completa el asistente.
 * El día que exista `provisionTenant` público con su portón, este módulo es la validación que
 * se reusa del lado servidor (ver docs/producto/facturita/PEDIDOS-A-PLATAFORMA.md).
 *
 * Sin DB, sin red, sin React: se testea solo (facturita-onboarding.test.ts).
 */

import { claseDelPrefijo, cuitValido, normalizarCuit } from "@/lib/cuit";

// ---------------------------------------------------------------------------
// CUIT del emisor
// ---------------------------------------------------------------------------

export type ResultadoCuit =
  | { ok: true; cuit: string; formateado: string }
  | { ok: false; error: string };

/** "20111111112" → "20-11111111-2". Si no son 11 dígitos, lo devuelve tal cual. */
export function formatearCuit(cuit: string): string {
  const s = normalizarCuit(cuit);
  if (s.length !== 11) return cuit;
  return `${s.slice(0, 2)}-${s.slice(2, 10)}-${s.slice(10)}`;
}

/**
 * Valida el CUIT del que va a facturar, con dígito verificador real (módulo 11). Los errores
 * dicen QUÉ revisar, en criollo: no es lo mismo que falten números a que no cierre el último.
 */
export function validarCuitEmisor(crudo: string): ResultadoCuit {
  const s = normalizarCuit(crudo ?? "");
  if (s.length === 0) return { ok: false, error: "Escribí tu CUIT: son 11 números." };
  if (s.length < 11) return { ok: false, error: `Faltan números: el CUIT tiene 11 y escribiste ${s.length}.` };
  if (s.length > 11) return { ok: false, error: `Sobran números: el CUIT tiene 11 y escribiste ${s.length}.` };
  if (claseDelPrefijo(s) === null) {
    return { ok: false, error: "Los dos primeros números no son de un CUIT (suelen ser 20, 23, 24, 27 o 30)." };
  }
  if (!cuitValido(s)) {
    return { ok: false, error: "Ese CUIT no cierra: revisá los números, sobre todo el último." };
  }
  return { ok: true, cuit: s, formateado: formatearCuit(s) };
}

// ---------------------------------------------------------------------------
// Condición frente al IVA
// ---------------------------------------------------------------------------

export type CondicionIva = "monotributo" | "responsable_inscripto" | "exento";

export interface OpcionCondicion {
  id: CondicionIva;
  nombre: string;
  ayuda: string;
  /** Letra de las facturas que emite (la decide el motor fiscal; acá sólo se anticipa). */
  letras: string;
}

export const CONDICIONES_IVA: readonly OpcionCondicion[] = [
  {
    id: "monotributo",
    nombre: "Monotributo",
    ayuda: "Pagás una cuota fija por mes. Es lo más común si recién arrancás.",
    letras: "C",
  },
  {
    id: "responsable_inscripto",
    nombre: "Responsable inscripto",
    ayuda: "Cobrás y pagás IVA aparte. Tu contador seguro te lo dijo.",
    letras: "B a consumidores finales y exentos (la A, por ahora, desde ARCA)",
  },
  {
    id: "exento",
    nombre: "Exento de IVA",
    ayuda: "Tu actividad no paga IVA (por ejemplo, algunas asociaciones o profesiones).",
    letras: "C",
  },
];

export function esCondicionIva(v: unknown): v is CondicionIva {
  return CONDICIONES_IVA.some((c) => c.id === v);
}

export function opcionCondicion(id: CondicionIva): OpcionCondicion {
  return CONDICIONES_IVA.find((c) => c.id === id) ?? CONDICIONES_IVA[0];
}

// ---------------------------------------------------------------------------
// Punto de venta
// ---------------------------------------------------------------------------

/** ARCA numera los puntos de venta de 1 a 99998. */
export const PUNTO_VENTA_MAX = 99_998;

export type ResultadoPuntoVenta = { ok: true; numero: number; formateado: string } | { ok: false; error: string };

/** "0003" → 3. Acepta ceros adelante, como lo muestra ARCA. */
export function validarPuntoVenta(crudo: string): ResultadoPuntoVenta {
  const s = (crudo ?? "").trim();
  if (s === "") return { ok: false, error: "Escribí el número del punto de venta (por ejemplo, 2)." };
  if (!/^\d+$/.test(s)) return { ok: false, error: "El punto de venta es sólo un número, sin letras ni guiones." };
  const numero = Number(s);
  if (numero < 1 || numero > PUNTO_VENTA_MAX) {
    return { ok: false, error: "Ese número no es un punto de venta: va del 1 al 99998." };
  }
  return { ok: true, numero, formateado: String(numero).padStart(5, "0") };
}

// ---------------------------------------------------------------------------
// Ayuda en criollo: punto de venta y certificado propio en ARCA
// ---------------------------------------------------------------------------

/*
 * DECISIÓN DEL DUEÑO (05/11/2026): GSG no hace trámites en ARCA por el usuario ni usa delegación a
 * su CUIT. Cada negocio tiene su certificado propio: el usuario entra él mismo con su clave fiscal
 * (que queda con él), lo crea con el pedido (.csr) que genera el sistema y lo asocia a «Facturación
 * Electrónica». Base legal citada como A VALIDAR POR LEGALES: RG 5048/2021 art. 4.
 */

export const PASOS_PUNTO_VENTA: readonly string[] = [
  "Entrá a arca.gob.ar con tu CUIT y tu clave fiscal.",
  "Buscá el servicio «Administración de puntos de venta y domicilios» y entrá.",
  "Tocá tu nombre y después «A/B/M de puntos de venta» → «Agregar».",
  "Elegí un número que no estés usando y, en «Sistema», el que diga «Web Services» (si sos monotributista, «Factura Electrónica – Monotributo – Web Services»).",
  "Confirmá. Ese número es el que anotás acá.",
];

/** El certificado propio, en criollo. El .csr lo genera el sistema cuando te activamos (nunca se pide la clave fiscal). */
export const PASOS_CERTIFICADO_PROPIO: readonly string[] = [
  "Cuando te activamos, el sistema te genera un archivo «pedido de certificado» (.csr). No lleva tu clave fiscal: la clave es tuya y no nos la das nunca.",
  "Entrá vos a arca.gob.ar con tu CUIT y tu clave fiscal nivel 3, y abrí «Administración de Certificados Digitales».",
  "«Agregar alias»: poné gsg-erp, subí el .csr y bajá el certificado (.crt) que te da ARCA.",
  "En «Administrador de Relaciones de Clave Fiscal» → «Nueva relación» → «Facturación Electrónica», elegí ese certificado.",
  "Subí el .crt en Facturita. Listo: el certificado es tuyo y sirve sólo para facturar; lo podés revocar cuando quieras.",
];

// ---------------------------------------------------------------------------
// El alta completa → mensaje para activar
// ---------------------------------------------------------------------------

export interface DatosAlta {
  nombre: string;
  cuit: string;
  condicion: CondicionIva | "";
  /** Vacío + `sinPuntoVenta` = "todavía no lo creé" (se lo armamos juntos al activar). */
  puntoVenta: string;
  sinPuntoVenta: boolean;
  /** «Ya hice el certificado en ARCA». Conserva el nombre viejo para no romper el PR #9. */
  delegacionHecha: boolean;
}

export const ALTA_VACIA: DatosAlta = {
  nombre: "",
  cuit: "",
  condicion: "",
  puntoVenta: "",
  sinPuntoVenta: false,
  delegacionHecha: false,
};

export type CampoAlta = "nombre" | "cuit" | "condicion" | "puntoVenta";
export type ErroresAlta = Partial<Record<CampoAlta, string>>;

export function validarNombre(crudo: string): string | null {
  const s = (crudo ?? "").trim();
  if (s.length < 2) return "Escribí tu nombre y apellido, o el de tu negocio como figura en ARCA.";
  if (s.length > 80) return "Es muy largo: con 80 letras alcanza.";
  return null;
}

/** Errores por campo (vacío = todo bien). Los usa cada paso y el resumen final. */
export function validarAlta(d: DatosAlta): ErroresAlta {
  const e: ErroresAlta = {};
  const nombre = validarNombre(d.nombre);
  if (nombre) e.nombre = nombre;
  const cuit = validarCuitEmisor(d.cuit);
  if (!cuit.ok) e.cuit = cuit.error;
  if (!esCondicionIva(d.condicion)) e.condicion = "Elegí cómo estás inscripto en ARCA.";
  if (!d.sinPuntoVenta) {
    const pv = validarPuntoVenta(d.puntoVenta);
    if (!pv.ok) e.puntoVenta = pv.error;
  }
  return e;
}

export function altaCompleta(d: DatosAlta): boolean {
  return Object.keys(validarAlta(d)).length === 0;
}

/**
 * El texto que la persona manda por WhatsApp para que la activemos. Sólo lo que hace falta para
 * el alta operada; nunca claves (la clave fiscal NO se pide en ningún paso).
 */
export function mensajeActivacion(d: DatosAlta): string {
  const cuit = validarCuitEmisor(d.cuit);
  const pv = d.sinPuntoVenta ? null : validarPuntoVenta(d.puntoVenta);
  const condicion = esCondicionIva(d.condicion) ? opcionCondicion(d.condicion).nombre : "a confirmar";
  return [
    "¡Hola! Quiero activar mi Facturita gratis.",
    `Nombre: ${d.nombre.trim()}`,
    `CUIT: ${cuit.ok ? cuit.formateado : d.cuit.trim()}`,
    `Condición frente al IVA: ${condicion}`,
    `Punto de venta: ${pv && pv.ok ? pv.numero : "todavía no lo creé"}`,
    `Certificado en ARCA: ${d.delegacionHecha ? "ya lo hice" : "me falta, ayudame"}`,
  ].join("\n");
}
