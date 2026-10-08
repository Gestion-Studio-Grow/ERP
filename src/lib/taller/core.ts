// ============================================================================
// TALLER — reglas puras del módulo (sin base, sin Next): patente, estados, plata,
// plantillas de WhatsApp y avisos. Todo lo que se puede probar sin levantar nada.
// ============================================================================

// ── Patente ─────────────────────────────────────────────────────────────────
// Autos: vieja ABC123 (1995–2016) y Mercosur AB123CD (2016+). Motos: vieja 123ABC
// y Mercosur A123BCD. Se guarda SIEMPRE normalizada (mayúsculas, sin espacios ni guiones).

export type FormatoPatente = "vieja" | "mercosur" | "moto-vieja" | "moto-mercosur";

export function normalizarPatente(raw: string | null | undefined): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatoPatente(raw: string | null | undefined): FormatoPatente | null {
  const p = normalizarPatente(raw);
  if (/^[A-Z]{3}\d{3}$/.test(p)) return "vieja";
  if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p)) return "mercosur";
  if (/^\d{3}[A-Z]{3}$/.test(p)) return "moto-vieja";
  if (/^[A-Z]\d{3}[A-Z]{3}$/.test(p)) return "moto-mercosur";
  return null;
}

/** Como se lee en la chapa: "ABC 123" / "AB 123 CD". Si no es válida, la devuelve normalizada. */
export function mostrarPatente(raw: string | null | undefined): string {
  const p = normalizarPatente(raw);
  switch (formatoPatente(p)) {
    case "vieja":
    case "moto-vieja":
      return `${p.slice(0, 3)} ${p.slice(3)}`;
    case "mercosur":
      return `${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5)}`;
    case "moto-mercosur":
      return `${p.slice(0, 1)} ${p.slice(1, 4)} ${p.slice(4)}`;
    default:
      return p;
  }
}

// ── Estados de la orden ─────────────────────────────────────────────────────

export const ESTADOS = [
  "RECIBIDO",
  "DIAGNOSTICO",
  "ESPERANDO_APROBACION",
  "ESPERANDO_REPUESTOS",
  "EN_REPARACION",
  "LISTO",
  "ENTREGADO",
] as const;
export type EstadoOrden = (typeof ESTADOS)[number];

export const ESTADO_LABEL: Record<EstadoOrden, string> = {
  RECIBIDO: "Recibido",
  DIAGNOSTICO: "Diagnóstico",
  ESPERANDO_APROBACION: "Esperando aprobación",
  ESPERANDO_REPUESTOS: "Esperando repuestos",
  EN_REPARACION: "En reparación",
  LISTO: "Listo",
  ENTREGADO: "Entregado",
};

/** Lo que lee el cliente en su link: sin jerga del taller. */
export const ESTADO_PARA_CLIENTE: Record<EstadoOrden, string> = {
  RECIBIDO: "Recibimos tu auto",
  DIAGNOSTICO: "Lo estamos revisando",
  ESPERANDO_APROBACION: "Te pasamos el presupuesto: necesitamos tu OK",
  ESPERANDO_REPUESTOS: "Esperando que lleguen los repuestos",
  EN_REPARACION: "Estamos trabajando en tu auto",
  LISTO: "¡Listo para retirar!",
  ENTREGADO: "Entregado",
};

export function esEstado(v: unknown): v is EstadoOrden {
  return typeof v === "string" && (ESTADOS as readonly string[]).includes(v);
}

export function siguienteEstado(e: EstadoOrden): EstadoOrden | null {
  const i = ESTADOS.indexOf(e);
  return i >= 0 && i < ESTADOS.length - 1 ? ESTADOS[i + 1] : null;
}

// ── Plata ───────────────────────────────────────────────────────────────────

export const redondear = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** $ 1.234.567,89 — formato argentino, siempre con dos decimales. */
export function pesos(n: number | null | undefined): string {
  const v = Number.isFinite(n as number) ? (n as number) : 0;
  const abs = Math.abs(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}$ ${abs}`;
}

/** Precio de venta sugerido de un repuesto: costo + margen %. */
export function precioConMargen(costo: number, margenPct: number): number {
  return redondear(costo * (1 + margenPct / 100));
}

export type TipoItem = "MANO_OBRA" | "REPUESTO";
export type DecisionItem = "PENDIENTE" | "APROBADO" | "RECHAZADO";

export interface ItemCalc {
  tipo: string;
  cantidad: number;
  precio: number;
  decision: string;
  traidoPorCliente?: boolean;
}

export interface Totales {
  manoDeObra: number;
  repuestos: number;
  /** Todo lo presupuestado que el cliente no rechazó. */
  presupuestado: number;
  /** Sólo lo que el cliente aprobó: es lo que se cobra. */
  aprobado: number;
  pendientes: number;
  rechazados: number;
}

const subtotal = (i: ItemCalc): number => (i.traidoPorCliente ? 0 : redondear(i.cantidad * i.precio));

export function totales(items: readonly ItemCalc[]): Totales {
  const t: Totales = { manoDeObra: 0, repuestos: 0, presupuestado: 0, aprobado: 0, pendientes: 0, rechazados: 0 };
  for (const i of items) {
    if (i.decision === "RECHAZADO") {
      t.rechazados++;
      continue;
    }
    const s = subtotal(i);
    if (i.tipo === "MANO_OBRA") t.manoDeObra += s;
    else t.repuestos += s;
    t.presupuestado += s;
    if (i.decision === "APROBADO") t.aprobado += s;
    else t.pendientes++;
  }
  t.manoDeObra = redondear(t.manoDeObra);
  t.repuestos = redondear(t.repuestos);
  t.presupuestado = redondear(t.presupuestado);
  t.aprobado = redondear(t.aprobado);
  return t;
}

// ── Medios de pago y recargo ────────────────────────────────────────────────

export const MEDIOS = ["EFECTIVO", "TRANSFERENCIA", "MERCADO_PAGO", "DEBITO", "CREDITO"] as const;
export type MedioPago = (typeof MEDIOS)[number];

export const MEDIO_LABEL: Record<MedioPago, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  MERCADO_PAGO: "Mercado Pago",
  DEBITO: "Débito",
  CREDITO: "Crédito",
};

export interface Recargos {
  debito: number;
  cuotas1: number;
  cuotas3: number;
  cuotas6: number;
  cuotas12: number;
}

export const RECARGOS_DEFAULT: Recargos = { debito: 0, cuotas1: 8, cuotas3: 15, cuotas6: 30, cuotas12: 60 };

export function recargoPct(medio: MedioPago, cuotas: number, r: Recargos): number {
  if (medio === "DEBITO") return r.debito;
  if (medio !== "CREDITO") return 0;
  if (cuotas >= 12) return r.cuotas12;
  if (cuotas >= 6) return r.cuotas6;
  if (cuotas >= 3) return r.cuotas3;
  return r.cuotas1;
}

/** Cuánto se le cobra al cliente para que al taller le entre `monto` limpio de recargo. */
export function conRecargo(monto: number, pct: number): { recargo: number; total: number } {
  const recargo = redondear((monto * pct) / 100);
  return { recargo, total: redondear(monto + recargo) };
}

// ── Plantillas de WhatsApp ──────────────────────────────────────────────────
// Texto con {variables}. El taller las edita en Configuración; lo que no edita usa éstas.

export const PLANTILLAS_DEFAULT = {
  recibido:
    "Hola {nombre}! Ya recibimos tu {vehiculo} ({patente}) en {taller}. Podés seguir el estado desde acá: {link}",
  presupuesto:
    "Hola {nombre}! Te pasamos el presupuesto de tu {vehiculo} ({patente}): {total}. Vale hasta el {validez}. Mirá el detalle y aprobá lo que quieras hacer desde acá: {link}",
  listo:
    "Hola {nombre}! Tu {vehiculo} ({patente}) ya está listo para retirar. Saldo a pagar: {saldo}. Te esperamos en {direccion} ({horario}).",
  entregado:
    "Gracias por confiar en {taller}, {nombre}! Tu trabajo tiene garantía hasta el {garantia}. Si quedaste conforme, ¿nos dejás una reseña? Nos ayuda un montón: {resena}",
  turno:
    "Hola {nombre}! Te recordamos tu turno de mañana a las {hora} en {taller} ({direccion}). Si no podés venir avisanos así le damos el lugar a otro. ¡Gracias!",
  service:
    "Hola {nombre}! A tu {vehiculo} ({patente}) ya le toca el service. ¿Te reservamos un turno? Pedilo acá: {turnos}",
  vtv: "Hola {nombre}! La VTV de tu {vehiculo} ({patente}) vence el {fecha}. Si querés lo revisamos antes para que pase sin vueltas: {turnos}",
  inactivo:
    "Hola {nombre}! Hace rato que no vemos tu {vehiculo} por {taller}. ¿Le hacemos un chequeo? Sacá turno acá: {turnos}",
  referido:
    "Hola {nombre}! Si nos recomendás a un amigo y viene de tu parte, los dos tienen un descuento en el próximo service. Pasale este link: {turnos}",
  deuda:
    "Hola {nombre}! Te recordamos que quedó un saldo de {saldo} por el trabajo en tu {vehiculo} ({patente}). Podés transferir al alias {alias}. ¡Gracias!",
} as const;

export type ClavePlantilla = keyof typeof PLANTILLAS_DEFAULT;
export const CLAVES_PLANTILLA = Object.keys(PLANTILLAS_DEFAULT) as ClavePlantilla[];

export const PLANTILLA_LABEL: Record<ClavePlantilla, string> = {
  recibido: "Auto recibido (con link de seguimiento)",
  presupuesto: "Presupuesto para aprobar",
  listo: "Auto listo para retirar",
  entregado: "Entrega: garantía y pedido de reseña",
  turno: "Recordatorio de turno (día anterior)",
  service: "Le toca el service",
  vtv: "VTV por vencer",
  inactivo: "Cliente que no vuelve hace 6 meses",
  referido: "Programa de referidos",
  deuda: "Saldo pendiente",
};

/** Reemplaza {variables}. Una variable sin dato se borra, nunca queda "{llave}" a la vista. */
export function armarMensaje(plantilla: string, vars: Record<string, string | number | null | undefined>): string {
  return plantilla
    .replace(/\{(\w+)\}/g, (_, k: string) => {
      const v = vars[k];
      return v == null ? "" : String(v);
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Link wa.me con el texto pre-armado (editable en WhatsApp antes de enviar). Null si no hay teléfono usable. */
export function waLink(telefono: string | null | undefined, texto: string): string | null {
  let d = (telefono ?? "").replace(/\D/g, "");
  if (d.length < 8) return null;
  // Celular argentino: wa.me quiere 549 + área + número, sin 0 ni 15.
  if (d.startsWith("00")) d = d.slice(2);
  if (!d.startsWith("54")) {
    if (d.startsWith("0")) d = d.slice(1);
    d = `549${d}`;
  } else if (!d.startsWith("549")) {
    d = `549${d.slice(2)}`;
  }
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`;
}

// ── Avisos (fidelización) ───────────────────────────────────────────────────

export type TipoAviso = "vtv" | "service" | "inactivo" | "deuda" | "garantia";

export interface DatosVehiculoAviso {
  id: string;
  km: number | null;
  vtvVence: Date | null;
  proximoServiceFecha: Date | null;
  proximoServiceKm: number | null;
  ultimaVisita: Date | null;
}

const DIA = 86_400_000;

/** Qué avisos le corresponden hoy a un vehículo. PURA: `hoy` se inyecta. */
export function avisosDeVehiculo(v: DatosVehiculoAviso, hoy: Date): TipoAviso[] {
  const out: TipoAviso[] = [];
  // VTV: avisa desde 30 días antes y hasta 30 después de vencida.
  if (v.vtvVence) {
    const dias = (v.vtvVence.getTime() - hoy.getTime()) / DIA;
    if (dias <= 30 && dias >= -30) out.push("vtv");
  }
  const porFecha = v.proximoServiceFecha && v.proximoServiceFecha.getTime() - hoy.getTime() <= 15 * DIA;
  const porKm = v.proximoServiceKm != null && v.km != null && v.km >= v.proximoServiceKm - 500;
  if (porFecha || porKm) out.push("service");
  if (v.ultimaVisita && hoy.getTime() - v.ultimaVisita.getTime() >= 183 * DIA) out.push("inactivo");
  return out;
}

/** Clave estable de "este aviso ya se mandó este mes" (no se le insiste al cliente todos los días). */
export function claveAviso(tipo: TipoAviso, refId: string, hoy: Date): string {
  return `${tipo}:${refId}:${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

export const fechaCorta = (d: Date | null | undefined): string =>
  d ? d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }) : "";

export const sumarDias = (d: Date, dias: number): Date => new Date(d.getTime() + dias * DIA);

/** ¿Esa fecha ya pasó? (vencimientos de presupuesto y de garantía). */
export const yaPaso = (d: Date | null | undefined): boolean => !!d && d.getTime() < Date.now();

/** La fecha de acá a `dias` días. */
export const dentroDe = (dias: number): Date => new Date(Date.now() + dias * DIA);
