// ============================================================================
// «AUTORIZAR LOS PENDIENTES» — un toque manda TODOS, de a tandas.
// ============================================================================
//
// El botón dice «Autorizar los 59 pendientes», pero cada ida al servidor manda a lo sumo 20
// (`procesarEnviosDelNegocio`, límite 20 en arca-dispatch.ts: una tanda cabe en el tiempo de una
// función). Antes un toque mandaba una tanda y el botón mentía: 59 → 39 → 19 → 0, tres toques.
// Ahora la pantalla pide tandas hasta que no quede nada que se pueda mandar, y para antes sólo si:
//   · ARCA no respondió a alguno (error pasajero): reintentar enseguida sería insistirle a ARCA
//     caído; los que quedan siguen pendientes y el aviso lo dice;
// Lo que falla por un error NUESTRO (la base rechazó la operación: QA vuelta 2, 19 envíos con
// P2002 anunciados como «ARCA no respondió… probá de nuevo») no corta el toque ni se le achaca a
// ARCA: se saltea en las tandas siguientes (se manda una sola vez por toque) y el aviso dice que
// quedó registrado para Soporte, sin invitar a reintentar lo que reintentar no arregla.
//   · una tanda no avanzó (no quedó nada que se pueda tomar ahora: otro envío en curso);
//   · se hicieron las tandas que hacían falta para los pendientes del toque, más dos: no persigue
//     sin fin los que se van sumando mientras manda (una venta nueva, el banco).
// PURO: recibe la función que manda una tanda. Lo prueba autorizar-en-tandas.test.ts.

/** Lo que devuelve una tanda (el resumen del despacho y cuántos quedan pendientes después). */
export interface TandaMandada {
  procesados: number;
  autorizados: number;
  rechazados: number;
  fallidos: number;
  descartados: number;
  /** Comprobantes del negocio que siguen pendientes de autorizar después de la tanda. */
  quedan: number;
  /** Envíos de la tanda que fallaron por un error nuestro, no de ARCA (van dentro de `fallidos`). */
  conErrorDelSistema: string[];
}

export type MotivoDeCorte = "terminado" | "arca-no-respondio" | "sin-avance" | "tope";

export interface ResultadoDeAutorizar {
  procesados: number;
  autorizados: number;
  rechazados: number;
  /** A cuántos no les respondió ARCA (se pueden volver a mandar en unos minutos). */
  sinRespuesta: number;
  /** Cuántos no se pudieron mandar por un error nuestro (quedan para Soporte). */
  delSistema: number;
  /** Todos los pendientes del negocio, también los del error nuestro: lo que dice el botón. */
  quedan: number;
  tandas: number;
  corte: MotivoDeCorte;
}

/** Lo que manda cada ida al servidor (`procesarEnviosDelNegocio`, arca-dispatch.ts). */
export const TANDA_DE_ARCA = 20;

/** Cuántos envíos se piden saltear como mucho (un toque con 5.000 pendientes). */
const SALTEAR_COMO_MUCHO = 5000;
const FORMA_DE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Lo que la pantalla pide saltear, validado en el borde (llega del navegador): sólo ids con forma
 * de id, sin repetir y con tope. Sólo excluye envíos, dentro del negocio de la sesión.
 */
export function enviosASaltear(entrada: unknown): string[] {
  if (!Array.isArray(entrada)) return [];
  const ids = new Set<string>();
  for (const id of entrada) {
    if (ids.size >= SALTEAR_COMO_MUCHO) break;
    if (typeof id === "string" && FORMA_DE_ID.test(id)) ids.add(id);
  }
  return [...ids];
}

export async function autorizarEnTandas(
  mandarTanda: (saltear: readonly string[]) => Promise<TandaMandada>,
  pendientes: number,
  alAvanzar?: (parcial: ResultadoDeAutorizar) => void,
): Promise<ResultadoDeAutorizar> {
  const tope = Math.ceil(Math.max(pendientes, 1) / TANDA_DE_ARCA) + 2;
  const r: ResultadoDeAutorizar = { procesados: 0, autorizados: 0, rechazados: 0, sinRespuesta: 0, delSistema: 0, quedan: pendientes, tandas: 0, corte: "terminado" };
  const saltear = new Set<string>();
  for (;;) {
    const t = await mandarTanda([...saltear]);
    r.tandas++;
    r.procesados += t.procesados;
    r.autorizados += t.autorizados;
    r.rechazados += t.rechazados;
    const nuevosDelSistema = t.conErrorDelSistema.filter((id) => !saltear.has(id));
    for (const id of nuevosDelSistema) saltear.add(id);
    const sinRespuesta = Math.max(0, t.fallidos - t.conErrorDelSistema.length);
    r.sinRespuesta += sinRespuesta;
    r.delSistema = saltear.size;
    r.quedan = t.quedan;
    if (t.quedan - saltear.size <= 0) r.corte = "terminado"; // lo que queda es para Soporte
    else if (sinRespuesta > 0) r.corte = "arca-no-respondio";
    else if (t.procesados + t.descartados + nuevosDelSistema.length === 0) r.corte = "sin-avance";
    else if (r.tandas >= tope) r.corte = "tope";
    else {
      alAvanzar?.({ ...r });
      continue;
    }
    return r;
  }
}

const cuenta = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-AR")} ${n === 1 ? uno : varios}`;

const unoOCuantos = (n: number) => (n === 1 ? "uno" : n.toLocaleString("es-AR"));

/**
 * El aviso al terminar: qué se mandó, qué dijo ARCA y, si quedó algo, por qué y qué hacer. Lo que
 * falló por un error nuestro se dice como tal y no se invita a reintentarlo.
 */
export function avisoDeAutorizar(r: ResultadoDeAutorizar): { tono: "ok" | "atencion"; texto: string } {
  const mandados =
    r.procesados === 0
      ? "No se autorizó ni se rechazó ninguno."
      : `Se ${r.procesados === 1 ? "mandó" : "mandaron"} ${cuenta(r.procesados, "comprobante", "comprobantes")} a ARCA: ${cuenta(r.autorizados, "autorizado", "autorizados")}, ${cuenta(r.rechazados, "rechazado", "rechazados")}.`;
  const nuestros =
    r.delSistema > 0
      ? ` No se ${r.delSistema === 1 ? "pudo" : "pudieron"} mandar ${unoOCuantos(r.delSistema)} por un error del sistema: ya quedó registrado y Soporte lo revisa.`
      : "";
  // Lo que todavía se puede mandar: los pendientes menos los del error nuestro.
  const resto = Math.max(0, r.quedan - r.delSistema);
  if (resto <= 0) {
    const motivo = r.rechazados > 0 ? " Los rechazados dicen el motivo en la lista." : "";
    return { tono: r.rechazados > 0 || r.delSistema > 0 ? "atencion" : "ok", texto: `${mandados}${motivo}${nuestros}` };
  }
  const quedan = `${resto === 1 ? "Queda" : "Quedan"}${r.delSistema > 0 ? (resto === 1 ? " otro" : " otros") : ""} ${cuenta(resto, "pendiente", "pendientes")}`;
  if (r.corte === "arca-no-respondio") {
    return { tono: "atencion", texto: `${mandados}${nuestros} ARCA no respondió a ${unoOCuantos(r.sinRespuesta)}. ${quedan}: probá de nuevo en unos minutos.` };
  }
  if (r.corte === "sin-avance") {
    return { tono: "atencion", texto: `${mandados}${nuestros} ${quedan} que no se pudieron mandar ahora: probá de nuevo en unos minutos y, si siguen, avisale a soporte.` };
  }
  return { tono: "atencion", texto: `${mandados}${nuestros} ${quedan}: entraron mientras se mandaban. Tocá «Autorizar» otra vez.` };
}
