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
import { recuadrosDeCuotas, type CuotaDelNegocio } from "./empresa.server";
import { agrupar, columnasDeLaVista, normalizarVista, ordenar, pasaFiltros, proyectarFila, vistasDelSistema, vistasVisibles, type ColumnaDef, type FilaCuenta, type ListaId, type VistaGuardada } from "./vistas-core";

/** Quién ve cada lista: la misma regla que la pantalla de Administración. */
export const veLaLista = (a: Actor, lista: ListaId): boolean => (lista === "a-cobrar" || lista === "a-pagar") && puede(a, "empresa", "ver");

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

/** La vista pedida si esta persona la puede ver; si no, la primera del sistema. Con las columnas que el permiso deja. */
export async function vistaAplicable(a: Actor, lista: ListaId, vistaId?: string | null): Promise<{ vistas: VistaGuardada[]; actual: VistaGuardada; columnas: ColumnaDef[] }> {
  const vistas = [...vistasDelSistema(lista), ...(await vistasGuardadas(a, lista))];
  const actual = vistas.find((v) => v.id === vistaId) ?? vistas[0];
  return { vistas, actual, columnas: columnasDeLaVista(lista, actual, columnasOcultas(a)) };
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
