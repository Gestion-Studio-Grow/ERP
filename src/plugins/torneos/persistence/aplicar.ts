// ============================================================================
// ORQUESTACIÓN DE MUTACIONES — el motor arriba, la persistencia debajo (ADR-097, FASE 2).
// ============================================================================
//
// Regla dura de FASE 2 (del pedido): las mutaciones del motor
// (`cargarResultado`, `reprogramarPartido`, `marcarWO`, `borrarResultado`) devuelven
// `{ ok, torneo, errores, advertencias }` → el endpoint persiste el snapshot **solo si
// `ok`**. Si la mutación fue rechazada (`ok:false`), el estado guardado NO cambia.
//
// Esta capa es PURA respecto de la DB: recibe un `TorneoStore` (puerto). Se testea con
// `MemoriaTorneoStore` (fake) sin tocar Neon; el adaptador real (`prisma-store.ts`) se
// valida en vivo recién al aplicar Gate 2. El motor NUNCA se toca (es copia verbatim).

import motor, { type Torneo, type ResultadoMutacion } from "../engine";
import { type TorneoStore, TorneoNoEncontradoError } from "./store";

/** Una mutación del motor: transforma un `Torneo` y reporta si fue aceptada. */
export type Mutacion = (torneo: Torneo) => ResultadoMutacion;

/** Resultado de una mutación orquestada: el del motor + si el snapshot se PERSISTIÓ. */
export interface ResultadoPersistido extends ResultadoMutacion {
  /** true ⇔ la mutación fue `ok` Y el snapshot quedó guardado. */
  persistido: boolean;
}

/**
 * Carga el snapshot, aplica la mutación del motor y persiste **solo si `ok`**.
 *
 * - Torneo inexistente → lanza `TorneoNoEncontradoError` (no hay nada que mutar).
 * - `ok:false` → devuelve el resultado con `persistido:false`, sin escribir nada.
 * - `ok:true`  → guarda el `torneo` devuelto y responde `persistido:true`.
 *
 * Determinístico y sin efectos salvo el `guardar` condicionado. El adaptador real corre
 * `cargar`+`guardar` dentro de una `tenantTransaction` (RLS); acá la atomicidad es del
 * store, no de esta función.
 */
export async function aplicarMutacion(
  store: TorneoStore,
  torneoId: string,
  mutar: Mutacion,
): Promise<ResultadoPersistido> {
  const actual = await store.cargar(torneoId);
  if (!actual) throw new TorneoNoEncontradoError(torneoId);

  const res = mutar(actual);
  if (res.ok) await store.guardar(torneoId, res.torneo);

  return { ...res, persistido: res.ok };
}

// ── Wrappers tipados sobre cada mutación del motor ────────────────────────────
// Atan la superficie del motor (CONTRATO-GESTION) a la orquestación persistida. El
// endpoint/consola llama a estos, no al motor directo, para no olvidarse el "solo si ok".

/** Carga un resultado de partido y persiste si el motor lo acepta. */
export function cargarResultado(
  store: TorneoStore,
  torneoId: string,
  partidoId: number,
  resultado: { sets: [number, number][]; wo?: boolean; ganador?: "A" | "B" },
): Promise<ResultadoPersistido> {
  return aplicarMutacion(store, torneoId, (t) => motor.cargarResultado(t, partidoId, resultado));
}

/** Borra el resultado de un partido y persiste si el motor lo acepta. */
export function borrarResultado(
  store: TorneoStore,
  torneoId: string,
  partidoId: number,
): Promise<ResultadoPersistido> {
  return aplicarMutacion(store, torneoId, (t) => motor.borrarResultado(t, partidoId));
}

/** Reprograma un partido (sede/cancha/día/hora) y persiste si el motor lo acepta. */
export function reprogramarPartido(
  store: TorneoStore,
  torneoId: string,
  partidoId: number,
  destino: { sede: string; cancha: number; dia: string; hora: string },
): Promise<ResultadoPersistido> {
  return aplicarMutacion(store, torneoId, (t) => motor.reprogramarPartido(t, partidoId, destino));
}

/** Marca un W.O. (walkover) contra el perdedor y persiste si el motor lo acepta. */
export function marcarWO(
  store: TorneoStore,
  torneoId: string,
  partidoId: number,
  perdedor: "A" | "B",
): Promise<ResultadoPersistido> {
  return aplicarMutacion(store, torneoId, (t) => motor.marcarWO(t, partidoId, perdedor));
}

/**
 * Crea un torneo nuevo desde su config y lo persiste (alta, no mutación). No pasa por
 * `aplicarMutacion` porque no hay estado previo que cargar. Devuelve el `Torneo` creado.
 */
export async function crearYGuardar(
  store: TorneoStore,
  torneoId: string,
  config: Parameters<typeof motor.crearTorneo>[0],
): Promise<Torneo> {
  const torneo = motor.crearTorneo(config);
  await store.guardar(torneoId, torneo);
  return torneo;
}
