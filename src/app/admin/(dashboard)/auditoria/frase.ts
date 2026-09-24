// ============================================================================
// CADA ACCIÓN AUDITADA, DICHA COMO UNA FRASE. PURO.
// ============================================================================
//
// La columna Detalle de la Auditoría mostraba el JSON crudo ({"code":74,"cupon":{…}}): la
// dueña que busca qué pasó el martes no lee eso. Acá cada fila se cuenta en castellano —"Anuló
// la venta #8 · se devolvieron $6.900"— y el registro técnico queda para ver a pedido.
//
// El `changes` es JSON de la base, escrito por versiones distintas del código: todo se lee con
// cuidado y lo que no tiene la forma esperada no se inventa. Si una acción no tiene frase
// propia, se dice lo que se sabe ("Editó un producto") y el registro técnico sigue a mano.
//
// No sabe de React ni de la base. Los resúmenes que ya existían (el cierre de caja, el cambio
// de precio y el interruptor de GSG) se reusan tal cual: son los mismos textos de siempre.

import { fmtMoneyARS } from "@/components/ui/format";
import { resumenCierre } from "@/lib/caja/cierre-resumen";
import { resumenDeFilaDePrecio } from "@/lib/catalogo/precios-auditoria";
import { textoDeInterruptorEnAuditoria } from "@/cambios/interruptores";

export type FilaParaDescribir = {
  actor: string;
  action: string;
  entity: string;
  entityId: string | null;
  channel: string | null;
  changes: unknown;
};

export type Descripcion = {
  /** Lo que pasó, en una frase: "Anuló la venta #8". */
  frase: string;
  /** Lo que acompaña, en líneas cortas: "Motivo: «se equivocó de producto»". */
  detalle: string[];
  /** Hay un registro técnico que vale la pena ofrecer a pedido. */
  tecnico: boolean;
};

// ── Lectura segura del JSON ────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const esObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const txt = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);

/** $6.900, o $6.900,50 si tiene centavos: en una frase los ",00" sobran. */
export function plata(n: number): string {
  return fmtMoneyARS(n, Number.isInteger(n) ? 0 : 2);
}

function cantidad(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

/** "21/09/2026" de un "2026-09-21"; si no tiene esa forma, tal cual. */
function dia(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/** "agosto de 2026" de un "2026-08". */
function mes(s: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return s;
  const nombres = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${nombres[Number(m[2]) - 1] ?? m[2]} de ${m[1]}`;
}

const MEDIO: Record<string, string> = {
  EFECTIVO: "en efectivo",
  MP: "por Mercado Pago o transferencia",
  MERCADOPAGO: "por Mercado Pago",
  TRANSFERENCIA: "por transferencia",
  TARJETA: "con tarjeta",
  CUENTA_CORRIENTE: "a cuenta",
};
const medio = (x: unknown): string | null => {
  const m = txt(x);
  return m ? (MEDIO[m] ?? null) : null;
};

const ESTADO_PEDIDO: Record<string, string> = {
  PENDING: "Nuevo",
  CONFIRMED: "Confirmado",
  PREPARING: "Preparando",
  READY: "Listo",
  DELIVERED: "Entregado",
  CANCELLED: "Anulado",
};

// ── Las cosas sobre las que se actúa ───────────────────────────────────────

/** Con artículo indefinido ("un turno") y definido ("el turno"). */
const COSA: Record<string, { un: string; el: string }> = {
  Appointment: { un: "un turno", el: "el turno" },
  Service: { un: "un servicio", el: "el servicio" },
  Box: { un: "un box", el: "el box" },
  Product: { un: "un producto", el: "el producto" },
  Professional: { un: "un profesional", el: "el profesional" },
  ProfessionalBlock: { un: "un bloqueo de agenda", el: "el bloqueo de agenda" },
  ProfessionalNews: { un: "una novedad de agenda", el: "la novedad de agenda" },
  ProfessionalServiceCommission: { un: "una comisión", el: "la comisión" },
  Review: { un: "una reseña", el: "la reseña" },
  Order: { un: "un pedido", el: "el pedido" },
  Client: { un: "una ficha de cliente", el: "la ficha de cliente" },
  Coupon: { un: "un cupón", el: "el cupón" },
  Supplier: { un: "un proveedor", el: "el proveedor" },
  User: { un: "un usuario", el: "el usuario" },
  StockMovement: { un: "un movimiento de stock", el: "el movimiento de stock" },
  StockPurchase: { un: "una compra", el: "la compra" },
  ProductBatch: { un: "un lote", el: "el lote" },
  DevolucionProveedor: { un: "una devolución a proveedor", el: "la devolución a proveedor" },
  AccountPayable: { un: "una cuenta a pagar", el: "la cuenta a pagar" },
  PayableCheque: { un: "un cheque", el: "el cheque" },
  CashSession: { un: "la caja", el: "la caja" },
  CashMovement: { un: "un movimiento de caja", el: "el movimiento de caja" },
  WaitlistEntry: { un: "una anotación en la lista de espera", el: "la anotación en la lista de espera" },
  PaymentLink: { un: "un link de pago", el: "el link de pago" },
  CommissionPayout: { un: "una liquidación de comisiones", el: "la liquidación de comisiones" },
  MessageTemplate: { un: "un mensaje de WhatsApp", el: "el mensaje de WhatsApp" },
  ServiceReminderConfig: { un: "un recordatorio", el: "el recordatorio" },
  LeadCampania: { un: "una inscripción de campaña", el: "la inscripción de campaña" },
  ContactoCliente: { un: "un contacto con un cliente", el: "el contacto con el cliente" },
  ConsentimientoCliente: { un: "un permiso de contacto", el: "el permiso de contacto" },
  BusinessSettings: { un: "los datos del negocio", el: "los datos del negocio" },
  Tenant: { un: "la configuración del negocio", el: "la configuración del negocio" },
  "Tenant.accentPreset": { un: "el color del panel", el: "el color del panel" },
  TenantFiscalCredential: { un: "el certificado de ARCA", el: "el certificado de ARCA" },
  CarteraCliente: { un: "un local de la red", el: "el local de la red" },
  Traslado: { un: "un traslado", el: "el traslado" },
  ProcessingRun: { un: "una importación del extracto", el: "la importación del extracto" },
  CierreMes: { un: "el cierre del mes", el: "el cierre del mes" },
  CierreDiario: { un: "el cierre de caja", el: "el cierre de caja" },
};

function cosa(entity: string): { un: string; el: string } {
  return COSA[entity] ?? { un: "un registro", el: "el registro" };
}

/** "el producto «Vacío»" si el cambio trae el nombre; si no, "un producto". */
function nombrada(entity: string, c: Obj | null): string {
  const nombre = c ? (txt(c.name) ?? txt(c.nombre) ?? txt(c.clientName)) : null;
  const k = cosa(entity);
  return nombre ? `${k.el} «${nombre}»` : k.un;
}

const VERBO: Record<string, string> = {
  create: "Creó",
  create_manual: "Cargó a mano",
  update: "Editó",
  delete: "Borró",
  cancel: "Canceló",
  deactivate: "Dio de baja",
  reactivate: "Reactivó",
  import: "Importó",
  adjust: "Ajustó",
  notify: "Avisó sobre",
};

// ── Frases por cosa ────────────────────────────────────────────────────────

type Frase = { frase: string; detalle?: string[] };

function venta(code: number | null, c: Obj): string {
  if (code === null) return "un pedido";
  return c.channel === "COUNTER" ? `la venta #${code}` : `el pedido #${code}`;
}

function pedido(f: FilaParaDescribir, c: Obj): Frase | null {
  const code = num(c.code);
  const cual = code !== null ? `#${code}` : "";
  if (f.action === "create") {
    const extras: string[] = [];
    const total = num(c.total);
    if (total !== null) extras.push(plata(total));
    const cupon = esObj(c.cupon) ? c.cupon : null;
    if (cupon && txt(cupon.codigo)) {
      const monto = num(cupon.monto);
      extras.push(`cupón ${txt(cupon.codigo)}${monto ? ` −${plata(monto)}` : ""}`);
    } else if (esObj(c.descuento)) {
      const d = c.descuento;
      const valor = num(d.valor);
      const monto = num(d.monto);
      if (d.tipo === "PERCENT" && valor !== null) extras.push(`descuento del ${cantidad(valor)}%${monto ? ` (−${plata(monto)})` : ""}`);
      else if (monto) extras.push(`descuento de ${plata(monto)}`);
    }
    if (Array.isArray(c.preciosAMano) && c.preciosAMano.length > 0) {
      extras.push(c.preciosAMano.length === 1 ? "1 precio a mano" : `${c.preciosAMano.length} precios a mano`);
    }
    if (c.aCuenta === true) extras.push("a cuenta");
    const inicio =
      c.channel === "COUNTER"
        ? `Registró la venta ${cual}`.trim()
        : c.channel === "ONLINE"
          ? `Entró el pedido ${cual} desde la tienda`.replace("  ", " ")
          : `Creó el pedido ${cual}`.trim();
    return { frase: [inicio, ...extras].join(" · ") };
  }
  if (f.action === "update") {
    if (c.status === "CANCELLED") {
      const detalle: string[] = [];
      const motivo = txt(c.motivo);
      if (motivo) detalle.push(`Motivo: «${motivo}»`);
      const monto = num(c.montoRevertido);
      if (monto) detalle.push(`Se devolvieron ${plata(monto)} de la caja`);
      if (Array.isArray(c.stockDevuelto) && c.stockDevuelto.length > 0) {
        const items = c.stockDevuelto
          .filter(esObj)
          .map((x) => {
            const n = txt(x.name) ?? txt(x.nombre);
            const q = num(x.qty);
            return n ? `${q !== null ? `${cantidad(q)} × ` : ""}${n}` : null;
          })
          .filter((x): x is string => x !== null);
        if (items.length > 0) detalle.push(`Volvió al stock: ${items.join(", ")}`);
      }
      const cuenta = num(c.cuentaCorrienteAnulada);
      if (cuenta) detalle.push(`Se anularon ${plata(cuenta)} de la cuenta corriente del cliente`);
      const cupon = txt(c.cuponDevuelto);
      if (cupon) detalle.push(`El cupón ${cupon} recuperó su uso`);
      return { frase: `Anuló ${code !== null ? `la venta #${code}` : "una venta"}`, detalle };
    }
    if (esObj(c.status)) {
      const de = ESTADO_PEDIDO[String(c.status.from)];
      const a = ESTADO_PEDIDO[String(c.status.to)];
      if (de && a) {
        return {
          frase: `Pasó ${code !== null ? `el pedido #${code}` : "un pedido"} de «${de}» a «${a}»`,
          detalle: c.quedaACobrar === true ? ["Quedó a cobrar"] : [],
        };
      }
    }
    if (c.paid === true) {
      const m = medio(c.method);
      return { frase: `Cobró ${code !== null ? `el pedido #${code}` : "un pedido"}${m ? ` ${m}` : ""}` };
    }
    if (esObj(c.total)) {
      const de = num(c.total.from);
      const a = num(c.total.to);
      if (de !== null && a !== null) return { frase: `Ajustó el total de un pedido al pesarlo: ${plata(de)} → ${plata(a)}` };
    }
    return null;
  }
  if (f.action === "cupon-del-pedido") {
    const codigo = txt(c.codigo);
    const valor = num(c.valor);
    const monto = num(c.monto);
    if (!codigo) return null;
    const cuanto = c.tipo === "PERCENT" && valor !== null ? ` (−${cantidad(valor)}%)` : monto ? ` (−${plata(monto)})` : "";
    return { frase: `Se aplicó el cupón ${codigo}${cuanto} a un pedido` };
  }
  if (f.action === "link-de-pago") {
    const monto = num(c.monto);
    return { frase: `Mandó un link de pago${code !== null ? ` por ${venta(code, c)}` : ""}${monto ? ` de ${plata(monto)}` : ""}` };
  }
  if (f.action === "whatsapp") return { frase: `Avisó por WhatsApp ${code !== null ? `del pedido #${code}` : "de un pedido"}` };
  return null;
}

function turno(f: FilaParaDescribir, c: Obj | null): Frase | null {
  const o = c ?? {};
  const monto = num(o.amount) ?? num(o.monto);
  const m = medio(o.method);
  const motivo = txt(o.motivo);
  switch (f.action) {
    case "create":
    case "create_manual": {
      const senia = esObj(o.senia) ? num(o.senia.monto) : null;
      return {
        frase: f.action === "create" ? "Reservó un turno" : "Agendó un turno",
        detalle: senia ? [`Seña de ${plata(senia)}${medio(esObj(o.senia) ? o.senia.method : null) ? ` ${medio((o.senia as Obj).method)}` : ""}`] : [],
      };
    }
    case "confirm":
      return { frase: "Confirmó un turno" };
    case "confirm_payment":
      return { frase: `Confirmó el pago de un turno${monto ? ` · ${plata(monto)}` : ""}${m ? ` ${m}` : ""}` };
    case "collect_payment":
      return { frase: `Cobró un turno${monto ? ` · ${plata(monto)}` : ""}${m ? ` ${m}` : ""}` };
    case "complete": {
      const saldo = esObj(o.saldoCobrado) ? num(o.saldoCobrado.amount) : null;
      return { frase: `Marcó un turno como atendido${saldo ? ` · cobró el saldo de ${plata(saldo)}` : ""}` };
    }
    case "cancel":
      return { frase: "Canceló un turno" };
    case "no_show":
      return { frase: "Marcó que la persona no vino a su turno" };
    case "reschedule":
      return { frase: "Cambió de horario un turno" };
    case "void_collection":
      return { frase: `Anuló el cobro de un turno${monto ? ` · ${plata(monto)}` : ""}`, detalle: motivo ? [`Motivo: «${motivo}»`] : [] };
    case "write_off_balance":
      return { frase: "Perdonó el saldo de un turno", detalle: motivo ? [`Motivo: «${motivo}»`] : [] };
    case "reminder_manual":
      return { frase: "Mandó el recordatorio de un turno" };
    case "book_from_waitlist":
      return { frase: "Dio un turno desde la lista de espera" };
    default:
      return null;
  }
}

function caja(f: FilaParaDescribir, c: Obj | null): Frase | null {
  const o = c ?? {};
  if (f.entity === "CashSession") {
    if (f.action === "open") {
      const fondo = num(o.openingFloat);
      return { frase: `Abrió la caja${fondo !== null ? ` con ${plata(fondo)} de cambio` : ""}` };
    }
    if (f.action === "close") {
      const contado = num(o.counted);
      const esperado = num(o.expected);
      const dif = num(o.diff);
      const detalle: string[] = [];
      if (contado !== null && esperado !== null) detalle.push(`Contó ${plata(contado)} y se esperaban ${plata(esperado)}`);
      if (dif) detalle.push(dif > 0 ? `Sobraron ${plata(dif)}` : `Faltaron ${plata(-dif)}`);
      return { frase: "Cerró la caja", detalle };
    }
    if (f.action === "movement") {
      const monto = num(o.amount);
      const tipo = o.type === "EGRESO" ? "una salida" : "una entrada";
      return { frase: `Cargó ${tipo}${monto !== null ? ` de ${plata(monto)}` : ""} en la caja`, detalle: txt(o.reason) ? [`«${txt(o.reason)}»`] : [] };
    }
  }
  if (f.entity === "CashMovement" && (f.action === "libro.add" || f.action === "libro.delete")) {
    const monto = num(o.amount);
    const tipo = o.type === "EGRESO" ? "una salida" : "una entrada";
    const m = medio(o.method);
    const que = `${tipo}${monto !== null ? ` de ${plata(monto)}` : ""}${m ? ` ${m}` : ""}`;
    const texto = txt(o.detail) ?? txt(o.reason);
    const detalle = [
      ...(texto && !texto.startsWith("raw:") ? [`«${texto}»`] : []),
      ...(txt(o.occurredAt) ? [`Del día ${dia(txt(o.occurredAt)!)}`] : []),
    ];
    return f.action === "libro.add"
      ? { frase: `Cargó ${que} en el libro de caja`, detalle }
      : { frase: `Borró ${que} del libro de caja`, detalle };
  }
  if (f.entity === "CommissionPayout" && f.action === "settle") {
    const monto = num(o.amount);
    const quien = txt(o.professionalName);
    const turnos = num(o.appointmentCount);
    return {
      frase: `Liquidó ${monto !== null ? `${plata(monto)} de ` : ""}comisiones${quien ? ` a ${quien}` : ""}`,
      detalle: [...(turnos ? [`${cantidad(turnos)} ${turnos === 1 ? "turno" : "turnos"}`] : []), ...(txt(o.note) ? [`«${txt(o.note)}»`] : [])],
    };
  }
  if (f.entity === "CierreMes") {
    const cual = f.entityId && /^\d{4}-\d{2}$/.test(f.entityId) ? ` de ${mes(f.entityId)}` : "";
    const motivo = txt(o.motivo);
    if (f.action === "cierre-mes.congelar") return { frase: `Cerró el mes${cual}` };
    if (f.action === "cierre-mes.reabrir") return { frase: `Reabrió el mes${cual}`, detalle: motivo ? [`Motivo: «${motivo}»`] : [] };
    if (f.action === "cierre-mes.paquete") return { frase: `Bajó el paquete del mes${cual} para el contador` };
  }
  return null;
}

function stock(f: FilaParaDescribir, c: Obj | null): Frase | null {
  const o = c ?? {};
  if (f.entity === "StockPurchase" && f.action === "create") {
    const code = num(o.code);
    const total = num(o.totalCost);
    return {
      frase: `Registró ${o.kind === "COMPRA" || o.kind === undefined ? "la compra" : "el ingreso"}${code !== null ? ` #${code}` : ""}${total !== null ? ` por ${plata(total)}` : ""}`,
    };
  }
  if (f.entity === "Traslado") {
    const codigo = txt(o.codigo);
    const lineas = Array.isArray(o.lineas)
      ? o.lineas
          .filter(esObj)
          .map((l) => {
            const n = txt(l.nombre);
            const q = num(l.cantidad);
            return n ? `${q !== null ? `${cantidad(q)}${txt(l.unidad) === "kg" ? " kg" : ""} de ` : ""}${n}` : null;
          })
          .filter((x): x is string => x !== null)
      : [];
    const destino = esObj(o.destino) ? txt(o.destino.nombre) : null;
    const origen = esObj(o.origen) ? txt(o.origen.nombre) : null;
    const detalle = lineas.length > 0 ? [lineas.join(", ")] : [];
    if (f.action === "traslado.salida") return { frase: `Mandó el traslado ${codigo ?? ""}${destino ? ` a ${destino}` : ""}`.replace("  ", " "), detalle };
    if (f.action === "traslado.entrada") return { frase: `Recibió el traslado ${codigo ?? ""}${origen ? ` de ${origen}` : ""}`.replace("  ", " "), detalle };
  }
  return null;
}

function red(f: FilaParaDescribir, c: Obj | null): Frase | null {
  const o = c ?? {};
  const alias = txt(o.alias);
  switch (f.action) {
    case "multilocal.vincular":
      return { frase: `Sumó ${alias ? `el local ${alias}` : "un local"} a la red` };
    case "multilocal.alias":
      return { frase: `Cambió el nombre del local${alias ? ` a ${alias}` : ""}` };
    case "multilocal.baja":
      return { frase: `Sacó ${alias ? `el local ${alias}` : "un local"} de la red` };
    case "multilocal.vinculado":
      return { frase: `Este negocio quedó dentro de la red${txt(o.casa) ? ` de ${txt(o.casa)}` : ""}${alias ? ` como ${alias}` : ""}` };
    case "multilocal.desvinculado":
      return { frase: "Este negocio salió de la red de locales" };
    case "multilocal.catalogo": {
      const nuevos = Array.isArray(o.nuevos) ? o.nuevos.length : 0;
      const cambios = Array.isArray(o.cambios) ? o.cambios.length : 0;
      return {
        frase: `Llegó el catálogo${txt(o.casa) ? ` de ${txt(o.casa)}` : " de la casa"}: ${nuevos} ${nuevos === 1 ? "producto nuevo" : "productos nuevos"} y ${cambios} ${cambios === 1 ? "precio cambiado" : "precios cambiados"}`,
      };
    }
    case "multilocal.catalogo.empuje": {
      const n = Array.isArray(o.locales) ? o.locales.length : 0;
      return { frase: `Mandó el catálogo a ${n} ${n === 1 ? "local" : "locales"}` };
    }
    case "fiscal.alta-en-red": {
      const pv = num(o.arcaPuntoVenta);
      return { frase: `Se cargaron el CUIT${pv !== null ? ` y el punto de venta ${pv}` : ""} del local` };
    }
    case "fiscal.cuit.set":
      return { frase: "Cargó el CUIT del negocio" };
    case "fiscal.cuit.clear":
      return { frase: "Borró el CUIT del negocio" };
    case "fiscal.puntoVenta.set":
      return { frase: `Cargó el punto de venta${num(o.despues) !== null ? ` ${num(o.despues)}` : ""}` };
    case "fiscal.puntoVenta.clear":
      return { frase: "Borró el punto de venta" };
    case "module.activate":
      return { frase: "Cambió las apps contratadas del negocio" };
    default:
      return null;
  }
}

function personas(f: FilaParaDescribir, c: Obj | null): Frase | null {
  const o = c ?? {};
  if (f.entity === "User") {
    const nombre = txt(o.name);
    switch (f.action) {
      case "create":
        return { frase: `Creó el usuario${nombre ? ` ${nombre}` : ""}` };
      case "update":
        if (o.active === false) return { frase: "Dio de baja a un usuario" };
        if (o.active === true) return { frase: "Reactivó a un usuario" };
        return null;
      case "reset_password":
        return { frase: "Le cambió la contraseña a un usuario" };
      case "change_own_password":
        return { frase: "Cambió su propia contraseña" };
    }
  }
  if (f.entity === "WaitlistEntry") {
    const nombre = txt(o.clientName);
    if (f.action === "create") return { frase: `Anotó ${nombre ? `a ${nombre}` : "a alguien"} en la lista de espera` };
    if (f.action === "cancel") return { frase: "Sacó a alguien de la lista de espera" };
  }
  if (f.entity === "PaymentLink" && f.action === "create") {
    const monto = num(o.monto);
    return { frase: `Creó un link de pago${monto !== null ? ` de ${plata(monto)}` : ""}`, detalle: txt(o.concepto) ? [`«${txt(o.concepto)}»`] : [] };
  }
  return null;
}

// ── Punto de entrada ───────────────────────────────────────────────────────

/** La acción de una fila de la auditoría, dicha en castellano. */
export function describirAccion(f: FilaParaDescribir): Descripcion {
  const c = esObj(f.changes) ? f.changes : null;
  const hayTecnico = f.changes !== null && f.changes !== undefined;

  // El interruptor de GSG: la frase ya existe y el detalle es interno, no se ofrece.
  const interruptor = textoDeInterruptorEnAuditoria(f);
  if (interruptor) return { frase: interruptor, detalle: [], tecnico: false };

  // El cierre de caja ES el registro del arqueo: su resumen de siempre, medio por medio.
  if (f.entity === "CierreDiario") {
    const r = c ? resumenCierre(c) : null;
    const del = f.entityId && /^\d{4}-\d{2}-\d{2}$/.test(f.entityId) ? ` del ${dia(f.entityId)}` : "";
    const verbo = f.action === "caja.corte-inicial" ? "Hizo el corte inicial de la caja" : "Cerró la caja";
    if (!r) return { frase: `${verbo}${del}`, detalle: [], tecnico: hayTecnico };
    return {
      frase: [`${verbo}${del}`, ...(r.titulo ? [r.titulo] : [])].join(" · "),
      detalle: [...r.medios, ...(r.nota ? [`«${r.nota}»`] : [])],
      tecnico: hayTecnico,
    };
  }

  // El cambio de precio y la etiqueta impresa: "Vacío: $9.000 → $9.900 /kg".
  const precio = resumenDeFilaDePrecio(f.action, f.changes, (n) => fmtMoneyARS(n));
  if (precio) {
    const verbo = f.action === "etiqueta-impresa" ? "Imprimió la etiqueta de" : "Cambió el precio de";
    return { frase: `${verbo} ${precio}`, detalle: [], tecnico: hayTecnico };
  }

  const propia =
    (f.entity === "Order" && c ? pedido(f, c) : null) ??
    (f.entity === "Appointment" ? turno(f, c) : null) ??
    caja(f, c) ??
    stock(f, c) ??
    red(f, c) ??
    personas(f, c);
  if (propia) return { frase: propia.frase, detalle: propia.detalle ?? [], tecnico: hayTecnico };

  // Sin frase propia: el verbo y la cosa, y el registro técnico a mano.
  const verbo = VERBO[f.action];
  if (verbo) return { frase: `${verbo} ${nombrada(f.entity, c)}`, detalle: [], tecnico: hayTecnico };
  return { frase: `Hizo un cambio en ${cosa(f.entity).el}`, detalle: [], tecnico: true };
}
