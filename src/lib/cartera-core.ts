/**
 * CORE del módulo CARTERA (producto Contador — ADR-025 §12, diseño validado por
 * el Challenger en ADR-045). Hace REAL el scaffold de `contador-panel.ts`: un
 * estudio contable (tenant) administra la facturación de N clientes (cada uno,
 * OTRO tenant), sobre una tabla de ASIGNACIÓN explícita `CarteraCliente`
 * (patrón variante, ADR-055).
 *
 * REGLAS DE AISLAMIENTO (no negociables):
 *  - El panel NUNCA evade RLS: los datos de cada cliente se leen SOLO vía
 *    `tenantTransaction(clienteTenantId)` / `runInTenantContext` (los cores de
 *    bancos-glue), y SIEMPRE después de verificar la pertenencia del cliente a
 *    la cartera del estudio actual (`exigirClienteDeCartera`).
 *  - Jamás `operatorPrisma` en este camino.
 *  - La tabla CarteraCliente usa `tenantId` = estudio (dueño de la fila) → la
 *    policy RLS data-driven la cubre sola (ver prisma/schema.prisma).
 *
 * Este archivo es la LÓGICA con puertos inyectables (testeable sin DB, mismo
 * molde que bancos-glue/provisioning); las Server Actions que la cablean a
 * Prisma/RLS viven en `cartera-actions.ts`.
 *
 * ⚠️ SIN "use server", A PROPÓSITO. `recolectarCliente` lee la base de un cliente con
 * el tenantId que le pasan. En un archivo "use server" cada export es un endpoint: un
 * usuario autenticado de CUALQUIER tenant lo llamaría con un id ajeno, `tenantTransaction`
 * pondría el GUC con ese id y RLS lo dejaría pasar. La única puerta es
 * `monitorCarteraAction` (exigirEstudio → filas de SU cartera → recién ahí, por cliente).
 * Lo cuida un test de forma en monitor-core.test.ts.
 *
 * Y lo importa un client component (CarteraPanel, por UMBRAL_ALERTA_CAP): nada de
 * imports de VALOR de Prisma acá. Lo de Prisma entra sólo como `import type`.
 */

import { CAP_FACTURAS_MES_DEFAULT, cuitValido, normalizarCuit } from "@/plugins/bancos";
import { isValidEmail, suggestSlug } from "@/lib/provisioning/slug";
import { businessWallTimeToUtc, dateStrInBusinessTz } from "@/lib/datetime";
import {
  UMBRAL_OUTBOX_TRABADO,
  emiteConValidezFiscal,
  type HechosCliente,
  type ModoArca,
} from "@/lib/monitor-core";
import type { Prisma } from "@/generated/prisma/client";
import type { FiltrosFacturacionMes } from "@/lib/bancos-glue";

// ── Vocabulario (espejo del enum EstadoCarteraCliente del schema) ────────────

export type EstadoCartera = "activa" | "pausada" | "baja";

/** Id del módulo en el catálogo (ADR-054): la ASIGNACIÓN al tenant estudio es la llave del panel. */
export const MODULO_CARTERA = "cartera";

/** % del cap de facturas del mes desde el cual el cliente cuenta como "cerca del tope" (§12.3). */
export const UMBRAL_ALERTA_CAP = 0.8;

// ── Contratos del panel (el scaffold FilaCartera/ResumenCartera, hecho real) ──

/** Resumen fiscal de UN cliente (sale de los cores de bancos-glue, vía RLS). */
export interface ResumenFiscalCliente {
  facturasMes: number;
  capFacturasMes: number;
  montoFacturadoMes: number;
  pendientesRevision: number;
  /** Propuestas listas para "Emitir automáticas (N)". */
  listasParaEmitir: number;
  ultimaImportacion: { nombreArchivo: string; createdAt: string } | null;
}

/** Una fila de la cartera del contador (conserva el contrato del scaffold, ahora real). */
export interface FilaCartera extends ResumenFiscalCliente {
  carteraId: string;
  clienteTenantId: string;
  /** Nombre corto que usa el contador ("Kiosco de Marta"). */
  alias: string;
  /** Nombre real del negocio (Tenant.name). */
  nombre: string;
  slug: string;
  cuit: string | null;
  estado: EstadoCartera;
  /** % del cap consumido (0..1). ≥ UMBRAL_ALERTA_CAP ⇒ alerta. */
  pctCap: number;
  /** Config ARCA lista (CUIT cargado). Hoy siempre homologación (cert delegado GSG). */
  arcaConfigurado: boolean;
  arcaHomologacion: boolean;
  /**
   * `true` sólo si lo que emite tiene validez fiscal: ARCA en producción y el cliente
   * fuera de homologación (`emiteConValidezFiscal`). Si es `false`, su `montoFacturadoMes`
   * es "emitido en prueba" y la pantalla lo tiene que decir así.
   */
  validezFiscal: boolean;
  /** Subdominio del cliente si tiene URL propia (para "abrir su backoffice"). */
  subdomain: string | null;
}

/** KPIs de cabecera del panel (conserva el contrato del scaffold, ahora real). */
export interface ResumenCartera {
  /** Clientes activos (los pausados se cuentan aparte). */
  clientes: number;
  pausados: number;
  /** Facturas del CUPO del mes (todo lo emitido, rechazados incluidos), entre todos. */
  facturasMes: number;
  /** Suma de todos los `montoFacturadoMes`, con y sin validez fiscal. */
  montoFacturadoMes: number;
  /** De eso, lo emitido CON validez fiscal (filas con `validezFiscal`). */
  montoFiscalMes: number;
  /** De eso, lo emitido EN PRUEBA: tiene CAE de homologación o del simulador, no es factura. */
  montoPruebaMes: number;
  pendientesRevision: number;
  listasParaEmitir: number;
  /** Clientes con pctCap ≥ UMBRAL_ALERTA_CAP. */
  cercaDelTope: number;
}

// ── Puertos (los cablea cartera-actions; los tests inyectan fakes) ───────────

/** Fila cruda de CarteraCliente (lo que devuelve la DB del ESTUDIO). */
export interface FilaCarteraDb {
  id: string;
  clienteTenantId: string;
  alias: string;
  estado: EstadoCartera;
}

/** Metadata del tenant cliente (tabla Tenant, fuera de RLS — solo control). */
export interface ClienteInfo {
  nombre: string;
  slug: string;
  subdomain: string | null;
  arcaCuit: string | null;
  arcaHomologacion: boolean;
}

export interface CarteraPorts {
  /** Filas de la cartera del estudio (SIEMPRE filtradas por estudioTenantId; excluye `baja`). */
  filasDeCartera(estudioTenantId: string): Promise<FilaCarteraDb[]>;
  /** Metadata del tenant cliente. `null` si no existe (fila huérfana). */
  datosCliente(clienteTenantId: string): Promise<ClienteInfo | null>;
  /** Resumen fiscal del cliente — la implementación real corre vía tenantTransaction(clienteTenantId). */
  resumenFiscalCliente(clienteTenantId: string): Promise<ResumenFiscalCliente>;
}

// ── Armado del panel (PURO + puertos) ─────────────────────────────────────────

/**
 * Combina fila + metadata + resumen fiscal en la fila que ve el contador. PURA.
 *
 * `modoArca` es el de la plataforma (`ARCA_MODO`). Sin él no se puede afirmar que algo
 * tenga validez fiscal, así que la fila sale con `validezFiscal: false`: ante la duda,
 * "en prueba" (lo que se muestra de más como prueba no le hace perder plata a nadie; lo
 * que se muestra como facturado sin serlo, sí).
 */
export function armarFilaCartera(
  fila: FilaCarteraDb,
  info: ClienteInfo,
  resumen: ResumenFiscalCliente,
  modoArca?: ModoArca,
): FilaCartera {
  const cap = resumen.capFacturasMes > 0 ? resumen.capFacturasMes : CAP_FACTURAS_MES_DEFAULT;
  return {
    carteraId: fila.id,
    clienteTenantId: fila.clienteTenantId,
    alias: fila.alias,
    estado: fila.estado,
    nombre: info.nombre,
    slug: info.slug,
    subdomain: info.subdomain,
    cuit: info.arcaCuit,
    arcaConfigurado: info.arcaCuit !== null && info.arcaCuit !== "",
    arcaHomologacion: info.arcaHomologacion,
    validezFiscal: modoArca ? emiteConValidezFiscal(info.arcaHomologacion, modoArca) : false,
    ...resumen,
    pctCap: resumen.facturasMes / cap,
  };
}

/** KPIs de cabecera a partir de las filas. PURA. */
export function resumirCartera(filas: FilaCartera[]): ResumenCartera {
  const suma = (f: (x: FilaCartera) => number) => filas.reduce((s, x) => s + f(x), 0);
  return {
    clientes: filas.filter((f) => f.estado === "activa").length,
    pausados: filas.filter((f) => f.estado === "pausada").length,
    facturasMes: suma((f) => f.facturasMes),
    montoFacturadoMes: suma((f) => f.montoFacturadoMes),
    montoFiscalMes: suma((f) => (f.validezFiscal ? f.montoFacturadoMes : 0)),
    montoPruebaMes: suma((f) => (f.validezFiscal ? 0 : f.montoFacturadoMes)),
    pendientesRevision: suma((f) => f.pendientesRevision),
    listasParaEmitir: suma((f) => f.listasParaEmitir),
    cercaDelTope: filas.filter((f) => f.pctCap >= UMBRAL_ALERTA_CAP).length,
  };
}

// ── La pasada única por cliente: volumen + hechos del monitoreo ───────────────
//
// Antes cada cliente costaba 1 lectura de Tenant + 1 tenantTransaction de volumen (que
// volvía a leer Tenant), y el monitoreo, cableado aparte, iba a sumar otra transacción
// por cliente. Ahora: UNA lectura de metadata para toda la cartera y UNA transacción por
// cliente que devuelve las dos cosas. El piso son N transacciones: el GUC de RLS es por
// transacción y operatorPrisma está prohibido en este camino, así que no hay una sola
// consulta que las junte sin evadir el aislamiento.

/** Metadata del tenant cliente que trae la lectura única (Tenant, fuera de RLS — solo control). */
export interface MetaCliente extends ClienteInfo {
  arcaPuntoVenta: number | null;
  /** `Tenant.bancosCapFacturasMes`; `null` = el default del producto. */
  capFacturasMes: number | null;
}

/** Lo que la pasada necesita además del cliente: un solo reloj para toda la cartera. */
export interface ContextoRecoleccion {
  /** Los cortes del mes de `Invoice` (bancos-glue `filtrosFacturacionMes`). */
  filtros: FiltrosFacturacionMes;
  /** 00:00 de HOY en hora del negocio, en UTC: lo de hoy todavía no se puede haber cerrado. */
  inicioDeHoy: Date;
  /**
   * Hasta qué día está cerrada la caja, leído con ESTE `tx` (frontera-cierre
   * `lastClosedDayTx`). Entra inyectado porque ese módulo importa prisma y éste no puede.
   */
  leerFronteraCaja: (tx: Prisma.TransactionClient, tenantId: string) => Promise<string | null>;
}

export interface RecoleccionCliente {
  resumen: ResumenFiscalCliente;
  hechos: HechosCliente;
}

/** Decimal de Prisma → number, en el borde (ADR-057; mismo criterio que `toNum` de bancos-glue). */
function aNumero(v: unknown): number {
  if (v != null && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** "2026-09-03" → "2026-09-04" (anclado a mediodía UTC: sin corrimientos de zona). */
function diaSiguiente(dia: string): string {
  const d = new Date(`${dia}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * La pasada de UN cliente: volumen del mes y hechos del monitoreo, con el `tx` de SU
 * `tenantTransaction` (GUC = cliente). Nunca abre otra conexión ni usa el prisma ambiental.
 *
 * NO la llames con un `fila` que no salió de la cartera del estudio actual: el aislamiento
 * lo pone quien la llama (`recorrerCartera` + `monitorCarteraAction`), no esta función.
 */
export async function recolectarCliente(
  tx: Prisma.TransactionClient,
  fila: FilaCarteraDb,
  meta: MetaCliente,
  ctx: ContextoRecoleccion,
): Promise<RecoleccionCliente> {
  const tenantId = fila.clienteTenantId;
  const { filtros } = ctx;

  const [
    facturasMes,
    facturado,
    rechazadasMes,
    pendientesRevision,
    listasParaEmitir,
    revisionMasVieja,
    ultimaImportacion,
    ultimaFactura,
    outboxTrabados,
    credencial,
    ultimoMovimientoCaja,
  ] = await Promise.all([
    tx.invoice.count({ where: { tenantId, ...filtros.cupo } }),
    tx.invoice.aggregate({ _sum: { total: true }, where: { tenantId, ...filtros.facturado } }),
    tx.invoice.count({ where: { tenantId, ...filtros.rechazado } }),
    tx.movimientoImportado.count({ where: { tenantId, estadoPropuesta: "revision" } }),
    tx.movimientoImportado.count({ where: { tenantId, estadoPropuesta: "auto" } }),
    tx.movimientoImportado.findFirst({
      where: { tenantId, estadoPropuesta: "revision" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    tx.importacionBancaria.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { nombreArchivo: true, createdAt: true },
    }),
    tx.invoice.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    tx.outboxEvent.count({
      where: { tenantId, processedAt: null, attempts: { gte: UMBRAL_OUTBOX_TRABADO } },
    }),
    // Sólo la metadata NO secreta del certificado (el vencimiento). El material cifrado no
    // se toca: ni se selecciona.
    tx.tenantFiscalCredential.findUnique({
      where: { tenantId },
      select: { certNotAfter: true },
    }),
    tx.cashMovement.findFirst({
      where: { tenantId },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    }),
  ]);

  // Caja: sólo si el cliente tiene movimientos. La cartera nace con facturación pura y
  // sin caja; para esos, "caja sin cerrar" no existe.
  let caja: HechosCliente["caja"] = null;
  if (ultimoMovimientoCaja) {
    const cerradoHasta = await ctx.leerFronteraCaja(tx, tenantId);
    const desde = cerradoHasta ? businessWallTimeToUtc(diaSiguiente(cerradoHasta), "00:00") : null;
    const primeroSinCerrar = await tx.cashMovement.findFirst({
      where: {
        tenantId,
        occurredAt: { ...(desde ? { gte: desde } : {}), lt: ctx.inicioDeHoy },
      },
      orderBy: { occurredAt: "asc" },
      select: { occurredAt: true },
    });
    caja = {
      pendienteDesde: primeroSinCerrar ? dateStrInBusinessTz(primeroSinCerrar.occurredAt) : null,
    };
  }

  const capFacturasMes = meta.capFacturasMes ?? CAP_FACTURAS_MES_DEFAULT;
  const actividad = [ultimaImportacion?.createdAt, ultimaFactura?.createdAt]
    .filter((d): d is Date => d instanceof Date)
    .map((d) => d.getTime());

  return {
    resumen: {
      facturasMes,
      capFacturasMes,
      montoFacturadoMes: aNumero(facturado._sum.total),
      pendientesRevision,
      listasParaEmitir,
      ultimaImportacion: ultimaImportacion
        ? {
            nombreArchivo: ultimaImportacion.nombreArchivo,
            createdAt: ultimaImportacion.createdAt.toISOString(),
          }
        : null,
    },
    hechos: {
      clienteTenantId: tenantId,
      alias: fila.alias,
      estadoCartera: fila.estado,
      arcaCuit: meta.arcaCuit,
      arcaPuntoVenta: meta.arcaPuntoVenta,
      arcaHomologacion: meta.arcaHomologacion,
      credencialCargada: credencial !== null,
      certVenceAt: credencial?.certNotAfter?.toISOString() ?? null,
      facturasMes,
      capFacturasMes,
      rechazadasMes,
      outboxTrabados,
      pendientesRevision,
      revisionMasViejaAt: revisionMasVieja?.createdAt.toISOString() ?? null,
      ultimaActividadAt: actividad.length > 0 ? new Date(Math.max(...actividad)).toISOString() : null,
      caja,
    },
  };
}

/** Puertos del recorrido (los cablea `monitorCarteraAction`; los tests inyectan fakes). */
export interface RecorridoPorts {
  /** Filas de la cartera del estudio (SIEMPRE filtradas por estudioTenantId; excluye `baja`). */
  filasDeCartera(estudioTenantId: string): Promise<FilaCarteraDb[]>;
  /** Metadata de los clientes pedidos, en UNA lectura. Clientes inexistentes no vienen. */
  metadataClientes(clienteTenantIds: string[]): Promise<Map<string, MetaCliente>>;
  /** La pasada de un cliente (la real: `recolectarCliente` en tenantTransaction(cliente)). */
  recolectar(fila: FilaCarteraDb, meta: MetaCliente): Promise<RecoleccionCliente>;
}

/**
 * La cartera del estudio en UNA pasada: filas del panel de volumen + hechos del monitoreo.
 *
 * AISLAMIENTO: los ids que se leen salen EXCLUSIVAMENTE de `filasDeCartera(estudioTenantId)`
 * — nunca de un input —, así que la lectura de metadata y cada pasada sólo tocan clientes de
 * la cartera de ESTE estudio.
 */
export async function recorrerCartera(
  ports: RecorridoPorts,
  estudioTenantId: string,
  modoArca: ModoArca,
): Promise<{ filas: FilaCartera[]; resumen: ResumenCartera; hechos: HechosCliente[] }> {
  const filasDb = await ports.filasDeCartera(estudioTenantId);
  const metas =
    filasDb.length > 0
      ? await ports.metadataClientes(filasDb.map((f) => f.clienteTenantId))
      : new Map<string, MetaCliente>();

  const filas: FilaCartera[] = [];
  const hechos: HechosCliente[] = [];
  // Secuencial a propósito, igual que antes: cuida las conexiones del pooler de Neon.
  // Paralelizar con un tope (3-4) queda para cuando se mida el pool con CH en vivo; con
  // una cartera de 30 clientes o más, antes que eso va una caché por estudio.
  for (const fila of filasDb) {
    const meta = metas.get(fila.clienteTenantId);
    if (!meta) continue; // fila huérfana (tenant borrado): no rompe el panel
    const pasada = await ports.recolectar(fila, meta);
    filas.push(armarFilaCartera(fila, meta, pasada.resumen, modoArca));
    hechos.push(pasada.hechos);
  }
  return { filas, resumen: resumirCartera(filas), hechos };
}

/**
 * La cartera completa del estudio: filas (activas + pausadas) con su resumen
 * fiscal, agregadas EN MEMORIA (nunca una query cross-tenant). El único filtro
 * de entrada es `estudioTenantId`: un estudio JAMÁS ve la cartera de otro
 * (defensa doble: predicado explícito + RLS sobre CarteraCliente).
 *
 * Ya no la llama ninguna action: /contador pasó a `recorrerCartera`, que hace volumen y
 * monitoreo en una sola pasada y lee la metadata de toda la cartera de una vez. Queda
 * mientras cartera-core.test.ts la cubra; se borra junto con esos tests.
 */
export async function listarCarteraCore(
  ports: CarteraPorts,
  estudioTenantId: string,
): Promise<{ filas: FilaCartera[]; resumen: ResumenCartera }> {
  const filasDb = await ports.filasDeCartera(estudioTenantId);
  const filas: FilaCartera[] = [];
  // Secuencial a propósito: N es chico (cartera de un estudio) y cuida las
  // conexiones del pooler de Neon (plan free) — deuda anotada: paginar/paralelizar
  // con límite cuando una cartera supere ~50 clientes.
  for (const fila of filasDb) {
    const info = await ports.datosCliente(fila.clienteTenantId);
    if (!info) continue; // fila huérfana (tenant borrado): no rompe el panel
    const resumen = await ports.resumenFiscalCliente(fila.clienteTenantId);
    filas.push(armarFilaCartera(fila, info, resumen));
  }
  return { filas, resumen: resumirCartera(filas) };
}

// ── Pertenencia estricta estudio→cliente (la guarda de TODA acción) ───────────

export type ResultadoPertenencia =
  | { ok: true; fila: FilaCarteraDb }
  | { ok: false; error: string };

/**
 * Verifica que `clienteTenantId` pertenezca a la cartera del estudio actual.
 * `buscarFila` DEBE consultar por (estudioTenantId, clienteTenantId) — la
 * implementación real corre con el tenant del ESTUDIO (RLS incluida).
 *
 * - Fila inexistente o en `baja` → mismo error (no se filtra si el cliente
 *   existe en otra cartera: cero fuga de información).
 * - `pausada` solo pasa con `permitirPausada` (para poder reactivar).
 */
export async function exigirClienteDeCartera(
  buscarFila: (
    estudioTenantId: string,
    clienteTenantId: string,
  ) => Promise<FilaCarteraDb | null>,
  estudioTenantId: string,
  clienteTenantId: string,
  opts?: { permitirPausada?: boolean },
): Promise<ResultadoPertenencia> {
  const fila = await buscarFila(estudioTenantId, clienteTenantId);
  if (!fila || fila.estado === "baja") {
    return { ok: false, error: "Ese cliente no está en tu cartera." };
  }
  if (fila.estado === "pausada" && !opts?.permitirPausada) {
    return {
      ok: false,
      error: "Ese cliente está pausado en tu cartera: reactivalo para operar.",
    };
  }
  return { ok: true, fila };
}

// ── Alta de cliente: validación + slug seguro (PURO + lookup inyectado) ───────

export interface AltaClienteInput {
  nombre: string;
  cuit: string;
  email: string;
  /** Nombre corto para la cartera; default: el nombre. */
  alias?: string;
  /**
   * Punto de venta de ARCA para factura electrónica. Sin él el cliente no emite nada, y
   * después sólo lo puede cargar Gestión Studio Grow: pedirlo en el alta corta de raíz el
   * "no puede emitir" del monitoreo. Opcional en el contrato para que el formulario viejo
   * no rompa el alta; el formulario lo tiene que pedir.
   */
  puntoVenta?: number | string | null;
}

export type ValidacionAlta =
  | {
      ok: true;
      nombre: string;
      cuit: string;
      email: string;
      alias: string;
      slugBase: string;
      /** `null` = no se informó (el monitoreo lo va a marcar como "no puede emitir"). */
      puntoVenta: number | null;
    }
  | { ok: false; error: string };

/** Mayor punto de venta que se acepta: ARCA los numera con hasta 5 cifras. */
export const PUNTO_VENTA_MAX = 99_999;

export type ValidacionPuntoVenta = { ok: true; puntoVenta: number | null } | { ok: false; error: string };

/**
 * Punto de venta del alta: vacío = no informado; si viene, un entero de 1 a 99999. PURA.
 * No se redondea ni se recorta nada: un "3,5" o un "0" es un error de tipeo, y un punto de
 * venta equivocado emite comprobantes que después sólo se anulan con nota de crédito.
 */
export function validarPuntoVenta(raw: AltaClienteInput["puntoVenta"]): ValidacionPuntoVenta {
  const texto = raw == null ? "" : String(raw).trim();
  if (texto === "") return { ok: true, puntoVenta: null };
  const n = /^\d{1,5}$/.test(texto) ? Number(texto) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > PUNTO_VENTA_MAX) {
    return {
      ok: false,
      error: "El punto de venta es un número de 1 a 5 cifras: el que el cliente dio de alta en ARCA para factura electrónica.",
    };
  }
  return { ok: true, puntoVenta: n };
}

/** Valida y normaliza el alta. CUIT con dígito verificador (mismo criterio que bancos). PURA. */
export function validarAltaCliente(input: AltaClienteInput): ValidacionAlta {
  const nombre = input.nombre?.trim() ?? "";
  if (nombre.length < 2) {
    return { ok: false, error: "Poné el nombre del negocio (mínimo 2 caracteres)." };
  }
  const cuit = normalizarCuit(input.cuit ?? "");
  if (!cuitValido(cuit)) {
    return { ok: false, error: "El CUIT no es válido: revisá los 11 números." };
  }
  const email = (input.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { ok: false, error: "El email del cliente no es válido." };
  }
  const pv = validarPuntoVenta(input.puntoVenta);
  if (!pv.ok) return pv;
  const slugBase = suggestSlug(nombre);
  if (!slugBase) {
    return { ok: false, error: "No se pudo generar el nombre corto para la web: usá un nombre con letras o números." };
  }
  return {
    ok: true,
    nombre,
    cuit,
    email,
    alias: (input.alias?.trim() || nombre),
    slugBase,
    puntoVenta: pv.puntoVenta,
  };
}

/**
 * Qué hace el alta (o la re-alta) con el punto de venta, según lo que escribió el contador
 * y lo que el tenant ya tiene. PURA.
 *
 * Se completa si falta y NUNCA se pisa: cambiar el punto de venta de quien ya emite corta
 * su numeración, y eso es de la consola de operador. Lo que no se hizo se avisa: un dato
 * tipeado que se descarta en silencio es peor que no haberlo pedido.
 */
export function decidirPuntoVentaAlta(
  informado: number | null,
  actual: number | null,
): { escribir: number | null; aviso: string | null } {
  if (actual !== null) {
    return {
      escribir: null,
      aviso:
        informado !== null && informado !== actual
          ? `Ya tenía el punto de venta ${actual} y no se cambió: si está mal, pedíselo a Gestión Studio Grow.`
          : null,
    };
  }
  if (informado !== null) return { escribir: informado, aviso: null };
  return {
    escribir: null,
    aviso: "No tiene punto de venta: hasta que se cargue no puede emitir. Pedíselo a Gestión Studio Grow.",
  };
}

export type ResolucionSlug =
  | { ok: true; slug: string; reusaExistente: boolean }
  | { ok: false; error: string };

/**
 * Resuelve el slug del tenant cliente SIN riesgo de "adjuntarse" al negocio de
 * otro: `provisionTenant` es idempotente POR SLUG, así que si el slug sugerido ya
 * pertenece a un tenant con OTRO CUIT no se reusa jamás — se prueba una variante
 * con la cola del CUIT y, si también está tomada por otro, se corta con error.
 * Mismo CUIT ⇒ re-alta idempotente del mismo negocio (reusaExistente).
 */
export async function resolverSlugCliente(
  slugBase: string,
  cuit: string,
  lookup: (slug: string) => Promise<{ arcaCuit: string | null } | null>,
): Promise<ResolucionSlug> {
  const candidatos = [slugBase, `${slugBase}-${cuit.slice(-4)}`];
  for (const slug of candidatos) {
    const existente = await lookup(slug);
    if (!existente) return { ok: true, slug, reusaExistente: false };
    if (existente.arcaCuit && normalizarCuit(existente.arcaCuit) === cuit) {
      return { ok: true, slug, reusaExistente: true };
    }
  }
  return {
    ok: false,
    error:
      "Ya existe otro negocio con ese nombre en la plataforma y no se pudo generar un nombre corto único para la web. Probá con un nombre más específico.",
  };
}

// ── Provisioning bajo RLS (reuso de provisionTenant SIN operatorPrisma) ──────

/**
 * Envuelve el cliente de transacción para que, APENAS `provisionTenant` crea/
 * encuentra la fila Tenant (su `tenant.upsert` es la primera escritura), se setee
 * `app.current_tenant_id` = ese id DENTRO de la misma transacción. Así el resto
 * del alta (OWNER, BusinessSettings) pasa las policies WITH CHECK de RLS con el
 * rol de la app (app_rls), sin bypass y sin operatorPrisma — el alta sigue siendo
 * atómica y reusa el core de ADR-019 tal cual.
 *
 * Por qué un Proxy y no tocar provisionTenant: el core de ADR-019 es compartido
 * (CLI, consola de operador); el contexto RLS es una necesidad EXCLUSIVA de este
 * camino (única superficie que provisiona con el rol de la app). PURA respecto de
 * Prisma: testeable con un tx fake.
 */
export function conGucTrasCrearTenant<T extends object>(tx: T): T {
  const raw = tx as unknown as {
    tenant: object;
    $executeRaw: (q: TemplateStringsArray, ...valores: unknown[]) => Promise<unknown>;
  };
  const bindOf = (target: object, prop: PropertyKey): unknown => {
    const v = (target as Record<PropertyKey, unknown>)[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
  };
  const tenantProxy = new Proxy(raw.tenant, {
    get(target, prop) {
      if (prop === "upsert") {
        const upsert = bindOf(target, prop) as (args: unknown) => Promise<{ id: string }>;
        return async (args: unknown) => {
          const tenant = await upsert(args);
          // set_config(..., true) = SET LOCAL parametrizable (pooling-safe, ADR-018).
          await raw.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`;
          return tenant;
        };
      }
      return bindOf(target, prop);
    },
  });
  return new Proxy(tx, {
    get(target, prop) {
      if (prop === "tenant") return tenantProxy;
      return bindOf(target, prop);
    },
  });
}

/** Lo único que `provisionTenant` usa del PrismaClient: `$transaction` interactiva. */
export interface ClienteTransaccional {
  $transaction<T>(fn: (tx: object) => Promise<T>): Promise<T>;
}

/**
 * Fachada de PrismaClient para pasarle a `provisionTenant` desde el panel del
 * contador: misma transacción, mismo todo-o-nada, pero con el GUC de RLS seteado
 * apenas existe el id del tenant nuevo (ver `conGucTrasCrearTenant`). Con
 * RLS_ENFORCEMENT off el set_config es inocuo → un solo camino de código.
 */
export function crearClienteProvisioning(base: ClienteTransaccional): ClienteTransaccional {
  return {
    $transaction: <T>(fn: (tx: object) => Promise<T>) =>
      base.$transaction((tx) => fn(conGucTrasCrearTenant(tx))),
  };
}
