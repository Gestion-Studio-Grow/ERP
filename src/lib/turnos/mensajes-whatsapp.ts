// ============================================================================
// LOS MENSAJES DE WHATSAPP DE LA AGENDA — el texto armado, listo para `wa.me`. PURO, client-safe.
// ============================================================================
//
// Principio 5 de la reingeniería de CH (ch-DISENO.md §1.1): «Siempre una salida a WhatsApp con el
// texto armado». Dar turno, pedir seña, mover, cancelar, no vino, cobrar, recordar saldo y el cierre
// de caja terminan con un botón que abre el chat con el mensaje ya escrito, en criollo, con el monto
// y el alias cuando corresponde. Nada se tipea dos veces.
//
// Todas las pantallas que mandan un WhatsApp (el alta, el cajón del turno, mover, la bandeja, la
// caja) arman el texto ACÁ, con estas funciones, para que la clienta reciba siempre la misma voz.
// El link se arma con `linkWhatsApp` (el 549 + el teléfono normalizado de `waLinkClienta`: nunca se
// abre WhatsApp a un número que no es el de ella).
//
// Reglas que el test vigila (mensajes-whatsapp.test.ts, CH-050):
//   · nunca «undefined», «null», «NaN» ni «$0»: un dato que falta se saca de la frase, no se imprime;
//   · pesos sin decimales cuando son enteros («$5.000»), con el punto de miles argentino;
//   · la fecha y la hora en la zona del negocio, con el día de la semana («el jueves 24 a las 16:00»);
//   · de vos, corto, con el primer nombre (un mensaje 1 a 1 no saluda con el apellido);
//   · las tildes y los emojis viajan bien en `wa.me` (encodeURIComponent, en `buildWhatsAppHref`).
//
// PROVISIONAL A CONFIRMAR CON LA DUEÑA: el tono de cada texto y el alias para la seña. El alias del
// negocio no tiene columna todavía (D3 / M2: `BusinessSettings.aliasSenia`, migración SIN aplicar):
// mientras tanto `ALIAS_SENIA_PROVISIONAL` es `null` y el pedido de seña sale SIN alias («te pasamos
// por acá los datos para transferir»). Inventar un alias sería mandar a la clienta a transferirle a
// otra persona: por eso no hay un valor de ejemplo.

import { BUSINESS_TIMEZONE } from "@/lib/business-config";
import { primerNombre } from "@/lib/crm/textos";
import { waLinkClienta } from "@/lib/whatsapp-cta";

/**
 * El alias / CBU del negocio para que la clienta mande la seña. PROVISIONAL A CONFIRMAR: `null`
 * hasta que exista `BusinessSettings.aliasSenia` (Tanda 3, migración M2 sin aplicar) o la dueña lo
 * pase. Con `null` el pedido de seña no nombra ningún alias.
 */
export const ALIAS_SENIA_PROVISIONAL: string | null = null;

/** El cierre de los mensajes a la clienta (provisional a confirmar con la dueña). */
const CIERRE = "Cualquier cambio avisanos por acá 💚";

// ── Piezas ───────────────────────────────────────────────────────────────────

const PESOS = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0, minimumFractionDigits: 0 });
const PESOS_CON_CENTAVOS = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/** ¿Es un monto que se puede nombrar? (número finito y mayor que cero). */
export function hayPlata(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** «$5.000» · «$7.500,50». Negativos con el signo menos tipográfico. Un no-número da «$0» (no se usa así). */
export function pesosEnTexto(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  const abs = Math.abs(n);
  const entero = Math.round(abs * 100) % 100 === 0;
  return `${n < 0 ? "−" : ""}$${(entero ? PESOS : PESOS_CON_CENTAVOS).format(entero ? Math.round(abs) : abs)}`;
}

const DIA_Y_HORA = new Intl.DateTimeFormat("es-AR", {
  timeZone: BUSINESS_TIMEZONE,
  weekday: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DIA_CORTO = new Intl.DateTimeFormat("es-AR", { timeZone: BUSINESS_TIMEZONE, weekday: "short", day: "numeric" });

function partes(instante: Date): { semana: string; dia: string; hora: string } | null {
  if (Number.isNaN(instante.getTime())) return null;
  const p = DIA_Y_HORA.formatToParts(instante);
  const de = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const hh = de("hour") === "24" ? "00" : de("hour");
  return { semana: de("weekday").toLowerCase(), dia: de("day"), hora: `${hh}:${de("minute")}` };
}

/** «el jueves 24 a las 16:00» (en la zona del negocio). Una fecha ilegible da "" (la frase la saltea). */
export function cuandoEnTexto(inicio: string | Date): string {
  const p = partes(new Date(inicio));
  return p ? `el ${p.semana} ${p.dia} a las ${p.hora}` : "";
}

/** «jueves 24 a las 16:00», sin el artículo (para «al …», «del …»). */
function diaYHora(inicio: string | Date): string {
  return cuandoEnTexto(inicio).replace(/^el /, "");
}

/** «jue 24» (para el cierre de caja, que es un resumen). Recibe un día «2026-10-24». */
export function diaCortoEnTexto(dia: string): string {
  const d = new Date(`${dia}T15:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return "";
  return DIA_CORTO.format(d).replace(".", "").replace(",", "");
}

/**
 * «Bozo, axilas, piernas completas y cavado»: los servicios en una frase. El primero conserva su
 * mayúscula y los demás van en minúscula (salvo que sean siglas: «LED» queda «LED»).
 */
export function listaDeServicios(servicios: string | readonly string[]): string {
  const lista = (typeof servicios === "string" ? [servicios] : [...servicios]).map((s) => s.trim()).filter(Boolean);
  if (lista.length === 0) return "";
  const bajar = (s: string) => (/^[A-ZÁÉÍÓÚÑ0-9]{2,}\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
  const [primero, ...resto] = lista;
  const todos = [primero, ...resto.map(bajar)];
  if (todos.length === 1) return todos[0];
  return `${todos.slice(0, -1).join(", ")} y ${todos[todos.length - 1]}`;
}

function limpio(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  return t === "undefined" || t === "null" ? "" : t;
}

function saludo(clienta: string): string {
  const n = primerNombre(limpio(clienta));
  return n ? `¡Hola ${n}!` : "¡Hola!";
}

/** Une las frases que tienen algo, con un espacio. */
function frases(...partes: (string | false | null | undefined)[]): string {
  return partes
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .map((p) => p.trim())
    .join(" ");
}

const MEDIO_EN_TEXTO: Record<string, string> = {
  EFECTIVO: "en efectivo",
  MERCADOPAGO: "por Mercado Pago",
  TRANSFERENCIA: "por transferencia",
  DEBITO: "con débito",
  CREDITO: "con crédito",
};

/** «por transferencia» · «en efectivo» · "" si el medio no se sabe. */
export function medioEnTexto(medio: string | null | undefined): string {
  return MEDIO_EN_TEXTO[limpio(medio).toUpperCase()] ?? "";
}

// ── El turno del que se habla ─────────────────────────────────────────────────

export type TurnoDelMensaje = {
  /** El nombre como está en la ficha («Laura Gómez»): se saluda con el primero. */
  clienta: string;
  /** Uno o varios servicios (un combo son varios). */
  servicios: string | readonly string[];
  /** ISO del inicio. */
  inicio: string | Date;
  /** Con quién (el nombre de la profesional). */
  profesional?: string | null;
  /** La dirección del local (BusinessSettings.addressLine), si está cargada. */
  direccion?: string | null;
};

function queCuandoConQuien(t: TurnoDelMensaje): string {
  const servicio = listaDeServicios(t.servicios);
  const cuando = cuandoEnTexto(t.inicio);
  const con = limpio(t.profesional);
  const donde = limpio(t.direccion);
  return [servicio ? `*${servicio}*` : "un turno", cuando ? `*${cuando}*` : "", con ? `con ${con}` : "", donde ? `en ${donde}` : ""]
    .filter(Boolean)
    .join(" ");
}

// ── 1. Confirmación del turno dado ────────────────────────────────────────────

export type SeniaDelMensaje = { monto: number; medio?: string | null };

/**
 * Al dar el turno (pantalla «Listo ✓»):
 * «¡Hola Laura! Te agendamos *Piernas completas* *el jueves 24 a las 16:00* con Caro. Recibimos tu
 * seña de $5.000 por transferencia, ¡gracias! Cualquier cambio avisanos por acá 💚»
 * Sin seña cobrada no se nombra ninguna seña (ni «$0»).
 */
export function mensajeConfirmacion(t: TurnoDelMensaje & { senia?: SeniaDelMensaje | null }): string {
  const senia = t.senia && hayPlata(t.senia.monto) ? t.senia : null;
  return frases(
    saludo(t.clienta),
    `Te agendamos ${queCuandoConQuien(t)}.`,
    senia && `Recibimos tu seña de ${pesosEnTexto(senia.monto)}${medioEnTexto(senia.medio) ? ` ${medioEnTexto(senia.medio)}` : ""}, ¡gracias!`,
    CIERRE,
  );
}

// ── 2. Pedido de seña ─────────────────────────────────────────────────────────

/**
 * «…Para reservar te pedimos una seña de $5.000 al alias *ch.estetica*. Cuando la mandes, avisanos
 * por acá.» Sin alias (hoy, provisional), «…una seña de $5.000: te pasamos por acá los datos para
 * transferir.». Sin monto, no hay pedido que hacer: devuelve la confirmación sola.
 */
export function mensajePedidoDeSenia(t: TurnoDelMensaje & { monto: number; alias?: string | null }): string {
  if (!hayPlata(t.monto)) return mensajeConfirmacion({ ...t, senia: null });
  const alias = limpio(t.alias);
  const pedido = alias
    ? `Para reservar te pedimos una seña de ${pesosEnTexto(t.monto)} al alias *${alias}*. Cuando la mandes, avisanos por acá con el comprobante.`
    : `Para reservar te pedimos una seña de ${pesosEnTexto(t.monto)}: te pasamos por acá los datos para transferir. Cuando la mandes, avisanos con el comprobante.`;
  return frases(saludo(t.clienta), `Te anotamos ${queCuandoConQuien(t)}.`, pedido, "¡Gracias! 💚");
}

// ── 3. Mover (reprogramar) ────────────────────────────────────────────────────

/**
 * «¡Hola Laura! Te pasamos el turno al viernes 25 a las 17:30 con Lu (era el jueves 24 a las 16:00).
 * Si no te queda bien, avisanos por acá 💚»
 */
export function mensajeMover(t: TurnoDelMensaje & { inicioAnterior?: string | Date | null }): string {
  const nuevo = diaYHora(t.inicio);
  const antes = t.inicioAnterior ? diaYHora(t.inicioAnterior) : "";
  const con = limpio(t.profesional);
  const servicio = listaDeServicios(t.servicios);
  return frases(
    saludo(t.clienta),
    `Te pasamos ${servicio ? `el turno de *${servicio}*` : "el turno"}${nuevo ? ` al *${nuevo}*` : ""}${con ? ` con ${con}` : ""}${antes ? ` (era el ${antes})` : ""}.`,
    "Si no te queda bien, avisanos por acá 💚",
  );
}

// ── 4. Cancelación ────────────────────────────────────────────────────────────

export type DestinoDeLaSeniaMsg = "retener" | "devolver" | "a-favor";

function fraseDeLaSenia(senia: { monto: number; destino: DestinoDeLaSeniaMsg } | null | undefined): string {
  if (!senia || !hayPlata(senia.monto)) return "";
  const m = pesosEnTexto(senia.monto);
  switch (senia.destino) {
    case "devolver":
      return `Te devolvemos la seña de ${m}.`;
    case "a-favor":
      return `La seña de ${m} te queda a favor para el próximo turno.`;
    default:
      return `La seña de ${m} queda para el negocio, como habíamos quedado.`;
  }
}

/**
 * Cancelar. Quien cancela cambia el tono: si fue el negocio, se pide disculpas y se ofrece otro día;
 * si avisó la clienta, se confirma. La seña, si hubo, dice qué pasa con ella.
 */
export function mensajeCancelacion(
  t: TurnoDelMensaje & { quien: "clienta" | "negocio"; senia?: { monto: number; destino: DestinoDeLaSeniaMsg } | null },
): string {
  const cuando = cuandoEnTexto(t.inicio);
  const servicio = listaDeServicios(t.servicios);
  const turno = `${servicio ? `el turno de *${servicio}*` : "tu turno"}${cuando ? ` del ${cuando.replace(/^el /, "")}` : ""}`;
  return t.quien === "negocio"
    ? frases(saludo(t.clienta), `Te pedimos disculpas: tuvimos que cancelar ${turno}.`, fraseDeLaSenia(t.senia), "¿Te buscamos otro día que te quede bien? 💚")
    : frases(saludo(t.clienta), `Listo, cancelamos ${turno}.`, fraseDeLaSenia(t.senia), "Cuando quieras otro turno, escribinos por acá 💚");
}

// ── 5. No vino ────────────────────────────────────────────────────────────────

/**
 * «¡Hola Laura! Te esperábamos hoy a las 16:00 para Piernas completas. ¿Está todo bien? Si querés,
 * te buscamos otro turno.» + qué pasa con la seña, si hubo.
 */
export function mensajeNoVino(t: TurnoDelMensaje & { senia?: { monto: number; destino: DestinoDeLaSeniaMsg } | null }): string {
  const cuando = cuandoEnTexto(t.inicio);
  const servicio = listaDeServicios(t.servicios);
  return frases(
    saludo(t.clienta),
    `Te esperábamos${cuando ? ` ${cuando}` : ""}${servicio ? ` para *${servicio}*` : ""}. ¿Está todo bien?`,
    fraseDeLaSenia(t.senia),
    "Si querés, te buscamos otro turno por acá 💚",
  );
}

// ── 6. Recordar un saldo ──────────────────────────────────────────────────────

/**
 * «¡Hola Laura! Te escribimos por el saldo de $9.000 de Piernas completas del jueves 24. Lo podés
 * abonar al alias *x* o en tu próxima visita. ¡Gracias!» Sin saldo no hay nada que recordar: "".
 */
export function mensajeRecordarSaldo(d: {
  clienta: string;
  saldo: number;
  servicio?: string | null;
  inicio?: string | Date | null;
  alias?: string | null;
}): string {
  if (!hayPlata(d.saldo)) return "";
  const servicio = limpio(d.servicio);
  const cuando = d.inicio ? cuandoEnTexto(d.inicio) : "";
  const dia = cuando ? cuando.replace(/^el /, "").replace(/ a las .*$/, "") : "";
  const alias = limpio(d.alias);
  return frases(
    saludo(d.clienta),
    `Te escribimos por el saldo de ${pesosEnTexto(d.saldo)}${servicio ? ` de *${servicio}*` : ""}${dia ? ` del ${dia}` : ""}.`,
    alias ? `Lo podés abonar al alias *${alias}* o en tu próxima visita.` : "Lo podés abonar en tu próxima visita o te pasamos los datos para transferir.",
    "¡Gracias! 💚",
  );
}

// ── 7. Comprobante de un cobro ────────────────────────────────────────────────

/** «¡Hola Laura! Recibimos $27.000 en efectivo por Piernas completas. ¡Gracias!» (+ saldo si queda). */
export function mensajeCobro(d: { clienta: string; monto: number; medio?: string | null; servicio?: string | null; saldo?: number | null }): string {
  if (!hayPlata(d.monto)) return "";
  const medio = medioEnTexto(d.medio);
  const servicio = limpio(d.servicio);
  return frases(
    saludo(d.clienta),
    `Recibimos ${pesosEnTexto(d.monto)}${medio ? ` ${medio}` : ""}${servicio ? ` por *${servicio}*` : ""}.`,
    hayPlata(d.saldo) && `Queda un saldo de ${pesosEnTexto(d.saldo)}.`,
    "¡Gracias! 💚",
  );
}

// ── 8. Cierre de caja (a la dueña) ────────────────────────────────────────────

export type ColumnaDelCierre = {
  /** Lo que se contó (o lo que dice el libro, si no se cuenta esa columna). */
  monto: number;
  /** Contado − esperado. 0 / ausente = cuadra (no se nombra). */
  diferencia?: number | null;
};

/**
 * El resumen que la recepción le manda a la dueña al cerrar el día:
 * «Cierre jue 24: Efectivo $118.000 (−$2.000), MP/Transf. $64.000, Tarjeta $30.000 · 14 turnos.
 * Qué pasó: faltó cambio.» Las columnas en cero se omiten salvo el efectivo (que siempre se cuenta).
 */
export function mensajeCierreDeCaja(d: {
  dia: string;
  efectivo: ColumnaDelCierre;
  mercadoPago?: ColumnaDelCierre | null;
  tarjeta?: ColumnaDelCierre | null;
  turnos?: number | null;
  /** «Qué pasó», si hubo diferencia. */
  nota?: string | null;
  /** Quién cerró. */
  quien?: string | null;
}): string {
  const col = (nombre: string, c: ColumnaDelCierre | null | undefined, siempre = false): string => {
    if (!c || !Number.isFinite(c.monto)) return "";
    if (!siempre && c.monto === 0 && !c.diferencia) return "";
    const dif = typeof c.diferencia === "number" && Number.isFinite(c.diferencia) && c.diferencia !== 0
      ? ` (${c.diferencia > 0 ? "+" : ""}${pesosEnTexto(c.diferencia)})`
      : "";
    return `${nombre} ${pesosEnTexto(c.monto)}${dif}`;
  };
  const columnas = [col("Efectivo", d.efectivo, true), col("MP/Transf.", d.mercadoPago), col("Tarjeta", d.tarjeta)].filter(Boolean).join(", ");
  const dia = diaCortoEnTexto(d.dia);
  const turnos = typeof d.turnos === "number" && Number.isFinite(d.turnos) && d.turnos > 0 ? ` · ${d.turnos === 1 ? "1 turno" : `${d.turnos} turnos`}` : "";
  const nota = limpio(d.nota);
  const quien = limpio(d.quien);
  return frases(`Cierre${dia ? ` ${dia}` : ""}: ${columnas}${turnos}.`, nota && `Qué pasó: ${nota}.`, quien && `Cerró ${quien}.`);
}

// ── 9. Escribirle sin un turno de por medio ───────────────────────────────────

/**
 * El saludo solo («¡Hola Laura!»), para abrir el chat desde el buscador o la ficha sin un motivo
 * armado: la recepción escribe el resto. Sin nombre, «¡Hola!».
 */
export function mensajeSaludo(clienta: string): string {
  return saludo(clienta);
}

/** Por qué se le escribe a una clienta que no tiene un turno en juego (las vistas de Clientes). */
export type MotivoDeVolver = "frecuente" | "hace-mucho" | "cumple-hoy" | "cumple-cerca";

/**
 * Invitarla a volver (Clientes: Frecuentes · Hace mucho · Cumplen):
 *   · frecuente: «¡Hola Laura! ¿Cómo estás? Te escribimos para ver si querés que te reservemos el
 *     próximo turno. 💚»
 *   · hace mucho: «…Hace mucho que no te vemos. ¿Querés que te reservemos un turno? Decinos qué día
 *     te queda bien 💚»
 *   · cumple hoy: «¡Feliz cumple, Laura! Que tengas un día hermoso 💚»
 *   · cumple cerca: «…Se viene tu cumple. ¿Querés que te reservemos un turno para esa semana? 💚»
 */
export function mensajeParaVolver(motivo: MotivoDeVolver, clienta: string): string {
  const n = primerNombre(limpio(clienta));
  switch (motivo) {
    case "cumple-hoy":
      return `¡Feliz cumple${n ? `, ${n}` : ""}! Que tengas un día hermoso 💚`;
    case "cumple-cerca":
      return frases(saludo(clienta), "Se viene tu cumple. ¿Querés que te reservemos un turno para esa semana? 💚");
    case "hace-mucho":
      return frases(saludo(clienta), "Hace mucho que no te vemos. ¿Querés que te reservemos un turno? Decinos qué día te queda bien 💚");
    default:
      return frases(saludo(clienta), "¿Cómo estás? Te escribimos para ver si querés que te reservemos el próximo turno 💚");
  }
}

// ── El link ───────────────────────────────────────────────────────────────────

/**
 * El link `wa.me` a la clienta con el texto, o `null` si el teléfono no es un celular argentino de
 * 10 dígitos (no se abre WhatsApp a un número que no es el de ella). Es `waLinkClienta`.
 */
export function linkWhatsApp(telefono: string | null | undefined, texto: string): string | null {
  return waLinkClienta(telefono, texto);
}
