// ============================================================================
// EL NÚMERO DEL BOTÓN — lo que se decide sin tocar la base.
// ============================================================================
//
// Cada app del Inicio puede mostrar un número ("3 abiertos", "2 días sin cerrar"). Lo
// calcula un LOADER por app (src/apps/kpis/<dominio>.server.ts) y lo sirve `cargarKpi`
// (index.server.ts). Acá vive la parte que no necesita base, para probarla con datos:
//   · qué parte del número ve cada rol: la plata pide reports:read (`partesDelKpi`), y si
//     el rol no la ve, el loader ni la lee;
//   · el tope de 1,5 s: un número lento no puede frenar el Inicio entero;
//   · la FILA: cuántos números se piden a la base a la vez (ver `crearFila`);
//   · el log de milisegundos de cada tile: es la medición de latencia contra Neon que hoy no
//     existe (el `ms` es la consulta; la espera en la fila sale aparte, en `espera`);
//   · qué se muestra cuando no hay número: '—' con el motivo, nunca un 0 inventado.
//
// Sin "server-only" a propósito: no importa Prisma ni nada del servidor salvo TIPOS, así los
// tests lo ejecutan en node. El `.server` del nombre dice quién lo usa: sólo el servidor.

import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/lib/capabilities";
import type { AppDescriptor } from "@/apps/contract";
import { partesDelKpi } from "@/apps/visibles";

/** Cuánto puede tardar un número antes de rendirse. Pasado esto, el tile dice que no pudo. */
export const TOPE_KPI_MS = 1500;

/** El texto de un tile que no se pudo calcular (error o tope vencido). */
export const NO_SE_PUDO = "No se pudo calcular ahora";

/**
 * El cliente de base con el que lee un loader. En runtime es el `prisma` global del request:
 * cada operación sale sola, con el negocio del request puesto por el candado de tenant y por
 * RLS. Se tipa con el cliente de modelos de Prisma porque es el que aceptan las lecturas
 * compartidas con las pantallas (p. ej. la frontera del cierre, frontera-cierre.ts), y el
 * `prisma` global cumple ese tipo. Es un parámetro para que los tests pasen una base falsa y
 * vean QUÉ consulta hace cada loader.
 */
export type DbKpi = Prisma.TransactionClient;

/** Lo que un loader sabe del negocio. Es lo mismo para todos los tiles del request. */
export interface NegocioKpi {
  db: DbKpi;
  tenantId: string;
  /** Hoy en la zona del negocio (AAAA-MM-DD): el "hoy" de la pantalla, no el del servidor. */
  hoy: string;
  ahora: Date;
  /** ¿Local de mostrador? Cambia qué número tiene sentido (la caja con cajón, por ejemplo). */
  esMostrador: boolean;
  /** Cómo llama el rubro a lo que vende: "corte"/"cortes" en la carnicería, "producto" en velas. */
  sustantivo: { uno: string; varios: string };
}

export interface ContextoLoader extends NegocioKpi {
  /** ¿Esta persona puede ver plata? Si es false, el loader NO lee montos. */
  monto: boolean;
}

/**
 * Lo que devuelve un loader.
 *   · `valor` + `detalle`: el número y qué es ("3" + "abiertos").
 *   · `alerta`: lo que pide acción HOY. Si está, el tile va en tono alerta y además aparece
 *     arriba, en "Para atender hoy" ("1" + "entregado sin cobrar").
 *   · `monto`: la parte que es plata. Sólo se muestra si el rol tiene reports:read.
 *   · `sinDato`: no hay número que dar, y el motivo en palabras de negocio. Se muestra '—'
 *     con el motivo: un 0 diría "no hay nada", que es otra cosa.
 * `null` = esta app no tiene número en este negocio (la caja de una estética no tiene cajón).
 */
export type DatoKpi =
  | { valor: string; detalle?: string; alerta?: AlertaKpi; monto?: string }
  | { sinDato: string };

export interface AlertaKpi {
  valor: string;
  texto: string;
}

export type LoaderKpi = (ctx: ContextoLoader) => Promise<DatoKpi | null>;

/** Lo que recibe la pantalla. Nunca tira: un tile que falla no se lleva puesto el Inicio. */
export type ResultadoKpi =
  | { estado: "ok"; valor: string; detalle?: string; alerta?: AlertaKpi; monto?: string }
  | { estado: "sin-dato"; motivo: string }
  | { estado: "error"; motivo: string };

export interface LogKpi {
  info(scope: string, msg: string, ctx?: Record<string, unknown>): void;
  warn(scope: string, msg: string, ctx?: Record<string, unknown>): void;
}

/**
 * Cuántos números se calculan A LA VEZ en un request. Sin fila, el Inicio de un local con
 * ~30 números los largaba todos juntos contra un pool de 5 conexiones (prisma-base.ts:33) y,
 * con RLS, cada número es una transacción de 4 viajes (rls.ts:84). MEDIDO (2026-09-24, 30
 * transacciones como las del Inicio con 80 ms de ida y vuelta, pool de 5): sin fila, todas
 * llegaban juntas a ~2.060 ms, 10 pasaban el tope de 1,5 s y con 45 números Prisma cortaba 15
 * por "Unable to start a transaction in the given time" (espera máxima de 2 s por conexión).
 * Con fila del tamaño del pool, en ESE banco (un solo Inicio, base local detrás de un proxy de
 * 80 ms, no el laboratorio): el mismo total (~2.065 ms), cada número tarda lo suyo (p95 ≈ 420 ms)
 * y ninguno pasó el tope. Con una fila más chica que el pool el total crece (4 → 2.720 ms,
 * 2 → 5.030 ms) sin ganar nada: por eso la fila es el pool. Y es UNA por instancia, no por
 * request (index.server.ts): el pool se comparte entre requests, la fila también.
 *
 * Lo que espera en la fila NO cuenta para el tope de 1,5 s (esperar su turno no es tardar),
 * pero tiene su propio techo, `TOPE_FILA_MS`: si la base está caída, los últimos de la fila
 * no se quedan esperando para siempre.
 */
export interface FilaKpi {
  /** Espera un lugar. Devuelve con qué soltarlo, o rechaza con `FilaVencida` pasado el techo. */
  entrar(): Promise<() => void>;
}

/** Cuánto puede esperar un número su turno en la fila antes de rendirse sin consultar. */
export const TOPE_FILA_MS = 5000;

/** El número esperó su turno más de lo que el Inicio puede esperar. No llegó a consultar. */
export class FilaVencida extends Error {
  constructor(ms: number) {
    super(`el número esperó su turno más de ${ms} ms`);
    this.name = "FilaVencida";
  }
}

/**
 * Una fila con `enParalelo` lugares, en orden de llegada: el primero que pide es el primero
 * que consulta. Por eso el Inicio pide primero lo que se ve arriba (Mis apps y después los
 * espacios en orden). Un lugar se suelta UNA sola vez aunque se llame dos veces a `soltar`.
 * Vive lo que vive la instancia: el lugar se suelta al terminar la consulta, falle o no
 * (`cargarKpiCon`), y el que no consigue turno se va solo al vencer `topeEsperaMs`.
 */
export function crearFila(
  enParalelo: number,
  topeEsperaMs: number = TOPE_FILA_MS,
  temporizador: { poner: (fn: () => void, ms: number) => unknown; sacar: (t: unknown) => void } = {
    poner: (fn, ms) => setTimeout(fn, ms),
    sacar: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
  },
): FilaKpi {
  let libres = Math.max(1, Math.floor(enParalelo));
  const esperando: { pasar: () => void }[] = [];

  function soltadorUnico(): () => void {
    let soltado = false;
    return () => {
      if (soltado) return;
      soltado = true;
      const siguiente = esperando.shift();
      if (siguiente) siguiente.pasar();
      else libres++;
    };
  }

  return {
    entrar() {
      if (libres > 0) {
        libres--;
        return Promise.resolve(soltadorUnico());
      }
      return new Promise((resolve, reject) => {
        const turno = {
          pasar: () => {
            temporizador.sacar(timer);
            resolve(soltadorUnico());
          },
        };
        const timer = temporizador.poner(() => {
          const i = esperando.indexOf(turno);
          if (i >= 0) esperando.splice(i, 1);
          reject(new FilaVencida(topeEsperaMs));
        }, topeEsperaMs);
        esperando.push(turno);
      });
    },
  };
}

/**
 * Cuántos lugares tiene la fila: las conexiones del pool, leídas de la MISMA variable y con el
 * mismo default que el pool (`DB_CONNECTION_LIMIT`, 5: prisma-base.ts:33). Si alguien agranda
 * el pool, la fila lo acompaña sin tocar código.
 */
export function enParaleloDelPool(valor: string | undefined): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
}

export interface DepsKpi {
  loaders: Readonly<Record<string, LoaderKpi>>;
  /**
   * El negocio del request. Es una función y no un valor para que se lea ADENTRO del tope y
   * del try: si leer el negocio falla, falla este tile con su '—', no la página.
   */
  negocio: () => Promise<NegocioKpi>;
  log: LogKpi;
  /** Milisegundos monótonos (performance.now en runtime). Inyectado para medir en tests. */
  reloj: () => number;
  topeMs?: number;
  /** Ids de KPI que se fuerzan a fallar (QA: `KPI_FALLA_FORZADA`). Ver `fallasForzadas`. */
  fallaForzada?: ReadonlySet<string>;
  /** La fila de la instancia (ver `crearFila`). Sin fila, cada número sale apenas se pide. */
  fila?: FilaKpi;
}

/** El tope se venció: el número tardó más de lo que el Inicio puede esperar. */
export class TopeKpiVencido extends Error {
  constructor(ms: number) {
    super(`el número tardó más de ${ms} ms`);
    this.name = "TopeKpiVencido";
  }
}

/**
 * La promesa, o un rechazo `TopeKpiVencido` si tarda más de `ms`. La consulta que perdió la
 * carrera sigue hasta terminar (Prisma no la cancela), pero ya no frena la pantalla; su
 * resultado o su error quedan atendidos por la carrera, así que no hay rechazo suelto.
 */
export function conTope<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const vencido = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TopeKpiVencido(ms)), ms);
  });
  return Promise.race([p, vencido]).finally(() => clearTimeout(timer));
}

/**
 * Los KPI que QA fuerza a fallar, leídos de `KPI_FALLA_FORZADA` ("pedidos,caja-del-dia" o
 * "*" para todos). Existe para probar con build y start reales que un tile roto muestra '—'
 * y el resto del Inicio carga igual, sin romper la base. Sin la variable no hace nada.
 */
export function fallasForzadas(valor: string | undefined): ReadonlySet<string> | undefined {
  const v = valor?.trim();
  if (!v) return undefined;
  return new Set(v.split(",").map((s) => s.trim()).filter(Boolean));
}

function debeFallar(fallas: ReadonlySet<string> | undefined, id: string): boolean {
  return !!fallas && (fallas.has("*") || fallas.has(id));
}

/**
 * ¿El tile de esta app lleva número para este rol? Sí si declara KPI, el rol puede verlo y
 * ya hay loader. Lo usa la pantalla para no pintar un "calculando…" que nunca llega.
 */
export function llevaNumero(
  app: AppDescriptor,
  role: Role,
  loaders: Readonly<Record<string, LoaderKpi>>,
): boolean {
  const partes = partesDelKpi(app, role);
  return !!app.kpi && !!partes?.numero && !!loaders[app.kpi.id];
}

/**
 * El número de una app para un rol, o `null` si no lleva número (la app no declara KPI, el
 * rol no puede verlo, o todavía no tiene loader). No tira nunca.
 *
 * Los montos: `partesDelKpi` decide si el rol ve la plata. El loader recibe esa respuesta
 * (`monto`) y no la lee si es false; y aunque un loader se equivocara y la devolviera, acá
 * se descarta. Son dos capas porque un monto a la vista de recepción no se "des-ve".
 */
export async function cargarKpiCon(
  app: AppDescriptor,
  role: Role,
  deps: DepsKpi,
): Promise<ResultadoKpi | null> {
  const kpi = app.kpi;
  const partes = partesDelKpi(app, role);
  if (!kpi || !partes || !partes.numero) return null;
  const loader = deps.loaders[kpi.id];
  if (!loader) return null;

  const tope = deps.topeMs ?? TOPE_KPI_MS;
  const pedido = deps.reloj();
  // El reloj del tope arranca cuando el número CONSULTA, no cuando se pidió: la espera en la
  // fila se loguea aparte (`espera`) y tiene su propio techo.
  let t0 = pedido;
  let espera: number | undefined;
  let estado: "ok" | "sin-numero" | "sin-dato" | "error" | "tope" | "fila" = "error";
  let error: string | undefined;
  try {
    if (debeFallar(deps.fallaForzada, kpi.id)) throw new Error("falla forzada por KPI_FALLA_FORZADA");
    const soltar = deps.fila ? await deps.fila.entrar() : undefined;
    t0 = deps.reloj();
    if (deps.fila) espera = Math.round(t0 - pedido);
    // Todo adentro de la promesa: si leer el negocio tira de una, igual se suelta el lugar.
    const trabajo = Promise.resolve()
      .then(() => deps.negocio())
      .then((negocio) => loader({ ...negocio, monto: partes.monto }));
    // El lugar se suelta cuando la consulta TERMINA, no cuando vence el tope: Prisma no la
    // cancela y la conexión sigue ocupada. Soltarlo antes metería un número más que el pool.
    if (soltar) trabajo.then(soltar, soltar);
    const dato = await conTope(trabajo, tope);
    if (dato === null) {
      estado = "sin-numero";
      return null;
    }
    if ("sinDato" in dato) {
      estado = "sin-dato";
      return { estado: "sin-dato", motivo: dato.sinDato };
    }
    estado = "ok";
    const resultado: ResultadoKpi = { estado: "ok", valor: dato.valor };
    if (dato.detalle) resultado.detalle = dato.detalle;
    if (dato.alerta) resultado.alerta = dato.alerta;
    if (partes.monto && dato.monto) resultado.monto = dato.monto;
    return resultado;
  } catch (e) {
    estado = e instanceof TopeKpiVencido ? "tope" : e instanceof FilaVencida ? "fila" : "error";
    error = e instanceof Error ? e.message : String(e);
    return { estado: "error", motivo: NO_SE_PUDO };
  } finally {
    // Una línea por tile, siempre, con los milisegundos: es lo que permite medir el p95 en
    // preview. `ms` es lo que tardó la consulta; `espera`, lo que esperó su turno en la fila.
    // Los que fallan salen como warn para que se vean sin filtrar.
    const fin = deps.reloj();
    // El que se rindió en la fila no consultó: todo su tiempo fue espera.
    if (estado === "fila") espera = Math.round(fin - pedido);
    const linea = {
      kpi: kpi.id,
      ms: estado === "fila" ? 0 : Math.round(fin - t0),
      ...(espera !== undefined ? { espera } : {}),
      estado,
      ...(error ? { error } : {}),
    };
    if (estado === "error" || estado === "tope" || estado === "fila") deps.log.warn("kpi", "tile", linea);
    else deps.log.info("kpi", "tile", linea);
  }
}

// ── Palabras ─────────────────────────────────────────────────────────────────

/** La palabra en singular o plural según la cantidad: plural(1, "día", "días") → "día". */
export function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios;
}

/** Plural de un sustantivo de rubro: "corte" → "cortes", "prenda" → "prendas". */
export function pluralDe(sustantivo: string): string {
  const s = sustantivo.trim() || "producto";
  return s.endsWith("s") ? s : `${s}s`;
}
