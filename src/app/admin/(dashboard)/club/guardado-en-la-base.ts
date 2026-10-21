// ============================================================================
// GUARDADO DEL CLUB EN LA BASE DEL ERP — el adaptador del almacén para el modo real (BP-3).
// ============================================================================
//
// CONTRATO (lo fija la sesión de terminales; `crearAlmacen({ reloj: "real", guardado })` lo enchufa):
//
//   leer():   Promise<{ texto, version } | null>        null = el club nunca se guardó (ni acá ni en la base)
//   guardar(texto, versionEsperada):
//             Promise<{ ok: true, version } | { ok: false, motivo: "conflicto" | "error", version? }>
//
//   · `texto` es el sobre v1 tal cual lo arma el almacén (`textoDelEstado`): no se vuelve a serializar. Lo único que
//     se le agrega es `"guardado": <ms>` al final (`conGuardado`), sin recorrer el estado.
//   · `version` es un CONTADOR (0 = nunca se guardó) que lleva la base junto a cada foto (src/lib/club/estado-repo.ts).
//   · `leer()` RECHAZA (no devuelve null) si la base no respondió y en este equipo no hay espejo: devolver null ahí
//     sería arrancar un club vacío encima de uno que existe.
//
// CADENCIA. `guardar` no va a la base en cada toque: escribe el ESPEJO de este equipo en el acto y programa la
// subida para `esperaMs` (30 s) después del ÚLTIMO cambio, con un tope de `esperaMaximaMs` (2 min) desde el primer
// cambio sin subir (una racha de cobros sin pausa igual se guarda). Al ocultar la pestaña o salir
// (`engancharSalida`) se sube en el acto. Las llamadas que caen en la misma ventana comparten UNA subida y su
// resultado. Medido en BP-3: un mes de club lleno es ~3 MB de texto y ~150 KB en gzip; con 30 s la recepción hace a
// lo sumo ~2 escrituras por minuto de actividad en Neon.
//
// ESPEJO (localStorage de este equipo): `gsg-club:<slug>:real:v1` guarda el sobre (el mismo formato del respaldo, se
// puede descargar tal cual) y `…:meta` `{ version, guardado, subido }`: sobre qué versión de la base se armó, cuándo
// y si ya llegó a la base. El espejo es lo que salva el trabajo si la base no responde o se corta el wifi.
//
// RECONCILIACIÓN al leer (por `guardado`, en ms): gana el espejo si no llegó a la base, está armado sobre la MISMA
// versión que la base tiene ahora y es más nuevo; entonces se sube enseguida. Si la base no respondió, se sigue con
// el espejo. Si el espejo tiene trabajo sin subir pero la base avanzó desde otra terminal, gana la base y el espejo
// se aparta en `…:descartada` (no se borra: se puede recuperar a mano).
//
// Corre en el navegador; en los tests se le pasan la base, el espejo y el reloj falsos.
//
// — Elaborado por GSG

import { comprimir, conGuardado, descomprimir, guardadoDelTexto } from "@/lib/club/foto";
import type { RespuestaGuardarFoto, RespuestaLeerFoto } from "./estado-actions";

/** El contrato del almacén para guardar el club (el de localStorage y éste lo cumplen). */
export interface GuardadoDelClub {
  leer(): Promise<{ texto: string; version: number } | null>;
  guardar(texto: string, versionEsperada: number): Promise<ResultadoDelGuardado>;
}

export type ResultadoDelGuardado = { ok: true; version: number } | { ok: false; motivo: "conflicto" | "error"; version?: number };

/** Las acciones del servidor (estado-actions.ts): `{ leer: leerFotoDelClub, guardar: guardarFotoDelClub }`. */
export interface PuertaDeLaBase {
  leer(): Promise<RespuestaLeerFoto>;
  guardar(datos: FormData): Promise<RespuestaGuardarFoto>;
}

export type Espejo = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface OpcionesGuardadoEnLaBase {
  /** El slug del negocio (namespacea el espejo). */
  negocio: string;
  base: PuertaDeLaBase;
  espejo: Espejo | null;
  reloj?: () => number;
  programar?: (fn: () => void, ms: number) => unknown;
  cancelar?: (marca: unknown) => void;
  /** Cuánto se espera después del último cambio para subir. */
  esperaMs?: number;
  /** Lo más que puede quedar un cambio sin subir aunque los cambios no paren. */
  esperaMaximaMs?: number;
}

/** Cómo está el guardado (para el indicador de la pantalla). */
export interface EstadoDelGuardado {
  version: number;
  /** De dónde salió lo que se abrió. */
  origen: "base" | "espejo" | "nada" | null;
  /** Hay cambios en el espejo que todavía no llegaron a la base. */
  pendiente: boolean;
  subiendo: boolean;
  /** Cuándo llegó a la base lo último (ms), en esta sesión. */
  ultimaSubida: number | null;
  /** Otra terminal guardó: hasta volver a leer de la base (`leer`, lo hace el almacén solo) no se sube nada. */
  conflicto: boolean;
  /** El último error al subir (se reintenta solo). */
  error: string | null;
  /** Al abrir, el espejo tenía trabajo que perdió contra la base y quedó apartado. */
  apartado: boolean;
}

export interface GuardadoEnLaBase extends GuardadoDelClub {
  /** Sube ya lo pendiente (al ocultar o salir). */
  guardarYa(): Promise<void>;
  estado(): EstadoDelGuardado;
  /** Sube al ocultar la pestaña (`visibilitychange`) y al salir (`pagehide`). Devuelve cómo desengancharlo. */
  engancharSalida(objetivo?: ObjetivoDeSalida | null): () => void;
}

/** Lo que se usa de `window`/`document` para enterarse de que la pestaña se oculta o se va. */
export interface ObjetivoDeSalida {
  addEventListener(tipo: string, fn: () => void): void;
  removeEventListener(tipo: string, fn: () => void): void;
  oculta(): boolean;
}

export const ESPERA_GUARDADO_MS = 30_000;
export const ESPERA_MAXIMA_GUARDADO_MS = 120_000;

/** Las claves del espejo de un negocio. Sin negocio no hay clave «de todos». */
export function clavesDelEspejo(negocio: string): { foto: string; meta: string; descartada: string } {
  if (!negocio.trim()) throw new Error("El guardado del club necesita el negocio.");
  const foto = `gsg-club:${negocio}:real:v1`;
  return { foto, meta: `${foto}:meta`, descartada: `${foto}:descartada` };
}

interface MetaDelEspejo {
  /** La versión de la base sobre la que se armó. */
  version: number;
  guardado: number;
  subido: boolean;
}

function setTimeoutSinRetener(fn: () => void, ms: number): unknown {
  const t = setTimeout(fn, ms) as unknown as { unref?: () => void };
  t.unref?.();
  return t;
}

export function crearGuardadoEnLaBase({
  negocio,
  base,
  espejo,
  reloj = Date.now,
  programar = setTimeoutSinRetener,
  cancelar = (m) => clearTimeout(m as ReturnType<typeof setTimeout>),
  esperaMs = ESPERA_GUARDADO_MS,
  esperaMaximaMs = ESPERA_MAXIMA_GUARDADO_MS,
}: OpcionesGuardadoEnLaBase): GuardadoEnLaBase {
  const claves = clavesDelEspejo(negocio);
  let version = 0;
  let origen: EstadoDelGuardado["origen"] = null;
  let ultimaSubida: number | null = null;
  let conflicto = false;
  let error: string | null = null;
  let apartado = false;
  /** Lo que falta subir (el texto más nuevo) y quiénes esperan el resultado. */
  let pendiente: { texto: string; guardado: number; desde: number; esperan: ((r: ResultadoDelGuardado) => void)[] } | null = null;
  let marca: unknown = null;
  let enVuelo: Promise<void> | null = null;

  // ── espejo ──
  const leerEspejo = (): { texto: string; meta: MetaDelEspejo } | null => {
    if (!espejo) return null;
    try {
      const texto = espejo.getItem(claves.foto);
      const meta = JSON.parse(espejo.getItem(claves.meta) ?? "null") as Partial<MetaDelEspejo> | null;
      if (!texto || !meta || !Number.isInteger(meta.version)) return null;
      return { texto, meta: { version: meta.version!, guardado: Number(meta.guardado) || guardadoDelTexto(texto) || 0, subido: meta.subido === true } };
    } catch {
      return null;
    }
  };
  const escribirMeta = (meta: MetaDelEspejo) => {
    try {
      espejo?.setItem(claves.meta, JSON.stringify(meta));
    } catch {
      // sin lugar: el espejo queda como estaba
    }
  };
  const escribirEspejo = (texto: string, meta: MetaDelEspejo) => {
    if (!espejo) return;
    try {
      espejo.setItem(claves.foto, texto);
      escribirMeta(meta);
    } catch {
      // incógnito o sin lugar: se sigue con la base
    }
  };

  // ── subir ──
  const desprogramar = () => {
    if (marca !== null) cancelar(marca);
    marca = null;
  };
  const programarSubida = (ms: number) => {
    desprogramar();
    marca = programar(() => {
      marca = null;
      void subir();
    }, Math.max(0, ms));
  };

  /** `pendiente` leído a través de una función: TS no ve que `guardar` lo cambia mientras se espera la base. */
  const pendienteAhora = () => pendiente;

  async function subir(): Promise<void> {
    if (enVuelo) {
      // Lo que llegó mientras tanto sale cuando termine la subida en curso.
      await enVuelo;
      if (pendiente && !enVuelo) return subir();
      return;
    }
    if (!pendiente || conflicto) return;
    desprogramar();
    const lote = pendiente;
    pendiente = null;
    const resolver = (r: ResultadoDelGuardado) => lote.esperan.forEach((fn) => fn(r));
    enVuelo = (async () => {
      let r: RespuestaGuardarFoto;
      try {
        const datos = new FormData();
        datos.set("foto", await comprimir(lote.texto), "foto.json.gz");
        datos.set("version", String(version));
        r = await base.guardar(datos);
      } catch {
        r = { ok: false, motivo: "error", error: "No hubo respuesta de la base." };
      }
      // Lo que se guardó DURANTE la subida (el `await` de arriba deja correr a `guardar`).
      const nuevo = pendienteAhora();
      if (r.ok) {
        version = r.version;
        ultimaSubida = reloj();
        error = null;
        // El espejo ya tiene este texto (o uno más nuevo, si se siguió trabajando): sólo se anota que llegó.
        escribirMeta(nuevo ? { version, guardado: nuevo.guardado, subido: false } : { version, guardado: lote.guardado, subido: true });
        resolver({ ok: true, version });
      } else if (r.motivo === "conflicto") {
        conflicto = true;
        error = r.error;
        const choque: ResultadoDelGuardado = { ok: false, motivo: "conflicto", version: r.version };
        resolver(choque);
        // Lo que esperaba tampoco puede subir: queda en el espejo.
        if (nuevo) {
          nuevo.esperan.forEach((fn) => fn(choque));
          nuevo.esperan = [];
        }
      } else {
        error = r.error;
        resolver({ ok: false, motivo: "error" });
        // Se reintenta con el texto más nuevo (si no hay uno más nuevo, con éste).
        if (!pendiente) pendiente = { ...lote, esperan: [] };
        programarSubida(esperaMs);
      }
    })();
    try {
      await enVuelo;
    } finally {
      enVuelo = null;
    }
    // Lo que llegó durante la subida no programó la suya: sale cuando le toca (30 s después de su último cambio,
    // con el tope de la espera máxima).
    if (pendiente && marca === null && !conflicto) programarSubida(restante(pendiente));
  }

  function restante(p: { guardado: number; desde: number }): number {
    const ahora = reloj();
    return Math.min(p.guardado + esperaMs - ahora, p.desde + esperaMaximaMs - ahora);
  }

  async function guardarYa(): Promise<void> {
    if (!pendiente && !enVuelo) return;
    desprogramar();
    await subir();
  }

  return {
    async leer() {
      const local = leerEspejo();
      let r: RespuestaLeerFoto;
      try {
        r = await base.leer();
      } catch {
        r = { ok: false, error: "No hubo respuesta de la base." };
      }
      if (!r.ok) {
        if (!local) throw new Error(`No se pudo abrir el club: ${r.error}`);
        // La base no respondió: se sigue con el espejo; lo que no subió, sube con el próximo guardado.
        version = local.meta.version;
        origen = "espejo";
        if (!local.meta.subido) pendiente = { texto: local.texto, guardado: local.meta.guardado, desde: reloj(), esperan: [] };
        return { texto: local.texto, version };
      }
      const enBase = r.foto ? { texto: await descomprimir(r.foto.gzip), version: r.foto.version, guardado: r.foto.guardado ?? -Infinity } : null;
      const versionBase = enBase?.version ?? 0;
      // Volver a leer de la base CIERRA el choque (otra terminal guardó): lo de acá que no llegó ya lo tiene el almacén
      // (lo aparta y avisa) y desde acá se sigue guardando sobre la versión nueva. Sin esto el marcador quedaba pegado y
      // cada guardado nuevo volvía a chocar: el puesto perdía cambios en silencio hasta apretar F5 (21/10).
      if (conflicto) {
        conflicto = false;
        error = null;
        if (pendiente) {
          pendiente.esperan.forEach((fn) => fn({ ok: false, motivo: "conflicto", version: versionBase }));
          pendiente = null;
        }
        desprogramar();
      }
      const guardadoBase = enBase?.guardado ?? -Infinity;
      version = versionBase;
      const localSinSubir = local && !local.meta.subido && local.meta.guardado > guardadoBase;
      if (local && localSinSubir && local.meta.version === versionBase) {
        // El espejo sigue a lo que tiene la base y es más nuevo: gana y sube ya.
        origen = "espejo";
        pendiente = { texto: local.texto, guardado: local.meta.guardado, desde: reloj(), esperan: [] };
        programarSubida(0);
        return { texto: local.texto, version };
      }
      if (local && localSinSubir) {
        // La base avanzó desde otra terminal: gana la base; lo de este equipo se aparta, no se pierde.
        try {
          espejo?.setItem(claves.descartada, local.texto);
          apartado = true;
        } catch {
          // sin lugar para apartarlo
        }
      }
      if (!enBase) {
        origen = "nada";
        return null;
      }
      origen = "base";
      // El espejo ya es esta misma foto: no se reescribe (un mes de club son ~3 MB en cada apertura).
      if (local?.meta.subido && local.meta.version === versionBase) return { texto: enBase.texto, version: versionBase };
      escribirEspejo(enBase.texto, { version: versionBase, guardado: Number.isFinite(guardadoBase) ? guardadoBase : 0, subido: true });
      return { texto: enBase.texto, version: versionBase };
    },

    guardar(texto, versionEsperada) {
      if (conflicto) return Promise.resolve({ ok: false, motivo: "conflicto", version });
      const ahora = reloj();
      let conMarca: string;
      try {
        conMarca = conGuardado(texto, ahora);
      } catch {
        return Promise.resolve({ ok: false, motivo: "error" });
      }
      // La versión que manda el almacén puede ir atrasada (la subida anterior todavía no volvió): vale la más alta.
      if (versionEsperada > version) version = versionEsperada;
      escribirEspejo(conMarca, { version, guardado: ahora, subido: false });
      return new Promise<ResultadoDelGuardado>((resolve) => {
        const desde = pendiente?.desde ?? ahora;
        pendiente = { texto: conMarca, guardado: ahora, desde, esperan: [...(pendiente?.esperan ?? []), resolve] };
        if (!enVuelo) programarSubida(restante(pendiente));
      });
    },

    guardarYa,

    estado: () => ({ version, origen, pendiente: pendiente !== null, subiendo: enVuelo !== null, ultimaSubida, conflicto, error, apartado }),

    engancharSalida(objetivo = objetivoDelNavegador()) {
      if (!objetivo) return () => {};
      const alOcultar = () => {
        if (objetivo.oculta()) void guardarYa();
      };
      const alSalir = () => void guardarYa();
      objetivo.addEventListener("visibilitychange", alOcultar);
      objetivo.addEventListener("pagehide", alSalir);
      return () => {
        objetivo.removeEventListener("visibilitychange", alOcultar);
        objetivo.removeEventListener("pagehide", alSalir);
      };
    },
  };
}

/** `document` (para `visibilitychange`) y `window` (para `pagehide`) juntos, o null fuera del navegador. */
function objetivoDelNavegador(): ObjetivoDeSalida | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  return {
    addEventListener: (tipo, fn) => (tipo === "pagehide" ? window : document).addEventListener(tipo, fn),
    removeEventListener: (tipo, fn) => (tipo === "pagehide" ? window : document).removeEventListener(tipo, fn),
    oculta: () => document.visibilityState === "hidden",
  };
}
