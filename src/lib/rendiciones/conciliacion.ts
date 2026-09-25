/**
 * RENDÍ — conciliación contra la precarga de IVA Simple (Core, PURO). Plan §6.7; RG 5705/2025.
 *
 * Rendí importa la precarga que descarga el contador (no hay web service de "Mis Comprobantes" y Rendí
 * nunca usa la clave fiscal del cliente). Cruza lo rendido contra lo que ARCA tiene recibido a nombre
 * de la empresa.
 *
 * Decisiones donde el contrato no alcanza (ver README):
 * - El cruce es uno a uno: cada línea de la precarga justifica un solo comprobante, en el orden en que
 *   vienen. Un duplicado rendido encuentra la línea ya usada y sale "no encontrado", que es lo que es.
 * - `empresaCuit` saca de la precarga las líneas que emitió la propia empresa (sus ventas, si el
 *   archivo trae emitidos y recibidos juntos): no son gastos y no pueden quedar como "no rendidas".
 */

import { normalizarCuit } from "@/lib/cuit";
import { tipoArcaDesdeClase } from "./qr-arca";
import type { Centavos, Comprobante, LineaPrecarga, ResultadoConciliacion } from "./tipos";

function clave(cuit: string, tipo: number, puntoVenta: number, numero: number): string {
  return `${normalizarCuit(cuit)}|${tipo}|${puntoVenta}|${numero}`;
}

/**
 * Clave: (CUIT emisor, tipo ARCA, punto de venta, número). Sin clave (tique a consumidor final, sin
 * comprobante, clase sin código ARCA o sin CUIT, punto de venta o número) → "no_electronico". Con clave
 * y sin línea → "no_encontrado". Con línea: diferencia de total (comprobante − precarga) fuera de la
 * tolerancia → `diferenciasImporte`; si no, `coinciden`. Las líneas sin comprobante → `precargaNoRendida`.
 */
export function conciliarConPrecarga(
  comprobantes: Comprobante[],
  precarga: LineaPrecarga[],
  empresaCuit: string,
  tolerancia: Centavos,
): ResultadoConciliacion {
  const empresa = normalizarCuit(empresaCuit);
  const lineas = precarga
    .filter((l) => normalizarCuit(l.cuitEmisor) !== empresa)
    .map((l) => ({ l, clave: clave(l.cuitEmisor, l.tipoComprobanteArca, l.puntoVenta, l.numero), usada: false }));

  const resultado: ResultadoConciliacion = {
    coinciden: [],
    rendidoNoEnPrecarga: [],
    precargaNoRendida: [],
    diferenciasImporte: [],
  };

  for (const c of comprobantes) {
    const d = c.datos;
    const tipo = tipoArcaDesdeClase(d.clase);
    if (
      d.clase === "tique_consumidor_final" ||
      d.clase === "sin_comprobante" ||
      tipo === undefined ||
      !d.cuitEmisor ||
      d.puntoVenta === undefined ||
      d.numero === undefined
    ) {
      resultado.rendidoNoEnPrecarga.push({ comprobanteId: c.id, motivo: "no_electronico" });
      continue;
    }

    const k = clave(d.cuitEmisor, tipo, d.puntoVenta, d.numero);
    const linea = lineas.find((x) => !x.usada && x.clave === k);
    if (!linea) {
      // La precarga sólo trae lo recibido A NOMBRE DE LA EMPRESA: un comprobante a consumidor final
      // (o a otra CUIT) no puede estar ahí, y no es un comprobante dudoso.
      const deLaEmpresa = d.cuitReceptor !== undefined && normalizarCuit(d.cuitReceptor) === empresa;
      resultado.rendidoNoEnPrecarga.push({ comprobanteId: c.id, motivo: deLaEmpresa ? "no_encontrado" : "no_es_de_la_empresa" });
      continue;
    }
    linea.usada = true;
    const diferencia = d.total - linea.l.total;
    if (Math.abs(diferencia) > tolerancia) {
      resultado.diferenciasImporte.push({ comprobanteId: c.id, precarga: linea.l, diferencia });
    } else {
      resultado.coinciden.push({ comprobanteId: c.id, precarga: linea.l });
    }
  }

  resultado.precargaNoRendida = lineas.filter((x) => !x.usada).map((x) => x.l);
  return resultado;
}
