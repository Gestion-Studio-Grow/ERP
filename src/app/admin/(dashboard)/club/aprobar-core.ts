// ============================================================================
// EL APROBADOR DEL DUEÑO — el link que le llega por WhatsApp, su PIN y el código de 6 letras. PURO.
// ============================================================================
//
// Paridad con el club vanilla (public/previews/breakpoint/club/app.mjs: `linkAprobacion`, `panelAprobacion`,
// `dialogoAprobar`, `SOLO_APROBAR`), que es lo que el club usa hoy:
//   1. Recepción pide el OK para fiar (o la cuenta corriente) y toca «Avisar a Rober por WhatsApp»: al celular del
//      dueño (Configuración → Avisos, `celularDelDuenio`) le llega el texto del motor (`mensajeWhatsApp("aprobacion")`)
//      con el LINK al aprobador del ERP: `<origen>/admin/club/aprobar#aprobar&id=…&c=…&n=…&m=…&t=…&p=…&f=…` (o, si el
//      negocio aprueba en otro sitio —aprobador-externo.ts: Break Point en el trial, decisión G4—, a esa página con el
//      mismo fragmento: `https://breakpointpadel.gsgapp.com.ar/club#aprobar&…`).
//   2. El dueño lo abre (con su sesión del ERP: la pantalla es de un OWNER), elige quién es, pone su PIN y el monto
//      que aprueba: le sale el código (`codigoAprobacion` del motor) y lo manda con «Mandar el código por WhatsApp».
//   3. Recepción lo tipea (Clientes / Buffet): `aprobarPorCodigo` lo verifica contra el PIN de cada dueño, con 5
//      intentos por pedido (eso ya existe y no se toca acá).
//
// QUÉ LLEVA EL LINK (lo mismo que el vanilla, `datosAprobacion` del motor, ni un dato más):
//   id = el id del pedido · c = el id del cliente · n = el nombre del cliente · m = el monto pedido ·
//   t = «cc» o «fiado» · p = el nombre de quien pidió (recepción) · f = la fecha del pedido.
//   NO lleva PIN, ni celulares, ni deuda, ni saldo, ni nada del estado. Va en el FRAGMENTO (#…): el navegador no
//   lo manda al servidor (no queda en los registros de Vercel), y la pantalla lo borra de la barra al leerlo.
//   Lo que sí: queda escrito en el chat de WhatsApp del dueño (como hoy). El link solo no aprueba nada: el código
//   sale del PIN del dueño, y sin el PIN correcto la compu del club lo rechaza.
//
// El PIN se prueba con el MISMO tope que el bloqueo (bloqueo-core.ts: 5 mal → 30 s, 2 min, 10 min), contra los
// dueños del estado que este equipo tiene a mano. Sin estado a mano (jornada real sin la base encendida, BP-3), el
// celular no puede verificar el PIN: calcula el código igual (como el vanilla) y lo verifica la compu del club.

import { pinDeEjemplo, codigoAprobacion, datosAprobacion, mensajeWhatsApp, pesos, pinValidoPara } from "@/lib/club/motor.mjs";
import type { DatosAprobacion, EstadoClub } from "@/lib/club/motor.mjs";
import { aprobadorExternoDe } from "./aprobador-externo";
import { probarPin, segundosDeEspera, textoDeEspera, textoPinIncompleto, intentosVigentes, pinCompleto, type IntentosDelBloqueo } from "./bloqueo-core";
import { celularDelDuenio, contactosDe } from "./configuracion-core";
import { leerMonto } from "./montos-core";
import { enlaceWhatsApp, type EnlaceWhatsApp, type ModoDelClub } from "./whatsapp-core";

/** Dónde vive el aprobador en el ERP (dentro del panel: hace falta la sesión de un dueño). */
export const RUTA_DEL_APROBADOR = "/admin/club/aprobar";
/** El fragmento arranca así (el mismo `#aprobar&…` del vanilla). */
export const PREFIJO_DEL_PEDIDO = "#aprobar&";

/**
 * El link al aprobador para ESTE pedido. `origen`: «https://club.ejemplo.com» (sin la barra final). `negocio`: el slug;
 * si el negocio aprueba en otro sitio (aprobador-externo.ts, p. ej. Break Point con el club de hoy durante el trial),
 * el link va a esa página con el MISMO fragmento (las mismas 7 claves, en el mismo orden que arma el vanilla).
 */
export function linkDelAprobador(origen: string, d: DatosAprobacion, negocio?: string | null): string {
  const q = new URLSearchParams({ id: d.id, c: d.c, n: d.n, m: String(d.m), t: d.t, p: d.p, f: d.f ?? "" });
  const pagina = aprobadorExternoDe(negocio) ?? `${origen.replace(/\/+$/, "")}${RUTA_DEL_APROBADOR}`;
  return `${pagina}${PREFIJO_DEL_PEDIDO}${q.toString()}`;
}

const ID = /^[\w-]{1,60}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MONTO_MAXIMO = 1_000_000_000;
/** Texto del link: sin saltos ni caracteres de control, recortado. React lo escapa al mostrarlo. */
const textoLimpio = (s: string | null, largo: number) =>
  String(s ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, largo);

/**
 * Lee el pedido del fragmento (`location.hash`). Lo que venga roto, incompleto o raro → null («pedile a recepción
 * que lo vuelva a mandar»). Nunca tira.
 */
export function leerPedidoDelLink(hash: string): DatosAprobacion | null {
  if (!hash.startsWith(PREFIJO_DEL_PEDIDO)) return null;
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(hash.slice(PREFIJO_DEL_PEDIDO.length));
  } catch {
    return null;
  }
  const id = q.get("id") ?? "";
  const c = q.get("c") ?? "";
  const m = Number(q.get("m"));
  const t = q.get("t");
  const f = q.get("f") ?? "";
  const n = textoLimpio(q.get("n"), 80);
  const p = textoLimpio(q.get("p"), 60);
  // La sal del club (hex): el celular calcula el código con el PIN con hash, como lo tiene guardado el club.
  const s = q.get("s") ?? "";
  if (!ID.test(id) || !ID.test(c)) return null;
  if (!Number.isInteger(m) || m <= 0 || m > MONTO_MAXIMO) return null;
  if (t !== "cc" && t !== "fiado") return null;
  if (f !== "" && !FECHA.test(f)) return null;
  if (!n || !p) return null;
  if (s && !/^[0-9a-f]{8,64}$/.test(s)) return null;
  return { id, c, n, m, t, p, f, ...(s ? { s } : {}) };
}

const ddmm = (f: string) => `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;

/** «fiarle $ 22.100 a Agustina Romero» · «cuenta corriente para Agustina Romero hasta $ 60.000». */
export function queSePide(d: Pick<DatosAprobacion, "t" | "m" | "n">, monto: number = d.m): string {
  return d.t === "fiado" ? `fiarle ${pesos(monto)} a ${d.n}` : `cuenta corriente para ${d.n} hasta ${pesos(monto)}`;
}

/** La línea del pedido: «Majo pide fiarle $ 22.100 a Agustina Romero · 17/10». */
export function textoDelPedido(d: DatosAprobacion): string {
  return `${d.p} pide ${queSePide(d)}${d.f ? ` · ${ddmm(d.f)}` : ""}`;
}

// ───────────── el aviso al dueño (lo usa Clientes; el Buffet lo pide a su sesión) ─────────────

export interface AvisoAlDuenio {
  duenioId: string;
  nombre: string;
  /** Al celular del dueño (Configuración → Avisos); en la demo o sin celular, para elegir el chat. */
  enlace: EnlaceWhatsApp;
}

/**
 * Un botón «Avisar a <dueño> por WhatsApp» por cada dueño activo, con el link al aprobador del ERP (o al del sitio
 * que el negocio tenga declarado en aprobador-externo.ts: quien llama pasa el `negocio`).
 */
export function avisosAlDuenio(estado: EstadoClub, novedadId: string, origen: string, modo: ModoDelClub, negocio?: string | null): AvisoAlDuenio[] {
  const d = datosAprobacion(estado, novedadId);
  if (!d) return [];
  const link = linkDelAprobador(origen, d, negocio);
  return estado.usuarios
    .filter((u) => u.rol === "duenio" && u.activo !== false)
    .map((u) => ({
      duenioId: u.id,
      nombre: u.nombre,
      enlace: enlaceWhatsApp(
        celularDelDuenio(estado, u.id),
        mensajeWhatsApp("aprobacion", { duenio: u.nombre, pidio: d.p, cliente: d.n, monto: pesos(d.m), tipo: d.t, link }),
        modo,
      ),
    }));
}

// ───────────── la pantalla del dueño ─────────────

export interface DuenioQueAprueba {
  id: string;
  nombre: string;
}

/** Quiénes pueden aprobar: dueños activos con PIN armado (sin PIN no hay código). Sin PINs. */
export function duenosQueAprueban(estado: EstadoClub | null): DuenioQueAprueba[] {
  return (estado?.usuarios ?? []).filter((u) => u.rol === "duenio" && u.activo !== false && !!u.pin).map((u) => ({ id: u.id, nombre: u.nombre }));
}

/**
 * ¿Qué sabe ESTE equipo del pedido? «pendiente»: está y espera · «resuelto»: ya se aprobó o rechazó (el código no
 * serviría) · «desconocido»: no está en el estado a mano (lo normal en el celular del dueño).
 */
export function situacionDelPedido(estado: EstadoClub | null, d: DatosAprobacion): "pendiente" | "resuelto" | "desconocido" {
  const n = estado?.novedades.find((x) => x.id === d.id && x.clienteId === d.c);
  if (!n) return "desconocido";
  return n.estado === "pendiente" ? "pendiente" : "resuelto";
}

export type PruebaDeAprobacion =
  | { tipo: "espera"; segundos: number; mensaje: string }
  | { tipo: "incompleto"; mensaje: string }
  | { tipo: "malo"; intentos: IntentosDelBloqueo; mensaje: string }
  | {
      tipo: "codigo";
      codigo: string;
      monto: number;
      /** Quién aprobó (con el PIN verificado) o null si este equipo no lo pudo verificar. */
      aprobo: string | null;
      intentos: IntentosDelBloqueo;
      /** Aprobó con el PIN viejo de 2: se le avisa que en la compu del club le van a pedir uno de 4. */
      pinViejo: boolean;
    };

/**
 * El dueño pone su PIN y el monto: sale el código. Con `estado` (los dueños a mano) el PIN se VERIFICA con el tope del
 * bloqueo (`probarPin`): mal no da código, y 5 mal hacen esperar. Sin estado, no se puede verificar acá: el código
 * sale igual (como el vanilla) y lo verifica la compu del club con sus 5 intentos por pedido. El PIN de dueño son 4
 * números; se acepta también el viejo de 2 (`pinAceptadoPara`: el celular no sabe si ese dueño ya lo cambió). Lo que no
 * tiene esa forma o un monto inválido no gasta un intento. Pura: el reloj se inyecta.
 */
export function probarAprobacion(args: {
  estado: EstadoClub | null;
  pedido: DatosAprobacion;
  duenioId: string | null;
  pin: string;
  monto: string;
  intentos: IntentosDelBloqueo;
  ahoraMs: number;
}): PruebaDeAprobacion {
  const { estado, pedido, duenioId, ahoraMs } = args;
  const i = intentosVigentes(args.intentos, ahoraMs);
  const espera = segundosDeEspera(i, ahoraMs);
  if (espera > 0) return { tipo: "espera", segundos: espera, mensaje: textoDeEspera(espera) };
  const monto = leerMonto(args.monto);
  if (!(monto > 0) || monto > MONTO_MAXIMO) return { tipo: "incompleto", mensaje: "Poné el monto que aprobás." };
  const pin = String(args.pin ?? "").trim();
  // Con la sal del club (`s` del link): la clave es el PIN con hash, la misma que el club tiene guardada.
  const codigo = (p: string) => codigoAprobacion({ pin: p, sal: pedido.s ?? estado?.salPin, novedadId: pedido.id, clienteId: pedido.c, monto, fecha: pedido.f });
  const pinViejo = !pinValidoPara("duenio", pin);
  if (!estado) {
    if (!pinCompleto(pin, "duenio")) return { tipo: "incompleto", mensaje: textoPinIncompleto("duenio") };
    return { tipo: "codigo", codigo: codigo(pin), monto, aprobo: null, intentos: i, pinViejo };
  }
  const duenios = duenosQueAprueban(estado);
  if (!duenioId || !duenios.some((u) => u.id === duenioId)) return { tipo: "incompleto", mensaje: "Elegí quién aprueba." };
  const r = probarPin(estado, duenioId, pin, i, ahoraMs);
  if (r.tipo !== "bueno") return r;
  return { tipo: "codigo", codigo: codigo(r.pin), monto, aprobo: r.usuario.nombre, intentos: r.intentos, pinViejo };
}

/** El texto con el código para recepción («Aprobado: Agustina Romero $ 22.100. Código ABC-DEF») y su link. */
export function enlaceDelCodigo(estado: EstadoClub | null, pedido: DatosAprobacion, codigo: string, monto: number, modo: ModoDelClub): EnlaceWhatsApp {
  const texto = mensajeWhatsApp("aprobado", { cliente: pedido.n, monto: pesos(monto), codigo });
  return enlaceWhatsApp(estado ? (contactosDe(estado).club ?? "") : "", texto, modo);
}

/** SÓLO DEMO: los PIN de ejemplo de los dueños («Rober 1111 · Majo 2222»), para recorrer el flujo. En el real, nunca. */
export function pinesDeEjemplo(estado: EstadoClub | null, modo: ModoDelClub): string | null {
  if (modo !== "demo" || !estado) return null;
  const lista = estado.usuarios.filter((u) => u.rol === "duenio" && u.activo !== false && u.pin).map((u) => `${u.nombre} ${pinDeEjemplo(u)}`);
  return lista.length ? lista.join(" · ") : null;
}
