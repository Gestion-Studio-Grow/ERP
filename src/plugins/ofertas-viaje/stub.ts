/**
 * ADAPTER stub de ofertas de viaje: en memoria, sin red, DETERMINÍSTICO.
 *
 * Sirve para dev/test/demo (probador sin credenciales) y para que el esqueleto
 * vertical funcione con el flag prendido sin gastar cuota de ningún proveedor.
 * Genera ofertas plausibles a partir de la búsqueda (sin Math.random: mismos
 * resultados para la misma búsqueda, así los tests son estables).
 *
 * Cumple la invariante del port: toda oferta sale con `capturadoEn`, `unidad` y —en
 * alojamiento— `baseOcupacion` explícitos.
 */

import {
  baseParaPersonas,
  type BusquedaHoteles,
  type BusquedaVuelos,
  type InstanteISO,
  type OfertaHotel,
  type OfertaVuelo,
  type ProveedorOfertas,
  type ResultadoBusqueda,
} from "./port";

export const CLAVE_STUB = "stub";

const AEROLINEAS = ["AR", "LA", "IB", "AA"] as const;
const REGIMENES = ["solo alojamiento", "con desayuno", "media pensión"] as const;

/** Hash chico y estable de un string (para variar montos sin aleatoriedad). */
function semilla(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function nochesEntre(checkIn: string, checkOut: string): number {
  const a = Date.UTC(+checkIn.slice(0, 4), +checkIn.slice(5, 7) - 1, +checkIn.slice(8, 10));
  const b = Date.UTC(+checkOut.slice(0, 4), +checkOut.slice(5, 7) - 1, +checkOut.slice(8, 10));
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export class StubProveedorOfertas implements ProveedorOfertas {
  readonly clave = CLAVE_STUB;

  /** `ahora` inyectable para tests (default: reloj real). */
  constructor(private readonly ahora: () => Date = () => new Date()) {}

  async buscarVuelos(b: BusquedaVuelos): Promise<ResultadoBusqueda<OfertaVuelo>> {
    const capturadoEn: InstanteISO = this.ahora().toISOString();
    const base = semilla(`${b.origen}${b.destino}${b.fechaIda}${b.fechaVuelta ?? ""}`);
    const n = Math.min(b.maxResultados ?? 3, 5);
    const moneda = b.moneda ?? "USD";
    const ofertas: OfertaVuelo[] = [];
    for (let i = 0; i < n; i++) {
      const aerolinea = AEROLINEAS[(base + i) % AEROLINEAS.length];
      const monto = 380 + ((base >>> (i * 3)) % 420) + i * 55;
      const salida = `${b.fechaIda}T${String(6 + i * 4).padStart(2, "0")}:15:00.000Z`;
      const llegada = `${b.fechaIda}T${String(9 + i * 4).padStart(2, "0")}:40:00.000Z`;
      const tramos = [
        {
          segmentos: [
            { origen: b.origen, destino: b.destino, salida, llegada, aerolinea, numeroVuelo: `${aerolinea}${1200 + i}`, duracionMin: 205 },
          ],
          duracionTotalMin: 205,
        },
      ];
      if (b.fechaVuelta) {
        tramos.push({
          segmentos: [
            {
              origen: b.destino,
              destino: b.origen,
              salida: `${b.fechaVuelta}T${String(10 + i * 3).padStart(2, "0")}:00:00.000Z`,
              llegada: `${b.fechaVuelta}T${String(13 + i * 3).padStart(2, "0")}:25:00.000Z`,
              aerolinea,
              numeroVuelo: `${aerolinea}${1300 + i}`,
              duracionMin: 205,
            },
          ],
          duracionTotalMin: 205,
        });
      }
      const pax = b.adultos + (b.ninos ?? 0);
      ofertas.push({
        referenciaProveedor: `stub-vuelo-${base.toString(16)}-${i}`,
        proveedor: CLAVE_STUB,
        tramos,
        precio: {
          monto,
          moneda,
          unidad: "POR_PERSONA",
          capturadoEn,
          vigenteHasta: `${sumarDias(capturadoEn.slice(0, 10), 2)}T23:59:59.000Z`,
          incluyeImpuestos: "SI",
        },
        totalGrupo: { monto: monto * pax, moneda },
        equipajeIncluido: i % 2 === 0,
        asientosDisponibles: 4 + (i % 5),
      });
    }
    return { ofertas, proveedor: CLAVE_STUB, capturadoEn, desdeCache: false, avisos: ["Datos simulados: precios de ejemplo, no reales."] };
  }

  async buscarHoteles(b: BusquedaHoteles): Promise<ResultadoBusqueda<OfertaHotel>> {
    const capturadoEn: InstanteISO = this.ahora().toISOString();
    const base = semilla(`${b.ciudad}${b.checkIn}${b.checkOut}`);
    const n = Math.min(b.maxResultados ?? 3, 5);
    const moneda = b.moneda ?? "USD";
    const noches = nochesEntre(b.checkIn, b.checkOut);
    const porHab = Math.max(1, Math.ceil(b.adultos / Math.max(1, b.habitaciones ?? 1)));
    const { base: baseOcupacion, ocupacion } = baseParaPersonas(porHab);
    const ofertas: OfertaHotel[] = [];
    for (let i = 0; i < n; i++) {
      const estrellas = 3 + (i % 3);
      const porNoche = 60 + ((base >>> (i * 2)) % 90) + estrellas * 20;
      ofertas.push({
        referenciaProveedor: `stub-hotel-${base.toString(16)}-${i}`,
        proveedor: CLAVE_STUB,
        hotel: { nombre: `Hotel de ejemplo ${i + 1} (${b.ciudad})`, codigo: `STB${i}`, ciudad: b.ciudad, estrellas },
        habitacion: { descripcion: `Habitación ${baseOcupacion.toLowerCase()} estándar`, tipo: baseOcupacion.toLowerCase(), regimen: REGIMENES[i % REGIMENES.length] },
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        noches,
        precio: {
          monto: porNoche * noches,
          moneda,
          unidad: "POR_HABITACION_TOTAL",
          baseOcupacion,
          ...(ocupacion ? { ocupacion } : {}),
          noches,
          capturadoEn,
        },
        politicaCancelacion: i === 0 ? "No reembolsable" : "Cancelación gratis hasta 48 h antes",
      });
    }
    return { ofertas, proveedor: CLAVE_STUB, capturadoEn, desdeCache: false, avisos: ["Datos simulados: precios de ejemplo, no reales."] };
  }
}
