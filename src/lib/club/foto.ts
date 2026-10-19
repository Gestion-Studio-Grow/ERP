// ============================================================================
// LA FOTO DEL CLUB — leer, validar, resumir y comprimir el sobre v1 del respaldo.
// ============================================================================
//
// La foto es el mismo sobre del respaldo del piloto (docs/tenants/breakpoint/FORMATO-RESPALDO.md):
// `{ v, estado, secuencia, usuario?, guardado? }`. Este módulo es ISOMÓRFICO (lo usan el servidor —el repositorio y
// las acciones—, el adaptador de guardado del navegador y los scripts) y no toca ninguna base.
//
//   · `leerSobre`: texto u objeto → sobre validado por el motor (`hidratarEstado`), o el motivo en criollo.
//   · `resumenDelRespaldo`: lo que hay que mirar antes de restaurar (conteos, caja = cobrado al centavo, cajas sin
//     cerrar, PIN presentes —nunca sus valores—).
//   · `comprimir` / `descomprimir`: gzip con `CompressionStream` (navegador y Node 22). La foto de un mes lleno pesa
//     ~3 MB de texto y ~150 KB en gzip: comprimida entra holgada en el límite de 1 MB de una server action (y en el
//     de 4,5 MB de Vercel para la respuesta).
//   · `guardadoDelTexto` / `conGuardado`: el `guardado` (ms) del sobre sin recorrer el estado entero.
//
// OJO: `hidratarEstado` sube el contador de ids del motor a nivel de módulo (`retomarSecuencia`). En el navegador
// es lo que se quiere al retomar; en el servidor el motor no crea ids, así que no molesta.
//
// — Elaborado por GSG

import * as M from "./motor.mjs";
import type { EstadoClub, Fecha, FotoEstado } from "./motor.mjs";
import { dateStrInBusinessTz, wallHourMinuteInBusinessTz } from "@/lib/datetime";

/** El sobre completo, como lo descarga «Descargar respaldo». */
export type Sobre = FotoEstado & { usuario?: string; guardado?: number };

export type LecturaDeSobre = { ok: true; sobre: Sobre; estado: EstadoClub } | { ok: false; motivo: string };

/** Lee y valida un sobre (texto u objeto ya parseado). Nunca tira. */
export function leerSobre(entrada: unknown): LecturaDeSobre {
  let crudo: unknown = entrada;
  if (typeof entrada === "string") {
    try {
      crudo = JSON.parse(entrada);
    } catch {
      return { ok: false, motivo: "El archivo no es un respaldo del club: no se pudo leer." };
    }
  }
  const h = M.hidratarEstado(crudo);
  if (!h.ok) return { ok: false, motivo: `El respaldo no sirve: ${h.motivo}.` };
  const o = crudo as Record<string, unknown>;
  const sobre: Sobre = { v: M.VERSION_ESTADO, estado: h.estado, secuencia: Number(o.secuencia) || 0 };
  if (typeof o.usuario === "string") sobre.usuario = o.usuario;
  if (typeof o.guardado === "number" && Number.isFinite(o.guardado)) sobre.guardado = o.guardado;
  return { ok: true, sobre, estado: h.estado };
}

// ── el `guardado` sin recorrer el estado ─────────────────────────────────────

const GUARDADO_AL_FINAL = /,"guardado":(\d{1,16})\}\s*$/;

/** El `guardado` (ms) del sobre. Rápido si está al final (como lo deja `conGuardado`); si no, lo parsea. */
export function guardadoDelTexto(texto: string): number | null {
  const m = GUARDADO_AL_FINAL.exec(texto.slice(-40));
  if (m) return Number(m[1]);
  try {
    const g = (JSON.parse(texto) as { guardado?: unknown }).guardado;
    return typeof g === "number" && Number.isFinite(g) ? g : null;
  } catch {
    return null;
  }
}

/**
 * El texto con `guardado` = `ms` al final, sin volver a serializar el estado (el texto del almacén es
 * `{ v, estado, secuencia }`; si ya traía un `guardado` al final, se reemplaza).
 */
export function conGuardado(texto: string, ms: number): string {
  const base = texto.trimEnd();
  const sinGuardado = GUARDADO_AL_FINAL.test(base.slice(-40)) ? base.replace(GUARDADO_AL_FINAL, "}") : base;
  if (!sinGuardado.endsWith("}")) throw new Error("El texto del club no es un objeto.");
  return `${sinGuardado.slice(0, -1)},"guardado":${Math.round(ms)}}`;
}

// ── el día de caja de un instante ────────────────────────────────────────────

/** El día de caja (de 12 a 12, según `config.corteCaja`) al que pertenece el instante `ms`, en la hora del club. */
export function diaDeCajaEn(estado: EstadoClub, ms: number): Fecha {
  const instante = new Date(ms);
  const { hour, minute } = wallHourMinuteInBusinessTz(instante);
  return M.diaDeCaja(estado, dateStrInBusinessTz(instante), hour * 60 + minute);
}

// ── resumen para revisar un respaldo ─────────────────────────────────────────

const MEDIOS_DE_CAJA = new Set(["efectivo", "mercadopago", "transferencia", "debito"]);

export interface CajaDelDia {
  dia: Fecha;
  ingresos: number;
  egresos: number;
  neto: number;
  efectivoEsperado: number;
  cerrada: boolean;
}

export interface ResumenDelRespaldo {
  conteos: {
    canchas: number;
    clientes: number;
    productos: number;
    usuarios: number;
    reservas: number;
    cuentas: number;
    cuentasAbiertas: number;
    movimientosDeCaja: number;
    cierresDeCaja: number;
  };
  /** «Caja = cobrado»: lo que entró a la caja contra lo cobrado en canchas y cuentas, sin monedero. */
  caja: {
    ingresos: number;
    egresos: number;
    cobradoCanchas: number;
    cobradoCuentas: number;
    cobrado: number;
    /** Pagado con créditos del cliente: NO entra a la caja. */
    monedero: number;
    /** ingresos − cobrado. 0 = cuadra al centavo. Si no es 0: cobros de cuenta corriente u otros ingresos sueltos. */
    diferencia: number;
    cuadra: boolean;
  };
  porDia: CajaDelDia[];
  cajasSinCerrar: Fecha[];
  /** Cuántos usuarios activos tienen PIN (el valor nunca se muestra). */
  pin: { usuariosActivos: number; conPin: number; sinPin: string[] };
  deudas: { clientes: number; total: number };
  monederoDeClientes: number;
}

/** Lo que hay que mirar antes de restaurar. Puro. */
export function resumenDelRespaldo(estado: EstadoClub): ResumenDelRespaldo {
  const sumaPagos = (pagos: readonly { medio: string; monto: number }[]) => {
    let caja = 0;
    let monedero = 0;
    for (const p of pagos) {
      if (MEDIOS_DE_CAJA.has(p.medio)) caja += p.monto;
      else if (p.medio === "monedero") monedero += p.monto;
    }
    return { caja, monedero };
  };
  let cobradoCanchas = 0;
  let cobradoCuentas = 0;
  let monedero = 0;
  for (const r of estado.reservas) {
    const s = sumaPagos(r.pagos ?? []);
    cobradoCanchas += s.caja;
    monedero += s.monedero;
  }
  for (const c of estado.cuentas) {
    const s = sumaPagos(c.pagos ?? []);
    cobradoCuentas += s.caja;
    monedero += s.monedero;
  }
  const total = M.resumenCaja(estado);
  const cobrado = cobradoCanchas + cobradoCuentas;
  const dias = [...new Set(estado.caja.movimientos.map((m) => m.caja ?? (m.fecha ? M.diaDeCaja(estado, m.fecha, m.min ?? 0) : "")).filter(Boolean))].sort();
  const activos = estado.usuarios.filter((u) => u.activo !== false);
  const deben = estado.clientes.filter((c) => (c.deuda ?? 0) > 0);
  return {
    conteos: {
      canchas: estado.canchas.length,
      clientes: estado.clientes.length,
      productos: estado.productos.length,
      usuarios: estado.usuarios.length,
      reservas: estado.reservas.length,
      cuentas: estado.cuentas.length,
      cuentasAbiertas: estado.cuentas.filter((c) => c.estado === "abierta").length,
      movimientosDeCaja: estado.caja.movimientos.length,
      cierresDeCaja: estado.caja.cierres.length,
    },
    caja: {
      ingresos: total.ingresos,
      egresos: total.egresos,
      cobradoCanchas,
      cobradoCuentas,
      cobrado,
      monedero,
      diferencia: total.ingresos - cobrado,
      cuadra: total.ingresos === cobrado,
    },
    porDia: dias.map((dia) => {
      const r = M.resumenCaja(estado, dia);
      return { dia, ingresos: r.ingresos, egresos: r.egresos, neto: r.neto, efectivoEsperado: r.efectivoEsperado, cerrada: M.cajaCerrada(estado, dia) };
    }),
    cajasSinCerrar: M.cajasConMovimientosSinCerrar(estado),
    pin: {
      usuariosActivos: activos.length,
      conPin: activos.filter((u) => typeof u.pin === "string" && u.pin.length > 0).length,
      sinPin: activos.filter((u) => !u.pin).map((u) => u.nombre),
    },
    deudas: { clientes: deben.length, total: deben.reduce((s, c) => s + c.deuda, 0) },
    monederoDeClientes: estado.clientes.reduce((s, c) => s + (c.monedero ?? 0), 0),
  };
}

// ── gzip (navegador y Node 22) ───────────────────────────────────────────────

/** El texto comprimido con gzip. */
export async function comprimir(texto: string): Promise<Blob> {
  const flujo = new Blob([texto]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(flujo).blob();
}

/** El texto de un gzip (Blob, bytes o base64). */
export async function descomprimir(datos: Blob | Uint8Array | ArrayBuffer | string): Promise<string> {
  const blob =
    typeof datos === "string" ? new Blob([base64ABytes(datos)]) : datos instanceof Blob ? datos : new Blob([new Uint8Array(datos)]);
  const flujo = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(flujo).text();
}

function base64ABytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
