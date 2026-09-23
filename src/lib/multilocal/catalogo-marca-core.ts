// ============================================================================
// CATÁLOGO DE LA MARCA — la lista de la casa, mandada a cada local.
// ============================================================================
//
// QUÉ ES. Una marca con varios locales publica UNA lista de productos y precios: la de la casa.
// Cada local sigue teniendo su propio catálogo (es un negocio aparte), y este empuje le deja
// los precios y los productos de la casa. Se hace con las MISMAS piezas que la planilla de
// cortes de cada local (catalogo/planilla-core.ts): la lista de la casa se arma como la planilla
// que baja la casa (`armarPlanilla`), y se "sube" a cada local (`planificarPlanilla` +
// `escribirPlan`). Así el empuje no tiene reglas propias: lo que la planilla rechaza (un nombre
// repetido, un producto que en el local se vende por unidad y en la casa por kilo), acá también,
// y lo que la planilla no toca (el stock, la forma de venta de lo que ya existe), acá tampoco.
//
// TODO O NADA POR LOCAL. Cada local se escribe en SU transacción (con su GUC). Si un local tiene
// una fila que no cierra, ese local no se toca y se dice por qué; los demás siguen. Entre la
// vista previa y el "Aplicar" manda la HUELLA de cada local: si su catálogo cambió en el medio,
// ese local no se aplica y se pide mirar la vista previa nueva.
//
// IDEMPOTENTE. Aplicar dos veces la misma lista no escribe nada la segunda: el plan de un local
// al día no tiene cambios.
//
// QUÉ SE LE DICE A LA DUEÑA (límites de esta etapa):
//   · los productos se cruzan por NOMBRE (sin acentos ni mayúsculas): un renombre en un local
//     se ve como "1 que no existe" (se crea) + "1 sólo del local" (no se toca);
//   · un local puede cambiar un precio y el próximo empuje se lo pisa: se ve como diferencia,
//     no se bloquea;
//   · los productos pausados en la casa y los que no tienen precio no se mandan.
//
// Auditoría en CADA local (su propia auditoría dice qué cambió, quién y desde qué casa) y un
// resumen en la casa. Sin imports de VALOR de Prisma: la base llega por el `tx` del llamador.

import type { Prisma } from "@/generated/prisma/client";
import {
  SELECT_CATALOGO,
  aProductoDelCatalogo,
  armarPlanilla,
  escribirPlan,
  normalizarNombre,
  planAplicable,
  planificarPlanilla,
  type FormaDeVenta,
  type PlanPlanilla,
  type ProductoDelCatalogo,
} from "@/lib/catalogo/planilla-core";
import { registrarCambiosDePrecio, type CambioDePrecio } from "@/lib/catalogo/precios-auditoria";

type Tx = Prisma.TransactionClient;

export const ACCION_CATALOGO_EN_EL_LOCAL = "multilocal.catalogo";
export const ACCION_CATALOGO_EN_LA_CASA = "multilocal.catalogo.empuje";
/** El nombre de la app, como la ve la dueña (el mismo del registro, src/apps/catalogo/locales.ts). */
export const NOMBRE_APP_CATALOGO = "Catálogo y precios de la marca";

// ── La lista de la casa ─────────────────────────────────────────────────────

export interface ListaDeLaCasa {
  /** La planilla de la casa (el texto que se "sube" a cada local). */
  texto: string;
  /** Productos que se mandan. */
  incluidos: number;
  /** Activos sin precio de venta: no se mandan (un producto nuevo sin precio no se puede vender). */
  sinPrecio: string[];
  /** Nombres que la casa tiene dos veces: bloquean el empuje entero hasta que se renombre uno. */
  repetidos: string[];
}

const precioDe = (p: Pick<ProductoDelCatalogo, "saleUnit" | "price" | "pricePerKg">) =>
  p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price;

/**
 * La lista que se manda: los productos ACTIVOS de la casa con precio. Los pausados no viajan
 * (la casa los sacó de su lista); los que no tienen precio, tampoco, y se nombran. PURA.
 */
export function listaDeLaCasa(catalogo: readonly ProductoDelCatalogo[]): ListaDeLaCasa {
  const activos = catalogo.filter((p) => p.active);
  const sinPrecio = activos.filter((p) => !(Number(precioDe(p)) > 0)).map((p) => p.name);
  const incluidos = activos.filter((p) => Number(precioDe(p)) > 0);
  const vistos = new Map<string, string>();
  const repetidos: string[] = [];
  for (const p of incluidos) {
    const k = normalizarNombre(p.name);
    if (vistos.has(k)) repetidos.push(p.name);
    else vistos.set(k, p.name);
  }
  return {
    texto: armarPlanilla(incluidos),
    incluidos: incluidos.length,
    sinPrecio: sinPrecio.sort((a, b) => a.localeCompare(b, "es")),
    repetidos: [...new Set(repetidos)].sort((a, b) => a.localeCompare(b, "es")),
  };
}

// ── Lo que el empuje haría en un local ──────────────────────────────────────

export interface VistaDelLocal {
  /** Se puede aplicar: sin errores y con algo para escribir. */
  aplicable: boolean;
  /** Ya tiene la lista de la casa: nada que cambiar. */
  alDia: boolean;
  huella: string;
  cambiosDePrecio: { nombre: string; saleUnit: FormaDeVenta; antes: number | null; despues: number; pausado: boolean }[];
  /** Productos que cambian sólo el "controla stock". */
  cambiosDeControl: { nombre: string; antes: boolean; despues: boolean }[];
  /** Productos de la casa que el local no tiene: se crean. */
  nuevos: { nombre: string; saleUnit: FormaDeVenta; precio: number | null }[];
  /** Productos del local que la casa no tiene: no se tocan (un renombre se ve acá). */
  soloEnElLocal: string[];
  /** Por qué no se puede aplicar, dicho producto por producto. */
  problemas: { nombre: string; motivo: string }[];
}

/** El plan de la planilla → lo que la pantalla muestra de un local. PURA. */
export function vistaDelLocal(plan: PlanPlanilla): VistaDelLocal {
  const problemas = plan.errorGeneral
    ? [{ nombre: "", motivo: plan.errorGeneral }]
    : plan.errores.map((e) => ({ nombre: e.nombre, motivo: e.motivo }));
  const cambiosDePrecio = plan.cambios.flatMap((c) =>
    c.precioDespues === null
      ? []
      : [{ nombre: c.nombre, saleUnit: c.saleUnit, antes: c.precioAntes, despues: c.precioDespues, pausado: c.inactivo }],
  );
  const cambiosDeControl = plan.cambios.flatMap((c) =>
    c.precioDespues === null && c.controlDespues !== null ? [{ nombre: c.nombre, antes: c.controlAntes, despues: c.controlDespues }] : [],
  );
  const nuevos = plan.altas.map((a) => ({ nombre: a.data.name, saleUnit: a.data.saleUnit, precio: precioDe(a.data) }));
  const cantidad = plan.altas.length + plan.cambios.length;
  return {
    aplicable: planAplicable(plan),
    alDia: problemas.length === 0 && cantidad === 0,
    huella: plan.huella,
    cambiosDePrecio,
    cambiosDeControl,
    nuevos,
    soloEnElLocal: plan.noEstanEnPlanilla.map((p) => p.nombre).sort((a, b) => a.localeCompare(b, "es")),
    problemas,
  };
}

/** ¿El local tiene precios o productos distintos a la lista de la casa? (el número del Inicio). */
export function divergeDeLaLista(v: VistaDelLocal): boolean {
  return v.cambiosDePrecio.length + v.cambiosDeControl.length + v.nuevos.length > 0 || v.problemas.length > 0;
}

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-AR")} ${n === 1 ? uno : varios}`;

/** "Lomas: 58 cambios, 2 que no existen" — el resumen de la vista previa de un local. PURA. */
export function resumenDeLaVista(alias: string, v: VistaDelLocal): string {
  if (v.problemas.length > 0) return `${alias}: no se puede aplicar (${plural(v.problemas.length, "problema", "problemas")})`;
  if (v.alDia) return `${alias}: ya tiene la lista de la casa`;
  const partes: string[] = [];
  const cambios = v.cambiosDePrecio.length + v.cambiosDeControl.length;
  if (cambios > 0) partes.push(plural(cambios, "cambio", "cambios"));
  if (v.nuevos.length > 0) partes.push(`${v.nuevos.length.toLocaleString("es-AR")} que no ${v.nuevos.length === 1 ? "existe" : "existen"}`);
  return `${alias}: ${partes.join(", ")}`;
}

// ── Leer y escribir con el `tx` de UN local ─────────────────────────────────

/** El catálogo de un negocio (no borrados, pausados incluidos), con el `tx` de su transacción. */
export async function leerCatalogo(tx: Tx, tenantId: string): Promise<ProductoDelCatalogo[]> {
  const filas = await tx.product.findMany({
    where: { tenantId, deletedAt: null },
    select: SELECT_CATALOGO,
    orderBy: { name: "asc" },
  });
  return filas.map(aProductoDelCatalogo);
}

/** Lo que el empuje haría en el local, leído con su `tx`. Sólo lectura. */
export async function planDelLocal(tx: Tx, tenantId: string, lista: Pick<ListaDeLaCasa, "texto">): Promise<PlanPlanilla> {
  return planificarPlanilla(lista.texto, await leerCatalogo(tx, tenantId));
}

export type ResultadoEmpuje =
  | { estado: "aplicado"; nuevos: number; cambios: number }
  | { estado: "al-dia" }
  | { estado: "no-aplicable"; motivo: string }
  | { estado: "cambio"; motivo: string };

/** Por qué el empuje sin vista previa no toca un local que ya tiene su propio catálogo. PURA. */
export function motivoCatalogoPropio(n: number): string {
  return (
    `Ya tiene su propio catálogo (${plural(n, "producto", "productos")} con otro precio o que la casa no tiene), ` +
    "y sin vista previa no se le pisa nada. La lista se le manda desde la casa, en Mis locales → " +
    `«${NOMBRE_APP_CATALOGO}», donde se ve qué cambia antes de aplicar.`
  );
}

export interface PedidoEmpuje {
  /** El local, con el `tx` de SU transacción (el GUC lo pone quien llama). */
  tenantId: string;
  lista: Pick<ListaDeLaCasa, "texto">;
  /**
   * La huella de la vista previa que se aprobó. `null` = sin vista previa (el alta de un local
   * nuevo): entonces SÓLO se crean productos. Un local que ya tiene precios distintos, o productos
   * que la casa no tiene, tiene catálogo propio, y eso no se pisa sin que alguien mire qué cambia.
   */
  huella: string | null;
  /** "casa:<slug>:user:<id>" o "operator:<quien>". */
  actor: string;
  casa: { id: string; nombre: string };
  /** Quién lo pidió, en palabras, para la auditoría del local. */
  por: string;
  /** Id del lote: todas las filas de este empuje (en todos los locales) lo comparten. */
  lote: string;
}

/**
 * Aplica la lista de la casa en UN local, adentro de la transacción del local: vuelve a leer su
 * catálogo, vuelve a armar el plan, lo compara con la huella aprobada y escribe todo o nada:
 * los productos y precios (`escribirPlan`), una fila de `cambio-de-precio` por precio (lo que
 * leen Etiquetas y "Último aumento" del local) y el resumen en su auditoría.
 */
export async function empujarEnTx(tx: Tx, p: PedidoEmpuje): Promise<ResultadoEmpuje> {
  const plan = await planDelLocal(tx, p.tenantId, p.lista);
  if (plan.errorGeneral || plan.errores.length > 0) {
    const e = plan.errores[0];
    return { estado: "no-aplicable", motivo: plan.errorGeneral ?? (e.nombre ? `«${e.nombre}»: ${e.motivo}` : e.motivo) };
  }
  if (plan.altas.length + plan.cambios.length === 0) return { estado: "al-dia" };
  if (p.huella === null && (plan.cambios.length > 0 || plan.noEstanEnPlanilla.length > 0)) {
    return { estado: "no-aplicable", motivo: motivoCatalogoPropio(plan.cambios.length + plan.noEstanEnPlanilla.length) };
  }
  if (p.huella !== null && plan.huella !== p.huella) {
    return { estado: "cambio", motivo: "Su catálogo cambió desde la vista previa: mirá la vista previa nueva y aplicá de nuevo." };
  }
  const escrito = await escribirPlan(tx, p.tenantId, plan);
  const lote = { id: p.lote };
  const precios: CambioDePrecio[] = plan.cambios.flatMap((c) =>
    c.precioDespues === null ? [] : [{ productId: c.productId, nombre: c.nombre, saleUnit: c.saleUnit, antes: c.precioAntes, despues: c.precioDespues }],
  );
  await registrarCambiosDePrecio(tx, { tenantId: p.tenantId, actor: p.actor, origen: "planilla", cambios: precios, lote });
  const altas: CambioDePrecio[] = escrito.creados.flatMap((c) => {
    const precio = precioDe(c);
    return precio != null && precio > 0 ? [{ productId: c.id, nombre: c.name, saleUnit: c.saleUnit, antes: null, despues: precio }] : [];
  });
  await registrarCambiosDePrecio(tx, { tenantId: p.tenantId, actor: p.actor, origen: "alta", cambios: altas, lote });
  await tx.auditLog.create({
    data: {
      tenantId: p.tenantId,
      actor: p.actor,
      action: ACCION_CATALOGO_EN_EL_LOCAL,
      entity: "Product",
      channel: "admin",
      changes: {
        casaId: p.casa.id,
        casa: p.casa.nombre,
        por: p.por,
        lote: p.lote,
        nuevos: plan.altas.map((a) => a.data.name),
        cambios: plan.cambios.map((c) => ({
          id: c.productId,
          nombre: c.nombre,
          precio: c.precioDespues === null ? null : [c.precioAntes, c.precioDespues],
          controlaStock: c.controlDespues === null ? null : [c.controlAntes, c.controlDespues],
        })),
      },
    },
  });
  return { estado: "aplicado", nuevos: escrito.altas, cambios: escrito.cambios };
}

/** Lo que el resultado de un local le dice a la dueña. PURA. */
export function textoDelResultado(alias: string, r: ResultadoEmpuje): string {
  switch (r.estado) {
    case "aplicado": {
      const partes: string[] = [];
      if (r.cambios > 0) partes.push(plural(r.cambios, "cambio", "cambios"));
      if (r.nuevos > 0) partes.push(plural(r.nuevos, "producto nuevo", "productos nuevos"));
      return `${alias}: listo (${partes.join(", ")}).`;
    }
    case "al-dia":
      return `${alias}: ya tenía la lista de la casa, no se cambió nada.`;
    case "no-aplicable":
      return `${alias}: no se aplicó. ${r.motivo}`;
    case "cambio":
      return `${alias}: no se aplicó. ${r.motivo}`;
  }
}
