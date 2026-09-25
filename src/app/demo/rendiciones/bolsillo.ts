// Comprobantes "del bolsillo": los tickets que quien rinde tiene encima y todavía no cargó.
// Son ficticios (CUITs con dígito verificador válido, emisores inventados) y están elegidos
// para que cada uno muestre algo distinto del producto al "sacarle la foto":
//
// 1. Gomería: factura A con QR, de $ 12.700 justos. Es lo que le faltaba a Rubén para que la
//    rendición cuadre. El proveedor no está en el maestro de SAP: aparece la propuesta de alta.
// 2. Combustible: factura A con impuestos a los combustibles que la IA leyó con poca confianza
//    (se resalta para revisar) y un tipo de gasto que exige patente y tipo de vehículo.
// 3. Remís: factura C de un monotributista. Pide origen y destino (el transporte se reparte
//    entre jurisdicciones) y no recupera IVA.
// 4. Parador: ticket de controlador fiscal SIN QR (la IA lee todo) en pleno viaje del chofer:
//    la comida ya la paga el convenio y el sistema no deja cargarla.
//
// Lo que sale del QR se marca como exacto; lo que lee la IA, con su confianza por campo.
// El tipo de gasto NO viene elegido: la IA sólo lo sugiere y la persona confirma (la
// herramienta no adivina el tratamiento del IVA).

import type {
  CodigoJurisdiccion,
  Comprobante,
  DatosComprobante,
  EstadoConstatacion,
  TipoGasto,
} from "@/lib/rendiciones";
import type { RenglonTicket } from "./Ticket";
import { escenarioDemo } from "./escenario";

export interface ComprobanteDelBolsillo {
  id: string;
  titulo: string;
  /** Una línea para reconocerlo en la lista ("lo tenías en la campera"). */
  pista: string;
  domicilio: string;
  renglones: RenglonTicket[];
  tieneQr: boolean;
  datos: DatosComprobante;
  origenCampos: Comprobante["origenCampos"];
  confianzaIa: Comprobante["confianzaIa"];
  constatacion: EstadoConstatacion;
  cuitApocrifa: Comprobante["cuitApocrifa"];
  hashImagen: string;
  /** Lo que la IA sugiere completar; la persona lo confirma o lo cambia. */
  sugerencia: {
    /** Palabras para ubicar el tipo de gasto sugerido en el diccionario (por id, etiqueta o sinónimo). */
    tipoGasto: string[];
    jurisdiccion: CodigoJurisdiccion;
    origen?: CodigoJurisdiccion;
    destino?: CodigoJurisdiccion;
  };
}

const EMPRESA = escenarioDemo.empresa.cuit;

// Campos que trae el QR de ARCA (RG 4892/2020): exactos. El QR no trae neto ni IVA.
const DEL_QR = {
  clase: "qr",
  fecha: "qr",
  cuitEmisor: "qr",
  puntoVenta: "qr",
  numero: "qr",
  total: "qr",
  moneda: "qr",
  cuitReceptor: "qr",
  cae: "qr",
} as const;

export const bolsillo: ComprobanteDelBolsillo[] = [
  {
    id: "bolsillo-gomeria",
    titulo: "Gomería El Puente S.R.L.",
    pista: "Arreglo de una cubierta camino a Neuquén. Quedó en la campera.",
    domicilio: "Av. Colón 2450 · Bahía Blanca",
    renglones: [
      { descripcion: "Reparación cubierta 295/80 R22.5", importe: 785124 },
      { descripcion: "Parche vulcanizado y balanceo", importe: 264463 },
    ],
    tieneQr: true,
    datos: {
      clase: "factura_a",
      leyendaA: "ninguna",
      fecha: "2026-09-08",
      cuitEmisor: "30716622041",
      razonSocialEmisor: "Gomería El Puente S.R.L.",
      puntoVenta: 3,
      numero: 1874,
      cae: "76384019275512",
      cuitReceptor: EMPRESA,
      // $ 10.495,87 + IVA 21 % ($ 2.204,13) = $ 12.700,00 justos.
      lineasIva: [{ alicuota: 21, neto: 1049587, iva: 220413 }],
      percepciones: [],
      noGravado: 0,
      exento: 0,
      impuestosInternos: 0,
      total: 1270000,
      moneda: "ARS",
      esControladorFiscal: false,
    },
    origenCampos: { ...DEL_QR, razonSocialEmisor: "ia", lineasIva: "ia", leyendaA: "ia" },
    confianzaIa: { razonSocialEmisor: 0.98, lineasIva: 0.95, leyendaA: 0.97 },
    constatacion: "aprobada",
    cuitApocrifa: false,
    hashImagen: "demo-foto-gomeria",
    sugerencia: { tipoGasto: ["repuesto", "reparac"], jurisdiccion: "BA" },
  },
  {
    id: "bolsillo-combustible",
    titulo: "Petrolera del Comahue S.A.",
    pista: "Gasoil en Plaza Huincul, a la vuelta del viaje.",
    domicilio: "Ruta 22 km 1.290 · Plaza Huincul",
    renglones: [{ descripcion: "Gasoil grado 3 · 55,40 L", importe: 7000000 }],
    tieneQr: true,
    datos: {
      clase: "factura_a",
      leyendaA: "ninguna",
      fecha: "2026-09-11",
      cuitEmisor: "30704418732",
      razonSocialEmisor: "Petrolera del Comahue S.A.",
      puntoVenta: 12,
      numero: 58213,
      cae: "76391847520036",
      cuitReceptor: EMPRESA,
      // $ 70.000 + IVA 21 % ($ 14.700) + impuestos a los combustibles ($ 8.050) = $ 92.750.
      lineasIva: [{ alicuota: 21, neto: 7000000, iva: 1470000 }],
      percepciones: [],
      noGravado: 0,
      exento: 0,
      impuestosInternos: 805000,
      total: 9275000,
      moneda: "ARS",
      esControladorFiscal: false,
    },
    origenCampos: { ...DEL_QR, razonSocialEmisor: "ia", lineasIva: "ia", impuestosInternos: "ia", leyendaA: "ia" },
    confianzaIa: { razonSocialEmisor: 0.97, lineasIva: 0.93, impuestosInternos: 0.74, leyendaA: 0.96 },
    constatacion: "aprobada",
    cuitApocrifa: false,
    hashImagen: "demo-foto-combustible",
    sugerencia: { tipoGasto: ["combustible"], jurisdiccion: "NQ" },
  },
  {
    id: "bolsillo-remis",
    titulo: "Remises Del Valle",
    pista: "Remís del parque industrial al centro de Neuquén.",
    domicilio: "Perito Moreno 480 · Neuquén",
    renglones: [{ descripcion: "Viaje Parque Industrial → Centro", importe: 1850000 }],
    tieneQr: true,
    datos: {
      clase: "factura_c",
      leyendaA: "ninguna",
      fecha: "2026-09-10",
      cuitEmisor: "20315587426",
      razonSocialEmisor: "Mariano Quiroga (Remises Del Valle)",
      puntoVenta: 2,
      numero: 911,
      cae: "76375502194867",
      cuitReceptor: EMPRESA,
      lineasIva: [],
      percepciones: [],
      noGravado: 0,
      exento: 0,
      impuestosInternos: 0,
      total: 1850000,
      moneda: "ARS",
      esControladorFiscal: false,
    },
    origenCampos: { ...DEL_QR, razonSocialEmisor: "ia" },
    confianzaIa: { razonSocialEmisor: 0.91 },
    constatacion: "aprobada",
    cuitApocrifa: false,
    hashImagen: "demo-foto-remis",
    sugerencia: { tipoGasto: ["taxi", "remis"], jurisdiccion: "NQ", origen: "NQ", destino: "NQ" },
  },
  {
    id: "bolsillo-parador",
    titulo: "Parador La Posta del Chocón",
    pista: "Almuerzo en ruta, en pleno viaje a Neuquén.",
    domicilio: "Ruta 237 km 1.365 · Villa El Chocón",
    renglones: [
      { descripcion: "Menú del día", importe: 1290000 },
      { descripcion: "Agua mineral 500 ml", importe: 350000 },
    ],
    tieneQr: false,
    datos: {
      clase: "tique_consumidor_final",
      leyendaA: "ninguna",
      fecha: "2026-09-10",
      cuitEmisor: "30711987653",
      razonSocialEmisor: "La Posta del Chocón S.R.L.",
      puntoVenta: 4,
      numero: 23817,
      lineasIva: [],
      // IVA contenido que informa el ticket (RG 5614/2024): 21/121 de $ 16.400.
      ivaContenido: 284628,
      percepciones: [],
      noGravado: 0,
      exento: 0,
      impuestosInternos: 0,
      total: 1640000,
      moneda: "ARS",
      esControladorFiscal: true,
    },
    // Sin QR: todo lo leyó la IA, con su confianza. El número salió gastado (78 %).
    origenCampos: {
      clase: "ia",
      fecha: "ia",
      cuitEmisor: "ia",
      razonSocialEmisor: "ia",
      puntoVenta: "ia",
      numero: "ia",
      ivaContenido: "ia",
      total: "ia",
    },
    confianzaIa: {
      clase: 0.94,
      fecha: 0.96,
      cuitEmisor: 0.89,
      razonSocialEmisor: 0.93,
      puntoVenta: 0.82,
      numero: 0.78,
      ivaContenido: 0.9,
      total: 0.97,
    },
    constatacion: "sin_constatacion_posible",
    cuitApocrifa: "sin_consultar",
    hashImagen: "demo-foto-parador",
    sugerencia: { tipoGasto: ["comida"], jurisdiccion: "NQ" },
  },
];

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** El tipo de gasto que sugiere la IA, ubicado en el diccionario de la empresa. */
export function tipoSugerido(item: ComprobanteDelBolsillo, diccionario: TipoGasto[]): TipoGasto | undefined {
  return diccionario.find((t) =>
    item.sugerencia.tipoGasto.some((palabra) =>
      [t.id, t.etiqueta, ...t.sinonimos].some((texto) => normalizar(texto).includes(palabra)),
    ),
  );
}
