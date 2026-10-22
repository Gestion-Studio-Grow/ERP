// ============================================================================
// EL BUSCADOR DE CLIENTAS Y TURNOS («/») — lo que se decide sin base. PURO, client-safe.
// ============================================================================
//
// Reingeniería CH, Tanda 2 (§3.5 «Buscar una clienta», CH-022/CH-028/CH-063). La recepción aprieta
// «/», tipea «laura» o «5566» y ve a la clienta con lo que necesita para decidir SIN abrir nada:
// su próximo turno, si debe, cuántas veces faltó y cuándo vino por última vez; y sus teclas
// [Dar turno] [WhatsApp] [Cobrar lo que debe] [Ver ficha]. Debajo, sus turnos que vienen.
//
// La lectura (sesión, permisos, negocio) está en buscar-actions.ts. Acá: ordenar lo que trajo la
// base, calcular deuda y seña pendiente con las MISMAS reglas que la agenda (`estadoCobroTurno`,
// `esCuentaACobrar`, `seniaDelServicio`) y ARMAR LO QUE SE PINTA. El servidor devuelve renglones
// ya armados (nombre, segunda línea, resumen, teclas con su enlace): al navegador cruza sólo lo
// que se dibuja. El teléfono, por ejemplo, viaja adentro del enlace de WhatsApp y en la segunda
// línea, nunca como campo suelto; los ids de los turnos con deuda, sólo si quien mira cobra.
//
// QUIÉN VE QUÉ (`PermisosDelBuscador`, lo calcula la action con las capacidades del rol):
//   · clients:read  → clientas (con teléfono, deuda, faltazos) y [Ver ficha] [WhatsApp];
//   · agenda:manage → [Dar turno];
//   · agenda:collect → los huecos de plata ([Llegó la seña], [Cobrar lo que debe]) cuando el
//     veredicto de ESE turno lo deja (`puedeCobrarEsteTurno`: Vero cobra aparte);
//   · una PROFESIONAL (sin clients:read) ve SÓLO sus turnos que vienen, sin ficha ni plata.

import { normalizarBusqueda, rangoCoincidencia } from "@/modules/nav-search";
import { fmtMoneyARS } from "@/components/ui/format";
import { BUSINESS_TIMEZONE } from "@/lib/business-config";
import { dateStrInBusinessTz, fmtTime } from "@/lib/datetime";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { esCuentaACobrar, estadoCobroTurno, seniaDelServicio, type CobroTurno, type PagoLegado } from "@/lib/turnos/cobros";
import type { Comando, GrupoDeFichas, HuecoDeFicha, TeclaDeFicha } from "@/components/ui/comandos-core";
import type { Busqueda } from "@/lib/buscador/registros-core";

/** Como mucho tantas clientas (el diseño: «límite 8»). */
export const LIMITE_CLIENTAS = 8;
/** Como mucho tantos turnos que vienen, debajo de las clientas. */
export const LIMITE_TURNOS = 5;
/** Filas que lee la base antes de ordenar: margen para que el orden elija. */
export const FILAS_A_LEER = 25;

type Ok = Extract<Busqueda, { ok: true }>;

export interface PermisosDelBuscador {
  /** clients:read — clientas, teléfono, deuda, faltazos, ficha. */
  verClientas: boolean;
  /** agenda:manage — dar turno. */
  darTurno: boolean;
  /** agenda:collect — los huecos de plata (además, el veredicto de cada turno). */
  cobrar: boolean;
}

// ── Lo que lee el servidor ───────────────────────────────────────────────────

export interface ClientaLeida {
  id: string;
  nombre: string;
  telefono: string;
}

export interface TurnoLeido {
  id: string;
  clienteId: string;
  clienta: string;
  inicio: Date;
  estado: string;
  servicio: string;
  profesional: string;
  /** Precio congelado al reservar (o el del servicio). */
  precio: number;
  depositAmount: number | null;
  pagoLegado: PagoLegado;
  /** ¿Quien mira puede cobrar ESTE turno? (`puedeCobrarEsteTurno`). */
  cobrable: boolean;
}

export interface CompletadoLeido {
  id: string;
  clienteId: string;
  inicio: Date;
  precio: number;
  pagoLegado: PagoLegado;
}

export interface LecturaDelBuscador {
  clientas: readonly ClientaLeida[];
  /** Reservados y confirmados desde hoy (de las clientas encontradas, o de la profesional). */
  proximos: readonly TurnoLeido[];
  /** Completados de las clientas encontradas (deuda y última visita). */
  completados: readonly CompletadoLeido[];
  /** Un id de clienta por cada faltazo (NO_SHOW). */
  faltazos: readonly string[];
  /** Cobros por turno (`cobrosDetalladosPorTurno`): seña cobrada y saldo. */
  cobros: ReadonlyMap<string, readonly CobroTurno[]>;
}

// ── Orden ────────────────────────────────────────────────────────────────────

/**
 * Las clientas en el orden de la paleta: por el nombre (empieza con → palabra que empieza con →
 * contiene) y, después de todas ésas, las que coinciden sólo por el teléfono. Desempata el nombre.
 */
export function ordenarClientas<T extends ClientaLeida>(filas: readonly T[], b: Ok): T[] {
  const q = normalizarBusqueda(b.texto);
  const rango = (c: T): number | null => {
    const r = rangoCoincidencia({ href: "", label: c.nombre }, q);
    if (r !== null) return r;
    const tel = c.telefono.replace(/\D/g, "");
    return c.telefono.includes(b.texto) || (b.digitos && b.digitos.length >= 3 && tel.includes(b.digitos)) ? 4 : null;
  };
  return filas
    .map((f) => ({ f, r: rango(f) }))
    .filter((x): x is { f: T; r: number } => x.r !== null)
    .sort((a, b2) => a.r - b2.r || a.f.nombre.localeCompare(b2.f.nombre, "es"))
    .map((x) => x.f)
    .slice(0, LIMITE_CLIENTAS);
}

// ── Plata, con las reglas de la agenda ───────────────────────────────────────

const cobrosDe = (l: Pick<LecturaDelBuscador, "cobros">, id: string) => l.cobros.get(id) ?? [];

/**
 * La seña que falta cobrar de un turno que viene: Reservado, con seña en el catálogo y sin nada
 * cobrado todavía (la misma condición con la que `cobroSugerido` propone la seña). 0 si no.
 */
export function seniaPendiente(t: Pick<TurnoLeido, "estado" | "precio" | "depositAmount" | "pagoLegado">, cobros: readonly CobroTurno[]): number {
  if (t.estado !== "PENDING") return 0;
  const senia = seniaDelServicio({ depositAmount: t.depositAmount, precio: t.precio });
  if (senia <= 0) return 0;
  return estadoCobroTurno({ precio: t.precio, cobros, pagoLegado: t.pagoLegado }).cobrado > 0 ? 0 : senia;
}

export interface DeudaDeClienta {
  monto: number;
  /** Los turnos con saldo (para «Cobrar lo que debe»), del más viejo al más nuevo. */
  turnoIds: string[];
  /** El día del turno con saldo más viejo (AAAA-MM-DD): hasta dónde ir para atrás en la Lista. */
  desde: string | null;
}

/** Lo que debe: Σ saldo de sus turnos ya prestados (`esCuentaACobrar`, la regla de «Saldos a cobrar»). */
export function deudaDe(completados: readonly CompletadoLeido[], cobros: ReadonlyMap<string, readonly CobroTurno[]>): DeudaDeClienta {
  const conSaldo = completados
    .map((c) => ({ c, saldo: estadoCobroTurno({ precio: c.precio, cobros: cobros.get(c.id) ?? [], pagoLegado: c.pagoLegado }).saldo }))
    .filter((x) => esCuentaACobrar({ status: "COMPLETED", saldo: x.saldo }))
    .sort((a, b) => a.c.inicio.getTime() - b.c.inicio.getTime());
  const monto = Math.round(conSaldo.reduce((n, x) => n + x.saldo, 0) * 100) / 100;
  return { monto, turnoIds: conSaldo.map((x) => x.c.id), desde: conSaldo.length > 0 ? dateStrInBusinessTz(conSaldo[0].c.inicio) : null };
}

// ── Cómo se dice ─────────────────────────────────────────────────────────────

const DIA_CORTO = new Intl.DateTimeFormat("es-AR", { timeZone: BUSINESS_TIMEZONE, weekday: "short", day: "numeric" });
const DIA_Y_MES = new Intl.DateTimeFormat("es-AR", { timeZone: BUSINESS_TIMEZONE, day: "numeric", month: "short" });

/** «hoy 16:00», «mañana 10:30», «jue 24 16:00». */
export function cuandoEs(inicio: Date, ahora: Date): string {
  const dia = dateStrInBusinessTz(inicio);
  const hoy = dateStrInBusinessTz(ahora);
  const manana = dateStrInBusinessTz(new Date(ahora.getTime() + 86_400_000));
  const fecha = dia === hoy ? "hoy" : dia === manana ? "mañana" : DIA_CORTO.format(inicio).replace(".", "").replace(",", "");
  return `${fecha} ${fmtTime(inicio)}`;
}

/** «20 sep.» → «20 sep», o «hoy». */
function diaCorto(inicio: Date, ahora: Date): string {
  return dateStrInBusinessTz(inicio) === dateStrInBusinessTz(ahora) ? "hoy" : DIA_Y_MES.format(inicio).replace(".", "");
}

const pesos = (n: number) => fmtMoneyARS(n, 0);
const faltazosEnPalabras = (n: number) => (n === 1 ? "1 faltazo" : `${n} faltazos`);
const estadoEnPalabras = (estado: string) => (estado === "CONFIRMED" ? "Confirmado" : "Reservado");

/**
 * El saludo de WhatsApp desde el buscador. TODO(2-A): reemplazar por el texto de
 * src/lib/turnos/mensajes-whatsapp.ts al integrar la Tanda 2 (hoy ese archivo no existe en esta
 * rama). Sin «undefined» ni montos: un saludo con el nombre de pila (CH-050).
 */
export function saludoDeWhatsApp(nombre: string): string {
  const pila = nombre.trim().split(/\s+/)[0] ?? "";
  return pila ? `¡Hola ${pila}!` : "¡Hola!";
}

// ── Los enlaces (los mismos que ya existen) ─────────────────────────────────

/** El alta con la clienta elegida: lo mismo que `hrefNuevoTurno(null, id)` (turnos/pasos.ts). */
export const hrefDarTurno = (clienteId: string) => `/admin/turnos/lista?nuevo=1&cliente=${encodeURIComponent(clienteId)}`;
export const hrefFicha = (clienteId: string) => `/admin/clientes/${encodeURIComponent(clienteId)}`;
/**
 * El turno en la agenda de su día. Con el diseño nuevo, `?turno=` abre el cajón (MesaDeTurnos);
 * apagado, la agenda de ese día. TODO(2-C): cuando la grilla abra el cajón (CH-030), lo abre ahí.
 */
export const hrefTurno = (turnoId: string, dia: string) => `/admin/turnos?date=${dia}&turno=${encodeURIComponent(turnoId)}`;
/**
 * Hasta que exista `cobrarVariosTurnos` (2-B): «Saldos a cobrar» de «Todos los turnos», yendo
 * para atrás hasta el turno con saldo más viejo (la lista ignora un `desde` dentro de sus 90 días).
 */
export const hrefSaldos = (desde: string | null) => (desde ? `/admin/turnos/lista?desde=${desde}` : "/admin/turnos/lista");

// ── Lo que se pinta ──────────────────────────────────────────────────────────

function renglonDeTurno(t: TurnoLeido, l: LecturaDelBuscador, p: PermisosDelBuscador, ahora: Date): Comando {
  const dia = dateStrInBusinessTz(t.inicio);
  const senia = seniaPendiente(t, cobrosDe(l, t.id));
  const teclas: TeclaDeFicha[] = [{ id: "abrir-turno", etiqueta: "Abrir el turno", href: hrefTurno(t.id, dia) }];
  if (p.verClientas) teclas.push({ id: "ver-ficha", etiqueta: "Ver ficha", href: hrefFicha(t.clienteId) });
  const huecos: HuecoDeFicha[] = senia > 0 && p.cobrar && t.cobrable ? [{ tipo: "llego-la-senia", turnoId: t.id, monto: senia }] : [];
  const resumen = [`${cuandoEs(t.inicio, ahora)} · ${t.servicio} con ${t.profesional}`, estadoEnPalabras(t.estado)];
  if (senia > 0) resumen.push(`Seña de ${pesos(senia)} sin cobrar`);
  return {
    id: `turno-${t.id}`,
    grupo: "turnos",
    nombre: `${t.clienta} · ${cuandoEs(t.inicio, ahora)}`,
    segunda: [t.servicio, t.profesional, estadoEnPalabras(t.estado), senia > 0 ? `seña ${pesos(senia)} sin cobrar` : null].filter(Boolean).join(" · "),
    href: teclas[0].href,
    resumen,
    teclas,
    ...(huecos.length > 0 ? { huecos } : {}),
  };
}

function renglonDeClienta(c: ClientaLeida, l: LecturaDelBuscador, p: PermisosDelBuscador, ahora: Date): Comando {
  const proximo = l.proximos.filter((t) => t.clienteId === c.id).sort((a, b) => a.inicio.getTime() - b.inicio.getTime())[0] ?? null;
  const completados = l.completados.filter((t) => t.clienteId === c.id);
  const deuda = deudaDe(completados, l.cobros);
  const faltazos = l.faltazos.filter((id) => id === c.id).length;
  const ultima = completados.reduce<Date | null>((u, t) => (!u || t.inicio > u ? t.inicio : u), null);
  const senia = proximo ? seniaPendiente(proximo, cobrosDe(l, proximo.id)) : 0;

  const resumen: string[] = [
    proximo ? `Próximo turno: ${cuandoEs(proximo.inicio, ahora)} · ${proximo.servicio} con ${proximo.profesional}` : "Sin turnos por venir",
  ];
  if (senia > 0) resumen.push(`Seña de ${pesos(senia)} sin cobrar`);
  if (deuda.monto > 0) resumen.push(`Debe ${pesos(deuda.monto)}`);
  if (faltazos > 0) resumen.push(faltazosEnPalabras(faltazos));
  resumen.push(ultima ? `Última vez: ${diaCorto(ultima, ahora)}` : "Todavía no vino");

  const teclas: TeclaDeFicha[] = [];
  if (p.darTurno) teclas.push({ id: "dar-turno", etiqueta: "Dar turno", href: hrefDarTurno(c.id) });
  const wa = waLinkClienta(c.telefono, saludoDeWhatsApp(c.nombre));
  if (wa) teclas.push({ id: "whatsapp", etiqueta: "WhatsApp", href: wa, externo: true });
  // El enlace de respaldo a «Saldos a cobrar»: sólo a quien cobra (sin agenda:collect no puede).
  if (deuda.monto > 0 && p.cobrar) teclas.push({ id: "cobrar-deuda", etiqueta: `Cobrar lo que debe (${pesos(deuda.monto)})`, href: hrefSaldos(deuda.desde) });
  teclas.push({ id: "ver-ficha", etiqueta: "Ver ficha", href: hrefFicha(c.id) });

  const huecos: HuecoDeFicha[] = [];
  if (deuda.monto > 0 && p.cobrar) huecos.push({ tipo: "cobrar-deuda", clienteId: c.id, monto: deuda.monto, turnoIds: deuda.turnoIds });
  if (proximo && senia > 0 && p.cobrar && proximo.cobrable) huecos.push({ tipo: "llego-la-senia", turnoId: proximo.id, monto: senia });

  const segunda = [
    c.telefono.trim() || "Sin teléfono",
    proximo ? `turno ${cuandoEs(proximo.inicio, ahora)}` : null,
    deuda.monto > 0 ? `debe ${pesos(deuda.monto)}` : null,
    faltazos > 0 ? faltazosEnPalabras(faltazos) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    id: `clienta-${c.id}`,
    grupo: "clientas",
    nombre: c.nombre,
    segunda,
    href: teclas[0].href,
    resumen,
    teclas,
    ...(huecos.length > 0 ? { huecos } : {}),
  };
}

/**
 * Los grupos que devuelve el servidor: clientas (si las puede ver) y turnos que vienen. Un grupo
 * vacío no se manda. `lectura.clientas` llega ya ordenada y cortada (`ordenarClientas`).
 */
export function armarFichas(l: LecturaDelBuscador, p: PermisosDelBuscador, ahora: Date): GrupoDeFichas[] {
  const clientas = p.verClientas ? l.clientas.map((c) => renglonDeClienta(c, l, p, ahora)) : [];
  const turnos = [...l.proximos]
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
    .slice(0, LIMITE_TURNOS)
    .map((t) => renglonDeTurno(t, l, p, ahora));
  const grupos: GrupoDeFichas[] = [
    { grupo: "clientas", nombre: "Clientes", items: clientas },
    { grupo: "turnos", nombre: "Turnos", items: turnos },
  ];
  return grupos.filter((g) => g.items.length > 0);
}
