// Derivados de la demo de Rendí: todo lo que las pantallas CALCULAN a partir del estado.
//
// Regla de este archivo: acá no vive ninguna regla fiscal. Lo que decide si un comprobante
// computa IVA, si bloquea o a qué carril va es del motor (`evaluarComprobante`); lo que decide
// si una rendición cuadra o quién la aprueba, también (`calcularCuadratura`,
// `nivelesDeAprobacion`). Este módulo sólo ARMA los contextos que el motor pide, junta sus
// resultados por rendición y traduce códigos a palabras en criollo.
//
// Fechas: todo sale de `escenarioDemo.hoy` y de fechas ISO del escenario. Las cuentas de
// calendario (día de la semana, días entre fechas) son aritmética entera, sin `Date`: así el
// resultado es el mismo en el build estático, en el navegador y en cualquier zona horaria.

import {
  calcularCuadratura,
  destinoEnLote,
  etiquetaClase,
  evaluarComprobante,
  formatearFecha,
  formatearPesos,
  nivelesDeAprobacion,
  nombreJurisdiccion,
  nombrePeriodo,
  pesos,
  totalRendicion,
  type AccionRendicion,
  type Centavos,
  type ClaseComprobante,
  type CodigoJurisdiccion,
  type Comprobante,
  type ContextoEvaluacion,
  type ContextoTransicion,
  type Cuadratura,
  type DatosComprobante,
  type EstadoConstatacion,
  type EstadoRendicion,
  type Evaluacion,
  type MedioPago,
  type OrigenDato,
  type Persona,
  type Rendicion,
  type Severidad,
  type TipoGasto,
  type TipoVehiculo,
  type Tratamiento,
} from "@/lib/rendiciones";
import { fmtCuit, type BadgeTone } from "@/components/ui";
import { escenarioDemo as E } from "./escenario";

// ─────────────────────────────────────────────────────────────────────────────
// Personas
// ─────────────────────────────────────────────────────────────────────────────

const PERSONAS = new Map(E.personas.map((p) => [p.legajo, p]));

export function personaDe(legajo: string): Persona | undefined {
  return PERSONAS.get(legajo);
}

export function nombreDe(legajo: string): string {
  return PERSONAS.get(legajo)?.nombre ?? `Legajo ${legajo}`;
}

export function nombreDePila(legajo: string): string {
  return nombreDe(legajo).split(" ")[0];
}

export function iniciales(legajo: string): string {
  return nombreDe(legajo)
    .split(" ")
    .map((parte) => parte[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export const quienesRinden: Persona[] = E.personas.filter((p) => p.roles.includes("rinde"));

// El guion de la demo presenta a los aprobadores en este orden (el titular, su suplente y
// Dirección). Si el escenario suma otros, van al final en el orden en que vienen.
const ORDEN_APROBADORES = ["2002", "2001", "3001"];
export const aprobadores: Persona[] = E.personas
  .filter((p) => p.roles.includes("aprueba"))
  .sort((a, b) => rango(ORDEN_APROBADORES, a.legajo) - rango(ORDEN_APROBADORES, b.legajo));

function rango(orden: string[], legajo: string): number {
  const i = orden.indexOf(legajo);
  return i === -1 ? orden.length : i;
}

export const legajoTesoreria: string = E.personas.find((p) => p.roles.includes("tesoreria"))?.legajo ?? "";

/** Suplencias vigentes hoy en las que `legajo` reemplaza a alguien. */
export function suplenciasDe(legajo: string) {
  return E.suplencias.filter((s) => s.suplenteLegajo === legajo && s.desde <= E.hoy && E.hoy <= s.hasta);
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluación: el contexto que pide el motor, armado desde el estado
// ─────────────────────────────────────────────────────────────────────────────

/** CUITs del maestro de proveedores de SAP (espejo). El motor pide el conjunto, no el mapa. */
export const maestroProveedores: ReadonlySet<string> = new Set(Object.keys(E.parametrosSap.maestroProveedores));

export function contextoEvaluacion(
  c: Comprobante,
  todos: Comprobante[],
  periodo: string,
): ContextoEvaluacion | null {
  const persona = personaDe(c.legajo);
  if (!persona) return null;
  return {
    empresa: E.empresa,
    politica: E.politica,
    diccionario: E.diccionario,
    persona,
    viajes: E.viajes,
    otrosComprobantes: todos,
    maestroProveedores,
    periodo,
    reglaVersion: E.reglaVersion,
  };
}

/** Evalúa TODOS los comprobantes de la empresa con el motor (una evaluación por id). */
export function evaluarTodos(comprobantes: Comprobante[], rendiciones: Rendicion[]): Map<string, Evaluacion> {
  const periodoDe = new Map(rendiciones.map((r) => [r.id, r.periodo]));
  const evaluaciones = new Map<string, Evaluacion>();
  for (const c of comprobantes) {
    const ctx = contextoEvaluacion(c, comprobantes, periodoDe.get(c.rendicionId) ?? E.periodo);
    if (ctx) evaluaciones.set(c.id, evaluarComprobante(c, ctx));
  }
  return evaluaciones;
}

/** Evalúa un comprobante que todavía no se agregó (la vista previa de "Cargar comprobante"). */
export function evaluarBorrador(c: Comprobante, existentes: Comprobante[], periodo: string): Evaluacion | null {
  const ctx = contextoEvaluacion(c, existentes, periodo);
  return ctx ? evaluarComprobante(c, ctx) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resumen por rendición (lo que cada rol mira de una rendición)
// ─────────────────────────────────────────────────────────────────────────────

export interface ResumenRendicion {
  rendicion: Rendicion;
  persona: Persona | undefined;
  /** Sólo los comprobantes que HOY están en la rendición (los que pasaron a Cuentas a Pagar no). */
  comprobantes: Comprobante[];
  evaluaciones: Evaluacion[];
  cuadratura: Cuadratura;
  niveles: string[][];
  total: Centavos;
  bloqueados: number;
  avisos: number;
}

export function resumirRendiciones(
  rendiciones: Rendicion[],
  comprobantes: Comprobante[],
  evaluaciones: Map<string, Evaluacion>,
): Map<string, ResumenRendicion> {
  const porId = new Map(comprobantes.map((c) => [c.id, c]));
  const resumenes = new Map<string, ResumenRendicion>();
  for (const r of rendiciones) {
    // Se pasa al motor sólo lo que está en `comprobanteIds`: así la cuadratura y el total no
    // cuentan lo que la persona quitó o mandó a Cuentas a Pagar, sin importar cómo filtre.
    const cs = r.comprobanteIds.map((id) => porId.get(id)).filter((c): c is Comprobante => Boolean(c));
    const evs = cs.map((c) => evaluaciones.get(c.id)).filter((e): e is Evaluacion => Boolean(e));
    const persona = personaDe(r.legajo);
    const total = totalRendicion(cs);
    resumenes.set(r.id, {
      rendicion: r,
      persona,
      comprobantes: cs,
      evaluaciones: evs,
      cuadratura: calcularCuadratura(r, E.anticipos, cs, E.politica.toleranciaCentavos, evs),
      niveles: persona
        ? nivelesDeAprobacion(total, persona, E.personas, E.reglasAprobacion, E.suplencias, E.hoy)
        : [],
      total,
      bloqueados: evs.filter((e) => e.bloqueado).length,
      avisos: evs.reduce((n, e) => n + e.validaciones.filter((v) => v.severidad === "advierte").length, 0),
    });
  }
  return resumenes;
}

/**
 * El contexto que pide `aplicarAccion`, armado desde un resumen. Lleva los roles del actor
 * (`rolesActor`): con ellos el motor rechaza que alguien sin el rol de Tesorería tome el control,
 * contabilice o cierre.
 */
export function contextoTransicion(
  res: ResumenRendicion,
  actorLegajo: string,
  extra: { comentario?: string; comprobanteIds?: string[] } = {},
): ContextoTransicion {
  return {
    fecha: E.hoy,
    actorLegajo,
    rolesActor: personaDe(actorLegajo)?.roles ?? [],
    cuadratura: res.cuadratura,
    evaluaciones: res.evaluaciones,
    niveles: res.niveles,
    ...extra,
  };
}

/** Rendiciones que se pueden editar (agregar o quitar líneas, declarar devolución). */
export function esEditable(r: Rendicion): boolean {
  return r.estado === "borrador" || r.estado === "devuelta";
}

/** Rendición del período en curso de una persona. */
export function rendicionDe(rendiciones: Rendicion[], legajo: string): Rendicion | undefined {
  return rendiciones.find((r) => r.legajo === legajo && r.periodo === E.periodo) ?? rendiciones.find((r) => r.legajo === legajo);
}

/** Último evento de una acción en la bitácora (p. ej. la última devolución, con su comentario). */
export function ultimoEvento(r: Rendicion, accion: AccionRendicion) {
  for (let i = r.historial.length - 1; i >= 0; i--) {
    if (r.historial[i].accion === accion) return r.historial[i];
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Semáforo y riesgo (lectura de lo que devolvió el motor)
// ─────────────────────────────────────────────────────────────────────────────

export type Luz = "bloqueado" | "aviso" | "ok";

export function luzDe(ev: Evaluacion | undefined): Luz {
  if (!ev) return "aviso";
  if (ev.bloqueado) return "bloqueado";
  return ev.validaciones.some((v) => v.severidad === "advierte") ? "aviso" : "ok";
}

export const LUZ: Record<Luz, { texto: string; tono: BadgeTone }> = {
  bloqueado: { texto: "Bloqueado", tono: "danger" },
  aviso: { texto: "Con aviso", tono: "warning" },
  ok: { texto: "OK", tono: "success" },
};

const ORDEN_SEVERIDAD: Record<Severidad, number> = { bloquea: 0, advierte: 1, informa: 2 };

export function ordenarPorSeveridad<T extends { severidad: Severidad }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad]);
}

export type NivelRiesgo = "alto" | "medio" | "bajo";

/**
 * Orden de la cola de control de Tesorería (plan §6.5: "todo lo que supera un tope y todo lo
 * que trae avisos"). NO es una regla fiscal: es cómo se prioriza el muestreo, y se arma sólo con
 * lo que el motor ya dijo (bloqueos y avisos) más el tope de la política.
 */
export function riesgoDe(res: ResumenRendicion): { nivel: NivelRiesgo; puntaje: number; motivos: string[] } {
  const grandes = res.comprobantes.filter((c) => c.datos.total > E.politica.topeDerivacionCxP).length;
  const motivos: string[] = [];
  if (res.bloqueados) motivos.push(plural(res.bloqueados, "comprobante bloqueado", "comprobantes bloqueados"));
  if (res.avisos) motivos.push(plural(res.avisos, "aviso", "avisos"));
  if (grandes) motivos.push(`${plural(grandes, "comprobante", "comprobantes")} de más de ${formatearPesos(E.politica.topeDerivacionCxP)}`);
  const puntaje = res.bloqueados * 3 + res.avisos + grandes * 2;
  return { nivel: puntaje >= 3 ? "alto" : puntaje >= 1 ? "medio" : "bajo", puntaje, motivos };
}

export const RIESGO: Record<NivelRiesgo, { texto: string; tono: BadgeTone }> = {
  alto: { texto: "Riesgo alto", tono: "danger" },
  medio: { texto: "Riesgo medio", tono: "warning" },
  bajo: { texto: "Riesgo bajo", tono: "success" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Palabras: códigos del contrato → criollo
// ─────────────────────────────────────────────────────────────────────────────

export function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** La letra que va en el recuadro del comprobante dibujado (el nombre lo da `etiquetaClase` del motor). */
export const LETRA_CLASE: Record<ClaseComprobante, string> = {
  factura_a: "A",
  factura_b: "B",
  factura_c: "C",
  factura_m: "M",
  tique_factura_a: "A",
  tique_peaje: "P",
  tique_consumidor_final: "T",
  sin_comprobante: "—",
};

export const TRATAMIENTO: Record<Tratamiento, { texto: string; tono: BadgeTone }> = {
  computable: { texto: "Recupera IVA", tono: "success" },
  no_computable: { texto: "No recupera IVA", tono: "neutral" },
  no_registrable: { texto: "No se contabiliza", tono: "neutral" },
};

// ─────────────────────────────────────────────────────────────────────────────
// A dónde va cada comprobante: lo decide el motor (`destinoEnLote`)
// ─────────────────────────────────────────────────────────────────────────────

export interface Destino {
  tipo: "factura" | "asiento" | "cuentas_a_pagar" | "fuera";
  /** Entra al lote de SAP de la rendición (como factura o en el asiento). */
  entra: boolean;
  /** Etiqueta corta para tablas y chips. */
  texto: string;
  tono: BadgeTone;
  /** Por qué no entra, en palabras del motor. */
  motivo?: string;
}

/**
 * Todo lo que la pantalla afirma sobre la contabilización de un comprobante sale de acá. Lo
 * bloqueado o derivado NO se presenta con crédito fiscal ni gasto: no entra al lote de la
 * rendición. La decisión es de `destinoEnLote`; esto sólo le pone palabras.
 */
export function destinoDe(ev: Evaluacion): Destino {
  const d = destinoEnLote(ev);
  switch (d.tipo) {
    case "factura":
      return { tipo: "factura", entra: true, texto: "Factura de proveedor en SAP", tono: "success" };
    case "asiento":
      return { tipo: "asiento", entra: true, texto: "Asiento de gastos en SAP", tono: "neutral" };
    case "cuentas_a_pagar":
      return { tipo: "cuentas_a_pagar", entra: false, texto: "Va por Cuentas a Pagar", tono: "warning" };
    case "fuera":
      return { tipo: "fuera", entra: false, texto: "No entra al lote", tono: ev.bloqueado ? "danger" : "neutral", motivo: d.motivo };
  }
}

/** Chip de una fila: si entra, si recupera IVA; si no entra, a dónde va (o que no entra). */
export function etiquetaTrato(ev: Evaluacion): { texto: string; tono: BadgeTone } {
  const destino = destinoDe(ev);
  return destino.entra ? TRATAMIENTO[ev.tratamiento] : { texto: destino.texto, tono: destino.tono };
}

/** Cierra una frase del motor con punto si no lo trae. */
export function oracion(texto: string): string {
  const limpio = texto.trim();
  return /[.!?]$/.test(limpio) ? limpio : `${limpio}.`;
}

export const ESTADO_RENDICION: Record<EstadoRendicion, { texto: string; tono: BadgeTone }> = {
  borrador: { texto: "Borrador", tono: "neutral" },
  en_aprobacion: { texto: "En aprobación", tono: "info" },
  devuelta: { texto: "Devuelta", tono: "warning" },
  rechazada: { texto: "Rechazada", tono: "danger" },
  aprobada: { texto: "Aprobada", tono: "success" },
  en_control: { texto: "En control", tono: "info" },
  contabilizada: { texto: "Contabilizada", tono: "success" },
  cerrada: { texto: "Cerrada", tono: "neutral" },
};

export const ACCION: Record<AccionRendicion, string> = {
  enviar: "Envió la rendición",
  aprobar: "Aprobó",
  devolver: "Devolvió líneas",
  rechazar: "Rechazó la rendición",
  tomar_control: "Tesorería tomó el control",
  contabilizar: "Contabilizó",
  cerrar: "Cerró la rendición",
};

export const SEVERIDAD: Record<Severidad, { texto: string; tono: BadgeTone }> = {
  bloquea: { texto: "Bloquea", tono: "danger" },
  advierte: { texto: "Aviso", tono: "warning" },
  informa: { texto: "Para saber", tono: "info" },
};

export const ORIGEN: Record<OrigenDato, string> = {
  qr: "QR",
  ia: "IA",
  persona: "A mano",
};

/**
 * Por debajo de esta confianza la pantalla resalta el campo para que la persona lo mire
 * (plan §8.1, paso 5: "campos dudosos resaltados"). Es un umbral de presentación, no fiscal.
 */
export const UMBRAL_DUDA = 0.8;

export const CONSTATACION: Record<EstadoConstatacion, { texto: string; tono: BadgeTone }> = {
  aprobada: { texto: "Constatado en ARCA", tono: "success" },
  rechazada: { texto: "ARCA lo rechazó", tono: "danger" },
  sin_constatacion_posible: { texto: "Sin constatación posible (controlador fiscal)", tono: "neutral" },
  pendiente: { texto: "Constatación pendiente", tono: "warning" },
};

export const VEHICULO: Record<TipoVehiculo, string> = {
  automovil: "auto",
  utilitario: "utilitario",
  camion: "camión",
};

/** Las 24 jurisdicciones, para los selectores (el nombre de cada una lo da `nombreJurisdiccion`). */
export const CODIGOS_JURISDICCION: CodigoJurisdiccion[] = [
  "CABA", "BA", "CA", "CB", "CR", "CH", "CT", "ER", "FO", "JU", "LP", "LR",
  "MZ", "MI", "NQ", "RN", "SA", "SJ", "SL", "SC", "SF", "SE", "TF", "TU",
];

export function tipoGastoDe(id: string): TipoGasto | undefined {
  return E.diccionario.find((t) => t.id === id);
}

export function etiquetaTipo(id: string): string {
  return tipoGastoDe(id)?.etiqueta ?? "Sin clasificar";
}

export function medioTexto(m: MedioPago): string {
  switch (m.tipo) {
    case "efectivo_anticipo":
      return "Efectivo del anticipo";
    case "recargable":
      return `Tarjeta recargable …${E.tarjetas.find((t) => t.id === m.tarjetaId)?.ultimos4 ?? ""}`;
    case "tarjeta_corporativa":
      return `Tarjeta corporativa …${E.tarjetas.find((t) => t.id === m.tarjetaId)?.ultimos4 ?? ""}`;
    case "propio_a_reintegrar":
      return "Plata propia (a reintegrar)";
  }
}

/** Número oficial legible: punto de venta (4 o 5) + número (8). */
export function numeroOficial(d: Pick<DatosComprobante, "puntoVenta" | "numero">): string {
  if (!d.puntoVenta || !d.numero) return "—";
  return `${String(d.puntoVenta).padStart(d.puntoVenta > 9999 ? 5 : 4, "0")}-${String(d.numero).padStart(8, "0")}`;
}

/** Quién emitió el comprobante, en una línea. */
export function emisorDe(c: Comprobante): string {
  return c.datos.razonSocialEmisor ?? (c.datos.clase === "sin_comprobante" ? "Sin comprobante" : "Emisor sin nombre");
}

export function receptorTexto(cuitReceptor: string | undefined): string {
  if (!cuitReceptor) return "Consumidor final (sin CUIT)";
  if (cuitReceptor === E.empresa.cuit) return `${E.empresa.razonSocial} (la empresa)`;
  return `CUIT ${fmtCuit(cuitReceptor)} (no es la empresa)`;
}

const LEYENDA: Record<DatosComprobante["leyendaA"], string> = {
  ninguna: "Ninguna",
  operacion_sujeta_a_retencion: "Operación sujeta a retención",
  pago_en_cbu_informada: "Pago en CBU informada",
};

const REGIMEN: Record<DatosComprobante["percepciones"][number]["regimen"], string> = {
  iva: "de IVA",
  iibb: "de Ingresos Brutos",
  municipal: "municipal",
  otra: "",
};

export interface FilaLectura {
  clave: string;
  etiqueta: string;
  valor: string;
  origen?: OrigenDato;
  confianza?: number;
}

/**
 * "Qué dice el comprobante", fila por fila, con el origen de cada dato (QR, IA o la persona)
 * y la confianza de la IA. Sólo muestra lo que el comprobante trae (nada de ceros de relleno).
 */
export function filasDeDatos(
  d: DatosComprobante,
  origen: Comprobante["origenCampos"],
  confianza: Comprobante["confianzaIa"] = {},
): FilaLectura[] {
  const filas: FilaLectura[] = [];
  const agregar = (campo: keyof DatosComprobante, etiqueta: string, valor: string, clave: string = campo) =>
    filas.push({ clave, etiqueta, valor, origen: origen[campo], confianza: confianza[campo] });

  agregar("clase", "Tipo", etiquetaClase(d.clase));
  agregar("fecha", "Fecha", formatearFecha(d.fecha));
  if (d.razonSocialEmisor) agregar("razonSocialEmisor", "Emisor", d.razonSocialEmisor);
  if (d.cuitEmisor) agregar("cuitEmisor", "CUIT del emisor", fmtCuit(d.cuitEmisor));
  if (d.puntoVenta && d.numero) agregar("numero", "Número", numeroOficial(d));
  if (d.clase !== "sin_comprobante") agregar("cuitReceptor", "A nombre de", receptorTexto(d.cuitReceptor));
  if (d.leyendaA !== "ninguna") agregar("leyendaA", "Leyenda", LEYENDA[d.leyendaA]);
  d.lineasIva.forEach((l, i) => {
    agregar("lineasIva", `Neto gravado ${l.alicuota} %`, formatearPesos(l.neto), `neto-${i}`);
    agregar("lineasIva", `IVA ${l.alicuota} %`, formatearPesos(l.iva), `iva-${i}`);
  });
  if (d.ivaContenido) agregar("ivaContenido", "IVA contenido (informativo)", formatearPesos(d.ivaContenido));
  d.percepciones.forEach((p, i) =>
    agregar(
      "percepciones",
      `Percepción ${REGIMEN[p.regimen]}${p.jurisdiccion ? ` · ${nombreJurisdiccion(p.jurisdiccion)}` : ""}`.trim(),
      formatearPesos(p.importe),
      `percepcion-${i}`,
    ),
  );
  if (d.impuestosInternos) agregar("impuestosInternos", "Impuestos internos", formatearPesos(d.impuestosInternos));
  if (d.noGravado) agregar("noGravado", "No gravado", formatearPesos(d.noGravado));
  if (d.exento) agregar("exento", "Exento", formatearPesos(d.exento));
  agregar(
    "total",
    "Total",
    d.moneda === "USD" ? `USD ${importeSinSigno(d.total)} (cotización ${d.cotizacion ?? "sin cargar"})` : formatearPesos(d.total),
  );
  if (d.cae) agregar("cae", "CAE", d.cae);
  return filas;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fechas (ISO AAAA-MM-DD). Lo que el motor ya resuelve (formatearFecha, diasEntre,
// nombrePeriodo) se usa de ahí; acá quedan sólo los formatos cortos de pantalla.
// ─────────────────────────────────────────────────────────────────────────────

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** "2026-09-24" → "24/09". */
export function fechaCorta(iso: string): string {
  return formatearFecha(iso).slice(0, 5);
}

/** "2026-10-01" → "jueves 1/10" (día de la semana por aritmética entera, sin Date). */
export function fechaConDia(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = m < 3 ? a - 1 : a;
  const dia = (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[m - 1] + d) % 7;
  return `${DIAS[dia]} ${d}/${m}`;
}

/** "2026-09" → "septiembre" (del "septiembre de 2026" del motor). */
export function mesDe(periodo: string): string {
  return nombrePeriodo(periodo).split(" de ")[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Plata que tipea la persona
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lee un importe escrito a la argentina ("12.700", "12.700,50", "$ 1.234") y lo pasa a
 * centavos con `pesos` del motor. Vacío = 0. Devuelve null si no es un número.
 */
export function parsearPesos(texto: string): Centavos | null {
  const limpio = texto.replace(/\$/g, "").replace(/\s/g, "");
  if (limpio === "") return 0;
  let normal = limpio;
  if (limpio.includes(",")) normal = limpio.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) normal = limpio.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  return pesos(Number(normal));
}

/**
 * El número de `formatearPesos` sin el signo pesos: "$1.234,56" → "1.234,56", "-$5,00" → "-5,00".
 * Tolera el signo con o sin espacio, así no depende del formato exacto del motor.
 */
export function importeSinSigno(c: Centavos): string {
  return formatearPesos(c).replace(/^(-?)\s*\$\s*/, "$1");
}

/** Importe para mostrar dentro de un campo editable: "12.700,00". */
export function importeEditable(c: Centavos): string {
  return importeSinSigno(c);
}
