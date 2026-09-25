// ============================================================================
// REGISTRO DE CONECTORES — la lista única de integraciones (E3 §2.2).
// ============================================================================
//
// Sumar un conector = importarlo y agregarlo a `CONECTORES`. El registro se construye
// fail-closed: si un conector está mal formado, le falta el simulador o repite un id, no
// arranca (`RegistroInvalidoError`).
//
// Dos niveles de control, a propósito:
//   - `validarRegistro` (se corre al construir, en producción): la FORMA. Es barato y no
//     ejecuta nada del conector.
//   - `verificarSimulador` (lo corre registro.test.ts sobre cada conector registrado): el
//     COMPORTAMIENTO. Arma cada escenario firmado con un secreto, exige que la firma pase con
//     ese secreto y falle con otro, con el cuerpo alterado (si lo cubre) y con cada
//     encabezado o parámetro declarado firmado cambiado o sacado; que un instante firmado
//     fuera de la ventana se rechace; que `normalizarFailClosed` devuelva los eventos
//     esperados con su cuenta; y que, con la firma capturada y lo NO firmado cambiado (o lo
//     firmado cambiado sólo de forma: espacios, mayúsculas), el evento sea idéntico (misma
//     cuenta, misma clave). Así "el simulador firma con el mismo algoritmo que verifica" es un
//     test que se ejecuta, no una promesa. Un verificador que acepta todo no pasa, y uno que
//     canonicaliza lo que normalizar lee crudo tampoco.
//
// Los conectores entran por tanda (R1-F2 WhatsApp; R5 Mercado Pago y ARCA; R6 tiendas). Cada
// uno vive en su carpeta y acá sólo se agrega la línea.

import type { ModuleKind, ProblemaCatalogo } from "@/modules/contract";
import {
  encabezadosCanonicos,
  normalizarFailClosed,
  parsearCuerpoJson,
  responderDesafioFailClosed,
  validarConector,
  verificarFirmaFailClosed,
  VENTANA_ANTI_REPLAY_MS,
  type ConectorDescriptor,
  type EntradaCruda,
  type SimuladorConector,
} from "./contrato";

/** La lista de conectores del producto. Vacía hasta que entre el primero (R1-F2: WhatsApp). */
export const CONECTORES: readonly ConectorDescriptor[] = [];

export interface OpcionesRegistro {
  /**
   * Módulos del catálogo (id → kind). Si viene, cada conector tiene que existir ahí como
   * "plugin": un conector sin módulo no se puede asignar a un negocio.
   */
  modulosDelCatalogo?: ReadonlyMap<string, ModuleKind>;
}

/** Valida la forma de todos los conectores y lo que miran en conjunto. */
export function validarRegistro(
  conectores: readonly unknown[],
  opciones: OpcionesRegistro = {},
): ProblemaCatalogo[] {
  const problemas: ProblemaCatalogo[] = [];
  const ids = new Set<string>();
  for (const c of conectores) {
    problemas.push(...validarConector(c));
    const id = c && typeof c === "object" ? (c as { id?: unknown }).id : undefined;
    if (typeof id !== "string") continue;
    if (ids.has(id)) {
      problemas.push({ moduloId: id, severidad: "error", mensaje: `conector repetido: "${id}".` });
    }
    ids.add(id);
    const cat = opciones.modulosDelCatalogo;
    if (cat) {
      const kind = cat.get(id);
      if (kind === undefined) {
        problemas.push({
          moduloId: id,
          severidad: "error",
          mensaje: `el conector "${id}" no tiene módulo en el catálogo (src/modules/catalog.ts).`,
        });
      } else if (kind !== "plugin") {
        problemas.push({
          moduloId: id,
          severidad: "error",
          mensaje: `el módulo "${id}" del catálogo no es "plugin" (es "${kind}").`,
        });
      }
    }
  }
  return problemas;
}

export class RegistroInvalidoError extends Error {
  constructor(readonly problemas: ProblemaCatalogo[]) {
    super(
      "Registro de conectores inválido:\n" +
        problemas.map((p) => `  - [${p.moduloId}] ${p.mensaje}`).join("\n"),
    );
    this.name = "RegistroInvalidoError";
  }
}

export interface RegistroConectores {
  /** El conector por id, o null. El id puede venir de la URL: se busca en un Map. */
  obtener(id: string): ConectorDescriptor | null;
  ids(): string[];
  todos(): readonly ConectorDescriptor[];
}

/** Construye el registro. Fail-closed: con cualquier error lanza `RegistroInvalidoError`. */
export function construirRegistro(
  conectores: readonly ConectorDescriptor[] = CONECTORES,
  opciones: OpcionesRegistro = {},
): RegistroConectores {
  const errores = validarRegistro(conectores, opciones).filter((p) => p.severidad === "error");
  if (errores.length > 0) throw new RegistroInvalidoError(errores);
  const porId = new Map<string, ConectorDescriptor>(conectores.map((c) => [c.id, c]));
  const lista = Object.freeze([...conectores]);
  return {
    obtener: (id) => (typeof id === "string" ? porId.get(id) ?? null : null),
    ids: () => [...porId.keys()],
    todos: () => lista,
  };
}

let cache: RegistroConectores | null = null;
/** El registro del producto (perezoso, uno por proceso). */
export function registro(): RegistroConectores {
  if (!cache) cache = construirRegistro();
  return cache;
}

// ── Verificación del simulador (la ejecuta registro.test.ts) ─────────────────

const SECRETO_A = "secreto-de-prueba-A-9f2c1e7b";
const SECRETO_B = "secreto-de-prueba-B-41d0aa53";
const TOKEN_DESAFIO_A = "token-de-desafio-A-5e0b93";
const TOKEN_DESAFIO_B = "token-de-desafio-B-c8134f";

const enc = new TextEncoder();
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Donde = "encabezados" | "consulta";
const DONDES: readonly Donde[] = ["encabezados", "consulta"];
const cual = (donde: Donde, campo: string) => `${donde === "encabezados" ? "el encabezado" : "el parámetro"} "${campo}"`;

/** Copia de la request con el último byte del cuerpo cambiado. */
function conCuerpoAlterado(req: EntradaCruda): EntradaCruda {
  const cuerpo = new Uint8Array(req.cuerpo);
  cuerpo[cuerpo.length - 1] ^= 0x01;
  return { ...req, cuerpo };
}

/**
 * Tres maneras de cambiar el VALOR de un campo: agregarle un carácter, cambiarle el último, y
 * sacarlo (null). Si el campo está firmado, la firma tiene que fallar con cualquiera.
 */
function variantes(valor: string): Array<string | null> {
  const ultimo = valor.slice(-1);
  let otro = "0";
  if (/^[0-8]$/.test(ultimo)) otro = String(Number(ultimo) + 1);
  else if (/^[a-yA-Y]$/.test(ultimo)) otro = String.fromCharCode(ultimo.charCodeAt(0) + 1);
  return [`${valor}0`, `${valor.slice(0, -1)}${otro}`, null];
}

/**
 * Cambios que tocan sólo la FORMA de un valor: espacio adelante o atrás, mayúsculas por
 * minúsculas, un cero adelante. Un verificador que canonicaliza (trim, minúsculas, Number)
 * puede aceptarlos — Mercado Pago firma `data.id` en minúsculas —, y está bien SÓLO si el
 * evento sale idéntico. Si `normalizar` lee el valor crudo, " pago-1" es otra clave de
 * deduplicación del mismo pago con una firma capturada: el mismo pago asentado dos veces.
 */
function variantesDeForma(valor: string): Array<[string, string]> {
  const invertido = Array.from(valor, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())).join("");
  const todas: Array<[string, string]> = [
    ["espacio adelante", ` ${valor}`],
    ["espacio atrás", `${valor} `],
    ["las mayúsculas cambiadas", invertido],
    ["un cero adelante", `0${valor}`],
  ];
  return todas.filter(([, v]) => v !== valor);
}

/** ¿Tiene la forma de una request de la entrada? (encabezados en minúsculas, consulta objeto, cuerpo en bytes) */
function esRequestBienFormada(r: unknown): r is EntradaCruda {
  if (!r || typeof r !== "object") return false;
  const x = r as EntradaCruda;
  return (
    (x.metodo === "GET" || x.metodo === "POST") &&
    x.cuerpo instanceof Uint8Array &&
    !!x.consulta &&
    typeof x.consulta === "object" &&
    encabezadosCanonicos(x)
  );
}

const clavesDe = (o: Readonly<Record<string, string>>) => Object.keys(o).sort().join("\n");
const bytesIguales = (a: Uint8Array, b: Uint8Array) => a.byteLength === b.byteLength && a.every((x, i) => x === b[i]);

/**
 * Una alteración que PRUEBA algo: cambia al menos un valor y no saca ni agrega campos. Una
 * que saca la firma, o que es la misma request, se rechaza (o no) por un motivo trivial.
 */
function esAlteracionUtil(alterada: EntradaCruda, original: EntradaCruda): boolean {
  if (clavesDe(alterada.encabezados) !== clavesDe(original.encabezados)) return false;
  if (clavesDe(alterada.consulta) !== clavesDe(original.consulta)) return false;
  const distintos = (d: Donde) => Object.keys(original[d]).some((k) => alterada[d][k] !== original[d][k]);
  return distintos("encabezados") || distintos("consulta") || !bytesIguales(alterada.cuerpo, original.cuerpo);
}

/** La request con un encabezado o parámetro cambiado (o sacado si `valor` es null). Conserva el orden. */
function conCampo(req: EntradaCruda, donde: Donde, campo: string, valor: string | null): EntradaCruda {
  const campos = Object.entries(req[donde]).flatMap(([k, v]): Array<[string, string]> =>
    k !== campo ? [[k, v]] : valor === null ? [] : [[k, valor]],
  );
  return { ...req, [donde]: Object.fromEntries(campos) };
}

/** Cambia cada hoja de un JSON (textos, números, booleanos) conservando la forma. */
function forjar(v: unknown, prof = 0): unknown {
  if (prof > 32) return v;
  if (typeof v === "string") return `${v}-forjado`;
  if (typeof v === "number") return v + 1;
  if (typeof v === "boolean") return !v;
  if (Array.isArray(v)) return v.map((x) => forjar(x, prof + 1));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, forjar(x, prof + 1)]));
  return v;
}

/** Cuerpos distintos del original: vacío, "{}", uno de otra cuenta y el original con cada hoja cambiada. */
function cuerposForjados(req: EntradaCruda): Uint8Array[] {
  const forjados = [
    new Uint8Array(0),
    enc.encode("{}"),
    enc.encode(JSON.stringify({ cuenta: "cuenta-forjada", id: "id-forjado", user_id: "cuenta-forjada" })),
  ];
  try {
    const original = parsearCuerpoJson(req);
    if (original !== null) forjados.push(enc.encode(JSON.stringify(forjar(original))));
  } catch {
    // El cuerpo no es JSON: alcanzan los otros.
  }
  return forjados;
}

/** Los campos (parámetros o encabezados) cuyo valor NO trae `token`. */
const sinElToken = (o: Readonly<Record<string, string>>, token: string) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v !== "string" || !v.includes(token)));

/**
 * El desafío (GET de verificación): pasa con su token, no con otro, y nunca sin token (ni con
 * un GET vacío ni con el del simulador sin los campos que traen el token, que sí trae el eco).
 */
function verificarDesafio(conector: ConectorDescriptor, sim: SimuladorConector): string[] {
  const p: string[] = [];
  if (!conector.entrada?.desafio) return p;
  const aceptaSinToken = (r: EntradaCruda) => responderDesafioFailClosed(conector, r, TOKEN_DESAFIO_A).estado === 200;
  const vacio: EntradaCruda = { metodo: "GET", encabezados: {}, consulta: {}, cuerpo: new Uint8Array(0) };
  let sinToken = aceptaSinToken(vacio);
  if (typeof sim.desafio !== "function") {
    if (sinToken) p.push("el desafío acepta un GET sin token");
    p.push("el conector responde el desafío y el simulador no trae desafio()");
    return p;
  }
  let req: EntradaCruda;
  try {
    req = sim.desafio(TOKEN_DESAFIO_A);
  } catch (e) {
    p.push(`desafio() lanzó: ${mensajeDe(e)}`);
    return p;
  }
  if (!esRequestBienFormada(req)) {
    p.push("desafio() no devolvió una request de la entrada (encabezados en minúsculas, consulta como objeto, cuerpo en bytes)");
    return p;
  }
  const despojada: EntradaCruda = {
    ...req,
    encabezados: sinElToken(req.encabezados, TOKEN_DESAFIO_A),
    consulta: sinElToken(req.consulta, TOKEN_DESAFIO_A),
  };
  if (!sacoAlgunCampo(despojada, req)) p.push("la request de desafío del simulador no trae el token");
  else sinToken ||= aceptaSinToken(despojada);
  if (sinToken) p.push("el desafío acepta un GET sin token");
  if (responderDesafioFailClosed(conector, req, TOKEN_DESAFIO_A).estado !== 200) {
    p.push("el desafío del simulador no pasa con su propio token");
  }
  if (responderDesafioFailClosed(conector, req, TOKEN_DESAFIO_B).estado === 200) {
    p.push("el desafío pasa con otro token");
  }
  return p;
}

/** ¿Se sacó algún campo? (la request de desafío sin el token tiene que ser distinta) */
function sacoAlgunCampo(despojada: EntradaCruda, original: EntradaCruda): boolean {
  return (
    Object.keys(despojada.encabezados).length !== Object.keys(original.encabezados).length ||
    Object.keys(despojada.consulta).length !== Object.keys(original.consulta).length
  );
}

/**
 * Ejecuta el simulador del conector contra su propia entrada, con las MISMAS funciones que usa
 * la entrada en producción (`verificarFirmaFailClosed`, `normalizarFailClosed`). Devuelve los
 * problemas (vacío = el simulador y la entrada están de acuerdo, y la entrada rechaza lo que
 * tiene que rechazar).
 */
export function verificarSimulador(conector: ConectorDescriptor, ahora: Date = new Date()): string[] {
  const p: string[] = [];
  if (typeof conector.simulador !== "function") return ["sin simulador"];
  let sim: SimuladorConector;
  try {
    sim = conector.simulador();
  } catch (e) {
    return [`el simulador lanzó al construirse: ${mensajeDe(e)}`];
  }
  if (!sim || typeof sim !== "object") return ["el simulador no devolvió un objeto"];
  if (typeof sim.fuente !== "string" || !sim.fuente.trim()) {
    p.push("el simulador no dice de qué documentación sale (fuente)");
  }
  const escenarios = Array.isArray(sim.escenarios) ? sim.escenarios : [];

  if (conector.salida && typeof sim.transporte !== "function") {
    p.push("el conector tiene salida y el simulador no trae transporte falso");
  }

  const entrada = conector.entrada;
  if (!entrada) return p;
  p.push(...verificarDesafio(conector, sim));
  if (escenarios.length === 0) {
    p.push("el conector recibe avisos y el simulador no trae ningún escenario");
    return p;
  }

  const firmados: Record<Donde, ReadonlySet<string>> = {
    encabezados: new Set(entrada.encabezadosFirmados ?? []),
    consulta: new Set(entrada.consultaFirmada ?? []),
  };
  const comprobados: Record<Donde, Set<string>> = { encabezados: new Set(), consulta: new Set() };
  const pasa = (r: EntradaCruda, secreto: string = SECRETO_A) => verificarFirmaFailClosed(conector, r, secreto, ahora).ok;

  const idsEscenario = new Set<string>();
  for (const esc of escenarios) {
    const nombre = `escenario "${esc?.id}"`;
    if (!esc || typeof esc.armar !== "function") {
      p.push(`${nombre}: sin armar()`);
      continue;
    }
    if (idsEscenario.has(esc.id)) p.push(`${nombre}: id repetido`);
    idsEscenario.add(esc.id);

    const armar = (cuando: Date): EntradaCruda | string => {
      let r: EntradaCruda;
      try {
        r = esc.armar(SECRETO_A, cuando);
      } catch (e) {
        return `armar() lanzó: ${mensajeDe(e)}`;
      }
      if (!(r?.cuerpo instanceof Uint8Array)) return "armar() no devolvió una request con cuerpo en bytes";
      if (!encabezadosCanonicos(r) || !r.consulta || typeof r.consulta !== "object") {
        return "armar() tiene que devolver encabezados en minúsculas y la consulta como objeto";
      }
      return r;
    };
    const req = armar(ahora);
    if (typeof req === "string") {
      p.push(`${nombre}: ${req}`);
      continue;
    }
    if (entrada.firmaCubreCuerpo !== false && req.cuerpo.byteLength === 0) {
      p.push(`${nombre}: sin cuerpo no se puede probar la firma`);
      continue;
    }

    // 1. La firma del simulador pasa con su secreto…
    if (!pasa(req)) p.push(`${nombre}: la entrada rechaza la firma de su propio simulador`);
    // 2. …y no pasa con otro secreto, ni con el cuerpo alterado (si la firma lo cubre).
    if (pasa(req, SECRETO_B)) p.push(`${nombre}: la entrada acepta una firma hecha con otro secreto`);
    if (entrada.firmaCubreCuerpo !== false && pasa(conCuerpoAlterado(req))) {
      p.push(`${nombre}: la entrada acepta un cuerpo alterado`);
    }
    // 3. Lo que se declara firmado LO ESTÁ: cambiar o sacar cada encabezado o parámetro
    //    declarado hace fallar la firma. Si no, declararlo dejaría llegar a `normalizar` algo
    //    que un tercero puede cambiar.
    for (const donde of DONDES) {
      for (const campo of firmados[donde]) {
        if (!Object.prototype.hasOwnProperty.call(req[donde], campo)) continue;
        comprobados[donde].add(campo);
        for (const v of variantes(req[donde][campo])) {
          if (pasa(conCampo(req, donde, campo, v))) {
            p.push(`${nombre}: declara firmado ${cual(donde, campo)} y la firma pasa ${v === null ? "sin él" : "con otro valor"}`);
            break;
          }
        }
      }
    }
    // 4. Las alteraciones propias del simulador. Cada una tiene que tener la forma de una
    //    request de la entrada (si no, se rechaza por eso y no prueba nada) y rechazarse. Si
    //    la firma no cubre el cuerpo hace falta al menos una ÚTIL: que cambie un valor sin
    //    sacar ni agregar campos.
    let alteradas: unknown[] = [];
    if (typeof esc.alteraciones === "function") {
      try {
        const r: unknown = esc.alteraciones(req);
        if (Array.isArray(r)) alteradas = r;
        else p.push(`${nombre}: alteraciones() no devolvió una lista`);
      } catch (e) {
        p.push(`${nombre}: alteraciones() lanzó: ${mensajeDe(e)}`);
      }
    }
    let utiles = 0;
    alteradas.forEach((alterada, i) => {
      if (!esRequestBienFormada(alterada)) {
        p.push(
          `${nombre}: la alteración ${i + 1} no tiene la forma de una request de la entrada (encabezados en minúsculas, consulta como objeto, cuerpo en bytes): su rechazo no prueba nada`,
        );
        return;
      }
      if (pasa(alterada)) p.push(`${nombre}: la entrada acepta la alteración ${i + 1}`);
      else if (esAlteracionUtil(alterada, req)) utiles++;
    });
    if (entrada.firmaCubreCuerpo === false && utiles === 0) {
      p.push(
        `${nombre}: la firma no cubre el cuerpo y el simulador no trae alteraciones de lo firmado (al menos una que cambie un valor sin sacar ni agregar campos)`,
      );
    }
    // 5. Anti-replay: si la firma incluye un instante, lo firmado hace más de 5 minutos (o
    //    con más de 5 minutos de adelanto) se rechaza aunque la firma sea buena.
    if (entrada.firmaIncluyeInstante === true) {
      const fuera = VENTANA_ANTI_REPLAY_MS + 60_000;
      for (const [delta, cuando] of [
        [-fuera, "de hace más de 5 minutos"],
        [fuera, "con más de 5 minutos de adelanto"],
      ] as const) {
        const corrida = armar(new Date(ahora.getTime() + delta));
        if (typeof corrida === "string") p.push(`${nombre}: ${corrida}`);
        else if (pasa(corrida)) p.push(`${nombre}: la entrada acepta una firma ${cuando} (replay)`);
      }
    }

    // 6. La normalización (la misma función que usa la entrada) da lo esperado: eventos
    //    válidos, de la cuenta correcta y con claves únicas.
    const original = normalizarFailClosed(conector, req);
    if (!original.ok) {
      p.push(`${nombre}: ${original.detalle}`);
      continue;
    }
    for (const d of original.descartados) {
      for (const problema of d.problemas) p.push(`${nombre}: evento ${d.indice + 1}: ${problema}`);
    }
    const tipos = original.eventos.map((e) => e.tipo);
    const esperados = esc.esperado?.tipos ?? [];
    if (tipos.length !== esperados.length || tipos.some((t, i) => t !== esperados[i])) {
      p.push(`${nombre}: se esperaban [${esperados.join(", ")}] y salieron [${tipos.join(", ")}]`);
    }
    // El mismo aviso da siempre lo mismo: una clave al azar o con la hora rompe la deduplicación.
    const huella = JSON.stringify(original);
    if (JSON.stringify(normalizarFailClosed(conector, req)) !== huella) {
      p.push(`${nombre}: normalizar no es determinista: el mismo aviso da otro evento u otra clave`);
    }
    const idsEvento = new Set<string>();
    for (const e of original.eventos) {
      if (idsEvento.has(e.idExterno)) p.push(`${nombre}: dos eventos con la misma clave "${e.idExterno}"`);
      idsEvento.add(e.idExterno);
      if (entrada.modo === "url-de-app") {
        if (e.cuentaExterna == null) p.push(`${nombre}: evento sin cuenta externa en modo url-de-app`);
        else if (e.cuentaExterna !== esc.esperado?.cuentaExterna) {
          p.push(`${nombre}: evento de la cuenta "${String(e.cuentaExterna)}", se esperaba "${String(esc.esperado?.cuentaExterna)}"`);
        }
      }
    }

    // 7. Lo que la firma NO cubre no mueve nada. Con la firma capturada y el resto cambiado (el
    //    cuerpo, si no está firmado; cada encabezado o parámetro no declarado), o con lo
    //    firmado cambiado sólo de forma (espacios, mayúsculas, un cero adelante), o la firma
    //    falla o el resultado es IDÉNTICO: mismo tipo, misma cuenta (mismo negocio), misma
    //    clave de deduplicación, mismos datos. Es el ataque "firma válida, cuerpo de otra
    //    cuenta", y el de "firma válida, id con un espacio" contra un verificador que hace trim.
    const forjadas: Array<[string, EntradaCruda]> = [];
    if (entrada.firmaCubreCuerpo === false) {
      for (const cuerpo of cuerposForjados(req)) forjadas.push(["el cuerpo cambiado", { ...req, cuerpo }]);
    }
    for (const donde of DONDES) {
      for (const campo of Object.keys(req[donde])) {
        const valor = req[donde][campo];
        if (!firmados[donde].has(campo)) {
          for (const v of variantes(valor)) forjadas.push([`${cual(donde, campo)} cambiado`, conCampo(req, donde, campo, v)]);
        }
        for (const [como, v] of variantesDeForma(valor)) {
          forjadas.push([`${cual(donde, campo)} con ${como}`, conCampo(req, donde, campo, v)]);
        }
      }
    }
    for (const [que, forjada] of forjadas) {
      if (!pasa(forjada)) continue;
      if (JSON.stringify(normalizarFailClosed(conector, forjada)) !== huella) {
        p.push(
          `${nombre}: la firma sigue valiendo con ${que} y el evento cambia; lo que la firma no cubre (o la forma que el verificador ignora) no puede decidir negocio, tipo ni clave de deduplicación`,
        );
        break;
      }
    }
  }

  // Lo declarado firmado que ningún escenario trae no se pudo comprobar: no se acepta a ciegas.
  for (const donde of DONDES) {
    for (const campo of firmados[donde]) {
      if (!comprobados[donde].has(campo)) {
        p.push(`declara firmado ${cual(donde, campo)} y ningún escenario lo trae: no se puede comprobar`);
      }
    }
  }
  return p;
}
