// ============================================================================
// MIS LOCALES — el núcleo: la red de la casa, la pasada por local y el vínculo.
// ============================================================================
//
// Una marca con varios locales (MAGRA con sus carnicerías) son N negocios del sistema, uno
// por local, como hoy. Lo único nuevo es un VÍNCULO: la "casa" (el negocio con el módulo
// `multilocal`) queda unida a sus locales con filas de `CarteraCliente` (tenantId = casa,
// clienteTenantId = local). Es la misma tabla que usa la cartera del contador; los dos
// módulos se excluyen entre sí para que las filas de uno nunca se lean como del otro.
//
// ⚠️ SIN "use server", A PROPÓSITO. Varias funciones de acá leen o escriben la base de un
// negocio con el id que les pasan (`recorrerLocales`, `recolectarLocal`, `vincularEnTx`). En
// un archivo "use server" cada export es un endpoint: cualquiera con sesión en cualquier
// negocio las llamaría con un id ajeno y RLS lo dejaría pasar, porque el GUC lo pone quien
// llama. Las puertas son:
//   · lectura: src/lib/multilocal/multilocal-actions.ts (cada export arranca con
//     `exigirCasa`, y los ids de los locales salen SÓLO de las filas de la casa);
//   · vínculo y alta de un local ya dentro de la red: src/lib/operador/red-locales-actions.ts
//     (consola de GSG, `requireOperator`).
// Lo cuida forma.test.ts, que además exige que nadie más escriba CarteraCliente.
//
// Nada de imports de VALOR de Prisma: lo de Prisma entra como `import type` y el `tx` llega
// por parámetro, igual que en cartera-core.ts. Así los tests lo ejecutan con una base falsa y
// la suite de aislamiento (prisma/rls/aislamiento-capa-app.ts) con la base real.

import type { Prisma } from "@/generated/prisma/client";
import { round2 } from "@/lib/round";
import type { CashMethod, CashMovementType } from "@/lib/caja/cash-register";
import {
  CASH_METHODS,
  clasificarOrigen,
  splitByMethod,
  totalOf,
  zeroAmounts,
  type LibroMovement,
  type MethodAmounts,
} from "@/lib/caja/libro-caja";
import { buildCierreDiario, compareDayKeys, nextDayKey, type DayKey } from "@/lib/caja/cierre-diario";
import { resumenCierre } from "@/lib/caja/cierre-resumen";
import { businessWallTimeToUtc, dateStrInBusinessTz, dayOfWeekForDate } from "@/lib/datetime";
import { normalizarNombre } from "@/lib/catalogo/planilla-core";
import { csvField } from "@/lib/report-csv";
import { interpretarCuitInput } from "@/lib/fiscal/cuit-input";
import {
  choqueDePuntoDeVenta,
  cuitNormalizado,
  motivoDeChoque,
  puntosDeVentaUsados,
} from "@/app/operador/(console)/tenants/[id]/candado-punto-venta";
import { claveDeProducto } from "./traslado-core";
import {
  ACCION_CATALOGO_EN_LA_CASA,
  NOMBRE_APP_CATALOGO,
  empujarEnTx,
  leerCatalogo,
  listaDeLaCasa,
  type ResultadoEmpuje,
} from "./catalogo-marca-core";

type Tx = Prisma.TransactionClient;

// ── Quién es la casa ─────────────────────────────────────────────────────────

export const MODULO_MULTILOCAL = "multilocal";
/** El módulo del contador. Se repite el literal para no arrastrar cartera-core (y bancos) acá. */
const MODULO_CARTERA = "cartera";

/** El panel que se quiere abrir: la red de locales de la casa o la cartera del estudio. */
export type Panel = "casa" | "estudio";

export type Acceso = { ok: true } | { ok: false; error: string };

/**
 * ¿Este negocio puede abrir ese panel? Se decide con `Tenant.modules` leído de la base en el
 * momento (nunca con el menú ni con un flag): la asignación del módulo ES la barrera de acceso
 * a datos de otros negocios. PURA.
 *
 * `cartera` y `multilocal` guardan su vínculo en la misma tabla. Un negocio con los dos
 * mezclaría los locales de una marca con los clientes de un estudio (y el estudio puede
 * emitir facturas por sus clientes), así que con los dos juntos no se abre NINGUNO de los
 * dos paneles, en vez de elegir uno.
 */
export function decidirAcceso(modules: readonly string[] | null | undefined, panel: Panel): Acceso {
  if (!modules) {
    return { ok: false, error: "No se pudo leer qué tiene activado este negocio. Probá de nuevo en un rato." };
  }
  const tiene = new Set(modules);
  const propio = panel === "casa" ? MODULO_MULTILOCAL : MODULO_CARTERA;
  const otro = panel === "casa" ? MODULO_CARTERA : MODULO_MULTILOCAL;
  if (!tiene.has(propio)) {
    return {
      ok: false,
      error:
        panel === "casa"
          ? "Mis locales no está habilitado para este negocio. Si tenés varios locales, escribinos a Gestión Studio Grow."
          : "El módulo Cartera no está habilitado para este negocio.",
    };
  }
  if (tiene.has(otro)) {
    return {
      ok: false,
      error:
        "Este negocio tiene a la vez el panel del contador y Mis locales, y no pueden convivir: " +
        "los dos leen datos de otros negocios desde el mismo lugar. Escribinos a Gestión Studio Grow para dejar uno solo.",
    };
  }
  return { ok: true };
}

// ── Las filas de la red ──────────────────────────────────────────────────────

export type EstadoVinculo = "activa" | "pausada" | "baja";

/** Una fila de la red, como la guarda la base de la CASA. */
export interface FilaRed {
  id: string;
  localTenantId: string;
  alias: string;
  estado: EstadoVinculo;
}

/** Lo que se lee de la tabla Tenant de cada local (fuera de RLS: sólo datos de control). */
export interface MetaLocal {
  nombre: string;
  slug: string;
  subdomain: string | null;
  arcaCuit: string | null;
  arcaPuntoVenta: number | null;
}

export interface LocalDeLaRed extends MetaLocal {
  localTenantId: string;
  /** Cómo lo llama la casa ("Canning"). */
  alias: string;
}

/**
 * La consulta de las filas de la red. Sólo `activa`: un vínculo dado de baja desaparece en el
 * acto, y `pausada` no se usa en la red (es un estado de la cartera del contador). Vive acá
 * para que la action y la suite de aislamiento lean exactamente lo mismo.
 */
export function consultaFilasDeLaRed(casaId: string) {
  return {
    where: { tenantId: casaId, estado: "activa" as const },
    orderBy: { alias: "asc" as const },
    select: { id: true, clienteTenantId: true, alias: true, estado: true },
  } satisfies Prisma.CarteraClienteFindManyArgs;
}

/** Fila cruda de la base → fila de la red. */
export function filaDeLaBase(f: { id: string; clienteTenantId: string; alias: string; estado: string }): FilaRed {
  return { id: f.id, localTenantId: f.clienteTenantId, alias: f.alias, estado: f.estado as EstadoVinculo };
}

export interface PuertosRed {
  /** Las filas de la red, leídas con el GUC de la CASA (RLS de CarteraCliente). */
  filasDeLaRed(casaId: string): Promise<FilaRed[]>;
  /** Tenant de cada local, en UNA lectura. Los que no existen no vienen. */
  metaDeLocales(ids: string[]): Promise<Map<string, MetaLocal>>;
  /** Corre `fn` en UNA transacción con el GUC del local (la real: tenantTransaction). */
  enLocal<T>(localTenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
}

/**
 * Los locales de la casa. AISLAMIENTO: los ids salen EXCLUSIVAMENTE de las filas de la casa,
 * nunca de un input. Una fila que apuntara a la propia casa se descarta (el vínculo lo
 * impide, pero la casa no se lee como si fuera su propio local). Una fila huérfana (el
 * negocio ya no existe) tampoco rompe la pantalla.
 */
export async function localesDeLaRed(p: Pick<PuertosRed, "filasDeLaRed" | "metaDeLocales">, casaId: string): Promise<LocalDeLaRed[]> {
  const filas = (await p.filasDeLaRed(casaId)).filter((f) => f.estado === "activa" && f.localTenantId !== casaId);
  if (filas.length === 0) return [];
  const metas = await p.metaDeLocales(filas.map((f) => f.localTenantId));
  const locales: LocalDeLaRed[] = [];
  for (const f of filas) {
    const meta = metas.get(f.localTenantId);
    if (!meta) continue;
    locales.push({ ...meta, localTenantId: f.localTenantId, alias: f.alias });
  }
  return locales;
}

/** Un local cuya lectura falló. El error queda para el log; la pantalla dice qué pasó con él. */
export interface LocalQueFallo {
  local: LocalDeLaRed;
  error: unknown;
}

/** El recorrido de la red: lo que se pudo leer de cada local, y los locales que fallaron. */
export interface Recorrido<T> {
  leidos: { local: LocalDeLaRed; dato: T }[];
  fallidos: LocalQueFallo[];
}

/**
 * Cuántos locales se leen A LA VEZ. Cada lectura es una transacción que ocupa una conexión del
 * pool de la instancia (src/lib/db-pool.ts) mientras dura; leerlos todos juntos con una red
 * grande dejaría sin conexión al resto del pedido (el Inicio lee la red adentro de su fila de
 * números). De a tres: con la red de hoy (dos o tres locales) es una sola tanda en vez de una
 * por local, y con una red grande nunca toma más de tres conexiones.
 */
export const LOCALES_A_LA_VEZ = 3;

/**
 * Recorre la red: UNA transacción por local, con SU GUC. El piso son N transacciones porque el
 * GUC de RLS es por transacción y leer varios negocios en una sola consulta obligaría a evadir
 * el aislamiento. Van de a `LOCALES_A_LA_VEZ` (antes, de a uno: con 30 ms de ida y vuelta a la
 * base, cada local sumaba su tiempo entero al de la pantalla). Cada transacción sigue siendo la
 * de su local, con su GUC y su contexto propio: correr a la vez no mezcla negocios (lo prueba
 * prisma/rls/aislamiento-capa-app.ts con el rol app_rls).
 *
 * El resultado sale en el ORDEN de la red, termine primero el que termine.
 *
 * Un local que falla (la base no contestó a tiempo, una migración que ese local no tiene) NO
 * tumba la red: queda en `fallidos` y los demás se siguen leyendo. La dueña ve los que se
 * pudieron leer y un aviso por el que no, en vez de la pantalla genérica de error.
 */
export async function recorrerLocales<T>(
  p: PuertosRed,
  casaId: string,
  recolectar: (tx: Tx, local: LocalDeLaRed) => Promise<T>,
  aLaVez: number = LOCALES_A_LA_VEZ,
): Promise<Recorrido<T>> {
  const locales = await localesDeLaRed(p, casaId);
  const resultados: ({ ok: true; dato: T } | { ok: false; error: unknown })[] = new Array(locales.length);
  let siguiente = 0;
  const trabajar = async () => {
    while (siguiente < locales.length) {
      const i = siguiente++;
      const local = locales[i];
      try {
        resultados[i] = { ok: true, dato: await p.enLocal(local.localTenantId, (tx) => recolectar(tx, local)) };
      } catch (error) {
        resultados[i] = { ok: false, error };
      }
    }
  };
  const trabajadores = Math.max(1, Math.min(Math.floor(aLaVez) || 1, locales.length));
  await Promise.all(Array.from({ length: trabajadores }, trabajar));
  const leidos: { local: LocalDeLaRed; dato: T }[] = [];
  const fallidos: LocalQueFallo[] = [];
  resultados.forEach((r, i) => (r.ok ? leidos.push({ local: locales[i], dato: r.dato }) : fallidos.push({ local: locales[i], error: r.error })));
  return { leidos, fallidos };
}

/**
 * Un local pedido desde afuera (el `?local=` de la URL). Sólo vale si está entre los locales
 * que salieron de las filas de la casa: un id ajeno, tecleado o manipulado, da el MISMO error
 * que uno que no existe (no se confirma si ese negocio existe en otra red). PURA.
 */
export function elegirLocal<L extends { localTenantId: string }>(
  locales: readonly L[],
  pedido: string | null | undefined,
): { ok: true; local: L | null } | { ok: false; error: string } {
  const id = pedido?.trim();
  if (!id) return { ok: true, local: null };
  const local = locales.find((l) => l.localTenantId === id);
  if (!local) return { ok: false, error: "Ese local no es de tu red. Elegí uno de la lista." };
  return { ok: true, local };
}

/**
 * La dirección del backoffice de un local, para el botón "Abrir su caja". Primero el host del
 * mapa de ruteo (`TENANT_HOST_MAP`, host → subdominio: se busca al revés) y si no, el
 * subdominio del dominio propio (`APP_BASE_DOMAIN`). `null` si no tiene ninguna: la pantalla
 * lo dice en vez de armar un link roto. Entrar ahí pide el usuario de ESE local (los usuarios
 * son por negocio). PURA.
 */
export function direccionDelLocal(
  subdomain: string | null,
  ruteo: { mapaDeHosts: ReadonlyMap<string, string>; dominioPropio: string | null },
  ruta: string,
): string | null {
  const sub = subdomain?.trim().toLowerCase();
  if (!sub) return null;
  for (const [host, s] of ruteo.mapaDeHosts) if (s === sub) return `https://${host}${ruta}`;
  const base = ruteo.dominioPropio?.trim();
  return base ? `https://${sub}.${base}${ruta}` : null;
}

// ── Días ─────────────────────────────────────────────────────────────────────

/** "2026-09-23" + n días (anclado a mediodía UTC: sin corrimientos de zona). */
export function sumarDias(dia: DayKey, n: number): DayKey {
  const d = new Date(`${dia}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** El lunes de la semana de `dia` (la semana del negocio arranca el lunes). */
export function lunesDe(dia: DayKey): DayKey {
  return sumarDias(dia, -((dayOfWeekForDate(dia) + 6) % 7));
}

const inicioDelDia = (dia: DayKey): Date => businessWallTimeToUtc(dia, "00:00");

// ── La plata: ventas y anulaciones, con el criterio del libro ─────────────────

/** Una fila de `CashMovement` con lo que hace falta para clasificarla (el libro usa lo mismo). */
export interface FilaCaja {
  occurredAt: Date;
  type: CashMovementType;
  method: CashMethod;
  amount: number;
  createdBy: string;
  orderId: string | null;
}

export interface Ventas {
  /** Lo cobrado por ventas (del mostrador y turnos), por medio. */
  ventas: MethodAmounts;
  /** Las anulaciones de esas ventas, por medio. */
  anulado: MethodAmounts;
  /** Ventas menos anulaciones, los tres medios juntos. */
  neto: number;
  /** Cantidad de cobros (movimientos VENTA). */
  cantidad: number;
}

/**
 * Ventas del período con el criterio del LIBRO DE CAJA: cada fila se clasifica con
 * `clasificarOrigen` (libro-caja.ts) y se suma con `splitByMethod`, las mismas funciones que
 * arman el libro de cada local. Una venta es un VENTA; su anulación es el EGRESO con la marca
 * de anulación, en el día en que quedó asentada. Compras, retiros y gastos no son ventas y no
 * cuentan. PURA.
 */
export function ventasDe(filas: readonly FilaCaja[]): Ventas {
  const cobros: LibroMovement[] = [];
  const reversas: LibroMovement[] = [];
  for (const [i, f] of filas.entries()) {
    const m: LibroMovement = { id: String(i), occurredAt: f.occurredAt, type: f.type, method: f.method, amount: f.amount, detail: "" };
    if (f.type === "VENTA") cobros.push(m);
    else if (f.type === "EGRESO" && clasificarOrigen(f).origen === "anulacion") reversas.push(m);
  }
  const { ingresos } = splitByMethod(cobros);
  const { egresos } = splitByMethod(reversas);
  return { ventas: ingresos, anulado: egresos, neto: round2(totalOf(ingresos) - totalOf(egresos)), cantidad: cobros.length };
}

/** Las mismas ventas, día por día (día del negocio), ordenadas. PURA. */
export function ventasPorDia(filas: readonly FilaCaja[]): { dia: DayKey; ventas: Ventas }[] {
  const porDia = new Map<DayKey, FilaCaja[]>();
  for (const f of filas) {
    const dia = dateStrInBusinessTz(f.occurredAt);
    const lista = porDia.get(dia) ?? [];
    lista.push(f);
    porDia.set(dia, lista);
  }
  return [...porDia.entries()]
    .sort(([a], [b]) => compareDayKeys(a, b))
    .map(([dia, f]) => ({ dia, ventas: ventasDe(f) }));
}

/** Suma de varias `Ventas`. PURA. */
export function sumarVentas(lista: readonly Ventas[]): Ventas {
  const ventas = zeroAmounts();
  const anulado = zeroAmounts();
  let cantidad = 0;
  for (const v of lista) {
    for (const k of CASH_METHODS) {
      ventas[k] += v.ventas[k];
      anulado[k] += v.anulado[k];
    }
    cantidad += v.cantidad;
  }
  for (const k of CASH_METHODS) {
    ventas[k] = round2(ventas[k]);
    anulado[k] = round2(anulado[k]);
  }
  return { ventas, anulado, neto: round2(totalOf(ventas) - totalOf(anulado)), cantidad };
}

/** Las filas que hacen falta para las ventas: sólo VENTA y EGRESO (la anulación es un EGRESO). */
export function consultaFilasDeVentas(tenantId: string, desde: Date, hasta: Date) {
  return {
    where: { tenantId, type: { in: ["VENTA", "EGRESO"] as CashMovementType[] }, occurredAt: { gte: desde, lt: hasta } },
    select: { occurredAt: true, type: true, method: true, amount: true, createdBy: true, orderId: true },
  } satisfies Prisma.CashMovementFindManyArgs;
}

// ── La pasada de UN local ────────────────────────────────────────────────────

/** Lo mismo que muestra la pantalla de Caja del local, arriba de todo ("Lo que hay ahora"). */
export type CajaLocal =
  | {
      estado: "abierta";
      /** Hasta qué día está cerrada (null = nunca cerró). */
      cerradoHasta: DayKey | null;
      /** Desde qué día abarca el período sin cerrar (null = desde el origen). */
      desde: DayKey | null;
      /** El día más viejo con movimientos sin cerrar, ANTES de hoy (null = está al día). */
      pendienteDesde: DayKey | null;
      porMedio: Record<CashMethod, { ingresos: number; egresos: number; hay: number }>;
      total: number;
    }
  | { estado: "cerrada-hoy"; cerradoHasta: DayKey };

export interface CierreLocal {
  dia: DayKey;
  cuando: Date;
  /** Estado del cierre ("CUADRA", "FALTANTE"...), como lo guardó el cierre. */
  estado: string | null;
  /** Suma de las diferencias declaradas (sobrante > 0, faltante < 0). */
  diferencia: number;
  /** Una línea por medio: "Efectivo: contó $X sobre $Y · faltan $Z" (cierre-resumen.ts). */
  medios: string[];
  nota: string | null;
}

export interface ProductoLocal {
  nombre: string;
  saleUnit: "UNIT" | "WEIGHT";
  unidad: string;
  stock: number;
  minimo: number;
  controla: boolean;
}

export interface PasadaLocal {
  hoy: Ventas;
  semana: { actual: number; anterior: number };
  caja: CajaLocal;
  cierres: CierreLocal[];
  stock: ProductoLocal[];
}

/** Un reloj para toda la red y las lecturas que no pueden vivir acá (importan prisma). */
export interface ContextoPasada {
  hoy: DayKey;
  /**
   * Hasta qué día está cerrada la caja, leído con ESTE `tx` (frontera-cierre `lastClosedDayTx`).
   * Entra inyectado porque ese módulo importa prisma y éste no puede.
   */
  leerFronteraCaja(tx: Tx, tenantId: string): Promise<DayKey | null>;
  /** Los últimos cierres del día (filas de AuditLog del cierre), con el mismo `tx`. */
  leerCierres(tx: Tx, tenantId: string): Promise<{ entityId: string | null; createdAt: Date; changes: unknown }[]>;
}

/** Diferencia total que declaró un cierre, leída de su `changes` (JSON de la base). PURA. */
export function diferenciaDelCierre(changes: unknown): number {
  if (typeof changes !== "object" || changes === null) return 0;
  const porMedio = (changes as Record<string, unknown>).porMedio;
  if (typeof porMedio !== "object" || porMedio === null) return 0;
  let total = 0;
  for (const k of CASH_METHODS) {
    const d = ((porMedio as Record<string, unknown>)[k] as Record<string, unknown> | undefined)?.diferencia;
    if (typeof d === "number" && Number.isFinite(d)) total += d;
  }
  return round2(total);
}

/** Fila de auditoría del cierre → cierre del local. `null` si no tiene la forma del cierre. PURA. */
export function cierreDeLaAuditoria(f: { entityId: string | null; createdAt: Date; changes: unknown }): CierreLocal | null {
  const resumen = resumenCierre(f.changes);
  if (!resumen || !f.entityId) return null;
  const estado = (f.changes as Record<string, unknown>).estado;
  return {
    dia: f.entityId,
    cuando: f.createdAt,
    estado: typeof estado === "string" ? estado : null,
    diferencia: diferenciaDelCierre(f.changes),
    medios: resumen.medios,
    nota: resumen.nota,
  };
}

/**
 * La pasada de UN local, con el `tx` de SU transacción (GUC = local). Nunca abre otra
 * conexión ni usa el prisma del request: adentro de la transacción de otro negocio, el prisma
 * del request saldría por otra conexión, sin el GUC, y RLS devolvería 0 filas sin error.
 *
 * La caja se calcula con `buildCierreDiario` sobre las mismas filas que lee la pantalla de Caja
 * (getCierreDiarioData, cierre-diario-actions.ts): desde el día siguiente al último cierre,
 * más el arrastre agregado de lo anterior. Así cada cifra coincide con la que el local ve en
 * su propia Caja.
 *
 * NO la llames con un local que no salió de las filas de la casa: el aislamiento lo pone
 * quien la llama (`recorrerLocales` desde multilocal-actions.ts), no esta función.
 */
export async function recolectarLocal(tx: Tx, local: LocalDeLaRed, ctx: ContextoPasada): Promise<PasadaLocal> {
  const tenantId = local.localTenantId;
  const inicioDeHoy = inicioDelDia(ctx.hoy);
  const finDeHoy = inicioDelDia(nextDayKey(ctx.hoy));
  const lunes = lunesDe(ctx.hoy);
  // La semana anterior, hasta el MISMO día de la semana: comparar lunes-a-miércoles contra la
  // semana entera de antes haría caer a todos los locales todos los días.
  const lunesAnterior = sumarDias(lunes, -7);
  const finAnterior = inicioDelDia(sumarDias(ctx.hoy, -6));

  const [cerradoHasta, filasVentas, auditoriaCierres, stock] = await Promise.all([
    ctx.leerFronteraCaja(tx, tenantId),
    tx.cashMovement.findMany(consultaFilasDeVentas(tenantId, inicioDelDia(lunesAnterior), finDeHoy)),
    ctx.leerCierres(tx, tenantId),
    leerStock(tx, tenantId),
  ]);

  const filas = filasVentas as FilaCaja[];
  const enRango = (desde: Date, hasta: Date) => filas.filter((f) => f.occurredAt >= desde && f.occurredAt < hasta);

  // Caja: un día ya cerrado no tiene período (lo mismo que la pantalla de Caja).
  let caja: CajaLocal;
  if (cerradoHasta && compareDayKeys(ctx.hoy, cerradoHasta) <= 0) {
    caja = { estado: "cerrada-hoy", cerradoHasta };
  } else {
    const desde = cerradoHasta ? nextDayKey(cerradoHasta) : null;
    const start = desde ? inicioDelDia(desde) : new Date(0);
    const [periodo, anteriores] = await Promise.all([
      tx.cashMovement.findMany({
        where: { tenantId, occurredAt: { gte: start, lt: finDeHoy } },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        select: { id: true, occurredAt: true, type: true, method: true, amount: true },
      }),
      tx.cashMovement.groupBy({
        by: ["type", "method"],
        where: { tenantId, occurredAt: { lt: start } },
        _sum: { amount: true },
      }),
    ]);
    const previous: LibroMovement[] = anteriores.map((g, i) => ({
      id: `prev-${i}`,
      occurredAt: start,
      type: g.type as CashMovementType,
      method: g.method as CashMethod,
      amount: g._sum.amount ?? 0,
      detail: "",
    }));
    const movements: LibroMovement[] = periodo.map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt,
      type: r.type as CashMovementType,
      method: r.method as CashMethod,
      amount: r.amount,
      detail: "",
    }));
    const vista = buildCierreDiario({
      day: ctx.hoy,
      since: desde,
      previous,
      movements,
      declared: { EFECTIVO: null, MP: null, TARJETA: null },
    });
    const viejo = periodo.find((r) => r.occurredAt < inicioDeHoy);
    const porMedio = {} as Record<CashMethod, { ingresos: number; egresos: number; hay: number }>;
    for (const k of CASH_METHODS) {
      const m = vista.porMedio[k];
      porMedio[k] = { ingresos: m.ingresos, egresos: m.egresos, hay: m.expected };
    }
    caja = {
      estado: "abierta",
      cerradoHasta,
      desde,
      pendienteDesde: viejo ? dateStrInBusinessTz(viejo.occurredAt) : null,
      porMedio,
      total: vista.total.expected,
    };
  }

  const cierres: CierreLocal[] = [];
  for (const f of auditoriaCierres) {
    const c = cierreDeLaAuditoria(f);
    if (c) cierres.push(c);
  }

  return {
    hoy: ventasDe(enRango(inicioDeHoy, finDeHoy)),
    semana: {
      actual: ventasDe(enRango(inicioDelDia(lunes), finDeHoy)).neto,
      anterior: ventasDe(enRango(inicioDelDia(lunesAnterior), finAnterior)).neto,
    },
    caja,
    cierres,
    stock,
  };
}

// ── La regla del stock, la misma de la pantalla de Stock de cada local ────────
//
// Copia DELIBERADA de `esStockBajo`, `estaEnNegativo` y `whereProductosDeStock` de
// src/lib/inventory/valuation.ts. Esas tres funciones las suma el frente de stock en esta
// misma ola y todavía no están en main: importarlas ataba la compilación de Mis locales a que
// ese cambio entrara en el mismo push (sin él, tsc da TS2305 acá). Son tres líneas, y
// multilocal-core.test.ts las corre contra las de valuation.ts apenas existen: si una de las
// dos cambia, ese test se pone rojo. Cuando valuation.ts las tenga en main, se reemplazan por
// el import y se borran de acá.

/** Lo mínimo para decidir el nivel de un producto (la forma de `NivelDeStock` de valuation.ts). */
export type NivelDeStock = { trackStock: boolean; stock: number; lowStockAt: number };

/** Bajo el mínimo = controla existencias y está en el mínimo o por debajo. PURA. */
export function esStockBajo(p: NivelDeStock): boolean {
  return p.trackStock && p.stock <= p.lowStockAt;
}

/** En negativo = controla existencias y quedó bajo cero: hay que recontarlo. PURA. */
export function estaEnNegativo(p: Pick<NivelDeStock, "trackStock" | "stock">): boolean {
  return p.trackStock && p.stock < 0;
}

/** Los productos que lista la pantalla de Stock: activos y no borrados del negocio. */
export function whereProductosDeStock(tenantId: string) {
  return { tenantId, deletedAt: null, active: true };
}

/**
 * El stock de un negocio con el `tx` de SU transacción: los productos que lista su pantalla de
 * Stock (`whereProductosDeStock`, activos y no borrados), SIN costos. Es lo único que lee la
 * pasada del encargado (RECEPTION), que no ve plata.
 */
export async function leerStock(tx: Tx, tenantId: string): Promise<ProductoLocal[]> {
  const productos = await tx.product.findMany({
    where: whereProductosDeStock(tenantId),
    orderBy: { name: "asc" },
    select: { name: true, saleUnit: true, unit: true, stock: true, lowStockAt: true, trackStock: true },
  });
  return productos.map((p) => ({
    nombre: p.name,
    saleUnit: p.saleUnit,
    unidad: p.unit,
    stock: p.stock,
    minimo: p.lowStockAt,
    controla: p.trackStock,
  }));
}

// ── La red entera: los números del tablero ──────────────────────────────────

export interface LocalConPasada {
  local: LocalDeLaRed;
  dato: PasadaLocal;
}

/** ¿El producto está bajo el mínimo o en negativo? Con la regla de la pantalla de Stock (arriba). */
const bajo = (p: ProductoLocal) => esStockBajo({ trackStock: p.controla, stock: p.stock, lowStockAt: p.minimo });
const negativo = (p: ProductoLocal) => estaEnNegativo({ trackStock: p.controla, stock: p.stock });

export interface ResumenRed {
  locales: number;
  /**
   * Lo COBRADO hoy en todos los locales: los cobros de venta que entraron hoy a la caja menos
   * lo anulado hoy. No es "lo vendido": una anulación de hoy de una venta de ayer resta hoy,
   * igual que en la caja del local.
   */
  cobradoHoy: number;
  /** Locales con días anteriores sin cerrar. */
  cajasSinCerrar: number;
  /** El día sin cerrar más viejo de la red. */
  pendienteMasViejo: DayKey | null;
  /** Productos bajo el mínimo (sumados local por local) y en cuántos locales. */
  stockBajo: { productos: number; locales: number };
  stockNegativo: { productos: number; locales: number };
  semana: { actual: number; anterior: number; destacado: { alias: string; cambio: number } | null };
  /** Locales sin punto de venta de ARCA cargado (no pueden facturar). */
  sinPuntoDeVenta: number;
}

/**
 * Cambio relativo de la semana (0,12 = +12 %). `null` si la semana anterior no vendió nada:
 * "creció infinito" no le dice nada a nadie. PURA.
 */
export function cambioRelativo(actual: number, anterior: number): number | null {
  if (!(anterior > 0)) return null;
  return (actual - anterior) / anterior;
}

/**
 * Productos bajo el mínimo y en negativo, sumados local por local (un corte bajo en dos
 * locales cuenta dos veces: son dos heladeras que reponer), y en cuántos locales. PURA.
 */
export function contarStock(listas: readonly (readonly ProductoLocal[])[]): Pick<ResumenRed, "stockBajo" | "stockNegativo"> {
  const stockBajo = { productos: 0, locales: 0 };
  const stockNegativo = { productos: 0, locales: 0 };
  for (const lista of listas) {
    const b = lista.filter(bajo).length;
    const n = lista.filter(negativo).length;
    stockBajo.productos += b;
    stockNegativo.productos += n;
    if (b > 0) stockBajo.locales += 1;
    if (n > 0) stockNegativo.locales += 1;
  }
  return { stockBajo, stockNegativo };
}

/** Los números del tablero, a partir de la pasada de cada local. PURA. */
export function resumirRed(red: readonly LocalConPasada[]): ResumenRed {
  let pendienteMasViejo: DayKey | null = null;
  let cajasSinCerrar = 0;
  let destacado: { alias: string; cambio: number } | null = null;
  for (const { local, dato } of red) {
    if (dato.caja.estado === "abierta" && dato.caja.pendienteDesde) {
      cajasSinCerrar += 1;
      if (!pendienteMasViejo || compareDayKeys(dato.caja.pendienteDesde, pendienteMasViejo) < 0) {
        pendienteMasViejo = dato.caja.pendienteDesde;
      }
    }
    // El local que más se movió frente a la semana anterior, para arriba o para abajo: a la
    // dueña le sirve tanto el que creció como el que se cayó.
    const cambio = cambioRelativo(dato.semana.actual, dato.semana.anterior);
    if (cambio !== null && (destacado === null || Math.abs(cambio) > Math.abs(destacado.cambio))) {
      destacado = { alias: local.alias, cambio };
    }
  }
  return {
    locales: red.length,
    cobradoHoy: round2(red.reduce((s, x) => s + x.dato.hoy.neto, 0)),
    cajasSinCerrar,
    pendienteMasViejo,
    ...contarStock(red.map((x) => x.dato.stock)),
    semana: {
      actual: round2(red.reduce((s, x) => s + x.dato.semana.actual, 0)),
      anterior: round2(red.reduce((s, x) => s + x.dato.semana.anterior, 0)),
      destacado,
    },
    sinPuntoDeVenta: red.filter((x) => !x.local.arcaPuntoVenta).length,
  };
}

// ── Stock por local: la matriz ───────────────────────────────────────────────

export interface ColumnaStock {
  id: string;
  nombre: string;
  /** La casa (el obrador) va primera y se distingue: no es un local de venta. */
  esCasa: boolean;
  productos: readonly ProductoLocal[];
}

export interface CeldaStock {
  stock: number;
  minimo: number;
  controla: boolean;
  bajo: boolean;
  negativo: boolean;
}

export interface FilaStock {
  clave: string;
  nombre: string;
  saleUnit: "UNIT" | "WEIGHT";
  unidad: string;
  /** Una celda por columna, en el orden de las columnas; `null` = ese local no lo tiene. */
  celdas: (CeldaStock | null)[];
  algunoBajo: boolean;
  algunoNegativo: boolean;
}

/**
 * El mismo producto en todos los locales. Se cruza por nombre normalizado (sin acentos ni
 * mayúsculas, `normalizarNombre` de la planilla de precios) MÁS la unidad de venta: "Vacío"
 * por kilo y "Vacío" por unidad son dos productos distintos. Un renombre en un local lo deja
 * como otra fila: es el límite conocido hasta que exista un código de marca (segunda ventana).
 * PURA.
 */
export function matrizDeStock(columnas: readonly ColumnaStock[]): FilaStock[] {
  const filas = new Map<string, FilaStock>();
  columnas.forEach((col, i) => {
    for (const p of col.productos) {
      // La misma clave con que se cruza un producto en un traslado (traslado-core.ts).
      const clave = claveDeProducto(p.nombre, p.saleUnit);
      let fila = filas.get(clave);
      if (!fila) {
        fila = {
          clave,
          nombre: p.nombre.replace(/\s+/g, " ").trim(),
          saleUnit: p.saleUnit,
          unidad: p.unidad,
          celdas: columnas.map(() => null),
          algunoBajo: false,
          algunoNegativo: false,
        };
        filas.set(clave, fila);
      }
      const previa = fila.celdas[i];
      // Dos productos del MISMO local con el mismo nombre (un duplicado viejo): se suman, así
      // la celda dice lo que hay en ese local y no la mitad.
      const stock = round2((previa?.stock ?? 0) + p.stock);
      const celda: CeldaStock = {
        stock,
        minimo: previa ? Math.max(previa.minimo, p.minimo) : p.minimo,
        controla: (previa?.controla ?? false) || p.controla,
        bajo: false,
        negativo: false,
      };
      celda.bajo = esStockBajo({ trackStock: celda.controla, stock: celda.stock, lowStockAt: celda.minimo });
      celda.negativo = estaEnNegativo({ trackStock: celda.controla, stock: celda.stock });
      fila.celdas[i] = celda;
    }
  });
  const salida = [...filas.values()];
  for (const f of salida) {
    f.algunoBajo = f.celdas.some((c) => c?.bajo);
    f.algunoNegativo = f.celdas.some((c) => c?.negativo);
  }
  return salida.sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || a.saleUnit.localeCompare(b.saleUnit));
}

/** Filtros de la matriz: texto y "sólo lo que falta". PURA. */
export function filtrarMatriz(filas: readonly FilaStock[], f: { q?: string | null; soloBajo?: boolean }): FilaStock[] {
  const q = normalizarNombre(f.q ?? "");
  return filas.filter((x) => (!q || normalizarNombre(x.nombre).includes(q)) && (!f.soloBajo || x.algunoBajo || x.algunoNegativo));
}

// ── Ventas por local: el rango y el archivo ─────────────────────────────────

/** Tope del rango: una lectura por local de hasta tres meses de ventas, en serie. */
export const MAX_DIAS_RANGO = 93;

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

function diaValido(s: string | null | undefined): s is DayKey {
  if (!s || !RE_DIA.test(s)) return false;
  const d = new Date(`${s}T12:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export type Rango = { desde: DayKey; hasta: DayKey; dias: number };

/**
 * El rango de fechas de la pantalla. Sin fechas: la semana en curso (lunes a hoy). Una fecha
 * ilegible, invertida o en el futuro no se "corrige" en silencio: se dice qué pasó, y la
 * pantalla muestra la semana en curso con el aviso. PURA.
 */
export function leerRango(
  desdeRaw: string | null | undefined,
  hastaRaw: string | null | undefined,
  hoy: DayKey,
): { rango: Rango; aviso: string | null } {
  const porDefecto = (aviso: string | null) => {
    const desde = lunesDe(hoy);
    return { rango: { desde, hasta: hoy, dias: diasEntre(desde, hoy) }, aviso };
  };
  const d = desdeRaw?.trim() || null;
  const h = hastaRaw?.trim() || null;
  if (!d && !h) return porDefecto(null);
  const desde = d ?? h;
  const hasta = h ?? hoy;
  if (!diaValido(desde) || !diaValido(hasta)) return porDefecto("Una de las fechas no se entendió: te mostramos esta semana.");
  if (compareDayKeys(hasta, hoy) > 0) return porDefecto("La fecha hasta no puede ser posterior a hoy: te mostramos esta semana.");
  if (compareDayKeys(desde, hasta) > 0) return porDefecto("La fecha desde es posterior a la fecha hasta: te mostramos esta semana.");
  const dias = diasEntre(desde, hasta);
  if (dias > MAX_DIAS_RANGO) {
    return porDefecto(`El rango puede tener hasta ${MAX_DIAS_RANGO} días (pediste ${dias}): te mostramos esta semana.`);
  }
  return { rango: { desde, hasta, dias }, aviso: null };
}

/** Días del rango, los dos extremos incluidos. */
export function diasEntre(desde: DayKey, hasta: DayKey): number {
  const a = new Date(`${desde}T12:00:00.000Z`).getTime();
  const b = new Date(`${hasta}T12:00:00.000Z`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Los instantes del rango para la consulta: [00:00 de desde, 00:00 del día siguiente a hasta). */
export function instantesDelRango(r: Rango): { desde: Date; hasta: Date } {
  return { desde: inicioDelDia(r.desde), hasta: inicioDelDia(nextDayKey(r.hasta)) };
}

export interface VentasDeUnLocal {
  local: LocalDeLaRed;
  total: Ventas;
  porDia: { dia: DayKey; ventas: Ventas }[];
}

export interface GrupoCuit {
  cuit: string;
  locales: string[];
  total: Ventas;
}

/**
 * Consolidado por CUIT: sólo cuando dos o más locales comparten CUIT (el IVA y los ingresos
 * brutos se declaran por CUIT). Un local sin CUIT cargado no se agrupa con nadie. PURA.
 */
export function consolidarPorCuit(locales: readonly VentasDeUnLocal[]): GrupoCuit[] {
  const grupos = new Map<string, VentasDeUnLocal[]>();
  for (const l of locales) {
    const cuit = (l.local.arcaCuit ?? "").replace(/\D/g, "");
    if (!cuit) continue;
    grupos.set(cuit, [...(grupos.get(cuit) ?? []), l]);
  }
  return [...grupos.entries()]
    .filter(([, ls]) => ls.length > 1)
    .map(([cuit, ls]) => ({ cuit, locales: ls.map((l) => l.local.alias), total: sumarVentas(ls.map((l) => l.total)) }))
    .sort((a, b) => a.cuit.localeCompare(b.cuit));
}

const SEP = ";";
const fila = (...campos: (string | number)[]) => campos.map(csvField).join(SEP);
/** Importe con coma decimal (Excel en español), igual que el export de Reportes. */
const importe = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ETIQUETA_MEDIO: Record<CashMethod, string> = { EFECTIVO: "Efectivo", MP: "MP / Transf.", TARJETA: "Tarjeta" };

/**
 * El archivo para la contadora: un resumen por local, el consolidado por CUIT si lo hay y el
 * detalle día por día y por medio (una fila por local, día y medio con movimiento). Separador
 * `;` y coma decimal, como el resto de los exports del sistema. PURA.
 */
export function csvVentasDeLaRed(input: {
  casa: string;
  rango: Rango;
  locales: readonly VentasDeUnLocal[];
  porCuit: readonly GrupoCuit[];
}): string {
  const lineas: string[] = [];
  lineas.push(fila("Ventas por local", input.casa));
  lineas.push(fila("Desde", input.rango.desde, "Hasta", input.rango.hasta));
  lineas.push(fila("Ventas cobradas según la caja de cada local, menos las anulaciones del mismo período."));
  lineas.push("");
  lineas.push(fila("RESUMEN POR LOCAL"));
  lineas.push(fila("Local", "CUIT", "Punto de venta", ...CASH_METHODS.map((k) => ETIQUETA_MEDIO[k]), "Anulado", "Neto", "Cobros"));
  for (const l of input.locales) {
    lineas.push(
      fila(
        l.local.alias,
        l.local.arcaCuit ?? "",
        l.local.arcaPuntoVenta ?? "",
        ...CASH_METHODS.map((k) => importe(l.total.ventas[k])),
        importe(totalOf(l.total.anulado)),
        importe(l.total.neto),
        l.total.cantidad,
      ),
    );
  }
  const total = sumarVentas(input.locales.map((l) => l.total));
  lineas.push(fila("TOTAL", "", "", ...CASH_METHODS.map((k) => importe(total.ventas[k])), importe(totalOf(total.anulado)), importe(total.neto), total.cantidad));
  if (input.porCuit.length > 0) {
    lineas.push("");
    lineas.push(fila("CONSOLIDADO POR CUIT"));
    lineas.push(fila("CUIT", "Locales", ...CASH_METHODS.map((k) => ETIQUETA_MEDIO[k]), "Anulado", "Neto"));
    for (const g of input.porCuit) {
      lineas.push(fila(g.cuit, g.locales.join(", "), ...CASH_METHODS.map((k) => importe(g.total.ventas[k])), importe(totalOf(g.total.anulado)), importe(g.total.neto)));
    }
  }
  lineas.push("");
  lineas.push(fila("DETALLE POR DÍA"));
  lineas.push(fila("Fecha", "Local", "CUIT", "Medio", "Ventas", "Anulado", "Neto"));
  for (const l of input.locales) {
    for (const d of l.porDia) {
      for (const k of CASH_METHODS) {
        const v = d.ventas.ventas[k];
        const a = d.ventas.anulado[k];
        if (v === 0 && a === 0) continue;
        lineas.push(fila(d.dia, l.local.alias, l.local.arcaCuit ?? "", ETIQUETA_MEDIO[k], importe(v), importe(a), importe(round2(v - a))));
      }
    }
  }
  return lineas.join("\r\n") + "\r\n";
}

// ── El vínculo casa → local (sólo desde la consola de GSG) ───────────────────

/** Lo que el vínculo necesita saber de un negocio (tabla Tenant). */
export interface NegocioDeLaRed {
  id: string;
  name: string;
  slug: string;
  modules: readonly string[];
  arcaCuit: string | null;
}

export interface EstadoParaVincular {
  casa: NegocioDeLaRed | null;
  local: NegocioDeLaRed | null;
  /** Otras casas que ya tienen a este local (vínculo no dado de baja). */
  otrasCasasDelLocal: { id: string; name: string }[];
  /** Casas que tienen a la CASA como local: una casa no puede ser local de otra red. */
  casasDeLaCasa: { id: string; name: string }[];
  /** Negocios que no se tocan sin el OK del dueño (CH). */
  requiereOk: (slug: string) => boolean;
}

export const MOTIVO_OK_DEL_DUENIO_RED =
  "Requiere OK del dueño: es un cliente vivo en producción y no se suma a una red sin su aprobación.";

/**
 * ¿Se puede vincular este local a esta casa? Es la ÚNICA puerta que habilita leer datos de otro
 * negocio, así que todo lo dudoso se rechaza con el porqué y cómo seguir. Si se puede, puede
 * venir un aviso (CUIT distinto). PURA.
 */
export function validarVinculo(e: EstadoParaVincular): { ok: true; aviso: string | null } | { ok: false; motivo: string } {
  const { casa, local } = e;
  if (!casa) return { ok: false, motivo: "La casa no existe. Recargá la ficha." };
  if (!local) return { ok: false, motivo: "El local elegido no existe. Recargá la ficha y elegilo de nuevo." };
  if (casa.id === local.id) return { ok: false, motivo: "Un negocio no puede ser local de sí mismo." };
  if (e.requiereOk(casa.slug) || e.requiereOk(local.slug)) return { ok: false, motivo: MOTIVO_OK_DEL_DUENIO_RED };
  if (!casa.modules.includes(MODULO_MULTILOCAL)) {
    return {
      ok: false,
      motivo:
        `Primero activá «Mis locales» en ${casa.name} (Apps del negocio, más abajo). Sin ese módulo el ` +
        "vínculo no abre ninguna pantalla, y la fila quedaría sin dueño claro.",
    };
  }
  for (const n of [casa, local]) {
    if (n.modules.includes(MODULO_CARTERA)) {
      return {
        ok: false,
        motivo:
          `«${n.name}» tiene el panel del contador (Cartera). Un estudio contable no puede ser parte de una ` +
          "red de locales: los dos paneles leen otros negocios desde el mismo lugar y se mezclarían.",
      };
    }
  }
  if (local.modules.includes(MODULO_MULTILOCAL)) {
    return { ok: false, motivo: `«${local.name}» es la casa de su propia red: no puede ser local de otra.` };
  }
  if (e.otrasCasasDelLocal.length > 0) {
    const otra = e.otrasCasasDelLocal[0];
    return {
      ok: false,
      motivo: `«${local.name}» ya es local de «${otra.name}». Un local está en una sola red: dalo de baja allá antes de sumarlo acá.`,
    };
  }
  if (e.casasDeLaCasa.length > 0) {
    return {
      ok: false,
      motivo: `«${casa.name}» es local de la red de «${e.casasDeLaCasa[0].name}»: una casa no puede ser, a la vez, local de otra.`,
    };
  }
  const cuitCasa = (casa.arcaCuit ?? "").replace(/\D/g, "");
  const cuitLocal = (local.arcaCuit ?? "").replace(/\D/g, "");
  const aviso =
    cuitCasa && cuitLocal && cuitCasa !== cuitLocal
      ? `Ojo: «${local.name}» tiene otro CUIT que la casa. La dueña va a ver sus ventas, cajas y stock; ` +
        "los traslados de mercadería (cuando lleguen) sólo van entre locales del mismo CUIT."
      : null;
  return { ok: true, aviso };
}

/** Alias del local en la red: el que escribió el operador o, si no, el nombre del negocio. */
export function aliasDelLocal(pedido: string | null | undefined, nombre: string): string {
  const limpio = (pedido ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  return limpio || nombre;
}

async function ponerGuc(tx: Tx, tenantId: string): Promise<void> {
  // set_config(..., true) = SET LOCAL parametrizable: vale hasta el final de ESTA transacción
  // y cada sentencia lo relee, así una transacción puede pasar de un negocio a otro sin salir.
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
}

/**
 * Serializa a quien toca la misma casa o el mismo local: dos operadores que vinculan el mismo
 * local a dos casas a la vez no se cuelan entre la lectura y la escritura. Siempre en el mismo
 * orden (ids ordenados) para que dos transacciones no se esperen en cruz.
 */
async function bloquear(tx: Tx, ids: readonly string[]): Promise<void> {
  for (const id of [...new Set(ids)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`red-locales:${id}`}))`;
  }
}

const SELECT_NEGOCIO = { id: true, name: true, slug: true, modules: true, arcaCuit: true } as const;

/**
 * Qué casas (negocios con `multilocal`, fuera de `excepto`) tienen a cada uno de `ids` como
 * local, con el vínculo sin dar de baja. Recorre las casas con el GUC de cada una: funciona
 * igual con un rol exento de RLS (el del operador) que con `app_rls`, donde sin GUC la tabla
 * no devuelve nada y la validación pasaría en falso.
 */
async function casasQueTienenA(tx: Tx, ids: readonly string[], excepto: string): Promise<Map<string, { id: string; name: string }[]>> {
  const casas = await tx.tenant.findMany({
    where: { modules: { has: MODULO_MULTILOCAL }, id: { not: excepto } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const salida = new Map<string, { id: string; name: string }[]>(ids.map((id) => [id, []]));
  for (const c of casas) {
    await ponerGuc(tx, c.id);
    const filas = await tx.carteraCliente.findMany({
      where: { tenantId: c.id, clienteTenantId: { in: [...ids] }, estado: { not: "baja" } },
      select: { clienteTenantId: true },
    });
    for (const f of filas) salida.get(f.clienteTenantId)?.push(c);
  }
  return salida;
}

/**
 * De los negocios `ids`, cuáles ya son local de OTRA red (una casa distinta de `casaId`) y de
 * cuál. Para la lista del formulario de la consola: ofrecer un negocio que después se rechaza
 * al enviar es un callejón. Sólo lectura; lo que decide sigue siendo `validarVinculo`, adentro
 * de la transacción del vínculo.
 */
export async function localesDeOtrasRedes(
  tx: Tx,
  ids: readonly string[],
  casaId: string,
): Promise<Map<string, { id: string; name: string }[]>> {
  if (ids.length === 0) return new Map();
  const salida = await casasQueTienenA(tx, ids, casaId);
  return new Map([...salida].filter(([, casas]) => casas.length > 0));
}

export interface PedidoVinculo {
  casaId: string;
  localId: string;
  alias?: string | null;
  /** "operator:<quien>", como el resto de la consola. */
  actor: string;
}

export type ResultadoVinculo =
  | { ok: true; alias: string; yaEstaba: boolean; aviso: string | null; casa: string; local: string }
  | { ok: false; motivo: string };

/**
 * Vincula el local a la casa, adentro de la transacción del operador:
 *   1. toma el candado de los dos negocios;
 *   2. relee casa, local y las otras redes, y valida (`validarVinculo`);
 *   3. con el GUC de la CASA escribe la fila de CarteraCliente y la auditoría de la casa;
 *   4. con el GUC del LOCAL escribe la auditoría del local.
 * Todo o nada. Funciona con el rol exento de RLS y con `app_rls` (medido en la suite de
 * aislamiento): cada escritura va con el GUC del negocio dueño de la fila.
 * Idempotente: vincular de nuevo un local ya activo no escribe nada (salvo un alias nuevo).
 */
export async function vincularEnTx(
  tx: Tx,
  p: PedidoVinculo,
  requiereOk: (slug: string) => boolean,
): Promise<ResultadoVinculo> {
  await bloquear(tx, [p.casaId, p.localId]);
  const [casa, local] = await Promise.all([
    tx.tenant.findUnique({ where: { id: p.casaId }, select: SELECT_NEGOCIO }),
    tx.tenant.findUnique({ where: { id: p.localId }, select: SELECT_NEGOCIO }),
  ]);
  const otras = casa && local ? await casasQueTienenA(tx, [p.localId, p.casaId], p.casaId) : new Map();
  const v = validarVinculo({
    casa,
    local,
    otrasCasasDelLocal: otras.get(p.localId) ?? [],
    casasDeLaCasa: otras.get(p.casaId) ?? [],
    requiereOk,
  });
  if (!v.ok) return v;
  const c = casa!;
  const l = local!;

  await ponerGuc(tx, c.id);
  const antes = await tx.carteraCliente.findUnique({
    where: { tenantId_clienteTenantId: { tenantId: c.id, clienteTenantId: l.id } },
    select: { alias: true, estado: true },
  });
  const alias = aliasDelLocal(p.alias, antes?.alias ?? l.name);
  // Se copia ANTES de escribir: lo que se audita es el estado que había, no el que quedó.
  const estadoAnterior = antes?.estado ?? null;
  const yaEstaba = estadoAnterior === "activa";
  if (yaEstaba && antes?.alias === alias) {
    return { ok: true, alias, yaEstaba: true, aviso: v.aviso, casa: c.name, local: l.name };
  }
  await tx.carteraCliente.upsert({
    where: { tenantId_clienteTenantId: { tenantId: c.id, clienteTenantId: l.id } },
    update: { estado: "activa", alias },
    create: { tenantId: c.id, clienteTenantId: l.id, alias, estado: "activa" },
  });
  await tx.auditLog.create({
    data: {
      tenantId: c.id,
      actor: p.actor,
      action: yaEstaba ? "multilocal.alias" : "multilocal.vincular",
      entity: "CarteraCliente",
      entityId: l.id,
      changes: {
        casaId: c.id,
        localId: l.id,
        localSlug: l.slug,
        alias,
        estadoAnterior,
        estado: "activa",
        ...(v.aviso ? { aviso: v.aviso } : {}),
      },
    },
  });
  // El local también se entera: su propia auditoría dice desde cuándo y quién puede leer sus
  // ventas, su caja y su stock. Sin esto, el local no tiene forma de saberlo (la fila de la red
  // vive bajo la RLS de la casa).
  await ponerGuc(tx, l.id);
  await tx.auditLog.create({
    data: {
      tenantId: l.id,
      actor: p.actor,
      action: "multilocal.vinculado",
      entity: "Tenant",
      entityId: c.id,
      changes: { casaId: c.id, casaSlug: c.slug, casa: c.name, alias },
    },
  });
  return { ok: true, alias, yaEstaba, aviso: v.aviso, casa: c.name, local: l.name };
}

/**
 * Da de baja el vínculo: la casa deja de ver el local en el acto. No borra nada (la fila queda
 * en `baja`, con su historia) y deja auditoría en los dos negocios. Siempre se puede dar de
 * baja, aunque la casa ya no tenga el módulo: salir es más seguro que quedarse.
 */
export async function darDeBajaEnTx(
  tx: Tx,
  p: Omit<PedidoVinculo, "alias">,
): Promise<{ ok: true; alias: string } | { ok: false; motivo: string }> {
  await bloquear(tx, [p.casaId, p.localId]);
  await ponerGuc(tx, p.casaId);
  const fila = await tx.carteraCliente.findUnique({
    where: { tenantId_clienteTenantId: { tenantId: p.casaId, clienteTenantId: p.localId } },
    select: { alias: true, estado: true },
  });
  if (!fila || fila.estado === "baja") {
    return { ok: false, motivo: "Ese local no está vinculado a esta casa (o ya estaba dado de baja). Recargá la ficha." };
  }
  const { alias, estado: estadoAnterior } = fila;
  await tx.carteraCliente.update({
    where: { tenantId_clienteTenantId: { tenantId: p.casaId, clienteTenantId: p.localId } },
    data: { estado: "baja" },
  });
  await tx.auditLog.create({
    data: {
      tenantId: p.casaId,
      actor: p.actor,
      action: "multilocal.baja",
      entity: "CarteraCliente",
      entityId: p.localId,
      changes: { casaId: p.casaId, localId: p.localId, alias, estadoAnterior, estado: "baja" },
    },
  });
  await ponerGuc(tx, p.localId);
  await tx.auditLog.create({
    data: {
      tenantId: p.localId,
      actor: p.actor,
      action: "multilocal.desvinculado",
      entity: "Tenant",
      entityId: p.casaId,
      changes: { casaId: p.casaId, alias },
    },
  });
  return { ok: true, alias };
}

/** Un local de la red, visto desde la consola (con su estado de facturación). */
export interface LocalEnLaFicha {
  localTenantId: string;
  alias: string;
  estado: EstadoVinculo;
  nombre: string;
  slug: string;
  arcaCuit: string | null;
  arcaPuntoVenta: number | null;
}

export interface RedEnLaFicha {
  /** Las filas de la red de ESTE negocio (si es casa), en cualquier estado. */
  locales: LocalEnLaFicha[];
  /** Filas de CarteraCliente de este negocio que no están de baja (de la red o de la cartera). */
  vinculosActivos: number;
  /** Casas que tienen a este negocio como local. */
  esLocalDe: { id: string; name: string }[];
}

/**
 * Lo que la ficha del negocio muestra de la red, leído en la transacción del operador con el
 * GUC de cada negocio (ver `casasQueTienenA`). Sólo lectura.
 */
export async function leerRedEnTx(tx: Tx, tenantId: string): Promise<RedEnLaFicha> {
  await ponerGuc(tx, tenantId);
  const filas = await tx.carteraCliente.findMany({
    where: { tenantId },
    orderBy: [{ estado: "asc" }, { alias: "asc" }],
    select: { clienteTenantId: true, alias: true, estado: true },
  });
  const metas =
    filas.length > 0
      ? await tx.tenant.findMany({
          where: { id: { in: filas.map((f) => f.clienteTenantId) } },
          select: { id: true, name: true, slug: true, arcaCuit: true, arcaPuntoVenta: true },
        })
      : [];
  const porId = new Map(metas.map((m) => [m.id, m]));
  const locales: LocalEnLaFicha[] = [];
  for (const f of filas) {
    const m = porId.get(f.clienteTenantId);
    if (!m) continue;
    locales.push({
      localTenantId: f.clienteTenantId,
      alias: f.alias,
      estado: f.estado as EstadoVinculo,
      nombre: m.name,
      slug: m.slug,
      arcaCuit: m.arcaCuit,
      arcaPuntoVenta: m.arcaPuntoVenta,
    });
  }
  const esLocalDe = (await casasQueTienenA(tx, [tenantId], tenantId)).get(tenantId) ?? [];
  return { locales, vinculosActivos: filas.filter((f) => f.estado !== "baja").length, esLocalDe };
}

/** "Red MAGRA: 5 locales · 1 sin punto de venta" — el número de la ficha. PURA. */
export function resumenDeLaFicha(nombre: string, locales: readonly LocalEnLaFicha[]): string {
  const activos = locales.filter((l) => l.estado === "activa");
  const sinPv = activos.filter((l) => !l.arcaPuntoVenta).length;
  const n = activos.length;
  const base = `Red ${nombre}: ${n} ${n === 1 ? "local" : "locales"}`;
  return sinPv > 0 ? `${base} · ${sinPv} sin punto de venta` : base;
}

// ── Abrir un local que ya nace dentro de la red (consola de GSG, paso "¿de qué red?") ──
//
// El alta de un local suelto la hace la fábrica de negocios (operator-provisioning-actions.ts).
// Para una marca, además, el local nuevo tiene que quedar: con el CUIT y el punto de venta que
// le toca (sin repetir el talonario de otro local del mismo CUIT), vinculado a la casa y con la
// lista de la casa. Todo va en UNA transacción del operador, justo después del alta, y reintentar
// es seguro (el vínculo y el empuje son idempotentes).
//
// El vínculo y el CUIT + punto de venta son todo o nada. La lista NO los arrastra: si no se puede
// dejar (la casa tiene dos productos con el mismo nombre, o el local ya tenía catálogo propio), el
// local queda igual en la red y la lista queda pendiente, dicha con su porqué. Antes, un rechazo
// de la lista deshacía el vínculo, y "Reintentar" volvía a mandar lo mismo: el local creado quedaba
// fuera de la red sin salida desde el alta. La lista pendiente se manda después con vista previa,
// desde la casa (Catálogo y precios de la marca).
//
// Sin vista previa el empuje sólo CREA productos (`huella: null`, catalogo-marca-core.ts): esta
// puerta recibe el id del local por formulario, y un local que ya existía con su catálogo no puede
// perder sus precios porque alguien lo sumó desde el alta.

export interface PedidoAltaEnRed {
  casaId: string;
  localId: string;
  alias?: string | null;
  /** El CUIT que escribió el operador; vacío = el de la casa. */
  cuit?: string | null;
  /** El punto de venta de ARCA del local; vacío = se carga después en la ficha. */
  puntoVenta?: string | null;
  /** "operator:<quien>". */
  actor: string;
  /** Id del lote del empuje del catálogo (lo genera la action). */
  lote: string;
}

export type ResultadoAltaEnRed =
  | {
      ok: true;
      casa: string;
      local: string;
      alias: string;
      aviso: string | null;
      cuit: string | null;
      puntoVenta: number | null;
      catalogo: ResultadoEmpuje;
    }
  | { ok: false; motivo: string };

/** Un rechazo a mitad de la corrida: deshace lo que ya se escribió en la transacción. */
export class AltaEnRedRechazada extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "AltaEnRedRechazada";
  }
}

/**
 * CUIT y punto de venta del local nuevo, leídos de lo que escribió el operador. PURA.
 * Sin CUIT escrito, el de la casa. El punto de venta: vacío, o un entero de 1 a 99999 (lo
 * mismo que acepta la ficha, operator-actions.ts).
 */
export function leerFiscalDelAlta(
  pedido: { cuit?: string | null; puntoVenta?: string | null },
  cuitDeLaCasa: string | null,
): { ok: true; cuit: string | null; puntoVenta: number | null } | { ok: false; motivo: string } {
  const crudo = (pedido.cuit ?? "").trim();
  let cuit: string | null = cuitNormalizado(cuitDeLaCasa);
  if (crudo) {
    const r = interpretarCuitInput(crudo);
    if (r.accion === "error") return { ok: false, motivo: r.motivo };
    cuit = r.accion === "set" ? r.cuit : null;
  }
  const pv = (pedido.puntoVenta ?? "").trim();
  if (!pv) return { ok: true, cuit, puntoVenta: null };
  if (!/^\d{1,5}$/.test(pv) || Number(pv) <= 0) {
    return { ok: false, motivo: `"${pv}" no es un punto de venta válido: va un número entero de 1 a 99999 (el que ARCA habilitó para este CUIT).` };
  }
  if (!cuit) return { ok: false, motivo: "Para cargar el punto de venta hace falta el CUIT: la casa no tiene uno cargado, escribilo." };
  return { ok: true, cuit, puntoVenta: Number(pv) };
}

/**
 * ¿Ese CUIT ya usa ese punto de venta en otro negocio? El motivo del rechazo (con los puntos de
 * venta que ese CUIT ya usa) o null. Lee con el `tx` del operador; con `bloquear` = toma antes
 * el MISMO candado por CUIT que la ficha (operator-actions.ts), así dos operadores no se cuelan.
 */
export async function choqueFiscalEnTx(
  tx: Tx,
  localId: string,
  cuit: string | null,
  puntoVenta: number | null,
  bloquear: boolean,
): Promise<string | null> {
  if (!cuit || !puntoVenta) return null;
  if (bloquear) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`arca-punto-venta:${cuit}`}))`;
  const otros = await tx.tenant.findMany({
    where: { arcaCuit: cuit, id: { not: localId } },
    select: { id: true, name: true, slug: true, arcaCuit: true, arcaPuntoVenta: true },
  });
  const otro = choqueDePuntoDeVenta({ tenantId: localId, cuit, puntoVenta }, otros);
  return otro ? motivoDeChoque(cuit, puntoVenta, otro, puntosDeVentaUsados(localId, cuit, otros)) : null;
}

/**
 * El local recién dado de alta entra a la red, en la transacción del operador:
 *   1. el vínculo casa → local (`vincularEnTx`: sus validaciones, su candado y su auditoría);
 *   2. el CUIT y el punto de venta del local, con el candado por CUIT y sin repetir talonario;
 *   3. la lista de la casa, empujada al local (`empujarEnTx`, sin vista previa: sólo crea), con
 *      auditoría en los dos.
 * Un rechazo de 1 o 2 TIRA `AltaEnRedRechazada`: la transacción se deshace entera y el operador
 * ve el porqué. La lista que no se puede dejar no tira: vuelve como `catalogo` "no-aplicable",
 * con su motivo, y lo demás queda. Sirve también para reintentar: lo hecho no se escribe de nuevo.
 */
export async function sumarAltaEnTx(
  tx: Tx,
  p: PedidoAltaEnRed,
  requiereOk: (slug: string) => boolean,
): Promise<Extract<ResultadoAltaEnRed, { ok: true }>> {
  const vinculo = await vincularEnTx(tx, { casaId: p.casaId, localId: p.localId, alias: p.alias, actor: p.actor }, requiereOk);
  if (!vinculo.ok) throw new AltaEnRedRechazada(vinculo.motivo);

  const [casa, local] = await Promise.all([
    tx.tenant.findUnique({ where: { id: p.casaId }, select: { name: true, slug: true, arcaCuit: true } }),
    tx.tenant.findUnique({ where: { id: p.localId }, select: { name: true, arcaCuit: true, arcaPuntoVenta: true } }),
  ]);
  if (!casa || !local) throw new AltaEnRedRechazada("La casa o el local ya no existen. Recargá la consola.");

  const fiscal = leerFiscalDelAlta(p, casa.arcaCuit);
  if (!fiscal.ok) throw new AltaEnRedRechazada(fiscal.motivo);
  const cuitActual = cuitNormalizado(local.arcaCuit);
  if (cuitActual && fiscal.cuit && cuitActual !== fiscal.cuit) {
    throw new AltaEnRedRechazada(
      `«${local.name}» ya tiene otro CUIT cargado (${cuitActual}). No se pisa desde el alta: corregilo en su ficha si hace falta.`,
    );
  }
  if (local.arcaPuntoVenta && fiscal.puntoVenta && local.arcaPuntoVenta !== fiscal.puntoVenta) {
    throw new AltaEnRedRechazada(
      `«${local.name}» ya tiene el punto de venta ${local.arcaPuntoVenta}. No se pisa desde el alta: corregilo en su ficha si hace falta.`,
    );
  }
  const choque = await choqueFiscalEnTx(tx, p.localId, fiscal.cuit, fiscal.puntoVenta, true);
  if (choque) throw new AltaEnRedRechazada(choque);

  const nuevoCuit = cuitActual ?? fiscal.cuit;
  const nuevoPv = local.arcaPuntoVenta ?? fiscal.puntoVenta;
  if (nuevoCuit !== cuitActual || nuevoPv !== local.arcaPuntoVenta) {
    await tx.tenant.update({ where: { id: p.localId }, data: { arcaCuit: nuevoCuit, arcaPuntoVenta: nuevoPv } });
    await ponerGuc(tx, p.localId);
    await tx.auditLog.create({
      data: {
        tenantId: p.localId,
        actor: p.actor,
        action: "fiscal.alta-en-red",
        entity: "Tenant",
        entityId: p.localId,
        changes: {
          arcaCuit: nuevoCuit,
          arcaPuntoVenta: nuevoPv,
          antes: { arcaCuit: local.arcaCuit, arcaPuntoVenta: local.arcaPuntoVenta },
          casaId: p.casaId,
        },
      },
    });
  }

  // La lista de la casa, leída con SU GUC; después, escrita en el local con el suyo. Lo que impide
  // dejarla no deshace el vínculo ni el CUIT: queda pendiente y se dice por qué.
  await ponerGuc(tx, p.casaId);
  const lista = listaDeLaCasa(await leerCatalogo(tx, p.casaId));
  let catalogo: ResultadoEmpuje;
  if (lista.repetidos.length > 0) {
    catalogo = {
      estado: "no-aplicable",
      motivo:
        `La lista de ${casa.name} tiene productos con el mismo nombre (${lista.repetidos.join(", ")}). ` +
        `Hay que renombrar uno en la casa y después mandarla desde «${NOMBRE_APP_CATALOGO}».`,
    };
  } else if (lista.incluidos === 0) {
    catalogo = {
      estado: "no-aplicable",
      motivo: `${casa.name} todavía no tiene productos activos con precio: no hay lista para mandar. Cuando la cargue, la manda desde «${NOMBRE_APP_CATALOGO}».`,
    };
  } else {
    await ponerGuc(tx, p.localId);
    catalogo = await empujarEnTx(tx, {
      tenantId: p.localId,
      lista,
      huella: null,
      actor: p.actor,
      casa: { id: p.casaId, nombre: casa.name },
      por: "Gestión Studio Grow, al abrir el local",
      lote: p.lote,
    });
  }
  // El resumen en la casa, sólo si la lista cambió algo: reintentar no deja filas de más.
  if (catalogo.estado === "aplicado") {
    await ponerGuc(tx, p.casaId);
    await tx.auditLog.create({
      data: {
        tenantId: p.casaId,
        actor: p.actor,
        action: ACCION_CATALOGO_EN_LA_CASA,
        entity: "Product",
        channel: "admin",
        changes: { lote: p.lote, origen: "alta-del-local", locales: [{ localId: p.localId, alias: vinculo.alias, resultado: catalogo }] },
      },
    });
  }
  return {
    ok: true,
    casa: casa.name,
    local: local.name,
    alias: vinculo.alias,
    aviso: vinculo.aviso,
    cuit: nuevoCuit,
    puntoVenta: nuevoPv,
    catalogo,
  };
}
