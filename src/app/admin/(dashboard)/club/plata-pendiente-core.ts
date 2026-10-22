// ============================================================================
// PLATA PENDIENTE — lo que quedó sin resolver de CUALQUIER día, con su botón. PURO (sin DOM ni React).
// ============================================================================
//
// La lista sale entera del motor (`plataPendiente`): devoluciones en mano, faltas de alguien sin ficha, señas que
// vencieron y fiados que esperan (o ya tienen) el OK del dueño. No vence: un ítem sale de la lista recién cuando alguien
// lo resuelve. Acá sólo se traduce cada ítem a lo que hace su botón, y cada botón a un COMANDO de la lista blanca
// (comandos-core.ts) que ya existía: devolver y cobrar la falta (`ciclo`), cobrar la seña (`cuenta`), cobrar la cuenta o
// pasarla a la cuenta corriente (`buffet`). Lo único nuevo es «se fue: que se cierre sola al aprobar» (`plata`).
//
// Lo usan la bandeja de la Agenda, la Caja y la paleta (Ctrl+K). Plata exacta: el monto es el del motor; el cobro lo
// hace el motor con lo que haya EN ESE MOMENTO (si otro puesto ya lo cobró, dice que no y no cobra dos veces).

import { cerrarAlAprobar, hhmm, mensajeDeLaFalta, pesos, plataPendiente } from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub, PlataPendiente } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import type { MedioCaja } from "./cuenta-core";

/** Lo que el comando `plata` sabe hacer (lo demás ya tenía su comando). */
export type AccionPlata = { tipo: "esperarOK"; novedadId: string };

/** El núcleo del comando `plata`. Muta el estado (como todo el motor). */
export function ejecutarPlata(estado: EstadoClub, accion: AccionPlata, ahora: Ahora, auth: Auth): Desenlace {
  switch (accion.tipo) {
    case "esperarOK": {
      const res = cerrarAlAprobar(estado, accion.novedadId, auth, ahora);
      if (!res.ok) return { ok: false, mensaje: res.motivo };
      return { ok: true, mensaje: res.yaEstaba ? "Ya estaba: la cuenta se cierra sola cuando el dueño apruebe." : "Listo: cuando el dueño apruebe, la cuenta pasa sola a su cuenta corriente." };
    }
  }
  return { ok: false, mensaje: "Esta operación no se reconoce. Recargá la página." };
}

/** Qué hace el botón de un ítem. */
export type ResolverPlata =
  /** Elegir el medio y que pase (devolver sale de la caja; lo demás entra). */
  | { tipo: "conMedio"; verbo: string; sentido: "sale" | "entra" }
  /** Un toque, sin medio. */
  | { tipo: "unToque"; verbo: string }
  /** Nada que hacer todavía (espera al dueño y ya quedó para cerrarse sola). */
  | { tipo: "esperando" };

export interface ItemPlata {
  clave: string;
  item: PlataPendiente;
  /** «Pablo debe la falta del 15/10 · $ 42.000». */
  texto: string;
  /** Un renglón chico: de qué turno, de quién, desde cuándo. */
  detalle: string;
  resolver: ResolverPlata;
  /** El WhatsApp listo para el cliente (la falta con su monto), si tiene celular. */
  whatsapp: string | null;
}

export interface VistaPlata {
  items: ItemPlata[];
  /** Lo que entra (cobrar) y lo que sale (devolver), en pesos exactos. */
  entra: number;
  sale: number;
  firma: string;
}

const ddmm = (f: string | null) => (f ? `${Number(f.slice(8))}/${Number(f.slice(5, 7))}` : "");

function resolverDe(x: PlataPendiente): ResolverPlata {
  switch (x.tipo) {
    case "devolucion":
      return { tipo: "conMedio", verbo: `Devolver ${pesos(x.monto)}`, sentido: "sale" };
    case "falta_sin_ficha":
      return { tipo: "conMedio", verbo: `Cobrar ${pesos(x.monto)}`, sentido: "entra" };
    case "sena_vencida":
      return { tipo: "conMedio", verbo: `Cobrar la seña ${pesos(x.monto)}`, sentido: "entra" };
    case "fiado":
      if (x.estadoFiado === "aprobado") return { tipo: "unToque", verbo: `Pasar ${pesos(x.monto)} a su cuenta corriente` };
      if (x.estadoFiado === "rechazado") return { tipo: "conMedio", verbo: `Cobrar ${pesos(x.monto)}`, sentido: "entra" };
      return x.cerrarAlAprobar ? { tipo: "esperando" } : { tipo: "unToque", verbo: "Se fue: que se cierre sola al aprobar" };
  }
}

function detalleDe(x: PlataPendiente): string {
  if (x.tipo === "fiado") {
    const cuando = x.fecha ? `pedido el ${ddmm(x.fecha)}${x.inicio != null ? ` ${hhmm(x.inicio)}` : ""}` : "";
    const estado = x.estadoFiado === "esperando" ? (x.cerrarAlAprobar ? "se cierra sola cuando el dueño apruebe" : "esperando el OK del dueño") : x.estadoFiado === "aprobado" ? `aprobó ${x.aprobo ?? "el dueño"}` : `no lo aprobó ${x.aprobo ?? "el dueño"}`;
    return [cuando, estado].filter(Boolean).join(" · ");
  }
  const sinFicha = x.clienteId ? "" : " · sin ficha";
  return `Turno del ${ddmm(x.fecha)}${x.inicio != null ? ` ${hhmm(x.inicio)}` : ""}${sinFicha}`;
}

/** La lista para la pantalla, de lo más viejo a lo más nuevo, con su firma (repintar sólo si cambió). */
export function armarPlataPendiente(estado: EstadoClub): VistaPlata {
  const items = plataPendiente(estado).map((x): ItemPlata => ({
    clave: x.clave,
    item: x,
    texto: x.texto,
    detalle: detalleDe(x),
    resolver: resolverDe(x),
    whatsapp: x.tipo === "falta_sin_ficha" && x.reservaId && x.tel ? mensajeDeLaFalta(estado, x.reservaId) : null,
  }));
  const entra = items.filter((i) => i.item.sentido === "entra").reduce((s, i) => s + i.item.monto, 0);
  const sale = items.filter((i) => i.item.sentido === "sale").reduce((s, i) => s + i.item.monto, 0);
  return { items, entra, sale, firma: JSON.stringify(items.map((i) => [i.clave, i.texto, i.detalle, i.item.monto, i.resolver, i.whatsapp])) };
}

/**
 * El comando que resuelve un ítem (todos de la lista blanca): `medio` para lo que lo pide. `null` si ese ítem no se
 * resuelve con un toque (un fiado que ya quedó para cerrarse solo).
 */
export type ComandoDePlata =
  | { nombre: "ciclo"; args: [reservaId: string, accion: { tipo: "devolver" | "cobrarFalta"; medio: MedioCaja }] }
  | { nombre: "cuenta"; args: [reservaId: string, accion: { tipo: "cobrarSena"; medio: MedioCaja }] }
  | { nombre: "buffet"; args: [accion: { tipo: "aCuenta"; cuentaId: string } | { tipo: "cobrar"; cuentaId: string; medio: MedioCaja }] }
  | { nombre: "plata"; args: [accion: AccionPlata] };

export function comandoDePlata(x: PlataPendiente, medio: MedioCaja | null): ComandoDePlata | null {
  switch (x.tipo) {
    case "devolucion":
      return medio && x.reservaId ? { nombre: "ciclo", args: [x.reservaId, { tipo: "devolver", medio }] } : null;
    case "falta_sin_ficha":
      return medio && x.reservaId ? { nombre: "ciclo", args: [x.reservaId, { tipo: "cobrarFalta", medio }] } : null;
    case "sena_vencida":
      return medio && x.reservaId ? { nombre: "cuenta", args: [x.reservaId, { tipo: "cobrarSena", medio }] } : null;
    case "fiado":
      if (!x.cuentaId) return null;
      if (x.estadoFiado === "aprobado") return { nombre: "buffet", args: [{ tipo: "aCuenta", cuentaId: x.cuentaId }] };
      if (x.estadoFiado === "rechazado") return medio ? { nombre: "buffet", args: [{ tipo: "cobrar", cuentaId: x.cuentaId, medio }] } : null;
      return !x.cerrarAlAprobar && x.novedadId ? { nombre: "plata", args: [{ tipo: "esperarOK", novedadId: x.novedadId }] } : null;
  }
}

/** Los ítems que coinciden con lo que se busca (por nombre o celular), para la paleta. */
export function plataQueCoincide(estado: EstadoClub, texto: string): PlataPendiente[] {
  const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const q = normalizar(texto);
  if (!q) return [];
  const digitos = q.replace(/\D/g, "");
  return plataPendiente(estado).filter((x) => normalizar(x.nombre).includes(q) || (digitos.length >= 4 && x.tel.replace(/\D/g, "").includes(digitos)));
}
