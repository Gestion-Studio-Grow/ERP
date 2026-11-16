// CRM COMERCIAL · lo que deciden las pantallas, sin base ni DOM (GSG-CRM-011).
//
// Qué botón ve cada uno (Dirección, comercial, puesto), el orden de «Hoy» y las columnas del embudo. Se usa
// SÓLO en componentes de servidor: importa motor.ts (que usa node:crypto). A los componentes de cliente les
// llega el resultado ya armado (tipos con `import type`). Esconder un botón no protege nada: el servidor
// vuelve a comprobar el permiso con el contexto real de la oportunidad (repo.ts → permisos.ts).

import {
  ETAPAS,
  ETIQUETA_ETAPA,
  ETIQUETA_PUESTO_CRM,
  ETIQUETA_TAREA,
  etiquetaTarea,
  MOTIVOS,
  MOTIVOS_DORMIDA,
  esTerminal,
  pasesPosibles,
  type EntradaHoy,
  type Etapa,
} from "@/lib/crm-comercial/motor";
import { sumarAlCentavo } from "@/lib/dinero/redondeo";
import { puede, type ContextoOportunidad, type Miembro, type Operacion, type Puesto, type Rol } from "@/lib/crm-comercial/permisos";
import { PUESTOS } from "@/lib/crm-comercial/permisos";
import type { UsuarioYMiembro } from "@/lib/crm-comercial/repo";

export const ETIQUETA_ROL: Record<Rol, string> = { DIRECCION: "Dirección", COMERCIAL: "Comercial", PUESTO: "Puesto del equipo" };
export const ETIQUETA_PUESTO = ETIQUETA_PUESTO_CRM as Record<Puesto, string>;

/** «Dirección», «Comercial» o «Verificador (puesto del equipo)». */
export function quienEs(m: Pick<Miembro, "rol" | "puesto">): string {
  if (m.rol === "PUESTO") return `${m.puesto ? ETIQUETA_PUESTO[m.puesto] : "Puesto"} (puesto del equipo)`;
  return ETIQUETA_ROL[m.rol];
}

// ── Miembros del CRM (sólo Dirección; el servidor decide con «configurar») ─

/** El papel de un usuario en el CRM, en criollo: «Sin acceso», «Comercial», «Redactor (puesto del equipo) · dado de baja». */
export function papelEnCrm(m: UsuarioYMiembro["miembro"]): string {
  if (!m) return "Sin acceso";
  return m.activo ? quienEs(m) : `${quienEs(m)} · dado de baja`;
}

/** Los puestos para elegir. El Buscador de contactos se puede asignar, pero está apagado en esta versión. */
export function opcionesDePuesto(): { valor: Puesto; etiqueta: string }[] {
  return PUESTOS.map((p) => ({ valor: p, etiqueta: p === "contactos" ? `${ETIQUETA_PUESTO[p]} (apagado en esta versión)` : ETIQUETA_PUESTO[p] }));
}

/** Orden de la lista: con acceso primero (Dirección, Comercial, puestos), después dados de baja y sin acceso; por nombre. */
export function ordenarUsuarios<U extends Pick<UsuarioYMiembro, "nombre" | "miembro">>(us: readonly U[]): U[] {
  const peso = (u: U) => (!u.miembro ? 9 : !u.miembro.activo ? 8 : u.miembro.rol === "DIRECCION" ? 0 : u.miembro.rol === "COMERCIAL" ? 1 : 2);
  return [...us].sort((a, b) => peso(a) - peso(b) || a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * El alcance de algo que la persona YA ve: las listas vienen filtradas por el servidor (`filtroVisible`), así
 * que para decidir qué botones mostrar alcanza con el rol y el puesto. El servidor usa el contexto real.
 */
export function alcanceVisto(m: Miembro, o: { tipo: string; duenoUserId: string | null }): ContextoOportunidad {
  return { duenoUserId: m.rol === "COMERCIAL" ? (o.duenoUserId ?? null) : o.duenoUserId, creadaPor: m.userId, tipo: o.tipo, tomadoresEnCurso: [m.userId] };
}

/** ¿Le muestro el botón? (Sobre algo que ya ve.) */
export function puedeEn(m: Miembro | null, op: Operacion, o?: { tipo: string; duenoUserId: string | null }, etapaDestino?: Etapa): boolean {
  if (!m) return false;
  return puede(m, op, { ...(o ? { oportunidad: alcanceVisto(m, o) } : {}), ...(etapaDestino ? { etapaDestino } : {}) }).ok;
}

export type Pide = "motivo" | "despertarEl" | "comercial";
export interface OpcionPase {
  destino: Etapa;
  etiqueta: string;
  /** «aplicar»: la persona lo hace; «proponer»: queda para que lo apruebe Dirección. */
  modo: "aplicar" | "proponer";
  /** Lo que el formulario tiene que pedir (el resto de la evidencia la mira el servidor en la base). */
  pide: Pide[];
  /** Motivos del catálogo que valen para este pase. */
  motivos: { valor: string; etiqueta: string }[];
}

const MOTIVOS_TODOS = Object.entries(MOTIVOS).map(([valor, etiqueta]) => ({ valor, etiqueta }));
const MOTIVOS_DE_DORMIDA = MOTIVOS_TODOS.filter((m) => (MOTIVOS_DORMIDA as readonly string[]).includes(m.valor));

/**
 * A qué etapas puede mover (o proponer) esta persona la oportunidad, y qué tiene que cargar en el formulario.
 * Sin GANADA (la pone el proyecto) y sin pases desde ASIGNADA (se cierra desde el proyecto, diseño §2). Con un
 * pase ya propuesto no se ofrece otro: primero se decide ese.
 */
export function opcionesDePase(m: Miembro | null, o: { etapa: string; tipo: string; duenoUserId: string | null; pasePropuesto?: string | null }): OpcionPase[] {
  if (!m || !(ETAPAS as readonly string[]).includes(o.etapa)) return [];
  const etapa = o.etapa as Etapa;
  if (esTerminal(etapa) || etapa === "ASIGNADA") return [];
  const out: OpcionPase[] = [];
  for (const destino of pasesPosibles(etapa)) {
    if (destino === "GANADA") continue;
    if (o.tipo === "CONSULTA" && ["VERIFICADA", "SIN_CONTACTO", "CONTACTADA", "DETECTADA"].includes(destino)) continue;
    const modo = puedeEn(m, "aplicar_pase", o, destino) ? "aplicar" : puedeEn(m, "proponer_pase", o, destino) ? "proponer" : null;
    if (!modo) continue;
    if (modo === "proponer" && o.pasePropuesto) continue;
    const pide: Pide[] = [];
    let motivos: OpcionPase["motivos"] = [];
    if (destino === "DORMIDA") {
      pide.push("motivo", "despertarEl");
      motivos = MOTIVOS_DE_DORMIDA;
    }
    if (destino === "PERDIDA" || destino === "DESCARTADA") {
      pide.push("motivo");
      motivos = MOTIVOS_TODOS;
    }
    if (destino === "ASIGNADA" && modo === "aplicar") pide.push("comercial");
    out.push({ destino, etiqueta: ETIQUETA_ETAPA[destino], modo, pide, motivos });
  }
  return out;
}

// ── Embudo ──────────────────────────────────────────────────────────────────

/** Las columnas abiertas, en el orden del ciclo (prospecto arriba, consulta, después lo común). */
export const COLUMNAS: readonly Etapa[] = ["DETECTADA", "VERIFICADA", "SIN_CONTACTO", "CONTACTADA", "RECIBIDA", "EN_CONVERSACION", "FALTAN_DATOS", "CALIFICADA", "ASIGNADA", "DORMIDA"];
export const CERRADAS: readonly Etapa[] = ["GANADA", "PERDIDA", "DESCARTADA", "DERIVADA_AL_TALLER"];

export interface Ponderado {
  ARS: number;
  USD: number;
  /** Cuántas tarjetas no tienen monto (no suman: falta el dato, no es cero). */
  sinMonto: number;
}

export function ponderadoDe(filas: readonly { moneda: string; montoPonderado: number | null }[]): Ponderado {
  const con = filas.filter((f): f is { moneda: string; montoPonderado: number } => f.montoPonderado != null);
  return {
    ARS: sumarAlCentavo(con.filter((f) => f.moneda !== "USD").map((f) => f.montoPonderado)),
    USD: sumarAlCentavo(con.filter((f) => f.moneda === "USD").map((f) => f.montoPonderado)),
    sinMonto: filas.length - con.length,
  };
}

const PLATA = { ARS: new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }), USD: new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) };
export function plata(monto: number, moneda: string): string {
  return (moneda === "USD" ? PLATA.USD : PLATA.ARS).format(monto);
}
export function textoPonderado(p: Ponderado): string {
  const partes = [p.ARS > 0 ? plata(p.ARS, "ARS") : null, p.USD > 0 ? plata(p.USD, "USD") : null].filter(Boolean);
  return partes.length ? partes.join(" + ") : "Sin montos";
}

const DIA = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });
const HORA = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
export const dia = (d: Date | string | null | undefined): string => (d ? DIA.format(new Date(d)) : "—");
export const diaYHora = (d: Date | string | null | undefined): string => (d ? HORA.format(new Date(d)) : "—");
/** AAAA-MM-DD para un <input type="date">, en hora argentina. */
export function paraInputFecha(d: Date | string | null | undefined): string {
  if (!d) return "";
  const x = new Date(new Date(d).getTime() - 3 * 3_600_000);
  return x.toISOString().slice(0, 10);
}

/** Mañana en AAAA-MM-DD (para proponer la fecha del primer próximo paso). */
export const fechaDeManana = (): string => paraInputFecha(new Date(Date.now() + 86_400_000));

// ── Hoy ─────────────────────────────────────────────────────────────────────

export interface FilaParaHoy {
  id: string;
  tipo: string;
  etapa: string;
  marca: string | null;
  evento: string | null;
  duenoUserId: string | null;
  pasePropuesto: string | null;
  proximoPaso: string | null;
  proximoPasoEl: Date | null;
  version: number;
}
export interface BorradorParaHoy {
  id: string;
  oportunidadId: string;
  canal: string;
  estado: string;
  createdAt: Date;
  marca: string | null;
  evento: string | null;
}
export interface TareaParaHoy {
  id: string;
  oportunidadId: string;
  tipo: string;
  venceEl: Date | null;
  createdAt: Date;
}
export interface PedidoParaHoy {
  id: string;
  pedido: string;
  region: string | null;
}

export type AccionHoy =
  | { tipo: "aprobar_pase"; oportunidadId: string; version: number; destino: string; necesitaFicha: boolean }
  | { tipo: "rechazar_pase"; oportunidadId: string }
  | { tipo: "aprobar_borrador"; borradorId: string }
  | { tipo: "ir_a_borradores" }
  | { tipo: "pedido_de_datos"; oportunidadId: string }
  | { tipo: "tomar_tarea"; tareaId: string }
  | { tipo: "cerrar_tarea"; tareaId: string; aviso: string | null }
  | { tipo: "tomar_pedido"; pedidoId: string }
  | { tipo: "cerrar_pedido"; pedidoId: string };

export interface ItemBandeja {
  clave: string;
  urgencia: number;
  titulo: string;
  por: string[];
  href: string | null;
  acciones: AccionHoy[];
}

const nombreDe = (x: { marca: string | null; evento: string | null }, tipo?: string) =>
  [x.marca ?? (tipo === "CONSULTA" ? "Consulta sin marca" : "Sin marca"), x.evento].filter(Boolean).join(" · ");
const DIA_MS = 86_400_000;
export { etiquetaTarea };
export const TIPOS_DE_TAREA = Object.keys(ETIQUETA_TAREA);

/**
 * Qué se le avisa a quien toca «Marcar hecha». Un puesto sólo ve lo que creó o lo que tiene en curso: al cerrar
 * la tarea pierde la ficha. Si es la verificación y la oportunidad sigue en «Detectada», queda sin verificar.
 * Una persona no pierde nada: sin aviso.
 */
export function avisoAlCerrarTarea(m: Pick<Miembro, "rol">, tipoTarea: string, etapa: string | null): string | null {
  if (m.rol !== "PUESTO") return null;
  if (tipoTarea === "VERIFICAR" && etapa === "DETECTADA") {
    return "La oportunidad sigue sin verificar. Si marcás la tarea como hecha, sale de tu cola, dejás de ver la ficha y nadie la verifica. Primero cargá la verificación de la marca y del evento en la ficha y pasala a «Verificada». ¿La marcás hecha igual?";
  }
  return "Al marcarla hecha dejás de ver esta oportunidad (un puesto ve sólo lo que tiene en curso). ¿Seguro?";
}

/**
 * «Hoy»: todo lo que pide una acción, en UNA lista, lo más urgente arriba. Las razones de la oportunidad las
 * pone el motor (`bandejaHoy`); acá se suman los borradores, los datos que faltan y la cola de cada uno, y la
 * acción en un toque que le toca a esta persona (las que no le tocan no aparecen).
 */
export function armarBandeja(d: {
  miembro: Miembro;
  entradas: readonly EntradaHoy[];
  filas: readonly FilaParaHoy[];
  borradores: readonly BorradorParaHoy[];
  enCola: readonly TareaParaHoy[];
  enCurso: readonly TareaParaHoy[];
  pedidosEnCola: readonly PedidoParaHoy[];
  pedidosEnCurso: readonly PedidoParaHoy[];
  ahora: Date;
}): ItemBandeja[] {
  const m = d.miembro;
  const porId = new Map(d.filas.map((f) => [f.id, f]));
  const items = new Map<string, ItemBandeja>();
  const deOportunidad = (f: FilaParaHoy): ItemBandeja => {
    const clave = `op-${f.id}`;
    let it = items.get(clave);
    if (!it) {
      it = { clave, urgencia: 0, titulo: nombreDe(f, f.tipo), por: [], href: `/admin/crm/${f.id}`, acciones: [] };
      items.set(clave, it);
    }
    return it;
  };

  for (const e of d.entradas) {
    const f = porId.get(e.id);
    if (!f) continue;
    const it = deOportunidad(f);
    it.urgencia += e.urgencia;
    it.por.push(...e.por);
    if (f.pasePropuesto && (ETAPAS as readonly string[]).includes(f.pasePropuesto) && puedeEn(m, "aplicar_pase", f, f.pasePropuesto as Etapa)) {
      it.acciones.push({ tipo: "aprobar_pase", oportunidadId: f.id, version: f.version, destino: ETIQUETA_ETAPA[f.pasePropuesto as Etapa], necesitaFicha: f.pasePropuesto === "ASIGNADA" });
      it.acciones.push({ tipo: "rechazar_pase", oportunidadId: f.id });
    }
  }
  for (const f of d.filas) {
    if (f.etapa !== "FALTAN_DATOS") continue;
    const it = deOportunidad(f);
    it.urgencia += 25;
    it.por.push("Faltan datos del brief: pedilos y registrá el pedido");
    if (puedeEn(m, "marcar_faltantes", f)) it.acciones.push({ tipo: "pedido_de_datos", oportunidadId: f.id });
  }

  for (const b of d.borradores) {
    const dias = Math.max(0, Math.floor((d.ahora.getTime() - new Date(b.createdAt).getTime()) / DIA_MS));
    const canal = b.canal === "WHATSAPP" ? "WhatsApp" : "mail";
    const espera = dias === 0 ? "de hoy" : dias === 1 ? "espera hace 1 día" : `espera hace ${dias} días`;
    if (b.estado === "BORRADOR") {
      const acciones: AccionHoy[] = puedeEn(m, "aprobar_borrador", { tipo: "PROSPECTO", duenoUserId: m.userId }) ? [{ tipo: "aprobar_borrador", borradorId: b.id }, { tipo: "ir_a_borradores" }] : [];
      items.set(`bo-${b.id}`, { clave: `bo-${b.id}`, urgencia: 45 + Math.min(dias, 10) * 5, titulo: nombreDe(b), por: [`Borrador de ${canal} por aprobar (${espera})`], href: `/admin/crm/${b.oportunidadId}#borradores`, acciones });
    } else if (b.estado === "APROBADO") {
      const acciones: AccionHoy[] = puedeEn(m, "marcar_enviado", { tipo: "PROSPECTO", duenoUserId: m.userId }) ? [{ tipo: "ir_a_borradores" }] : [];
      items.set(`bo-${b.id}`, { clave: `bo-${b.id}`, urgencia: 35 + Math.min(dias, 10) * 5, titulo: nombreDe(b), por: [`Borrador de ${canal} aprobado: falta mandarlo y marcarlo como enviado`], href: `/admin/crm/${b.oportunidadId}#borradores`, acciones });
    }
  }

  for (const t of d.enCurso) {
    const f = porId.get(t.oportunidadId);
    const aviso = avisoAlCerrarTarea(m, t.tipo, f?.etapa ?? null);
    items.set(`ta-${t.id}`, { clave: `ta-${t.id}`, urgencia: 55, titulo: f ? nombreDe(f, f.tipo) : "Tarea tomada", por: [`Tenés en curso: ${etiquetaTarea(t.tipo)}`], href: `/admin/crm/${t.oportunidadId}`, acciones: [{ tipo: "cerrar_tarea", tareaId: t.id, aviso }] });
  }
  for (const t of d.enCola) {
    const vencida = t.venceEl ? new Date(t.venceEl).getTime() < d.ahora.getTime() : false;
    items.set(`ta-${t.id}`, {
      clave: `ta-${t.id}`,
      urgencia: vencida ? 50 : 30,
      titulo: `En tu cola: ${etiquetaTarea(t.tipo)}`,
      por: [t.venceEl ? (vencida ? `Venció el ${dia(t.venceEl)}` : `Vence el ${dia(t.venceEl)}`) : "Sin fecha de vencimiento"],
      href: null,
      acciones: [{ tipo: "tomar_tarea", tareaId: t.id }],
    });
  }
  for (const p of d.pedidosEnCurso) {
    items.set(`pe-${p.id}`, { clave: `pe-${p.id}`, urgencia: 40, titulo: "Pedido al equipo en curso", por: [p.pedido + (p.region ? ` (${p.region})` : "")], href: null, acciones: [{ tipo: "cerrar_pedido", pedidoId: p.id }] });
  }
  for (const p of d.pedidosEnCola) {
    items.set(`pe-${p.id}`, { clave: `pe-${p.id}`, urgencia: 20, titulo: "Pedido al equipo en cola", por: [p.pedido + (p.region ? ` (${p.region})` : "")], href: null, acciones: [{ tipo: "tomar_pedido", pedidoId: p.id }] });
  }

  return [...items.values()].sort((a, b) => b.urgencia - a.urgencia || a.clave.localeCompare(b.clave));
}
