// Lógica pura del CTA de WhatsApp (sin JSX, testeable con node:test).
//
// Regla del dueño: NUNCA un número hardcodeado ni abrir WhatsApp a un número
// falso. Si el tenant tiene su WhatsApp real configurado (BusinessSettings.whatsapp)
// se usa ese; si no, el CTA pide el número al usuario ahí mismo (just-in-time,
// ver src/components/whatsapp-cta.tsx) y recién con eso abre WhatsApp. El número
// que completa un visitante se guarda en localStorage, nunca en el repo/DB.

import { normalizarTelefono } from "@/lib/clientes/telefono";

// ── El número para wa.me: UNA sola regla para todo el ERP ──────────────────────
//
// wa.me quiere el número internacional sin "+": país + número. Hasta acá el número del NEGOCIO
// pasaba por un "sacá lo que no es dígito" y nada más, así que el «11-6677-8890» que carga
// cualquier local quedaba `wa.me/1166778890`, que WhatsApp lee como +1 (EE. UU.): el pedido le
// llegaba a un desconocido. Todos los links de WhatsApp (al negocio, a la clienta, a GSG) pasan
// ahora por `leerWhatsApp`.
//
// Argentina: `549` + área + número (13 dígitos). El 9 va siempre: WhatsApp en AR es celular y lo
// necesita, también cuando lo cargaron «+54 11 …» sin el 9. Los prefijos que se sacan (00, 54, 0
// de larga distancia, 9 internacional, 15 local) los saca `normalizarTelefono`, la misma clave
// que usan las fichas de clientas: no hay dos maneras de leer un teléfono argentino.
//
// Otro país: se respeta tal cual. Con "+" (o "00") adelante no hay duda. Sin "+" —el panel guardaba
// sólo los dígitos, así que un «+34 612…» quedó «34612…»— se toma como de otro país lo que no se
// puede leer como argentino y mide lo que mide un número internacional (11 a 15 dígitos, sin 0
// adelante). Es una heurística y está dicha: un número de otro país sin "+" que, sacándole un 9
// o un 0, parezca área + número argentino se lee como argentino. Para que no pase, se carga con "+".
//
// Lo que no es ninguna de las dos cosas (le falta el área, es el relleno «11 0000-0000») es
// `invalido` y el número para wa.me es "": mejor sin chat que un chat con otra persona.
//
// Límite conocido: un número de otro país de menos de 11 dígitos (Islandia, Malvinas) sólo se
// reconoce con el "+"; si se lo vuelve a pasar por acá ya sin el "+", queda inválido.

export type LecturaWhatsApp =
  | { tipo: "vacio"; numero: "" }
  /** `conCodigoDePais`: lo cargaron con el 54 (o +54). false = se lo agregamos nosotros. */
  | { tipo: "argentino"; numero: string; conCodigoDePais: boolean }
  /** `explicito`: vino con "+" o "00". false = sólo dígitos, se dedujo por el largo. */
  | { tipo: "otroPais"; numero: string; explicito: boolean }
  | { tipo: "invalido"; numero: ""; motivo: "faltaArea" | "relleno" | "largo" };

/** Código de área argentino: 11 (el único de dos dígitos) o empieza con 2 o 3. */
const AREA_ARGENTINA = /^(11|[23])/;

export function leerWhatsApp(raw: string | null | undefined): LecturaWhatsApp {
  const texto = String(raw ?? "").trim();
  let d = texto.replace(/\D/g, "");
  if (!d) return { tipo: "vacio", numero: "" };

  const explicito = texto.startsWith("+") || d.startsWith("00");
  if (d.startsWith("00")) d = d.slice(2);
  const conCodigoDePais = d.startsWith("54") && d.length > 10;

  if (explicito && !conCodigoDePais) {
    return d.length >= 8 && d.length <= 15 && !d.startsWith("0")
      ? { tipo: "otroPais", numero: d, explicito: true }
      : { tipo: "invalido", numero: "", motivo: "largo" };
  }

  // «+54 9 351 15 555-1234»: el 9 internacional Y el 15 local juntos (pasa). `normalizarTelefono`
  // saca el 9 sólo si quedan 11 dígitos; acá quedan 13, así que el 9 se saca antes.
  let nacional = conCodigoDePais ? d.slice(2) : d;
  if (nacional.startsWith("9") && nacional.length === 13) nacional = nacional.slice(1);
  const clave = normalizarTelefono(nacional);
  if (clave.length === 10 && AREA_ARGENTINA.test(clave)) {
    // El relleno de las altas («+54 9 11 0000 0000»): los 8 finales iguales no son de nadie.
    if (/^(\d)\1{7}$/.test(clave.slice(-8))) return { tipo: "invalido", numero: "", motivo: "relleno" };
    return { tipo: "argentino", numero: `549${clave}`, conCodigoDePais };
  }

  if (!conCodigoDePais && !d.startsWith("0") && d.length >= 11 && d.length <= 15) {
    return { tipo: "otroPais", numero: d, explicito: false };
  }
  return { tipo: "invalido", numero: "", motivo: clave.length === 10 ? "faltaArea" : "largo" };
}

/**
 * El número listo para `wa.me/<numero>`, o "" si no hay uno usable (ver `leerWhatsApp`). Es el
 * ÚLTIMO paso, el que arma la URL: sin el "+", un número de otro país vuelto a leer puede pasar
 * por argentino («351915123456», Portugal, se lee 351 15 912-3456, Córdoba). Para pasar el número
 * entre capas, `whatsappCanonico`.
 */
export function numeroWhatsApp(raw: string | null | undefined): string {
  return leerWhatsApp(raw).numero;
}

/**
 * El número con "+" adelante («+5491166778890», «+351915123456»), o "". Es la forma que viaja
 * entre capas (settings, props, el CTA): se puede volver a leer las veces que haga falta y da lo
 * mismo, porque el "+" dice sin dudas de qué país es.
 */
export function whatsappCanonico(raw: string | null | undefined): string {
  const numero = numeroWhatsApp(raw);
  return numero ? `+${numero}` : "";
}

/**
 * @deprecated Usá `numeroWhatsApp`. Antes sólo borraba lo que no es dígito y dejaba el número sin
 * el 549; queda como alias para que ningún llamador viejo vuelva a armar un link sin código de país.
 */
export const sanitizePhone = numeroWhatsApp;

/** Cómo se lee el número para wa.me, con espacios: «+54 9 11 6677-8890» / «+34612345678». */
export function etiquetaWhatsApp(numero: string): string {
  if (/^549\d{10}$/.test(numero)) {
    const resto = numero.slice(3);
    // El área mide 2 (sólo el 11), 3 o 4; sin tabla de áreas se corta en 3: el número es el
    // mismo, sólo cambia dónde va el espacio.
    const largoArea = resto.startsWith("11") ? 2 : 3;
    const area = resto.slice(0, largoArea);
    const abonado = resto.slice(largoArea);
    return `+54 9 ${area} ${abonado.slice(0, -4)}-${abonado.slice(-4)}`;
  }
  return numero ? `+${numero}` : "";
}

const hrefWa = (numero: string, texto: string): string =>
  texto ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : `https://wa.me/${numero}`;

export function buildWhatsAppHref(number: string, message: string): string {
  return `https://wa.me/${numeroWhatsApp(number)}?text=${encodeURIComponent(message)}`;
}

/** Namespaced por tenant: cada vidriera guarda el número que le completaron a ELLA. */
export function whatsappStorageKey(tenantKey: string): string {
  return `gsg-whatsapp-${tenantKey}`;
}

/**
 * Link de WhatsApp a una CLIENTA, desde la agenda o la ficha. `null` si el teléfono cargado
 * no es un celular argentino (o uno de otro país cargado con "+"): la regla de arriba vale
 * también acá, no se abre WhatsApp a un número que no es el de ella.
 *
 * Más estricto que el número del negocio a propósito: la ficha guarda lo que se tipeó, a las
 * apuradas, y un número sin "+" que no cierra como argentino es más probable que sea un error
 * de tipeo que un teléfono de afuera.
 */
export function waLinkClienta(phone: string | null | undefined, texto = ""): string | null {
  const l = leerWhatsApp(phone);
  if (l.tipo === "argentino" || (l.tipo === "otroPais" && l.explicito)) return hrefWa(l.numero, texto);
  return null;
}

/**
 * Lo que el panel (Datos del negocio) le dice al dueño debajo del campo WhatsApp, mientras escribe:
 * cómo va a quedar el número en los links y, si algo falta, qué. `null` = campo vacío, nada que decir.
 * `alerta` = así no se puede usar: la tienda no va a ofrecer el chat.
 */
export function avisoWhatsAppDelNegocio(raw: string | null | undefined): { tono: "ok" | "aviso" | "alerta"; texto: string } | null {
  const l = leerWhatsApp(raw);
  switch (l.tipo) {
    case "vacio":
      return null;
    case "argentino":
      return l.conCodigoDePais
        ? { tono: "ok", texto: `Tus clientes te van a escribir al ${etiquetaWhatsApp(l.numero)}.` }
        : { tono: "aviso", texto: `Lo cargaste sin código de país. Le agregamos el +54 9 de Argentina: va a quedar ${etiquetaWhatsApp(l.numero)}.` };
    case "otroPais":
      return l.explicito
        ? { tono: "ok", texto: `Número de otro país: va a quedar ${etiquetaWhatsApp(l.numero)}.` }
        : { tono: "aviso", texto: `No parece un número argentino: lo tomamos como de otro país (${etiquetaWhatsApp(l.numero)}). Si es de acá, revisá el código de área.` };
    case "invalido":
      return {
        tono: "alerta",
        texto:
          l.motivo === "faltaArea"
            ? "Falta el código de área (por ejemplo, 11 para CABA y GBA). Así tus clientes no te pueden escribir por WhatsApp."
            : l.motivo === "relleno"
              ? "Ese número es de relleno. Cargá el WhatsApp real del negocio."
              : "No es un número de WhatsApp. Escribilo con el código de área, por ejemplo 11 6677-8890.",
      };
  }
}
