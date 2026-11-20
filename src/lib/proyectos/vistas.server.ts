// ============================================================================
// VISTAS GUARDADAS — lectura (MIA T03, O46). Las reglas puras están en vistas-core.ts.
// El permiso de columnas se aplica acá, al leer: lo que el rol tiene oculto no sale del servidor.
// Sin la migración M7a aplicada, sólo están las vistas del sistema.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import { esTablaInexistente } from "@/lib/rendiciones/pin-core";
import { aPesos, codigoProyecto, estadoCuota } from "./gestion-core";
import { columnasOcultas, puede, type Actor } from "./gestion.server";
import { leerExtras } from "./empresa-core";
import { liquidacionesDelPeriodo, recuadrosDeCuotas, type CuotaDelNegocio } from "./empresa.server";
import { agrupar, agruparLiquidaciones, columnasDeLaVista, normalizarVista, ordenAplicable, ordenar, ordenarLiquidaciones, pasaFiltroLiquidacion, pasaFiltros, proyectarFila, proyectarLiquidacion, veImportes, vistasDelSistema, vistasVisibles, type ColumnaDef, type FilaCuenta, type FilaLiquidacion, type ListaId, type VistaGuardada } from "./vistas-core";

/** Quién ve cada lista: la misma regla que la pantalla de Administración. */
export const veLaLista = (a: Actor, lista: ListaId): boolean =>
  lista === "liquidaciones" ? puede(a, "liquidaciones", "ver") : (lista === "a-cobrar" || lista === "a-pagar") && puede(a, "empresa", "ver");

/**
 * Quién abre la liquidación de otra persona (pantalla e impresión): ve la lista Y ve los importes. Un rol con el permiso
 * de liquidaciones pero con «costo» oculto no la abre por la dirección (T12, O46); la propia sigue su regla.
 */
export const abreLiquidacionAjena = (a: Actor): boolean => veLaLista(a, "liquidaciones") && veImportes("liquidaciones", columnasOcultas(a));

/** Las guardadas que esta persona puede ver (las suyas y las de su rol). */
export async function vistasGuardadas(a: Actor, lista: ListaId): Promise<VistaGuardada[]> {
  try {
    const filas = await prisma.proyectoVista.findMany({
      where: { tenantId: a.tenantId, lista, OR: [{ alcance: "PERSONA", propietario: a.user.id }, { alcance: "ROL", propietario: a.rol }] },
      orderBy: [{ alcance: "asc" }, { nombre: "asc" }],
    });
    return vistasVisibles(filas, a.user.id, a.rol).flatMap((f) => {
      const n = normalizarVista(lista, f);
      return n.ok ? [{ ...n.vista, id: f.id, nombre: f.nombre, alcance: f.alcance as "PERSONA" | "ROL", propietario: f.propietario }] : [];
    });
  } catch (e) {
    if (esTablaInexistente(e)) return [];
    throw e;
  }
}

/**
 * La vista pedida si esta persona la puede ver; si no, la primera del sistema. Con las columnas que el permiso deja y
 * sin ordenar por un importe oculto (el orden solo dejaría adivinarlo).
 */
export async function vistaAplicable(a: Actor, lista: ListaId, vistaId?: string | null): Promise<{ vistas: VistaGuardada[]; actual: VistaGuardada; columnas: ColumnaDef[]; montos: boolean }> {
  const vistas = [...vistasDelSistema(lista), ...(await vistasGuardadas(a, lista))];
  const ocultas = columnasOcultas(a);
  const pedida = vistas.find((v) => v.id === vistaId) ?? vistas[0];
  const actual = { ...pedida, orden: ordenAplicable(lista, pedida.orden, ocultas) };
  const montos = veImportes(lista, ocultas);
  return { vistas, actual, columnas: columnasDeLaVista(lista, actual, ocultas), montos };
}

/** Una cuota del negocio como fila de lista: lo que falta (o lo que entró, si está cobrada), en pesos y su estado. */
export function filaDeCuota(c: CuotaDelNegocio & { pendiente?: number; cobrado?: number }, tc: Readonly<Record<string, number>>, hoy: Date): FilaCuenta {
  const deCobro = c.tipo === "COBRO" ? (c.pagadoEl ? c.cobrado : c.pendiente) : c.pagadoEl ? undefined : c.pendiente;
  const monto = deCobro ?? c.monto;
  return {
    id: c.id,
    vence: c.venceEl,
    evento: c.proyecto ? `${codigoProyecto(c.proyecto.numero, c.proyecto.createdAt)} ${c.proyecto.nombre}` : null,
    contraparte: (c.tipo === "COBRO" ? c.proyecto?.client.name : c.supplier?.name) ?? "—",
    concepto: c.concepto,
    monto,
    moneda: c.moneda,
    enPesos: aPesos(monto, c.moneda, tc),
    factura: c.factura,
    estado: estadoCuota(c, hoy),
    deEmpresa: !c.proyecto,
    comentario: c.comentario,
  };
}

/**
 * La lista leída con una vista: filas filtradas, ordenadas, agrupadas y SÓLO con las columnas que el rol puede ver.
 * Es lo que sale del servidor; una vista que pide una columna oculta no la recibe.
 */
export async function leerListaConVista(a: Actor, lista: ListaId, vistaId?: string | null, hoy: Date = new Date()) {
  if (!veLaLista(a, lista)) return { ok: false as const, error: "No tenés acceso a esta lista." };
  const { actual, columnas } = await vistaAplicable(a, lista, vistaId);
  const datos = await recuadrosDeCuotas(a.tenantId);
  const tipo = lista === "a-cobrar" ? "COBRO" : "PAGO";
  const filas = ordenar(datos.cuotas.filter((c) => c.tipo === tipo).map((c) => filaDeCuota(c, datos.tc, hoy)).filter((f) => pasaFiltros(f, actual.filtros, hoy)), actual.orden);
  return {
    ok: true as const,
    vista: { id: actual.id, nombre: actual.nombre },
    columnas: columnas.map((c) => c.id),
    grupos: agrupar(filas, actual.agrupacion).map((g) => ({ titulo: g.titulo, filas: g.filas.map((f) => proyectarFila(f, columnas)) })),
  };
}

/**
 * Las liquidaciones del mes leídas con una vista (T12, O46). Lo que sale del servidor ya va sin los importes que el rol
 * tiene ocultos: ni en las celdas, ni en las acciones.
 */
export async function leerLiquidacionesConVista(a: Actor, periodo: string, vistaId?: string | null) {
  if (!veLaLista(a, "liquidaciones")) return { ok: false as const, error: "No tenés acceso a esta lista." };
  const { vistas, actual, columnas, montos } = await vistaAplicable(a, "liquidaciones", vistaId);
  const leidas: FilaLiquidacion[] = (await liquidacionesDelPeriodo(a.tenantId, periodo)).map((l) => ({
    id: l.id,
    persona: l.persona.nombre,
    puesto: l.persona.puesto,
    personaId: l.personaId,
    userId: l.persona.userId,
    facturaA: l.facturaA,
    base: l.base,
    extras: leerExtras(l.extras),
    total: l.total,
    estado: l.estado as FilaLiquidacion["estado"],
    publicadaEl: l.publicadaEl,
    vistaEl: l.vistaEl,
  }));
  const filas = ordenarLiquidaciones(leidas.filter((f) => pasaFiltroLiquidacion(f, actual.filtros)), actual.orden);
  return {
    ok: true as const,
    vistas: vistas.map((v) => ({ id: v.id, nombre: v.nombre, alcance: v.alcance, propietario: v.propietario })),
    actual,
    montos,
    columnas: columnas.map((c) => ({ id: c.id, label: c.label })),
    grupos: agruparLiquidaciones(filas, actual.agrupacion).map((g) => ({ titulo: g.titulo, filas: g.filas.map((f) => proyectarLiquidacion(f, columnas, montos)) })),
  };
}
