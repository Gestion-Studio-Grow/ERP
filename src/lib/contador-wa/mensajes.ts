// Textos del asistente de WhatsApp del estudio contable, en un solo lugar.
//
// Fuente: E1 §3.3 (fase Explorar del lanzamiento), tabla "Máquina de estados del
// chatbot". Los textos de esa tabla van LITERALES; `{…}` es el dato. Castellano
// rioplatense, sin emojis y sin jerga. Lo que la tabla no cubría (volver a preguntar,
// "todavía estoy leyendo", un tipo de mensaje que no entiendo, un error al cargar)
// está marcado "fuera de la tabla de E1" y sigue el mismo tono.
//
// Módulo PURO: sin imports, sin fechas del sistema, sin red. Lo que es dato (nombres,
// montos, fechas) llega por parámetro y ya validado por `bot.ts`, salvo el nombre del
// archivo, que lo manda el remitente y se sanea acá (`nombreDeArchivo`).

/** Plazo de borrado de los archivos que manda el cliente. PROVISIONAL A CONFIRMAR (decisión del dueño). */
export const DIAS_RETENCION_ARCHIVOS = 180;

/** Plantilla de Meta para avisar facturas fuera de la ventana de 24 h (la aprueba el dueño en Meta). */
export const PLANTILLA_COMPROBANTES_EMITIDOS = "comprobantes_emitidos";

/** Títulos de los botones de confirmación (WhatsApp: hasta 20 caracteres). */
export const BOTON_SI_CARGAR = "Sí, cargarlo";
export const BOTON_NO = "No";

/** Tope de caracteres del título de un botón de respuesta en WhatsApp Cloud (a verificar en Meta). */
export const TOPE_TITULO_BOTON = 20;

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

/** Una sola línea: sin saltos ni caracteres de control, espacios colapsados. */
export function unaLinea(s: string): string {
  return s
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Recorta a `max` caracteres (por punto de código) con "…" al final. */
function recortar(s: string, max: number): string {
  const cps = Array.from(s);
  return cps.length <= max ? s : `${cps.slice(0, max - 1).join("")}…`;
}

/**
 * Nombre del archivo tal como se le devuelve al remitente. Lo escribió él (o su banco),
 * así que se sanea: una línea, sin caracteres de control y con tope de largo.
 */
export function nombreDeArchivo(nombre: string | null | undefined): string {
  const limpio = unaLinea(nombre ?? "");
  return limpio ? recortar(limpio, 60) : "el archivo";
}

/** Título de botón dentro del tope de WhatsApp. */
export function tituloDeBoton(s: string): string {
  return recortar(unaLinea(s), TOPE_TITULO_BOTON);
}

/**
 * Título del botón de la opción `n` de "¿De cuál negocio es?": "1 Kiosco de Marta". El número
 * va adelante y no se recorta nunca (n ≤ 3 en botones), así dos títulos del mismo mensaje no
 * pueden quedar iguales ni vacíos. Coincide con la lista numerada del texto.
 */
export function tituloDeOpcion(n: number, alias: string): string {
  return tituloDeBoton(`${n} ${unaLinea(alias)}`);
}

/** Pesos en formato argentino: $3.912.400,00. Determinista (no depende de ICU). */
export function formatearPesos(n: number): string {
  if (!Number.isFinite(n)) return "$0,00";
  const centavos = Math.round(Math.abs(n) * 100);
  const entero = Math.floor(centavos / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dec = String(centavos % 100).padStart(2, "0");
  return `${n < 0 && centavos > 0 ? "-" : ""}$${entero},${dec}`;
}

function partesDeFecha(iso: string | null | undefined): { a: string; m: string; d: string } | null {
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  return r ? { a: r[1], m: r[2], d: r[3] } : null;
}

/** "2026-09-01" → "01/09". Fecha de calendario (sin zona). */
export function diaMes(iso: string | null | undefined): string | null {
  const p = partesDeFecha(iso);
  return p ? `${p.d}/${p.m}` : null;
}

/** "2026-09-01" → "01/09/2026". */
export function fechaCorta(iso: string | null | undefined): string | null {
  const p = partesDeFecha(iso);
  return p ? `${p.d}/${p.m}/${p.a}` : null;
}

/** "2026-09" → "septiembre". Lo ilegible → null. */
export function nombreDeMes(mes: string | null | undefined): string | null {
  const r = /^(\d{4})-(\d{2})$/.exec(String(mes ?? ""));
  if (!r) return null;
  return MESES[Number(r[2]) - 1] ?? null;
}

/** Sólo los últimos 4 dígitos de una cuenta (nunca se devuelve un CBU entero). */
export function ultimos4(cuenta: string | null | undefined): string | null {
  const digitos = String(cuenta ?? "").replace(/\D/g, "");
  return digitos.length >= 4 ? digitos.slice(-4) : null;
}

function cuenta(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Lista de negocios para el saludo: "A", "A o B", "A, B o C"; más de tres, genérico. */
function negociosDelSaludo(aliases: string[]): string {
  const a = aliases.map(unaLinea).filter(Boolean);
  if (a.length === 0 || a.length > 3) return "el negocio que corresponda";
  if (a.length === 1) return a[0];
  return `${a.slice(0, -1).join(", ")} o ${a[a.length - 1]}`;
}

/** "1 Kiosco de Marta · 2 Taller Ruiz SRL". */
export function listaNumerada(aliases: string[]): string {
  return aliases.map((a, i) => `${i + 1} ${unaLinea(a)}`).join(" · ");
}

// ---------------------------------------------------------------------------
// Número que no está en la cartera (E1 §3.3: desconocido, pidiendo_alta)
// ---------------------------------------------------------------------------

/** E1 §3.3 `desconocido`. No nombra clientes ni da datos: sólo el nombre del estudio dueño del número. */
export function saludoDesconocido(estudio: string | null | undefined): string {
  const nombre = unaLinea(estudio ?? "");
  return (
    `Hola, te escribe el asistente del estudio${nombre ? ` ${nombre}` : ""}. ` +
    "Este número no está asociado a ningún cliente del estudio. " +
    "Si sos cliente, respondé con tu CUIT (11 números, sin guiones) y le aviso al estudio para que lo confirme."
  );
}

/** E1 §3.3 `pidiendo_alta` con CUIT válido. */
export function altaPedida(): string {
  return "Gracias. Se lo pasé al estudio; te escribimos cuando esté confirmado. Hasta entonces no puedo recibir archivos.";
}

/** E1 §3.3 `pidiendo_alta` con texto que no es un CUIT válido. */
export function pedirCuit(): string {
  return "Necesito el CUIT: 11 números, sin guiones ni espacios.";
}

// ---------------------------------------------------------------------------
// Cliente conocido
// ---------------------------------------------------------------------------

/** E1 §3.3 `inicio`, saludo o texto libre. */
export function saludoCliente(nombre: string | null | undefined, aliases: string[]): string {
  const n = unaLinea(nombre ?? "");
  return (
    `Hola${n ? ` ${n}` : ""}. ` +
    "Mandame el extracto del banco tal como lo bajás del home banking (PDF, Excel o CSV) " +
    `y lo cargo para ${negociosDelSaludo(aliases)}. ` +
    "También podés escribir *estado* para ver cómo va el mes, o *estudio* para hablar con una persona."
  );
}

/** E1 §3.3 privacidad, primer contacto de cada número (una vez). Plazo provisional a confirmar. */
export function avisoPrivacidad(): string {
  return `Los archivos que mandes se usan sólo para la contabilidad de tu negocio y el estudio los borra a los ${DIAS_RETENCION_ARCHIVOS} días.`;
}

/** E1 §3.3 `inicio` + documento, número con un solo cliente. */
export function archivoRecibido(archivo: string | null | undefined): string {
  return `Recibí ${nombreDeArchivo(archivo)}. Lo estoy leyendo; te contesto en un minuto.`;
}

/** E1 §3.3 `inicio` + documento, número con varios clientes. */
export function elegirCliente(archivo: string | null | undefined, aliases: string[]): string {
  return `Recibí ${nombreDeArchivo(archivo)}. ¿De cuál negocio es? ${listaNumerada(aliases)}`;
}

/** Fuera de la tabla de E1: la respuesta a "¿de cuál negocio es?" no se entendió. */
export function elegirClienteDeNuevo(archivo: string | null | undefined, aliases: string[]): string {
  return `No te entendí. ¿De cuál negocio es ${nombreDeArchivo(archivo)}? ${listaNumerada(aliases)}`;
}

/** Fuera de la tabla de E1: el nombre que escribió coincide con más de un negocio del número. */
export function elegirPorNumero(archivo: string | null | undefined, aliases: string[]): string {
  return `Hay más de un negocio con ese nombre. ¿De cuál es ${nombreDeArchivo(archivo)}? Respondé con el número: ${listaNumerada(aliases)}`;
}

/** Fuera de la tabla de E1: llega otro archivo mientras espero que elija el negocio del anterior. */
export function antesElegirCliente(archivo: string | null | undefined, aliases: string[]): string {
  return `Antes decime de cuál negocio es el anterior (${nombreDeArchivo(archivo)}): ${listaNumerada(aliases)}`;
}

/** E1 §3.3 `eligiendo_cliente` con elección válida. */
export function clienteElegido(alias: string): string {
  return `Dale, es de ${unaLinea(alias)}. Lo estoy leyendo.`;
}

/** Fuera de la tabla de E1: escribe mientras leo. */
export function todaviaLeyendo(archivo: string | null | undefined): string {
  return `Todavía estoy leyendo ${nombreDeArchivo(archivo)}; te contesto en un minuto.`;
}

/** Fuera de la tabla de E1: manda otro archivo mientras leo el anterior (no se encola: se pide de nuevo). */
export function todaviaLeyendoOtroArchivo(archivo: string | null | undefined): string {
  return `Todavía estoy leyendo ${nombreDeArchivo(archivo)}. Cuando te conteste, mandame el otro de nuevo.`;
}

export type DatosExtracto = {
  banco: string | null;
  cuentaUltimos4: string | null;
  /** Fecha de calendario "AAAA-MM-DD". */
  desde: string | null;
  hasta: string | null;
  movimientos: number;
  ingresos: number;
  /** Suma de los ingresos, en pesos. */
  totalIngresos: number;
};

/** E1 §3.3 `leyendo` → resultado OK (va con los botones Sí, cargarlo / No). */
export function extractoLeido(d: DatosExtracto, alias: string): string {
  const banco = unaLinea(d.banco ?? "");
  const ult4 = ultimos4(d.cuentaUltimos4);
  const desde = diaMes(d.desde);
  const hasta = diaMes(d.hasta);
  return (
    `Es un extracto ${banco ? `de ${banco}` : "bancario"}` +
    (ult4 ? ` (cuenta terminada en ${ult4})` : "") +
    (desde && hasta ? `, del ${desde} al ${hasta}` : "") +
    `: ${cuenta(d.movimientos, "movimiento", "movimientos")}, ` +
    `${cuenta(d.ingresos, "ingreso", "ingresos")} por ${formatearPesos(d.totalIngresos)}. ` +
    `¿Lo cargo para ${unaLinea(alias)}?`
  );
}

/** E1 §3.3 `leyendo` → duplicado exacto. `fechaIso` = "AAAA-MM-DD" en la zona del negocio. */
export function extractoDuplicado(fechaIso: string | null): string {
  const f = fechaCorta(fechaIso);
  return `Este extracto ya me lo habías mandado${f ? ` el ${f}` : ""}. No lo cargo de nuevo.`;
}

/**
 * Cómo bajar el extracto, por banco. PROVISIONAL A CONFIRMAR: es una instrucción genérica
 * hasta tener el recorrido real de cada home banking con el estudio piloto (E1 §5, paso 9).
 */
export function instruccionDescarga(banco: string): string {
  const b = unaLinea(banco);
  const normal = b.toLowerCase();
  if (normal.includes("mercado pago")) {
    return `En ${b}: entrá desde la computadora, buscá el resumen de tu cuenta y descargalo en PDF o Excel.`;
  }
  return `En ${b}: entrá al home banking desde la computadora, abrí los movimientos de la cuenta y descargalos en PDF o Excel.`;
}

/** E1 §3.3 `leyendo` → foto (o foto mandada directamente). */
export function fotoNoSoportada(banco: string | null | undefined): string {
  const b = unaLinea(banco ?? "");
  return (
    "Recibí una foto. Todavía no leo fotos: necesito el archivo que baja el home banking (PDF, Excel o CSV)." +
    (b ? ` ${instruccionDescarga(b)}` : "")
  );
}

/** E1 §3.3 `leyendo` → ilegible o no cuadra el saldo. */
export function extractoIlegible(): string {
  return "No pude leer bien este archivo. Se lo pasé al estudio para que lo revise; no tenés que hacer nada más.";
}

/** E1 §3.3 `esperando_confirmacion` + Sí, cuando la carga terminó. */
export function extractoCargado(paraFacturar: number, necesitanDato: number): string {
  if (paraFacturar === 0 && necesitanDato === 0) {
    // Fuera de la tabla de E1: "0 ventas quedan para facturar y 0 necesitan un dato" no se lee bien.
    return "Cargado. No encontré ventas para facturar en este extracto; el estudio lo revisa igual.";
  }
  const listas = paraFacturar === 1 ? "1 venta queda para facturar" : `${paraFacturar} ventas quedan para facturar`;
  const dato = necesitanDato === 1 ? "1 necesita un dato" : `${necesitanDato} necesitan un dato`;
  return `Cargado. ${listas} y ${dato}; el estudio las revisa y te mando las facturas cuando estén.`;
}

/** Fuera de la tabla de E1: la carga confirmada falló. */
export function cargaFallida(archivo: string | null | undefined): string {
  return `No pude cargar ${nombreDeArchivo(archivo)}. Se lo pasé al estudio para que lo revise; no tenés que hacer nada más.`;
}

/** E1 §3.3 `esperando_confirmacion` + No. */
export function extractoDescartado(): string {
  return "Listo, lo descarto. Si te equivocaste de archivo, mandame el correcto.";
}

/** E1 §3.3 `esperando_confirmacion` + otro archivo. */
export function antesConfirmar(archivo: string | null | undefined): string {
  return `Antes decime si cargo el anterior (${nombreDeArchivo(archivo)}): Sí o No.`;
}

/** Fuera de la tabla de E1: la respuesta a la confirmación no fue ni Sí ni No. */
export function repreguntarConfirmacion(alias: string): string {
  return `¿Lo cargo para ${unaLinea(alias)}? Respondé Sí o No.`;
}

export type DatosEstado = { extractosCargados: number; facturasEmitidas: number; esperandoAlEstudio: number };

/** E1 §3.3 "estado" (una línea por negocio del número). */
export function estadoDelMes(alias: string, mes: string, r: DatosEstado): string {
  return (
    `${unaLinea(alias)}, ${mes}: ` +
    `${cuenta(r.extractosCargados, "extracto cargado", "extractos cargados")}, ` +
    `${cuenta(r.facturasEmitidas, "factura emitida", "facturas emitidas")}, ` +
    `${r.esperandoAlEstudio} esperando al estudio.`
  );
}

/** Fuera de la tabla de E1: el resumen del mes no se pudo leer. */
export function estadoNoDisponible(): string {
  return "No pude ver cómo va el mes ahora. Probá en un rato o escribí *estudio* para hablar con una persona.";
}

/** E1 §3.3 "estudio", "humano", "hablar". */
export function pasoAPersona(): string {
  return "Le aviso al estudio; te responde una persona en horario de oficina.";
}

/** E1 §3.3 "baja". */
export function bajaConfirmada(): string {
  return "Listo, no te voy a escribir más. Si querés volver, mandá *alta*.";
}

/** Fuera de la tabla de E1 (E1 §3.2: "el resto → no entiendo este tipo de mensaje"). */
export function tipoNoSoportado(): string {
  return "No entiendo este tipo de mensaje. Mandame el extracto del banco (PDF, Excel o CSV), o escribí *estudio* para hablar con una persona.";
}

/** E1 §3.3 salida: facturas emitidas (dentro de la ventana de 24 h). */
export function facturasEmitidas(cantidad: number, mes: string | null, alias: string, total: number): string {
  const periodo = mes ? `de ${mes}` : "del período";
  const a = unaLinea(alias);
  const monto = formatearPesos(total);
  return cantidad === 1
    ? `Se emitió 1 factura ${periodo} de ${a} por ${monto}. Te mando el resumen y el PDF.`
    : `Se emitieron ${cantidad} facturas ${periodo} de ${a} por ${monto}. Te mando el resumen y los PDF.`;
}
