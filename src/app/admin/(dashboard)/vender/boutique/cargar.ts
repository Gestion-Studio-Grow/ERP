// EL MOSTRADOR BOUTIQUE DE VENDER, EN UNA TANDA (Magra · tanda perf, P-1).
//
// Antes, la rama boutique de Vender leía en cascada (página → MostradorDeVenta → extras → envíos →
// cuentas → balanza: 5 niveles de `await`) y cada lectura suelta iba envuelta en su transacción de
// RLS (BEGIN + set_config + consulta + COMMIT): 116 sentencias para 37 consultas, y el `Tenant` leído
// una y otra vez. Acá, UN `Promise.all`: las lecturas directas del mostrador van juntas en UNA
// `tenantTransaction` (un BEGIN, un set_config, un COMMIT), el `Tenant` se lee una vez, y lo que ya
// leyó la página (identidad, interruptores) se pasa en vez de volver a pedirlo.
//
// Son las MISMAS consultas y las MISMAS reglas que los lectores de siempre (`cargarVender`,
// `getPosStockSnapshot`, `cargarBoutique`, `cargarTeclasDelMostrador`, `balanzaDeVender`,
// `getAperturaEnVender`, `cuentasCorrientesDe`): si la transacción falla (una tabla de config que
// no está, un corte), se cae a esos lectores sueltos, cada uno con su red, y Vender sigue.
//
// No es una Server Action (sin "use server"): la llama la página, ya detrás de `requireApp`.

import "server-only";
import { tenantTransaction } from "@/lib/rls";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability, type Role } from "@/lib/capabilities";
import { businessWallTimeToUtc, dateStrInBusinessTz, todayInBusinessTz } from "@/lib/datetime";
import { lastClosedDayTx } from "@/lib/caja/frontera-cierre";
import { isFrozenDay } from "@/lib/caja/cierre-diario";
import { finDelDiaDelNegocio, saldoEfectivoDelLibro } from "@/lib/caja/saldo-cajon";
import { isDemoSandbox } from "@/lib/demo-flag";
import { leerConfigEnvios, type ConfigEnvios } from "@/lib/envios/config";
import { leerConfigCaja } from "@/lib/supermercado/config-repo";
import { leerTeclasFijadasDelNegocio } from "@/lib/vender/teclas-fijadas";
import { cargarGondolas } from "@/lib/catalogo/precios-lectura";
import { getPosStockSnapshot } from "@/lib/stock/pos-stock";
import type { PosStockInfo } from "@/lib/stock/pos-stock-rules";
import { getAperturaEnVender } from "@/lib/caja-actions";
import { cuentasCorrientesPrendidas } from "@/lib/settlement/asiento-libro";
import { ARQUEO_CIEGO, CUENTAS_CORRIENTES } from "@/cambios/interruptores";
import type { EstadoInterruptores } from "@/cambios/interruptores-core";
import { pedidoDeVentaDesdeLaFicha } from "@/lib/clientes/fiado.server";
import { leerPedidoDeVenta, type RepetirPedido } from "@/lib/clientes/fiado";
import type { ClienteElegido } from "@/lib/clientes/buscar-para-venta";
import type { SessionUser } from "@/lib/session";
import type { BalanzaDeVender } from "../reglas-venta";
import { BOTONES_RAPIDOS, DIAS_MAS_VENDIDOS, masVendidos } from "../reglas-venta";
import { cargarBoutique, cargarVender } from "../datos";
import type { TeclasDelMostrador } from "../teclas.server";
import { terminalDelEquipo } from "@/lib/terminal/terminal.server";
import { puedeAbrirApp } from "../puede-abrir";

/** Un producto vendible del mostrador (con precio): lo mismo que `cargarVender`. */
export type ProductoDelMostrador = {
  id: string;
  name: string;
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
  unit: string;
  codigo: string | null;
};

type Apertura = Awaited<ReturnType<typeof getAperturaEnVender>>;

/** Lo que sale de la base para el mostrador (una transacción, o los lectores sueltos si falla). */
export type DatosDelMostrador = {
  products: ProductoDelMostrador[];
  rapidos: string[];
  negocio: string;
  stockById: Record<string, PosStockInfo>;
  /** Productos activos (con y sin precio), para el aviso «sin precios». */
  activos: number;
  envios: ConfigEnvios | null;
  diaCerrado: string | null;
  fijadas: { ids: string[]; version: string | null };
  /** El formato de la balanza guardado por el negocio; null = no hay (o no se pudo leer). */
  formatoBalanza: { formato: BalanzaDeVender["formato"]; porDefecto: boolean } | null;
  apertura: Apertura;
};

export type MostradorBoutique = DatosDelMostrador & {
  hoy: string;
  terminal: Awaited<ReturnType<typeof terminalDelEquipo>>;
  puedeCuentas: boolean;
  puedeFacturar: boolean;
  /** ¿Puede abrir la app Balanza? (para ofrecer «Cambiar el formato»). */
  puedeBalanza: boolean;
  cuentasCorrientes: boolean;
  canManageCatalog: boolean;
  teclas: TeclasDelMostrador;
  desdeLaFicha: { cliente: ClienteElegido; repetir: RepetirPedido | null } | null;
};

/** Las lecturas directas del mostrador, todas en UNA transacción con RLS. */
async function datosEnUnaTransaccion(tenantId: string, hoy: string, conApertura: boolean): Promise<DatosDelMostrador> {
  const desde = new Date(businessWallTimeToUtc(hoy, "00:00").getTime() - DIAS_MAS_VENDIDOS * 86_400_000);
  return tenantTransaction(
    async (tx) => {
      const [filas, grupos, tenant, cerradoHasta, envios, fijadas, caja, sesionAbierta] = await Promise.all([
        // Una sola lectura del catálogo activo: la de `getPosStockSnapshot` (stock de todos los activos)
        // y la de `cargarVender` (los que tienen precio) salen de la misma fila.
        tx.product.findMany({
          where: { tenantId, deletedAt: null, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true, unit: true, codigo: true, stock: true, trackStock: true },
        }),
        tx.orderItem.groupBy({
          by: ["productId"],
          where: {
            tenantId,
            productId: { not: null },
            order: { is: { tenantId, paid: true, status: { not: "CANCELLED" }, createdAt: { gte: desde } } },
          },
          _count: { _all: true },
          orderBy: { _count: { productId: "desc" } },
          take: BOTONES_RAPIDOS * 2,
        }),
        tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
        lastClosedDayTx(tx, tenantId),
        leerConfigEnvios(tx, tenantId),
        leerTeclasFijadasDelNegocio(tx, tenantId),
        leerConfigCaja(tx, tenantId),
        conApertura ? tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } }) : Promise.resolve(null),
      ]);
      const diaCerrado = cerradoHasta && isFrozenDay(hoy, cerradoHasta) ? cerradoHasta : null;
      // «Abrí la caja: ayer quedaron $X» (la regla de `getAperturaEnVender`): sin turno abierto y
      // con el día de hoy sin cerrar, el efectivo que dice el libro.
      const hoyCaja = dateStrInBusinessTz(new Date());
      const diaDeCajaCerrado = cerradoHasta !== null && isFrozenDay(hoyCaja, cerradoHasta);
      const apertura: Apertura =
        conApertura && !diaDeCajaCerrado && !sesionAbierta
          ? { esperado: await saldoEfectivoDelLibro(tx, tenantId, finDelDiaDelNegocio(new Date())), ultimoCierre: cerradoHasta ?? null, hoy: hoyCaja, aCiegas: false }
          : null;
      const conPrecio = filas.filter((p) => p.price !== null || p.pricePerKg !== null);
      const stockById: Record<string, PosStockInfo> = {};
      for (const r of filas) stockById[r.id] = { stock: r.stock, trackStock: r.trackStock };
      const { version: _version, ...config } = envios;
      void _version;
      return {
        products: conPrecio.map(({ stock: _s, trackStock: _t, ...p }) => {
          void _s;
          void _t;
          return p;
        }),
        rapidos: masVendidos(grupos, new Set(conPrecio.map((p) => p.id))),
        negocio: tenant?.name ?? "Mi negocio",
        stockById,
        activos: filas.length,
        envios: config,
        diaCerrado,
        fijadas: { ids: fijadas.ids, version: fijadas.version },
        formatoBalanza: caja ? { formato: caja.formato, porDefecto: caja.porDefecto } : null,
        apertura,
      };
    },
    { tenantId },
  );
}

/** El camino de siempre, lector por lector, cada uno con su red: si la transacción única falla. */
async function datosSueltos(tenantId: string, hoy: string, conApertura: boolean): Promise<DatosDelMostrador> {
  const [datos, stock, extras, fijadas, caja, apertura] = await Promise.all([
    cargarVender(tenantId, hoy),
    getPosStockSnapshot(),
    cargarBoutique(tenantId, hoy),
    leerTeclasFijadasDelNegocio(prisma, tenantId).catch((e) => {
      logger.error("vender.teclas", "no se pudieron leer las teclas fijadas: Vender sigue con las de siempre", e);
      return { ids: [] as string[], version: null };
    }),
    leerConfigCaja(prisma, tenantId).catch((e) => {
      logger.error("vender.balanza", "no se pudo leer el formato de la balanza: Vender sigue sin el campo", e);
      return null;
    }),
    conApertura ? getAperturaEnVender() : Promise.resolve(null),
  ]);
  return {
    products: datos.products,
    rapidos: datos.rapidos,
    negocio: datos.negocio,
    stockById: stock.stockById,
    activos: stock.activeProducts,
    envios: extras.envios,
    diaCerrado: extras.diaCerrado,
    fijadas: { ids: fijadas.ids, version: fijadas.version },
    formatoBalanza: caja ? { formato: caja.formato, porDefecto: caja.porDefecto } : null,
    apertura,
  };
}

/** Qué puede abrir quien vende (las guardas de siempre; en el pedido ya las cacheó el layout). */
export type PermisosDelMostrador = {
  puedeCuentas: boolean;
  puedeFacturar: boolean;
  puedeBalanza: boolean;
  terminal: Awaited<ReturnType<typeof terminalDelEquipo>>;
};

export async function permisosDelMostrador(user: SessionUser): Promise<PermisosDelMostrador> {
  const [, puedeCuentas, puedeFacturar, puedeBalanza, terminal] = await Promise.all([
    // La misma guarda que `getPosStockSnapshot` (el stock del catálogo).
    requireCapability("orders:read"),
    // «A cuenta» y «Facturar» con la MISMA regla que exige su action (app, módulo, rol, rubro).
    puedeAbrirApp("cuentas-a-cobrar"),
    puedeAbrirApp("facturacion"),
    puedeAbrirApp("balanza"),
    terminalDelEquipo(user),
  ]);
  return { puedeCuentas, puedeFacturar, puedeBalanza, terminal };
}

/**
 * Todo lo que necesita la rama boutique de Vender, en UN `Promise.all`. Recibe lo que la página ya
 * leyó (el usuario, el negocio, los interruptores) y los parámetros de «Venderle / Repetir».
 */
export async function cargarMostradorBoutique(p: {
  user: SessionUser & { role: Role };
  tenantId: string;
  interruptores: EstadoInterruptores;
  cliente?: string | string[];
  repetir?: string | string[];
}, leerPermisos: (user: SessionUser) => Promise<PermisosDelMostrador> = permisosDelMostrador): Promise<MostradorBoutique> {
  const { user, tenantId } = p;
  const hoy = todayInBusinessTz();
  const tomaPedidos = roleHasCapability(user.role, "orders:manage");
  // La tarjeta «Abrí la caja» sólo para quien toma pedidos y nunca en la demo (`getAperturaEnVender`).
  const conApertura = tomaPedidos && !isDemoSandbox();
  const [datos, permisos, gondolas, desdeLaFicha] = await Promise.all([
    datosEnUnaTransaccion(tenantId, hoy, conApertura).catch((e) => {
      logger.error("vender.boutique", "la lectura en una transacción falló: Vender lee como siempre", e);
      return datosSueltos(tenantId, hoy, conApertura);
    }),
    leerPermisos(user),
    // Sin la columna (antes de Gate 2) devuelve vacío o falla: la góndola sale del nombre.
    cargarGondolas(tenantId).catch(() => new Map<string, string>()),
    tomaPedidos && leerPedidoDeVenta({ cliente: p.cliente, repetir: p.repetir }).clienteId
      ? pedidoDeVentaDesdeLaFicha({ cliente: p.cliente, repetir: p.repetir })
      : Promise.resolve(null),
  ]);
  return {
    ...datos,
    hoy,
    ...permisos,
    // «A cuenta» por NEGOCIO: el interruptor «cuentas-corrientes» ya leído con los demás (la misma
    // fila que lee `cuentasCorrientesDe`), sin otra consulta.
    cuentasCorrientes: cuentasCorrientesPrendidas(p.interruptores[CUENTAS_CORRIENTES]),
    canManageCatalog: roleHasCapability(user.role, "catalog:manage"),
    teclas: {
      fijadas: datos.fijadas.ids,
      version: datos.fijadas.version,
      puedeFijar: roleHasCapability(user.role, "catalog:manage"),
      gondolas: Object.fromEntries(gondolas),
    },
    desdeLaFicha,
    // Arqueo a ciegas (N2 · M1-C3): la tarjeta pide contar sin mostrar el número, y el número no viaja.
    apertura: p.interruptores[ARQUEO_CIEGO]?.encendido === true && datos.apertura ? { ...datos.apertura, esperado: 0, aCiegas: true } : datos.apertura,
  };
}
