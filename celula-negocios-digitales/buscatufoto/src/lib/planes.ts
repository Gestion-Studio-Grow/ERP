import type { PlanId } from "./tipos";

/**
 * Planes de buscatufoto. TODOS LOS NÚMEROS SON PROVISIONALES A CONFIRMAR (decide el dueño).
 * Pesos argentinos, sin impuestos ni costo del procesador de pago.
 */
export const PROVISIONAL = true;

export interface Plan {
  id: PlanId;
  nombre: string;
  bajada: string;
  mensual: number;
  /** precio por mes pagando el año entero */
  mensualEnAnual: number;
  comision: number;
  creditosMes: number;
  almacenamientoGB: number | null;
  incluye: string[];
}

export const CREDITOS = {
  porFoto: 1,
  porVideo: 10,
  porGBMes: 4,
  porGBMesAnual: 3,
  /** precio de cada crédito extra, ARS */
  extra: 9,
} as const;

export const PLANES: Record<PlanId, Plan> = {
  libre: {
    id: "libre",
    nombre: "Libre",
    bajada: "Para arrancar sin pagar nada fijo.",
    mensual: 0,
    mensualEnAnual: 0,
    comision: 0.09,
    creditosMes: 0,
    almacenamientoGB: 25,
    incluye: [
      "Sin costo fijo: pagás sólo cuando vendés",
      "25 GB de almacenamiento",
      "Marca de agua automática de buscatufoto",
      "Paquetes, descuento por cantidad y cupones",
      "Búsqueda por número de corredor",
      "Colaboradores en tus álbumes",
      "Placa para historias",
    ],
  },
  pro: {
    id: "pro",
    nombre: "Pro",
    bajada: "Para quien vende todos los fines de semana.",
    mensual: 19900,
    mensualEnAnual: 16500,
    comision: 0,
    creditosMes: 2500,
    almacenamientoGB: null,
    incluye: [
      "Todo lo del plan Libre, y además:",
      "0 % de comisión por venta",
      "2.500 créditos por mes (1 foto = 1, 1 video = 10)",
      "Almacenamiento sin tope fijo: 4 créditos por GB al mes",
      "Los créditos que no usás pasan al mes siguiente",
      "Marca de agua propia: logo, texto, color, escala y ángulo",
      "Álbumes ilimitados",
    ],
  },
};

export interface EntradaCalculo {
  ventasMes: number;
  fotosMes: number;
  videosMes: number;
  gb: number;
  anual: boolean;
}

export interface ResultadoCalculo {
  libre: { comision: number; total: number };
  pro: {
    abono: number;
    creditosIncluidos: number;
    creditosSubidas: number;
    creditosAlmacen: number;
    creditosUsados: number;
    excedente: number;
    costoExcedente: number;
    total: number;
  };
  conviene: PlanId;
  ahorro: number;
}

export function calcularPlanes(e: EntradaCalculo): ResultadoCalculo {
  const v = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  const ventas = v(e.ventasMes);
  const libreComision = Math.round(ventas * PLANES.libre.comision);
  const abono = e.anual ? PLANES.pro.mensualEnAnual : PLANES.pro.mensual;
  const creditosSubidas = Math.round(v(e.fotosMes)) * CREDITOS.porFoto + Math.round(v(e.videosMes)) * CREDITOS.porVideo;
  const creditosAlmacen = Math.ceil(v(e.gb) * (e.anual ? CREDITOS.porGBMesAnual : CREDITOS.porGBMes));
  const creditosUsados = creditosSubidas + creditosAlmacen;
  const excedente = Math.max(0, creditosUsados - PLANES.pro.creditosMes);
  const costoExcedente = excedente * CREDITOS.extra;
  const proTotal = abono + costoExcedente;
  const conviene: PlanId = proTotal < libreComision ? "pro" : "libre";
  return {
    libre: { comision: libreComision, total: libreComision },
    pro: {
      abono,
      creditosIncluidos: PLANES.pro.creditosMes,
      creditosSubidas,
      creditosAlmacen,
      creditosUsados,
      excedente,
      costoExcedente,
      total: proTotal,
    },
    conviene,
    ahorro: Math.abs(libreComision - proTotal),
  };
}
