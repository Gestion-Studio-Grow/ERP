// ============================================================================
// DÓNDE SE GUARDA EL CLUB — el contrato del guardado (enchufable) y el de este equipo (localStorage).
// ============================================================================
//
// El almacén (almacen.ts) no sabe dónde se guarda: habla con un `GuardadoDelClub`, asíncrono, con VERSIÓN. Es el
// contrato acordado con la sesión del club, que enchufa el de la base (BP-3) sin tocar el almacén:
//
//   · `leer()` da lo último guardado y su versión (null si no hay nada);
//   · `guardar(texto, versionEsperada)` escribe SÓLO si lo guardado sigue en `versionEsperada` (si otro escribió
//     antes, `conflicto`: nunca se pisa una versión más nueva con una vieja). Si sale bien, la versión nueva.
//
// El texto es el sobre v1 del motor (`textoDelEstado`, docs/tenants/breakpoint/FORMATO-RESPALDO.md) con dos claves
// más al final que `hidratarEstado` ignora: `hoy` (el día de la demo) y `guardado` (ms epoch). Se guarda y se
// devuelve TAL CUAL: el guardado no lo abre ni lo reescribe.
//
// EL DE ESTE EQUIPO (`crearGuardadoLocal`) es el default y, con otro guardado enchufado, el ESPEJO local:
//   · la clave es la de siempre (`gsg-club:<negocio>:<usuario>:v1` en la demo, `gsg-club:<negocio>:jornada:v1` en la
//     jornada real): MT, nada «de todos»;
//   · la versión va pegada al final del mismo texto (`…,"version":N}`), así texto y versión se escriben juntos (un
//     solo `setItem`, nada a medias) y se lee sin abrir el JSON (mirando los últimos caracteres). Lo guardado antes
//     de esto (sin versión) es la versión 0;
//   · además de la cara asíncrona del contrato tiene una cara SINCRÓNICA (`leerYa`, `guardarYa`), que es la que usa
//     el almacén: localStorage es sincrónico, y al salir de la página (`pagehide`) una promesa puede no llegar;
//   · como espejo de otro guardado, `espejar` deja una copia sincrónica de lo que todavía no se confirmó, con una
//     marca chica aparte (`<clave>:pendiente` = de qué versión viene y hasta cuál puede haber llegado lo que estaba
//     en camino). Al volver, si lo de allá está en ese rango, gana lo de este equipo (es más nuevo); si no, gana lo
//     de allá (otro guardó después).

/** Lo que devuelve `guardar`. `version` en el conflicto: la que está guardada (si se sabe). */
export type ResultadoDelGuardado = { ok: true; version: number } | { ok: false; motivo: "conflicto" | "error"; version?: number };

/** El contrato: dónde se guarda el club (este equipo, la base…). Asíncrono y con versión. */
export interface GuardadoDelClub {
  leer(): Promise<{ texto: string; version: number } | null>;
  guardar(texto: string, versionEsperada: number): Promise<ResultadoDelGuardado>;
  /**
   * OPCIONAL. Guarda aparte el anexo de los días archivados (`archivarDiasCerrados` del motor), ANTES de que el almacén
   * achique el estado: true si quedó guardado. Sin este método, el anexo va en el archivo único que se descarga y
   * el almacén exige que el dueño lo vuelva a elegir (`confirmar({ archivoElegido })`, verificado con su huella). El texto es `JSON.stringify(anexo)`; `hasta` es el último día
   * archivado. El de este equipo NO lo implementa a propósito: guardar el anexo en el mismo equipo ocuparía el lugar que
   * el archivado tiene que liberar; con él, el anexo se descarga (como el vanilla). Lo implementa la base (BP-3).
   */
  guardarAnexo?(texto: string, hasta: string): Promise<boolean>;
}

/** La marca de lo que quedó en el espejo sin confirmar: viene de `base` y lo que estaba en camino pudo llegar a `hasta`. */
export interface MarcaDelEspejo {
  base: number;
  hasta: number;
}

/** El guardado de este equipo: el contrato más su cara sincrónica y la de espejo. */
export interface GuardadoLocal extends GuardadoDelClub {
  readonly clave: string;
  leerYa(): { texto: string; version: number } | null;
  guardarYa(texto: string, versionEsperada: number): ResultadoDelGuardado;
  /** Copia sincrónica de lo que todavía no confirmó el otro guardado (ver arriba). Sin chequeo de versión. */
  espejar(texto: string, marca: MarcaDelEspejo): boolean;
  /** La marca de lo pendiente del espejo, o null (no hay nada sin confirmar). */
  marca(): MarcaDelEspejo | null;
  /** El otro guardado confirmó: lo del espejo ya no está pendiente. */
  alDia(): void;
  /** Aparta un texto que no se pudo leer (no se borra: se guarda al lado). false si no hubo lugar. */
  apartar(texto: string, cuando: number): boolean;
  borrar(): void;
}

/** El pedazo de `Storage` que se usa (se reemplaza en los tests). */
export type AlmacenamientoLocal = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const COLA = /,"version":(\d{1,15})\}$/;

/** El texto guardado sin la versión pegada al final, y la versión (0 si es de antes de las versiones). */
export function separarVersion(crudo: string): { texto: string; version: number } {
  const m = COLA.exec(crudo.slice(-32));
  if (!m) return { texto: crudo, version: 0 };
  return { texto: `${crudo.slice(0, crudo.length - m[0].length)}}`, version: Number(m[1]) };
}

/** El texto con la versión pegada al final (`{…}` → `{…,"version":N}`). */
export function pegarVersion(texto: string, version: number): string {
  if (!texto.endsWith("}")) throw new Error("El texto del club tiene que ser un objeto JSON.");
  return `${texto.slice(0, -1)},"version":${Math.max(0, Math.trunc(version))}}`;
}

export function esGuardadoLocal(g: GuardadoDelClub | null | undefined): g is GuardadoLocal {
  return !!g && typeof (g as Partial<GuardadoLocal>).guardarYa === "function" && typeof (g as Partial<GuardadoLocal>).leerYa === "function";
}

/** El guardado en este equipo (localStorage). Nunca tira: si el navegador no deja, `error` o null. */
export function crearGuardadoLocal(almacenamiento: AlmacenamientoLocal, clave: string): GuardadoLocal {
  if (!clave.trim()) throw new Error("El guardado del club necesita una clave.");
  const claveMarca = `${clave}:pendiente`;
  const crudo = (): string | null => {
    try {
      return almacenamiento.getItem(clave);
    } catch {
      return null;
    }
  };
  const versionGuardada = (): number => {
    const c = crudo();
    return c === null ? 0 : separarVersion(c).version;
  };
  const local: GuardadoLocal = {
    clave,
    leerYa() {
      const c = crudo();
      return c ? separarVersion(c) : null;
    },
    guardarYa(texto, versionEsperada) {
      let actual: number;
      try {
        actual = versionGuardada();
      } catch {
        return { ok: false, motivo: "error" };
      }
      if (actual !== versionEsperada) return { ok: false, motivo: "conflicto", version: actual };
      const nueva = versionEsperada + 1;
      try {
        almacenamiento.setItem(clave, pegarVersion(texto, nueva));
        return { ok: true, version: nueva };
      } catch {
        // Sin lugar (o el navegador no deja): lo de antes queda como estaba.
        return { ok: false, motivo: "error", version: actual };
      }
    },
    espejar(texto, marca) {
      try {
        almacenamiento.setItem(clave, pegarVersion(texto, marca.base));
        almacenamiento.setItem(claveMarca, JSON.stringify(marca));
        return true;
      } catch {
        return false;
      }
    },
    marca() {
      try {
        const m = JSON.parse(almacenamiento.getItem(claveMarca) ?? "null") as Partial<MarcaDelEspejo> | null;
        return m && Number.isInteger(m.base) && Number.isInteger(m.hasta) ? { base: m.base!, hasta: m.hasta! } : null;
      } catch {
        return null;
      }
    },
    alDia() {
      try {
        almacenamiento.removeItem(claveMarca);
      } catch {
        // sin almacenamiento: no había marca que borrar
      }
    },
    apartar(texto, cuando) {
      try {
        almacenamiento.setItem(`${clave}:ilegible:${cuando}`, texto);
        return true;
      } catch {
        return false;
      }
    },
    borrar() {
      try {
        almacenamiento.removeItem(clave);
        almacenamiento.removeItem(claveMarca);
      } catch {
        // sin almacenamiento: alcanza con lo que hay en memoria
      }
    },
    leer: async () => local.leerYa(),
    guardar: async (texto, versionEsperada) => local.guardarYa(texto, versionEsperada),
  };
  return local;
}
