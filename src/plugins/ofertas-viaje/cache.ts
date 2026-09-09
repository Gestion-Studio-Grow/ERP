/**
 * CACHÉ + CONTROL DE CUOTA de búsquedas — para no quemar requests del proveedor.
 *
 * Las APIs de ofertas cobran o limitan POR REQUEST (Amadeus: cuota mensual gratis
 * en test y pago por llamada en producción). Dos defensas, ambas detrás de
 * interfaces para poder persistirlas (Prisma) sin tocar el core:
 *
 *  1. CACHÉ por búsqueda normalizada: la misma búsqueda (mismos parámetros) dentro
 *     del TTL NO vuelve al proveedor. La clave es un hash del JSON canónico
 *     (claves ordenadas) → "AEP→MAD 10/11" pedido dos veces = una sola llamada.
 *     TTL corto a propósito: un precio cacheado sigue siendo un precio con
 *     `capturadoEn` viejo; el operador lo ve porque el snapshot lo muestra.
 *  2. CUOTA diaria por tenant y proveedor: tope de llamadas reales por día. Al
 *     superarlo la búsqueda se rechaza con un mensaje claro (no se cuelga ni se
 *     cobra de más).
 *
 * `ProveedorConCache` es un DECORADOR del port: envuelve cualquier
 * `ProveedorOfertas` y el resto del sistema sigue viendo el mismo contrato.
 *
 * NOTA de despliegue (honesta): las implementaciones EN MEMORIA de este archivo
 * viven por proceso. En serverless (Vercel) cada instancia arranca vacía, así que
 * el caché ayuda dentro de una instancia y la cuota NO es un tope duro. El tope
 * duro exige la versión persistida (`CacheBusquedaViaje` / `ConsumoProveedorViaje`
 * del schema) — queda diseñada, no cableada, hasta que se aplique la migración
 * (Gate 2). Ver nota técnica.
 */

import { createHash } from "node:crypto";
import type {
  BusquedaHoteles,
  BusquedaVuelos,
  OfertaHotel,
  OfertaVuelo,
  ProveedorOfertas,
  ResultadoBusqueda,
} from "./port";

export type TipoBusqueda = "VUELO" | "HOTEL";

/** JSON canónico (claves ordenadas recursivamente, sin undefined) → hash estable. */
export function claveBusqueda(tipo: TipoBusqueda, busqueda: BusquedaVuelos | BusquedaHoteles): string {
  const canonico = JSON.stringify(ordenar(busqueda));
  return createHash("sha256").update(`${tipo}|${canonico}`).digest("hex");
}

function ordenar(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenar);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const val = (v as Record<string, unknown>)[k];
      if (val !== undefined) out[k] = ordenar(val);
    }
    return out;
  }
  return v;
}

// ── Caché ─────────────────────────────────────────────────────────────────────

export interface EntradaCache<T> {
  resultado: ResultadoBusqueda<T>;
  /** Epoch ms de expiración. */
  expiraEn: number;
}

/** Puerto del caché. La implementación puede ser memoria (acá) o Prisma (glue). */
export interface CacheOfertas {
  obtener<T>(tenantId: string, proveedor: string, clave: string, ahoraMs: number): Promise<ResultadoBusqueda<T> | null>;
  guardar<T>(tenantId: string, proveedor: string, clave: string, resultado: ResultadoBusqueda<T>, expiraEnMs: number): Promise<void>;
}

export class MemoriaCacheOfertas implements CacheOfertas {
  private readonly entradas = new Map<string, EntradaCache<unknown>>();

  private k(tenantId: string, proveedor: string, clave: string): string {
    return `${tenantId}|${proveedor}|${clave}`;
  }

  async obtener<T>(tenantId: string, proveedor: string, clave: string, ahoraMs: number): Promise<ResultadoBusqueda<T> | null> {
    const e = this.entradas.get(this.k(tenantId, proveedor, clave));
    if (!e) return null;
    if (e.expiraEn <= ahoraMs) {
      this.entradas.delete(this.k(tenantId, proveedor, clave));
      return null;
    }
    return e.resultado as ResultadoBusqueda<T>;
  }

  async guardar<T>(tenantId: string, proveedor: string, clave: string, resultado: ResultadoBusqueda<T>, expiraEnMs: number): Promise<void> {
    this.entradas.set(this.k(tenantId, proveedor, clave), { resultado, expiraEn: expiraEnMs });
  }

  /** Cantidad de entradas vivas (para tests). */
  get tamano(): number {
    return this.entradas.size;
  }
}

// ── Cuota ─────────────────────────────────────────────────────────────────────

export type DecisionCuota =
  | { ok: true; usadas: number; limite: number }
  | { ok: false; usadas: number; limite: number; motivo: string };

/** Puerto del control de cuota diaria por tenant + proveedor. */
export interface ControlDeCuota {
  /** Intenta consumir UNA llamada real. Si no hay cupo, `ok:false` y NO consume. */
  consumir(tenantId: string, proveedor: string, ahora: Date): Promise<DecisionCuota>;
}

/** Día calendario `AAAA-MM-DD` en UTC (suficiente para un tope diario). */
export function diaDe(ahora: Date): string {
  return ahora.toISOString().slice(0, 10);
}

export class MemoriaControlDeCuota implements ControlDeCuota {
  private readonly usadas = new Map<string, number>();

  constructor(private readonly limiteDiario: number) {
    if (!Number.isInteger(limiteDiario) || limiteDiario < 0) {
      throw new Error(`limiteDiario inválido: ${limiteDiario}`);
    }
  }

  async consumir(tenantId: string, proveedor: string, ahora: Date): Promise<DecisionCuota> {
    const k = `${tenantId}|${proveedor}|${diaDe(ahora)}`;
    const usadas = this.usadas.get(k) ?? 0;
    if (usadas >= this.limiteDiario) {
      return {
        ok: false,
        usadas,
        limite: this.limiteDiario,
        motivo: `Se alcanzó el tope diario de ${this.limiteDiario} búsquedas reales con ${proveedor}. Mañana se renueva.`,
      };
    }
    this.usadas.set(k, usadas + 1);
    return { ok: true, usadas: usadas + 1, limite: this.limiteDiario };
  }
}

export class CuotaAgotadaError extends Error {
  constructor(readonly decision: Extract<DecisionCuota, { ok: false }>) {
    super(decision.motivo);
    this.name = "CuotaAgotadaError";
  }
}

// ── Decorador: proveedor con caché + cuota ────────────────────────────────────

export interface OpcionesProveedorConCache {
  cache: CacheOfertas;
  cuota: ControlDeCuota;
  /** TTL de una búsqueda de vuelos en ms (default 15 min). */
  ttlVuelosMs?: number;
  /** TTL de una búsqueda de hoteles en ms (default 30 min). */
  ttlHotelesMs?: number;
  ahora?: () => Date;
}

export const TTL_VUELOS_MS = 15 * 60_000;
export const TTL_HOTELES_MS = 30 * 60_000;

/**
 * Envuelve un proveedor real: primero caché, después cuota, recién entonces la
 * llamada. Cumple el mismo contrato → el core no distingue si hubo caché.
 */
export class ProveedorConCache implements ProveedorOfertas {
  readonly clave: string;
  private readonly ahora: () => Date;

  constructor(
    private readonly interno: ProveedorOfertas,
    private readonly tenantId: string,
    private readonly opts: OpcionesProveedorConCache,
  ) {
    this.clave = interno.clave;
    this.ahora = opts.ahora ?? (() => new Date());
  }

  buscarVuelos(b: BusquedaVuelos): Promise<ResultadoBusqueda<OfertaVuelo>> {
    return this.conCache<OfertaVuelo>("VUELO", b, this.opts.ttlVuelosMs ?? TTL_VUELOS_MS, () => this.interno.buscarVuelos(b));
  }

  buscarHoteles(b: BusquedaHoteles): Promise<ResultadoBusqueda<OfertaHotel>> {
    return this.conCache<OfertaHotel>("HOTEL", b, this.opts.ttlHotelesMs ?? TTL_HOTELES_MS, () => this.interno.buscarHoteles(b));
  }

  private async conCache<T>(
    tipo: TipoBusqueda,
    busqueda: BusquedaVuelos | BusquedaHoteles,
    ttlMs: number,
    llamar: () => Promise<ResultadoBusqueda<T>>,
  ): Promise<ResultadoBusqueda<T>> {
    const ahora = this.ahora();
    const clave = claveBusqueda(tipo, busqueda);
    const cacheado = await this.opts.cache.obtener<T>(this.tenantId, this.clave, clave, ahora.getTime());
    if (cacheado) return { ...cacheado, desdeCache: true };

    const decision = await this.opts.cuota.consumir(this.tenantId, this.clave, ahora);
    if (!decision.ok) throw new CuotaAgotadaError(decision);

    const resultado = await llamar();
    await this.opts.cache.guardar(this.tenantId, this.clave, clave, resultado, ahora.getTime() + ttlMs);
    return { ...resultado, desdeCache: false };
  }
}
