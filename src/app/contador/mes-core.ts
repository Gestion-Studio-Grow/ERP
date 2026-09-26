// El mes del estudio: lo que la contadora tiene pendiente con su cartera, de lo más grave a lo
// menos, y lo que le falta a UN cliente (la ficha). PURO (sin React, sin base): lo prueba
// mes-core.test.ts.
//
// No evalúa nada nuevo: junta lo que ya viene medido —las señales del monitor
// (src/lib/monitor-core.ts), el cierre del mes anterior y la última importación de extractos de
// cada fila de la cartera (src/lib/cartera-core.ts)— y lo agrupa en el orden en que una contadora
// con 15 a 60 clientes trabaja el mes:
//   1. quién no puede facturar hoy y por qué (lo frena todo);
//   2. lo que está por vencer o agotarse (certificado, límite del plan); lo ya vencido o agotado
//      frena la emisión y va en el 1;
//   3. los cierres del mes anterior sin congelar;
//   4. los extractos del mes que todavía no se cargaron;
//   5. las ventas que esperan datos del comprador.
// Los clientes en pausa o de baja no aparecen: la contadora los apartó a propósito.

import { noPuedeEmitir, type FilaMonitor, type SenalId } from "@/lib/monitor-core";
import type { FilaCartera } from "@/lib/cartera-core";
import { nombreDelMes } from "@/lib/libros/fecha-fiscal";

export type GrupoId = "no_emite" | "vence" | "cierre" | "extracto" | "revisar";

/** Quién lo resuelve: la contadora (desde el panel del cliente) o Soporte GSG. */
export type QuienResuelve = "estudio" | "gsg";

export interface PendienteDelCliente {
  grupo: GrupoId;
  clienteTenantId: string;
  alias: string;
  /** Qué pasa, con el dato real. */
  detalle: string;
  /** Qué hacer, en una línea. */
  accion: string;
  quien: QuienResuelve;
}

export interface GrupoDelMes {
  id: GrupoId;
  titulo: string;
  pendientes: PendienteDelCliente[];
}

/**
 * El plazo de ARCA para la fecha de una factura (manual de WSFEv1, CbteFch): hasta 5 días antes del
 * envío en venta de bienes y 10 en servicios. Es el mismo número que controla la emisión
 * (src/lib/fiscal/decidir-comprobante.ts, VENTANA_DIAS): la factura del banco lleva la fecha del
 * movimiento (src/lib/bancos-glue.ts, `fecha: mov.fecha`), así que una venta más vieja que eso NO se
 * factura sola cuando llega el extracto: queda para revisar y se emite con la fecha del día.
 * Nunca prometerle a la contadora que «se facturan igual».
 */
export const PLAZO_ARCA_DIAS = { bienes: 5, servicios: 10 } as const;

export const AVISO_PLAZO_ARCA =
  `Ojo con el plazo de ARCA: la factura lleva la fecha de la venta y ARCA la acepta hasta ${PLAZO_ARCA_DIAS.bienes} días después en bienes ` +
  `y ${PLAZO_ARCA_DIAS.servicios} en servicios. Las ventas más viejas que eso no se facturan solas: quedan para revisar y se emiten con la fecha del día.`;

/** El extracto de un cliente que todavía no tiene dónde subirse. */
export const EXTRACTO_SIN_DIRECCION =
  "Sin dirección propia todavía: no hay un panel donde subir el extracto. Pedí la dirección acá abajo (le llega a la bandeja de Soporte GSG). " +
  AVISO_PLAZO_ARCA;

/** Señales con fecha o tope. Las que ya frenan la emisión van en «No pueden facturar»; el resto, en «Vence». */
const SENALES_QUE_VENCEN: ReadonlySet<SenalId> = new Set<SenalId>([
  "cert_vencido",
  "cert_por_vencer",
  "cupo_del_plan",
  "cerca_del_cupo",
]);

/** Orden de los grupos: el primero es el más grave. */
export const ORDEN_DE_GRUPOS: readonly GrupoId[] = ["no_emite", "vence", "cierre", "extracto", "revisar"];

function tituloDelGrupo(id: GrupoId, mesActual: string, mesCierre: string | null): string {
  switch (id) {
    case "no_emite":
      return "No pueden facturar";
    case "vence":
      return "Vence o se agota este mes";
    case "cierre":
      return mesCierre ? `Falta cerrar ${nombreDelMes(mesCierre)}` : "Falta cerrar el mes anterior";
    case "extracto":
      return `Sin extracto de ${nombreDelMes(mesActual)}`;
    case "revisar":
      return "Ventas para revisar";
  }
}

/**
 * Qué decir del extracto del mes de un cliente. `tieneDireccion`: el cliente tiene su dirección
 * propia (subdominio) y la plataforma sabe armar el link a su panel.
 */
export function extractoDelMes(
  f: Pick<FilaCartera, "ultimaImportacion">,
  inicioDelMes: Date,
  tieneDireccion: boolean,
): { cargado: boolean; detalle: string; accion: string; quien: QuienResuelve } {
  const ultima = f.ultimaImportacion ? new Date(f.ultimaImportacion.createdAt) : null;
  const cargado = ultima !== null && ultima.getTime() >= inicioDelMes.getTime();
  if (cargado) {
    return { cargado, detalle: `Ya cargaste ${f.ultimaImportacion!.nombreArchivo}.`, accion: "", quien: "estudio" };
  }
  const detalle = ultima ? `El último que se cargó es ${f.ultimaImportacion!.nombreArchivo}, de un mes anterior.` : "Nunca se le cargó un extracto.";
  if (tieneDireccion) {
    return {
      cargado,
      detalle,
      accion: "Bajá el extracto del banco (o el resumen de Mercado Pago) y subilo desde su panel: Facturación automática, «Traer movimientos».",
      quien: "estudio",
    };
  }
  return {
    cargado,
    detalle: `${detalle} Todavía no tiene su dirección propia, así que no hay un panel dónde subirlo.`,
    accion: `Pedile a Soporte GSG que le active la dirección, desde «Pedir a Soporte GSG» en su ficha. ${AVISO_PLAZO_ARCA}`,
    quien: "gsg",
  };
}

/** Lo pendiente de UN cliente, en el orden de los grupos. PURA. */
export function pendientesDelCliente(
  fila: FilaCartera,
  monitor: FilaMonitor | undefined,
  inicioDelMes: Date,
  tieneDireccion: boolean,
): PendienteDelCliente[] {
  if (fila.estado !== "activa") return [];
  const base = { clienteTenantId: fila.clienteTenantId, alias: fila.alias };
  const salida: PendienteDelCliente[] = [];
  const senales = monitor?.senales ?? [];

  // «No pueden facturar» = lo mismo que frena la emisión (noPuedeEmitir, monitor-core): el
  // certificado vencido y el límite del plan agotado también frenan, aunque tengan fecha o tope.
  // Se pregunta señal por señal a la MISMA regla del monitor: no hay una segunda lista que se desfase.
  const frena = (s: FilaMonitor["senales"][number]) => !!monitor && noPuedeEmitir({ ...monitor, senales: [s] });
  const enNoEmite = new Set<FilaMonitor["senales"][number]>();
  if (monitor && noPuedeEmitir(monitor)) {
    for (const s of senales) {
      if (!frena(s) && (s.severidad !== "critico" || SENALES_QUE_VENCEN.has(s.id))) continue;
      enNoEmite.add(s);
      salida.push({ ...base, grupo: "no_emite", detalle: `${s.titulo}. ${s.detalle}`, accion: s.accion, quien: s.resuelve.quien });
    }
  }
  for (const s of senales) {
    if (!SENALES_QUE_VENCEN.has(s.id) || enNoEmite.has(s)) continue;
    salida.push({ ...base, grupo: "vence", detalle: `${s.titulo}. ${s.detalle}`, accion: s.accion, quien: s.resuelve.quien });
  }
  if (fila.cierreMes && !fila.cierreMes.congelado) {
    salida.push({
      ...base,
      grupo: "cierre",
      detalle: `${nombreDelMes(fila.cierreMes.mes)} sigue abierto: el paquete que bajes es un borrador.`,
      accion: "Pedile a la dueña o al dueño que lo revise y lo congele desde su panel, en «Cierre del mes». Después bajá el paquete final.",
      quien: "estudio",
    });
  }
  const ex = extractoDelMes(fila, inicioDelMes, tieneDireccion);
  if (!ex.cargado) salida.push({ ...base, grupo: "extracto", detalle: ex.detalle, accion: ex.accion, quien: ex.quien });
  if (fila.pendientesRevision > 0) {
    const n = fila.pendientesRevision;
    salida.push({
      ...base,
      grupo: "revisar",
      detalle: `${n.toLocaleString("es-AR")} ${n === 1 ? "venta espera" : "ventas esperan"} los datos del comprador para facturarse.`,
      accion: "Completalas desde su panel: Facturación automática, «Para revisar».",
      quien: "estudio",
    });
  }
  return salida.sort((a, b) => ORDEN_DE_GRUPOS.indexOf(a.grupo) - ORDEN_DE_GRUPOS.indexOf(b.grupo));
}

/**
 * El mes de toda la cartera, agrupado y ordenado. Dentro de cada grupo, primero el cliente que más
 * plata mueve este mes (el que más se nota si se frena), después por nombre. Grupos vacíos, fuera.
 * `tieneDireccion(f)`: si el cliente tiene panel propio al que se puede entrar. PURA.
 */
export function pendientesDelMes(
  cartera: readonly FilaCartera[],
  monitor: readonly FilaMonitor[],
  mesActual: string,
  inicioDelMes: Date,
  tieneDireccion: (f: FilaCartera) => boolean,
): GrupoDelMes[] {
  const porId = new Map(monitor.map((m) => [m.clienteTenantId, m]));
  const plata = new Map(cartera.map((f) => [f.clienteTenantId, f.montoFacturadoMes]));
  const todos = cartera.flatMap((f) => pendientesDelCliente(f, porId.get(f.clienteTenantId), inicioDelMes, tieneDireccion(f)));
  const mesCierre = cartera.find((f) => f.cierreMes)?.cierreMes?.mes ?? null;
  return ORDEN_DE_GRUPOS.map((id) => ({
    id,
    titulo: tituloDelGrupo(id, mesActual, mesCierre),
    pendientes: todos
      .filter((p) => p.grupo === id)
      .sort(
        (a, b) =>
          (plata.get(b.clienteTenantId) ?? 0) - (plata.get(a.clienteTenantId) ?? 0) ||
          a.alias.localeCompare(b.alias, "es") ||
          a.clienteTenantId.localeCompare(b.clienteTenantId),
      ),
  })).filter((g) => g.pendientes.length > 0);
}
