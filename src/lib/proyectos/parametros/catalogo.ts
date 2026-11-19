// ============================================================================
// PARÁMETROS DEL MÓDULO DE PROYECTOS — el catálogo (MIA T03, plan MIA-50 § 4.1). PURO.
// Cada parámetro: su grupo, qué tipo de valor acepta, dónde se nota, qué tanda lo usa y el valor del RUBRO. El valor del
// rubro es del sistema: rige mientras el negocio no cargue el suyo («sin fila rige el valor del rubro»). Lo que define el
// usuario va a la base (ProyectoParametro, M7a); este archivo no tiene datos de ningún cliente.
// `provisional: true` = valor a confirmar con el negocio: la marca viaja con el valor y en la base, en la fila.
// Lo que NO es parámetro (la aritmética, las reglas de integridad, los 10 estados internos): plan § 4.2, en el código.
// ============================================================================

import { ETAPAS, type Etapa } from "../core";
import { RUBROS } from "../gestion-core";

export interface Opcion { id: string; label: string }
export interface ConId { id: string; nombre: string }
export interface ConRango { valor: number; min: number; max: number }
export type Compuerta = "AVISA" | "FRENA";
export interface EtapaParam extends ConId { estados: Etapa[]; compuerta: Compuerta }

/** Los tipos de valor que el servidor sabe validar. */
export type TipoParametro =
  | { tipo: "porcentaje"; min: number; max: number }
  | { tipo: "conRango" }
  | { tipo: "entero"; min: number; max: number; unidad: string }
  | { tipo: "opcion"; opciones: readonly Opcion[] }
  | { tipo: "booleano"; si: string; no: string }
  | { tipo: "lista"; min: number; max: number }
  | { tipo: "multiple"; opciones: readonly Opcion[]; min: number }
  | { tipo: "conId"; min: number; max: number }
  | { tipo: "etapas" }
  | { tipo: "mapaConRango"; clavesDe: "equipo.funciones" }
  | { tipo: "matriz"; filasDe: "reparto.conceptos"; columnasDe: "equipo.funciones" }
  | { tipo: "mapaTexto"; claves: readonly Opcion[] }
  | { tipo: "mapaOpcion"; claves: readonly Opcion[]; opciones: readonly Opcion[] }
  | { tipo: "tramos"; min: number; max: number };

export const GRUPOS = [
  { id: "etapas", label: "Etapas" },
  { id: "precio", label: "Precio" },
  { id: "reparto", label: "Reparto" },
  { id: "equipo", label: "Equipo" },
  { id: "costos", label: "Costos" },
  { id: "plan", label: "Plan de cuotas" },
  { id: "prevision", label: "Previsión" },
  { id: "iva", label: "IVA" },
  { id: "moneda", label: "Moneda" },
  { id: "retenciones", label: "Retenciones" },
  { id: "cierre", label: "Cierre" },
  { id: "calendario", label: "Calendario" },
  { id: "antiguedad", label: "Antigüedad" },
  { id: "sociedades", label: "Sociedades" },
  { id: "cancelacion", label: "Cancelación" },
  { id: "palabras", label: "Palabras" },
] as const;
export type GrupoId = (typeof GRUPOS)[number]["id"];

/** Participante de un reparto que no es una función del equipo: la productora. */
export const EMPRESA = "EMPRESA";

const ROLES_QUE_CIERRAN: readonly Opcion[] = [
  { id: "ADMINISTRACION", label: "Administración" },
  { id: "DIRECCION", label: "Dirección" },
];

/** Los valores del rubro productora, tipados: lo que lee cada tanda. */
export interface Valores {
  "etapas.lista": EtapaParam[];
  "precio.modo": string;
  "precio.rentabilidad": ConRango;
  "precio.comision": Record<string, ConRango>;
  "precio.margenError": ConRango;
  "precio.iibbGa": ConRango;
  "precio.redondeo.tope": number;
  "precio.redondeo.medida": string;
  "precio.redondeo.accion": string;
  "precio.propuesta.detalle": string;
  "precio.propuesta.iva": string;
  "reparto.activo": boolean;
  "reparto.conceptos": ConId[];
  "reparto.matriz": Record<string, Record<string, number>>;
  "reparto.defensaNegativa": string;
  "reparto.cuandoSePaga": string;
  "equipo.funciones": ConId[];
  "costos.sectores": string[];
  "costos.categorias": string[];
  "costos.categoriasAdministracion": string[];
  "plan.anticipoProveedorDiasAntes": number;
  "plan.saldoProveedorDiasDespues": number;
  "plan.saldoClienteDiasAntes": number;
  "prevision.palabras": Record<string, string>;
  "iva.porComprobante": Record<string, string>;
  "moneda.habilitadas": string[];
  "moneda.cambioDelCosto": string;
  "moneda.cotizacionDelProyecto": string;
  "moneda.quienCotiza": string;
  "retenciones.tipos": string[];
  "retenciones.cuentanComoCobrado": boolean;
  "cierre.dia": number;
  "cierre.quienCierra": string;
  "cierre.mesEjercicio": number;
  "cierre.exigeCajaDiaria": boolean;
  "calendario.tiposObligacion": string[];
  "calendario.diasAviso": number;
  "calendario.guardaCerteza": boolean;
  "antiguedad.tramos": number[];
  "sociedades.vinculadas": string[];
  "sociedades.modeloCompra": string;
  "cancelacion.despuesDeAprobado": string;
  "palabras.textos": Record<string, string>;
}
export type Clave = keyof Valores;

export interface DefParametro<K extends Clave = Clave> {
  clave: K;
  grupo: GrupoId;
  nombre: string;
  /** «Dónde se nota»: la prueba de que el código lo lee (plan § 4.1). */
  seNota: string;
  /** La tanda que lo consume. */
  usa: string;
  def: TipoParametro;
  rubro: Valores[K];
  provisional: boolean;
  /** De dónde sale el valor del rubro. */
  fuente: string;
}

const pct = (valor: number): ConRango => ({ valor, min: 0, max: 100 });

const FUNCIONES: ConId[] = [
  { id: "COMERCIAL", nombre: "Comercial" },
  { id: "PRODUCTOR", nombre: "Productor" },
  { id: "PRODUCTOR_CAMPO", nombre: "Productor de campo" },
];

/** El catálogo completo, en el orden de la pantalla. Agregar un parámetro es sumar una entrada acá y a `Valores`. */
export const CATALOGO: readonly DefParametro[] = [
  // ── Etapas ──
  {
    clave: "etapas.lista", grupo: "etapas", nombre: "Etapas del proyecto", seNota: "Las columnas del tablero", usa: "T02, T09",
    def: { tipo: "etapas" }, provisional: false, fuente: "Diseño del módulo, decidido con el negocio",
    rubro: [
      { id: "BRIEF", nombre: "Brief o idea", estados: ["PEDIDO"], compuerta: "AVISA" },
      { id: "COMERCIAL", nombre: "Comercial", estados: ["DISENO", "RENDER", "PRESUPUESTO", "PROPUESTA"], compuerta: "AVISA" },
      { id: "PRODUCCION", nombre: "Producción", estados: ["APROBADO", "PRODUCCION", "ARMADO", "DESARME"], compuerta: "AVISA" },
      { id: "CIERRE", nombre: "Cierre y postventa", estados: ["CIERRE"], compuerta: "AVISA" },
    ],
  },
  // ── Precio ──
  {
    clave: "precio.modo", grupo: "precio", nombre: "Modo de precio", seNota: "La ficha muestra el tablero de precio o no", usa: "T07",
    def: { tipo: "opcion", opciones: [{ id: "POR_TOTAL", label: "Por total" }, { id: "POR_ITEM", label: "Por ítem" }] }, rubro: "POR_TOTAL", provisional: false, fuente: "Diseño del módulo",
  },
  { clave: "precio.rentabilidad", grupo: "precio", nombre: "Rentabilidad %", seNota: "Los renglones del tablero", usa: "T07", def: { tipo: "conRango" }, rubro: pct(30), provisional: true, fuente: "La planilla de costos del rubro" },
  { clave: "precio.comision", grupo: "precio", nombre: "Comisión por función %", seNota: "Los renglones del tablero", usa: "T07", def: { tipo: "mapaConRango", clavesDe: "equipo.funciones" }, rubro: { COMERCIAL: pct(10), PRODUCTOR: pct(10), PRODUCTOR_CAMPO: pct(0) }, provisional: true, fuente: "La planilla de costos del rubro" },
  { clave: "precio.margenError", grupo: "precio", nombre: "Margen de error %", seNota: "Los renglones del tablero", usa: "T07", def: { tipo: "conRango" }, rubro: pct(5), provisional: true, fuente: "La planilla de costos del rubro" },
  { clave: "precio.iibbGa", grupo: "precio", nombre: "IIB y gastos administrativos %", seNota: "Los renglones del tablero", usa: "T07", def: { tipo: "conRango" }, rubro: pct(7), provisional: true, fuente: "La planilla de costos del rubro" },
  { clave: "precio.redondeo.tope", grupo: "precio", nombre: "Tope del redondeo %", seNota: "El aviso de redondeo cuando pasa el tope", usa: "T07", def: { tipo: "porcentaje", min: 0, max: 100 }, rubro: 5, provisional: true, fuente: "Diseño del módulo, decidido con el negocio" },
  {
    clave: "precio.redondeo.medida", grupo: "precio", nombre: "Cómo se mide el redondeo", seNota: "El aviso de redondeo cuando pasa el tope", usa: "T07",
    def: { tipo: "opcion", opciones: [{ id: "BRUTO", label: "Bruto (sobre el total)" }, { id: "NETO", label: "Neto (después de IIB y GA)" }] }, rubro: "BRUTO", provisional: true, fuente: "Diseño del módulo (medido como en la planilla)",
  },
  {
    clave: "precio.redondeo.accion", grupo: "precio", nombre: "Qué pasa al pasar el tope", seNota: "El aviso de redondeo cuando pasa el tope", usa: "T07",
    def: { tipo: "opcion", opciones: [{ id: "AVISA_APRUEBA_DIRECCION", label: "Avisa y lo aprueba Dirección" }, { id: "FRENA", label: "Frena" }, { id: "INFORMA", label: "Sólo informa" }] }, rubro: "AVISA_APRUEBA_DIRECCION", provisional: true, fuente: "Diseño del módulo, decidido con el negocio",
  },
  {
    clave: "precio.propuesta.detalle", grupo: "precio", nombre: "Propuesta al cliente", seNota: "La propuesta pública", usa: "T07",
    def: { tipo: "opcion", opciones: [{ id: "TOTAL_SIN_PRECIO_POR_ITEM", label: "Sin precio por ítem, con el total" }, { id: "PRECIO_POR_ITEM", label: "Con precio por ítem" }] }, rubro: "TOTAL_SIN_PRECIO_POR_ITEM", provisional: true, fuente: "Sin fuente: a confirmar",
  },
  {
    clave: "precio.propuesta.iva", grupo: "precio", nombre: "Total de la propuesta", seNota: "La propuesta pública", usa: "T07",
    def: { tipo: "opcion", opciones: [{ id: "MAS_IVA", label: "Más IVA" }, { id: "CON_IVA", label: "Con IVA incluido" }] }, rubro: "MAS_IVA", provisional: true, fuente: "Sin fuente: a confirmar",
  },
  // ── Reparto ──
  { clave: "reparto.activo", grupo: "reparto", nombre: "Reparto", seNota: "La rendición y el plus del equipo", usa: "T07, T10, T12", def: { tipo: "booleano", si: "Prendido", no: "Apagado" }, rubro: true, provisional: true, fuente: "Diseño del módulo, decidido con el negocio" },
  { clave: "reparto.conceptos", grupo: "reparto", nombre: "Conceptos que se reparten", seNota: "La rendición", usa: "T07, T10, T12", def: { tipo: "conId", min: 1, max: 8 }, rubro: [{ id: "DEFENSA", nombre: "Defensa" }], provisional: true, fuente: "Diseño del módulo" },
  { clave: "reparto.matriz", grupo: "reparto", nombre: "Matriz inicial por función %", seNota: "La rendición: cuánto va a la empresa y cuánto a cada función", usa: "T07, T10, T12", def: { tipo: "matriz", filasDe: "reparto.conceptos", columnasDe: "equipo.funciones" }, rubro: { DEFENSA: { [EMPRESA]: 75, PRODUCTOR: 25 } }, provisional: true, fuente: "Diseño del módulo" },
  {
    clave: "reparto.defensaNegativa", grupo: "reparto", nombre: "Defensa negativa", seNota: "La rendición cuando la defensa da negativa", usa: "T10, T12",
    def: { tipo: "opcion", opciones: [{ id: "DESCUENTA", label: "Descuenta" }, { id: "PISO_CERO", label: "Piso cero" }] }, rubro: "DESCUENTA", provisional: true, fuente: "Pendiente: a decidir con el negocio",
  },
  {
    clave: "reparto.cuandoSePaga", grupo: "reparto", nombre: "Cuándo se paga", seNota: "La liquidación del equipo", usa: "T10, T12",
    def: { tipo: "opcion", opciones: [{ id: "AL_COBRAR_TODO", label: "Cuando el cliente pagó todo" }, { id: "AL_APROBAR", label: "Al aprobar la liquidación" }] }, rubro: "AL_COBRAR_TODO", provisional: true, fuente: "Pendiente: a decidir con el negocio",
  },
  // ── Equipo ──
  { clave: "equipo.funciones", grupo: "equipo", nombre: "Funciones del proyecto", seNota: "El equipo de la ficha", usa: "T07", def: { tipo: "conId", min: 1, max: 10 }, rubro: FUNCIONES, provisional: false, fuente: "Diseño del módulo" },
  // ── Costos ──
  { clave: "costos.sectores", grupo: "costos", nombre: "Sectores", seNota: "Los desplegables de la línea y de la imputación", usa: "T05, T06", def: { tipo: "lista", min: 1, max: 40 }, rubro: ["Producción", "Diseño", "Logística"], provisional: true, fuente: "Las listas de la planilla: a cargar con el negocio" },
  { clave: "costos.categorias", grupo: "costos", nombre: "Categorías", seNota: "Los desplegables de la línea y de la imputación", usa: "T05, T06", def: { tipo: "lista", min: 1, max: 60 }, rubro: [...RUBROS], provisional: true, fuente: "Los rubros que ya usa el sistema" },
  { clave: "costos.categoriasAdministracion", grupo: "costos", nombre: "Categorías de administración", seNota: "La imputación de gastos de administración", usa: "T05, T06", def: { tipo: "lista", min: 1, max: 40 }, rubro: ["Alquiler", "Servicios", "Honorarios", "Impuestos y tasas", "Sueldos y cargas"], provisional: true, fuente: "Sin fuente: a cargar con el negocio" },
  // ── Plan de cuotas (hoy fijos en gestion-core.ts:176-178; la fuente en pantalla lo dice en criollo) ──
  { clave: "plan.anticipoProveedorDiasAntes", grupo: "plan", nombre: "Anticipo al proveedor", seNota: "Los vencimientos del plan", usa: "T06", def: { tipo: "entero", min: 0, max: 365, unidad: "días antes del evento" }, rubro: 30, provisional: false, fuente: "Lo que el sistema usa hoy en el plan de cuotas" },
  { clave: "plan.saldoProveedorDiasDespues", grupo: "plan", nombre: "Saldo al proveedor", seNota: "Los vencimientos del plan", usa: "T06", def: { tipo: "entero", min: 0, max: 365, unidad: "días después del evento" }, rubro: 12, provisional: false, fuente: "Lo que el sistema usa hoy en el plan de cuotas" },
  { clave: "plan.saldoClienteDiasAntes", grupo: "plan", nombre: "Saldo del cliente", seNota: "Los vencimientos del plan", usa: "T06", def: { tipo: "entero", min: 0, max: 365, unidad: "días antes del evento" }, rubro: 5, provisional: false, fuente: "Lo que el sistema usa hoy en el plan de cuotas" },
  // ── Previsión ──
  {
    clave: "prevision.palabras", grupo: "prevision", nombre: "Estados de la previsión", seNota: "La previsión de pagos", usa: "T06",
    def: { tipo: "mapaTexto", claves: [{ id: "sinConfirmar", label: "Sin confirmar por Administración" }, { id: "confirmado", label: "Confirmado por Administración" }] }, rubro: { sinConfirmar: "Pendiente", confirmado: "Pagado" }, provisional: true, fuente: "Sin fuente: a confirmar",
  },
  // ── IVA ──
  {
    clave: "iva.porComprobante", grupo: "iva", nombre: "Tratamiento del IVA por comprobante", seNota: "El costo de cada comprobante de proveedor", usa: "T05",
    def: {
      tipo: "mapaOpcion",
      claves: [{ id: "A", label: "Factura A" }, { id: "B", label: "Factura B" }, { id: "C", label: "Factura C" }, { id: "SIN_FACTURA", label: "Sin factura" }],
      opciones: [{ id: "CREDITO", label: "Crédito fiscal" }, { id: "COSTO", label: "Suma al costo" }],
    },
    rubro: { A: "CREDITO", B: "COSTO", C: "COSTO", SIN_FACTURA: "COSTO" }, provisional: true, fuente: "Sin fuente del negocio: a confirmar con su contador",
  },
  // ── Moneda ──
  {
    clave: "moneda.habilitadas", grupo: "moneda", nombre: "Monedas habilitadas", seNota: "Las monedas que se pueden elegir al cargar", usa: "T08",
    def: { tipo: "multiple", opciones: [{ id: "ARS", label: "Pesos" }, { id: "USD", label: "Dólares" }, { id: "EUR", label: "Euros" }], min: 1 }, rubro: ["ARS", "USD"], provisional: false, fuente: "Diseño del módulo",
  },
  {
    clave: "moneda.cambioDelCosto", grupo: "moneda", nombre: "Cambio que vale para el costo", seNota: "El costo en pesos de lo que se compra en otra moneda", usa: "T08",
    def: { tipo: "opcion", opciones: [{ id: "MANUAL", label: "El que se carga a mano" }, { id: "DEL_COMPROBANTE", label: "El del día del comprobante" }, { id: "DEL_PAGO", label: "El del día del pago" }] }, rubro: "DEL_COMPROBANTE", provisional: true, fuente: "Diseño del módulo: a confirmar con el negocio",
  },
  {
    clave: "moneda.cotizacionDelProyecto", grupo: "moneda", nombre: "Cómo se carga la cotización", seNota: "El costo en pesos de lo que se compra en otra moneda", usa: "T08",
    def: { tipo: "opcion", opciones: [{ id: "A_MANO_CON_FECHA", label: "A mano, con su fecha" }] }, rubro: "A_MANO_CON_FECHA", provisional: true, fuente: "Diseño del módulo: a confirmar con el negocio",
  },
  { clave: "moneda.quienCotiza", grupo: "moneda", nombre: "Quién carga la cotización", seNota: "El costo en pesos de lo que se compra en otra moneda", usa: "T08", def: { tipo: "opcion", opciones: ROLES_QUE_CIERRAN }, rubro: "ADMINISTRACION", provisional: true, fuente: "Sin fuente: a confirmar" },
  // ── Retenciones ──
  { clave: "retenciones.tipos", grupo: "retenciones", nombre: "Tipos de retención", seNota: "Los cobros con retención", usa: "T08", def: { tipo: "lista", min: 0, max: 20 }, rubro: ["IIBB", "Ganancias", "IVA", "SUSS"], provisional: true, fuente: "Sin fuente del negocio: a confirmar" },
  { clave: "retenciones.cuentanComoCobrado", grupo: "retenciones", nombre: "La retención cuenta como cobrado", seNota: "Los cobros con retención", usa: "T08", def: { tipo: "booleano", si: "Sí", no: "No" }, rubro: true, provisional: true, fuente: "Sin fuente: a confirmar" },
  // ── Cierre ──
  { clave: "cierre.dia", grupo: "cierre", nombre: "Día de cierre del mes", seNota: "El cierre del mes", usa: "T01, T09", def: { tipo: "entero", min: 1, max: 28, unidad: "del mes siguiente" }, rubro: 10, provisional: true, fuente: "Diseño del módulo: provisional a confirmar" },
  { clave: "cierre.quienCierra", grupo: "cierre", nombre: "Quién cierra el mes", seNota: "El cierre del mes", usa: "T01, T09", def: { tipo: "opcion", opciones: ROLES_QUE_CIERRAN }, rubro: "ADMINISTRACION", provisional: true, fuente: "Diseño del módulo: provisional a confirmar" },
  { clave: "cierre.mesEjercicio", grupo: "cierre", nombre: "Mes en que cierra el ejercicio", seNota: "El cierre del mes", usa: "T01, T09", def: { tipo: "entero", min: 1, max: 12, unidad: "(1 = enero)" }, rubro: 12, provisional: true, fuente: "Se carga desde el contrato social del negocio" },
  { clave: "cierre.exigeCajaDiaria", grupo: "cierre", nombre: "Exige caja diaria cerrada", seNota: "El cierre del mes", usa: "T01, T09", def: { tipo: "booleano", si: "Sí", no: "No" }, rubro: false, provisional: true, fuente: "Sin fuente: a confirmar" },
  // ── Calendario ──
  { clave: "calendario.tiposObligacion", grupo: "calendario", nombre: "Tipos de obligación", seNota: "El calendario", usa: "T09", def: { tipo: "lista", min: 1, max: 30 }, rubro: ["Armado", "Evento", "Desarme", "Cuota a cobrar", "Pago a proveedor", "Reunión"], provisional: true, fuente: "Diseño del módulo: a confirmar con el negocio" },
  { clave: "calendario.diasAviso", grupo: "calendario", nombre: "Días de aviso", seNota: "El calendario", usa: "T09", def: { tipo: "entero", min: 0, max: 60, unidad: "días antes" }, rubro: 3, provisional: true, fuente: "Diseño del módulo: a confirmar con el negocio" },
  { clave: "calendario.guardaCerteza", grupo: "calendario", nombre: "Guarda si la fecha está confirmada", seNota: "El calendario", usa: "T09", def: { tipo: "booleano", si: "Sí", no: "No" }, rubro: true, provisional: true, fuente: "Diseño del módulo: a confirmar con el negocio" },
  // ── Antigüedad ──
  { clave: "antiguedad.tramos", grupo: "antiguedad", nombre: "Tramos de antigüedad (días)", seNota: "El informe de antigüedad de deudas", usa: "T09", def: { tipo: "tramos", min: 1, max: 6 }, rubro: [30, 60, 90], provisional: true, fuente: "Sin fuente: a confirmar" },
  // ── Sociedades ──
  { clave: "sociedades.vinculadas", grupo: "sociedades", nombre: "Sociedades vinculadas", seNota: "Las compras entre sociedades del grupo", usa: "T05", def: { tipo: "lista", min: 0, max: 10 }, rubro: [], provisional: true, fuente: "A cargar con el negocio" },
  {
    clave: "sociedades.modeloCompra", grupo: "sociedades", nombre: "Modelo de compra", seNota: "Las compras entre sociedades del grupo", usa: "T05",
    def: { tipo: "opcion", opciones: [{ id: "CADA_UNA_COMPRA", label: "Cada sociedad compra lo suyo" }, { id: "UNA_COMPRA_Y_REFACTURA", label: "Una compra y le factura a la otra" }] }, rubro: "CADA_UNA_COMPRA", provisional: true, fuente: "Sin definir: a confirmar con el negocio",
  },
  // ── Cancelación ──
  {
    clave: "cancelacion.despuesDeAprobado", grupo: "cancelacion", nombre: "Cancelar después de aprobado", seNota: "Cancelar un proyecto ya aprobado", usa: "T09",
    def: { tipo: "opcion", opciones: [{ id: "SOLO_DIRECCION_SIN_LIQUIDACION", label: "Sólo Dirección, sin liquidación automática" }, { id: "SOLO_DIRECCION_CON_LIQUIDACION", label: "Sólo Dirección, con liquidación de lo hecho" }] }, rubro: "SOLO_DIRECCION_SIN_LIQUIDACION", provisional: true, fuente: "Diseño del módulo: a confirmar con el negocio",
  },
  // ── Palabras (las de etapas, funciones y conceptos se editan en su grupo) ──
  {
    clave: "palabras.textos", grupo: "palabras", nombre: "Palabras del negocio", seNota: "Los textos de las pantallas", usa: "Todas",
    def: { tipo: "mapaTexto", claves: [{ id: "defensa", label: "Lo que se ahorra contra el costo" }, { id: "redondeo", label: "La diferencia del total a mano" }, { id: "rendicion", label: "La liquidación del proyecto" }, { id: "prevision", label: "Los pagos previstos" }] },
    rubro: { defensa: "Defensa", redondeo: "Redondeo", rendicion: "Rendición", prevision: "Previsión" }, provisional: false, fuente: "Diseño del módulo (las de la planilla)",
  },
];

export const CLAVES: readonly Clave[] = CATALOGO.map((p) => p.clave);
export const esClave = (v: unknown): v is Clave => typeof v === "string" && (CLAVES as readonly string[]).includes(v);
export const defDe = <K extends Clave>(clave: K): DefParametro<K> => CATALOGO.find((p) => p.clave === clave) as DefParametro<K>;
export const delGrupo = (grupo: GrupoId): readonly DefParametro[] => CATALOGO.filter((p) => p.grupo === grupo);
export const esGrupo = (v: unknown): v is GrupoId => typeof v === "string" && GRUPOS.some((g) => g.id === v);

/** Los estados internos que agrupan las etapas: fijos en el código (plan § 4.2). */
export const ESTADOS_INTERNOS: readonly Etapa[] = ETAPAS;
