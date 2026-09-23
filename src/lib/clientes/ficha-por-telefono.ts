// ============================================================================
// UNA CLIENTA, UNA FICHA — buscar la ficha por teléfono al dar un turno.
// ============================================================================
//
// Los cuatro caminos que crean turnos (reserva web, modal de reserva, alta manual y lista de
// espera) buscaban la clienta con `findFirst({ where: { phone } })`: match EXACTO sobre lo
// tipeado. "11 4000-7919" y "1140007919" daban dos fichas, con el historial y el "total
// gastado" partidos entre las dos. `normalizarTelefono` ya existía, pero sólo lo usaba la
// edición de la ficha.
//
// Por qué se traen las fichas y se compara EN MEMORIA, y no un `endsWith` en SQL: lo que se
// guarda en `Client.phone` es lo que se tipeó ("11 4000-7919" termina en "000-7919", no en
// "40007919"), así que cualquier sufijo de dígitos falla contra lo ya guardado. Sin columna
// normalizada no hay índice por el cual buscar; es un SELECT de (id, phone) del tenant —miles
// de filas, no millones—, el mismo que ya hace `updateClient` (client-actions.ts). El arreglo
// de fondo, si algún día pesa, es una columna `phoneKey` con migración, no un sufijo.
//
// Si el tenant YA tiene dos fichas con el mismo número (los duplicados de antes de esto), gana
// la de más turnos —la que la recepción viene usando— y el empate se devuelve para que el
// llamador lo deje en la auditoría. Unificar esas fichas es otra decisión (con la dueña) y no
// se hace acá.
//
// Sin "use server" y sin imports de valor de Prisma: `buscarFichaPorTelefono` recibe el
// `tenantId` por parámetro, así que NO puede ser un endpoint; la llaman las actions, que ya
// resolvieron el tenant con su guarda. Y el formulario de alta (componente cliente) importa
// de acá `fichaParaTelefono`, `detalleFicha` y la precarga (`alCambiarTelefono`,
// `alElegirFicha`).

import { normalizarTelefono } from "./telefono";
import { esCuentaACobrar, estadoCobroTurno, type CobroTurno, type PagoLegado } from "@/lib/turnos/cobros";
import { fmtShortDate } from "@/lib/datetime";

// ── La decisión, pura ─────────────────────────────────────────────────────────

/** Las fichas cuyo teléfono es el MISMO número que `phone`, escrito como sea. */
export function fichasDelTelefono<T extends { phone: string | null }>(fichas: readonly T[], phone: string | null | undefined): T[] {
  const clave = normalizarTelefono(phone);
  if (!clave) return [];
  return fichas.filter((f) => normalizarTelefono(f.phone) === clave);
}

type Candidata = { id: string; turnos: number; createdAt?: Date | string | null };

/**
 * Entre varias fichas del mismo número, la que se usa: la de MÁS turnos (es la que la
 * recepción viene usando y la que tiene el historial). Si empatan en turnos, la más vieja;
 * si tampoco se distinguen, el id menor — para que la elección no dependa del orden en que
 * la base devolvió las filas.
 */
export function elegirFicha<T extends Candidata>(candidatas: readonly T[]): T | null {
  if (candidatas.length === 0) return null;
  const ts = (c: Candidata) => (c.createdAt ? new Date(c.createdAt).getTime() : Number.POSITIVE_INFINITY);
  return [...candidatas].sort(
    (a, b) => b.turnos - a.turnos || ts(a) - ts(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )[0];
}

export type EmpateFichas = {
  clave: string;
  elegida: string;
  candidatas: { id: string; turnos: number }[];
};

export type FichaEncontrada = { id: string; empate: EmpateFichas | null };

/** La fila de auditoría de un empate: qué fichas comparten número y cuál se usó. */
export function entradaAuditoriaEmpate(e: EmpateFichas) {
  return {
    action: "client_phone_tie",
    entity: "Client",
    entityId: e.elegida,
    changes: { clave: e.clave, elegida: e.elegida, candidatas: e.candidatas },
  };
}

// ── La búsqueda contra la base ────────────────────────────────────────────────

// Lo mínimo que se necesita de un cliente de Prisma (el `prisma` con candado de tenant o el
// `tx` de una transacción). Estructural, para no importar Prisma y para poder probar la
// búsqueda con una base de mentira que EJECUTA la decisión.
type FilaFicha = { id: string; phone?: string | null; createdAt?: Date; _count?: { appointments: number } };
export interface LectorFichas {
  client: {
    findMany(args: {
      where: { tenantId: string; id?: { in: string[] } };
      select:
        | { id: true; phone: true }
        | { id: true; createdAt: true; _count: { select: { appointments: true } } };
    }): Promise<FilaFicha[]>;
  };
}

/**
 * La ficha del tenant que corresponde a `phone`, o `null` si no hay ninguna.
 *
 * El `tenantId` va explícito en el `where` además del candado de RLS/extensión, igual que
 * el resto de las lecturas de alta (defensa en profundidad: la lista de espera corre sobre
 * un `tx` crudo).
 */
export async function buscarFichaPorTelefono(
  db: LectorFichas,
  tenantId: string,
  phone: string | null | undefined,
): Promise<FichaEncontrada | null> {
  const clave = normalizarTelefono(phone);
  if (!clave) return null;

  const todas = await db.client.findMany({ where: { tenantId }, select: { id: true, phone: true } });
  const coinciden = fichasDelTelefono(
    todas.map((f) => ({ id: f.id, phone: f.phone ?? null })),
    phone,
  );
  if (coinciden.length === 0) return null;
  if (coinciden.length === 1) return { id: coinciden[0].id, empate: null };

  // Empate: recién acá se cuentan turnos, y sólo de las que coinciden.
  const conTurnos = await db.client.findMany({
    where: { tenantId, id: { in: coinciden.map((c) => c.id) } },
    select: { id: true, createdAt: true, _count: { select: { appointments: true } } },
  });
  const candidatas = conTurnos.map((f) => ({ id: f.id, turnos: f._count?.appointments ?? 0, createdAt: f.createdAt ?? null }));
  const elegida = elegirFicha(candidatas);
  if (!elegida) return null;
  return {
    id: elegida.id,
    empate: {
      clave,
      elegida: elegida.id,
      candidatas: candidatas.map((c) => ({ id: c.id, turnos: c.turnos })),
    },
  };
}

// ── Lo que ve la recepción al dar el turno ────────────────────────────────────

/** Una ficha tal como la muestra el alta: sin nada que el formulario no use. */
export type FichaParaAlta = {
  id: string;
  nombre: string;
  telefono: string;
  notas: string | null;
  vecina: boolean | null;
  turnos: number;
  /** Alta de la ficha (ISO): desempata igual que el servidor cuando dos fichas comparten número. */
  creada: string;
  ultimaVisita: { fecha: string; servicio: string; profesional: string } | null;
  /** Saldo de turnos ya prestados sin terminar de cobrar (0 si no debe nada). */
  saldo: number;
};

// Las notas viajan al navegador en cada carga de la agenda, una por clienta: se recortan para
// que una ficha con una historia clínica pegada no infle la página. La ficha completa está a
// un clic, en Clientes.
//
// PESO, medido con datos sintéticos (JSON.stringify de `resumirFichasParaAlta`, sin base
// real): ~295 bytes por ficha sin notas y ~455 con notas al tope → 1.000 fichas son 290-445 KB
// y 2.000 son 575-890 KB, en CADA apertura de /admin/turnos/lista (force-dynamic). Cuántas
// fichas tiene CH no se midió. Si pesa, el paso siguiente es mandar sólo id/nombre/teléfono/
// vecina y traer notas, última visita y saldo de la ficha reconocida a pedido.
const NOTAS_MAX = 160;

type ClienteCrudo = {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  isResident: boolean | null;
  createdAt: Date;
  _count: { appointments: number };
};

type TurnoCompletado = {
  clientId: string;
  status: string;
  startsAt: Date;
  precio: number;
  servicio: string;
  profesional: string;
  cobros: readonly CobroTurno[];
  pagoLegado?: PagoLegado;
};

/**
 * Arma la lista del buscador de "Clienta": por cada ficha, su última visita (el turno
 * COMPLETADO más reciente) y lo que debe (Σ saldo de los completados con saldo, con la MISMA
 * regla que la sección "Saldos a cobrar" de la lista: `esCuentaACobrar`).
 */
export function resumirFichasParaAlta(clientes: readonly ClienteCrudo[], completados: readonly TurnoCompletado[]): FichaParaAlta[] {
  const ultima = new Map<string, TurnoCompletado>();
  const saldo = new Map<string, number>();
  for (const t of completados) {
    const previa = ultima.get(t.clientId);
    if (!previa || t.startsAt.getTime() > previa.startsAt.getTime()) ultima.set(t.clientId, t);
    const plata = estadoCobroTurno({ precio: t.precio, cobros: t.cobros, pagoLegado: t.pagoLegado });
    if (esCuentaACobrar({ status: t.status, saldo: plata.saldo })) {
      saldo.set(t.clientId, (saldo.get(t.clientId) ?? 0) + plata.saldo);
    }
  }
  return clientes.map((c) => {
    const u = ultima.get(c.id);
    const notas = c.notes?.trim() || null;
    return {
      id: c.id,
      nombre: c.name,
      telefono: c.phone,
      notas: notas && notas.length > NOTAS_MAX ? `${notas.slice(0, NOTAS_MAX - 1)}…` : notas,
      vecina: c.isResident,
      turnos: c._count.appointments,
      creada: c.createdAt.toISOString(),
      ultimaVisita: u ? { fecha: u.startsAt.toISOString(), servicio: u.servicio, profesional: u.profesional } : null,
      saldo: saldo.get(c.id) ?? 0,
    };
  });
}

/**
 * La ficha que el alta reconoce para lo tipeado en "Teléfono": misma clave, y si hay más de
 * una, la misma elección que hace el servidor (`elegirFicha`). Así lo que la pantalla dice
 * ("es la ficha de Ana") es lo que después usa `createManualAppointment`.
 */
export function fichaParaTelefono(fichas: readonly FichaParaAlta[], phone: string): FichaParaAlta | null {
  return elegirFicha(fichasDelTelefono(fichas.map((f) => ({ ...f, phone: f.telefono, createdAt: f.creada })), phone));
}

// ── La precarga del alta: qué nombre y qué "de la zona" quedan en el formulario ──
//
// Esto decide PLATA, por eso vive acá y no en el componente: "Cliente de la zona" es lo que
// lee `createManualAppointment` para congelar el precio de vecina (`precioCongeladoDeReserva`)
// y para escribirlo en la ficha. Si la precarga lo tilda desde una ficha y después la ficha
// deja de corresponder —la recepción corrigió el teléfono—, el tilde no puede quedar colgado:
// el servidor crearía una ficha NUEVA con ese nombre y "de la zona", y el turno se congelaría
// con el precio local sin ninguna ficha que lo respalde. Así era la primera versión (lo
// encontró la revisión): el formulario tildaba al reconocer y no destildaba al dejar de
// reconocer.
//
// La regla: lo que la precarga escribió y la persona NO tocó se deshace cuando la ficha deja de
// corresponder; lo que la persona escribió o tildó a mano no se pisa al deshacer. Y
// "corresponder" es la MISMA elección que hace el servidor con ese teléfono
// (`fichaParaTelefono` → `elegirFicha`), así que el tilde precargado es siempre el de la ficha
// en la que el turno va a quedar.

/** Lo que la precarga escribió desde una ficha, y lo que había antes, para poder deshacerlo. */
export type PrecargaFicha = {
  fichaId: string;
  nombre: string;
  vecina: boolean;
  antes: { nombre: string; vecina: boolean };
};

export type DatosClientaAlta = {
  nombre: string;
  telefono: string;
  /** El tilde "Cliente de la zona": decide el precio que se congela. */
  vecina: boolean;
  precarga: PrecargaFicha | null;
};

export const DATOS_CLIENTA_VACIOS: DatosClientaAlta = { nombre: "", telefono: "", vecina: false, precarga: null };

function deshacerPrecarga(d: DatosClientaAlta): DatosClientaAlta {
  const p = d.precarga;
  if (!p) return d;
  return {
    ...d,
    nombre: d.nombre === p.nombre ? p.antes.nombre : d.nombre,
    vecina: d.vecina === p.vecina ? p.antes.vecina : d.vecina,
    precarga: null,
  };
}

function aplicarPrecarga(d: DatosClientaAlta, f: FichaParaAlta, pisarNombre: boolean): DatosClientaAlta {
  const nombre = pisarNombre || !d.nombre.trim() ? f.nombre : d.nombre;
  // `null` en la ficha = no se sabe: el beneficio se otorga, no se presume (la misma lectura
  // que hace `precioCongeladoDeReserva`).
  const vecina = f.vecina === true;
  return { ...d, nombre, vecina, precarga: { fichaId: f.id, nombre, vecina, antes: { nombre: d.nombre, vecina: d.vecina } } };
}

/**
 * La recepción tipeó (o corrigió) el teléfono. Si ahora corresponde a otra ficha, se deshace
 * la precarga anterior y se aplica la nueva: el nombre sólo se completa si estaba vacío (no se
 * pisa lo tipeado) y "de la zona" queda como dice la ficha. Si ya no corresponde a ninguna, se
 * deshace lo que la precarga había puesto.
 */
export function alCambiarTelefono(
  d: DatosClientaAlta,
  telefono: string,
  fichas: readonly FichaParaAlta[],
): DatosClientaAlta {
  const conTelefono = { ...d, telefono };
  const f = telefono ? fichaParaTelefono(fichas, telefono) : null;
  if (f && f.id === d.precarga?.fichaId) return conTelefono;
  const base = deshacerPrecarga(conTelefono);
  return f ? aplicarPrecarga(base, f, false) : base;
}

/**
 * La recepción eligió una clienta en el buscador. Se pone su teléfono y, desde ahí, manda la
 * ficha que el servidor va a usar para ese número —si hay duplicadas, la de más turnos, que
 * puede no ser la elegida—. El nombre sí se pisa: elegirla es decir "es ella".
 */
export function alElegirFicha(
  d: DatosClientaAlta,
  elegida: FichaParaAlta,
  fichas: readonly FichaParaAlta[],
): DatosClientaAlta {
  const base = { ...deshacerPrecarga(d), telefono: elegida.telefono };
  const f = fichaParaTelefono(fichas, elegida.telefono);
  // Una ficha cuyo teléfono no da clave (vacío, sin dígitos) el servidor no la encuentra: va a
  // crear otra. Se completan nombre y teléfono, y "de la zona" queda en manos de la persona.
  if (!f) return { ...base, nombre: elegida.nombre };
  return aplicarPrecarga(base, f, true);
}

/**
 * Segunda línea de cada clienta en el buscador "Clienta" del alta.
 *
 * El filtro del BuscadorCombo compara TEXTO, no teléfonos: con "11 4000-7919" guardado,
 * tipear "1140007919" no la encontraba. Por eso, si lo guardado no es ya la clave, se agrega
 * la clave al lado (sólo dígitos) y se puede buscar tipeando el número de corrido.
 */
export function detalleFicha(f: FichaParaAlta): string {
  const clave = normalizarTelefono(f.telefono);
  const tel = clave && clave !== f.telefono.trim() ? `${f.telefono} · ${clave}` : f.telefono;
  return f.ultimaVisita ? `${tel} · última visita ${fmtShortDate(f.ultimaVisita.fecha)}` : tel;
}
