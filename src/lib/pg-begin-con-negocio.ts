// ============================================================================
// BEGIN Y EL NEGOCIO EN UN SOLO VIAJE — cómo sale a la red una transacción con RLS.
// ============================================================================
//
// POR QUÉ. Con RLS prendido, cada lectura suelta del panel es una transacción: BEGIN, el
// `set_config` que pone el negocio, la consulta y COMMIT (src/lib/rls.ts). Son cuatro idas y
// vueltas a la base por lectura, y una pantalla hace decenas (el Inicio de un local, cerca de
// doscientas). Las dos primeras no dependen de nada de lo que pasa en el medio: pueden salir
// juntas, en un solo mensaje. Medido con el banco de la capa de datos (el código real contra una
// copia de la base del laboratorio, detrás de un proxy que cuenta viajes; informe de performance
// del 2026-09-24): una lectura suelta con RLS pasa de 4 viajes a 3 (con 30 ms de ida y vuelta,
// de 127 a 96 ms) y una transacción Serializable con una consulta, de 5 a 3 (de 163 a 96 ms).
//
// QUÉ HACE. Envuelve `query` de cada conexión del pool de pg:
//   · "BEGIN" no sale todavía: queda pendiente y se le contesta a Prisma como si hubiera salido
//     (Prisma no mira lo que devuelve un BEGIN, sólo que no falle).
//   · "SET TRANSACTION ISOLATION LEVEL X", que Prisma manda justo después cuando se pide un
//     nivel, se pliega al pendiente: "BEGIN ISOLATION LEVEL X" (es la misma orden de Postgres).
//   · Si lo siguiente es el `set_config` del negocio, salen los dos en UN mensaje simple:
//        BEGIN [ISOLATION LEVEL X]; SELECT set_config('app.current_tenant_id', '<id>', true)
//   · Si lo siguiente es cualquier otra cosa, sale primero el BEGIN y después eso: lo de siempre.
//   · Si lo siguiente es COMMIT o ROLLBACK (una transacción en la que no se hizo nada), no sale
//     ninguno de los dos: una transacción vacía no tiene efecto.
// Mismas sentencias, mismo orden, misma transacción y misma conexión. Cambia el empaquetado.
//
// POR QUÉ NO AFLOJA EL AISLAMIENTO:
//   · El negocio sigue siendo LOCAL a la transacción (`set_config(..., true)`, igual que antes):
//     un mensaje simple que empieza con BEGIN deja la transacción abierta al terminar, y el
//     COMMIT la cierra con el valor adentro. Verificado contra Postgres con el rol app_rls
//     (pg-begin-con-negocio-postgres.test.ts): adentro se ven las filas del negocio, afuera
//     ninguna, y después del COMMIT el valor queda vacío.
//   · El id viaja como literal y SÓLO si tiene la forma de un id (letras, números, - y _): no
//     puede traer comillas. Además va escapado por pg (`escapeLiteral`). Cualquier otra cosa
//     sale por el camino de siempre, parametrizada.
//   · Una conexión que vuelve al pool con un BEGIN pendiente lo pierde (`soltar`): lo pendiente
//     nunca salió, así que no hay transacción abierta que heredar.
//
// Hoja sin dependencias de valor: la prueban los tests con una conexión falsa y la enchufa
// src/lib/prisma-base.ts en cada conexión nueva del pool.

/** El SQL con el que rls.ts pone el negocio. `$executeRaw` lo manda parametrizado así. */
const GUC_DEL_NEGOCIO = /^\s*SELECT\s+set_config\(\s*'app\.current_tenant_id'\s*,\s*\$1\s*,\s*true\s*\)\s*;?\s*$/i;
const NIVEL = /^\s*SET\s+TRANSACTION\s+ISOLATION\s+LEVEL\s+(READ\s+UNCOMMITTED|READ\s+COMMITTED|REPEATABLE\s+READ|SERIALIZABLE)\s*;?\s*$/i;
const FIN = /^\s*(COMMIT|ROLLBACK)\s*;?\s*$/i;
/** Un id de negocio (cuid): lo único que se acepta como literal en el mensaje. */
const FORMA_DE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Lo que se usa de una conexión de pg. Es lo que imita la conexión falsa de los tests. */
export interface ConexionPg {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (...args: any[]) => any;
  escapeLiteral(s: string): string;
}

type Config = { text?: string; values?: unknown[]; name?: string; rowMode?: string; types?: unknown; submit?: unknown; callback?: unknown };

/** Un resultado con la forma que devuelve pg, para contestar lo que todavía no salió. */
function resultadoVacio(command: string) {
  return { command, rowCount: null, oid: 0, rows: [], fields: [] };
}

const MARCA = Symbol.for("gsg.pg-begin-con-negocio");

export interface Instalado {
  /** Olvida un BEGIN pendiente (la conexión volvió al pool). */
  soltar(): void;
}

/**
 * Enchufa el empaquetado en UNA conexión. Idempotente: una conexión se envuelve una sola vez.
 * `alEnviar` (opcional) ve cada mensaje que sale de verdad: lo usan los tests para contar viajes.
 *
 * Estados de la conexión:
 *   · libre      — nada pendiente: todo sale derecho.
 *   · pendiente  — llegó un BEGIN que todavía no salió (con o sin nivel de aislamiento).
 *   · vaciando   — el BEGIN salió solo (lo siguiente no era el negocio) y se espera su respuesta:
 *                  lo que llegue mientras tanto espera su turno, así el orden es el de llegada.
 *   · fallido    — el BEGIN que salió solo falló: nada más corre como si hubiera transacción.
 *                  Todo se rechaza con ese error hasta el ROLLBACK (o hasta que la conexión
 *                  vuelve al pool). Antes, ese error lo daba el BEGIN y la transacción no
 *                  arrancaba; ahora lo da la primera sentencia y la transacción tampoco corre.
 */
export function instalarBeginConNegocio(conexion: ConexionPg, alEnviar?: (texto: string) => void): Instalado {
  const ya = (conexion as unknown as Record<symbol, Instalado | undefined>)[MARCA];
  if (ya) return ya;

  const original = conexion.query.bind(conexion);
  type Estado =
    | { tipo: "libre" }
    | { tipo: "pendiente"; begin: string }
    | { tipo: "vaciando"; listo: Promise<void> }
    | { tipo: "fallido"; error: unknown };
  let estado: Estado = { tipo: "libre" };

  const enviar = (config: unknown, values?: unknown, callback?: unknown) => {
    if (alEnviar) alEnviar(typeof config === "string" ? config : String((config as Config)?.text ?? ""));
    if (callback !== undefined) return original(config, values, callback);
    return values === undefined ? original(config) : original(config, values);
  };

  const despachar = (config: unknown, values?: unknown, callback?: unknown): unknown => {
    const cfg = (typeof config === "string" ? { text: config } : (config ?? {})) as Config;
    const texto = typeof cfg.text === "string" ? cfg.text : "";
    const valores = Array.isArray(values) ? values : cfg.values;
    const sinValores = !valores || valores.length === 0;
    const conCallback =
      typeof values === "function" || typeof callback === "function" || typeof cfg.callback === "function" || typeof cfg.submit === "function";

    // Estilo callback u objeto Query: Prisma no lo usa. Pasa derecho; un BEGIN pendiente sale
    // antes (la cola de pg respeta el orden de llegada).
    if (conCallback) {
      if (estado.tipo === "pendiente") {
        const b = estado.begin;
        estado = { tipo: "libre" };
        Promise.resolve(enviar(b)).catch(() => {});
      }
      return enviar(config, values, callback);
    }

    if (estado.tipo === "vaciando") {
      const { listo } = estado;
      return listo.then(() => despachar(config, values));
    }

    if (estado.tipo === "fallido") {
      if (FIN.test(texto) && /ROLLBACK/i.test(texto)) {
        estado = { tipo: "libre" };
        return Promise.resolve(resultadoVacio("ROLLBACK"));
      }
      return Promise.reject(estado.error);
    }

    if (estado.tipo === "libre") {
      if (/^\s*BEGIN\s*;?\s*$/i.test(texto) && sinValores && !cfg.name) {
        estado = { tipo: "pendiente", begin: "BEGIN" };
        return Promise.resolve(resultadoVacio("BEGIN"));
      }
      return enviar(config, values);
    }

    // Hay un BEGIN pendiente.
    const begin = estado.begin;
    const nivel = NIVEL.exec(texto);
    if (nivel && sinValores && !cfg.name && begin === "BEGIN") {
      estado = { tipo: "pendiente", begin: `BEGIN ISOLATION LEVEL ${nivel[1].toUpperCase().replace(/\s+/g, " ")}` };
      return Promise.resolve(resultadoVacio("SET"));
    }
    if (FIN.test(texto) && sinValores && !cfg.name) {
      // Transacción vacía: ni el BEGIN ni su cierre tienen efecto.
      estado = { tipo: "libre" };
      return Promise.resolve(resultadoVacio(texto.trim().replace(/;$/, "").toUpperCase()));
    }
    const id = valores?.length === 1 ? valores[0] : undefined;
    if (GUC_DEL_NEGOCIO.test(texto) && typeof id === "string" && FORMA_DE_ID.test(id) && !cfg.name) {
      estado = { tipo: "libre" };
      const pedido: Config = { text: `${begin}; SELECT set_config('app.current_tenant_id', ${conexion.escapeLiteral(id)}, true)` };
      if (cfg.rowMode !== undefined) pedido.rowMode = cfg.rowMode;
      if (cfg.types !== undefined) pedido.types = cfg.types;
      // Varias sentencias en un mensaje simple: pg devuelve un resultado por sentencia. El que
      // corresponde a lo que se pidió es el del set_config, el último. Sale YA (sincrónico), así
      // lo que se pida después queda detrás en la cola de pg.
      return Promise.resolve(enviar(pedido)).then((r: unknown) => (Array.isArray(r) ? r[r.length - 1] : r));
    }
    // Otra cosa: el BEGIN sale solo y, cuando contestó, lo pedido. Mientras tanto la conexión
    // queda "vaciando": lo que llegue espera, y sale después, en orden.
    const salioElBegin = Promise.resolve(enviar(begin));
    const listo = salioElBegin.then(
      () => {
        if (estado.tipo === "vaciando" && estado.listo === listo) estado = { tipo: "libre" };
      },
      (error: unknown) => {
        if (estado.tipo === "vaciando" && estado.listo === listo) estado = { tipo: "fallido", error };
      },
    );
    estado = { tipo: "vaciando", listo };
    return salioElBegin.then(() => enviar(config, values));
  };

  conexion.query = despachar;

  const instalado: Instalado = {
    soltar() {
      estado = { tipo: "libre" };
    },
  };
  Object.defineProperty(conexion, MARCA, { value: instalado, enumerable: false });
  return instalado;
}

/** Lo que se usa del pool de pg: los avisos de conexión nueva ("connect") y devuelta ("release"). */
export interface PoolPg {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(evento: string, fn: (...args: any[]) => void): unknown;
}

/** Enchufa el empaquetado en cada conexión que abra el pool. */
export function instalarEnPool(pool: PoolPg): void {
  pool.on("connect", (c: ConexionPg) => {
    instalarBeginConNegocio(c);
  });
  pool.on("release", (_err: unknown, c: ConexionPg) => {
    (c as unknown as Record<symbol, Instalado | undefined>)[MARCA]?.soltar();
  });
}
