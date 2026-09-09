/**
 * Registro — log JSONL append-only de observaciones. Es la EVIDENCIA.
 * Sin log no hay validación: cada oportunidad observada queda escrita con bruto,
 * costos desagregados, neto, veredicto y resultado del re-chequeo.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const RUTA_DEFAULT = join(AQUI, '..', 'datos', 'observaciones.jsonl');

export function crearRegistro(ruta = RUTA_DEFAULT) {
  mkdirSync(dirname(ruta), { recursive: true });
  return {
    ruta,
    /** Agrega una observación (una línea JSON). */
    anotar(obs) {
      appendFileSync(ruta, JSON.stringify(obs) + '\n', 'utf8');
    },
    /** Lee todas las observaciones (líneas corruptas se saltean, no rompen el reporte). */
    leer() {
      if (!existsSync(ruta)) return [];
      return readFileSync(ruta, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
    },
    estadisticas() { return estadisticasDe(this.leer()); },
  };
}

/** Convierte una oportunidad del motor en una observación plana para el JSONL. */
export function observacionDe(op, { pasada, ts = Date.now() } = {}) {
  return {
    ts, pasada,
    estrategia: op.estrategia, par: op.par, ruta: op.ruta, nocional: op.nocional,
    bruto: op.bruto, spreadEjecutable: op.spreadEjecutable,
    costos: { comisiones: op.costos.comisiones, retiro: op.costos.retiro, slippage: op.costos.slippage, riesgoTraslado: op.costos.riesgoTraslado, impuesto: op.costos.impuesto, total: op.costos.totalConImpuesto },
    neto: op.neto, netoUSD: op.netoUSD, veredicto: op.veredicto,
    superviviente: op.veredicto !== 'muere',
    completo: op.completo,
    origen: op.detalle?.origen ?? null,
    recheck: op.recheck ?? null,
  };
}

/** Estadística acumulada sobre observaciones: supervivencia, fantasma, piso de costo vs bruto. */
export function estadisticasDe(obs) {
  const brutas = obs.length;
  const netasPositivas = obs.filter((o) => o.superviviente).length;
  const recheckeadas = obs.filter((o) => o.recheck?.hecho).length;
  const fantasmas = obs.filter((o) => o.recheck?.hecho && o.recheck.fantasma).length;
  const prom = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);
  const porEstrategia = {};
  for (const o of obs) {
    const e = (porEstrategia[o.estrategia] ??= { brutas: 0, netasPositivas: 0, recheckeadas: 0, fantasmas: 0, brutos: [], costos: [], netos: [] });
    e.brutas++; if (o.superviviente) e.netasPositivas++;
    if (o.recheck?.hecho) { e.recheckeadas++; if (o.recheck.fantasma) e.fantasmas++; }
    e.brutos.push(o.bruto); e.costos.push(o.costos?.total ?? NaN); e.netos.push(o.neto);
  }
  for (const e of Object.values(porEstrategia)) {
    e.tasaSupervivencia = e.brutas ? e.netasPositivas / e.brutas : NaN;
    e.tasaFantasma = e.recheckeadas ? e.fantasmas / e.recheckeadas : NaN;
    e.brutoPromedio = prom(e.brutos); e.pisoCostoPromedio = prom(e.costos); e.netoPromedio = prom(e.netos);
    e.mejorNeto = e.netos.length ? Math.max(...e.netos) : NaN;
    delete e.brutos; delete e.costos; delete e.netos;
  }
  return {
    brutas, netasPositivas,
    tasaSupervivencia: brutas ? netasPositivas / brutas : NaN,
    recheckeadas, fantasmas,
    tasaFantasma: recheckeadas ? fantasmas / recheckeadas : NaN,
    brutoPromedio: prom(obs.map((o) => o.bruto)),
    pisoCostoPromedio: prom(obs.map((o) => o.costos?.total ?? NaN)),
    netoPromedio: prom(obs.map((o) => o.neto)),
    mejorNeto: obs.length ? Math.max(...obs.map((o) => o.neto)) : NaN,
    pasadas: new Set(obs.map((o) => o.pasada)).size,
    desde: obs.length ? Math.min(...obs.map((o) => o.ts)) : null,
    hasta: obs.length ? Math.max(...obs.map((o) => o.ts)) : null,
    porEstrategia,
  };
}
