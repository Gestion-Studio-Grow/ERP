// ============================================================================
// ABONOS — «a este cliente facturale todos los meses $X a Fulano». PURO.
// ============================================================================
//
// Lo que decide este archivo (sin base, sin React; lo prueba abonos-core.test.ts):
//   1. qué es una regla de abono válida (`validarReglaAbono`), con los mensajes para la contadora;
//   2. cómo se lee y se escribe una regla en la tabla del motor `ReglaFacturacion`
//      (`reglaDesdeFila` / `filaDesdeRegla`: los códigos de ARCA ↔ las palabras de la pantalla);
//   3. qué hace el lote del mes con cada regla (`prepararLote`): emitir, ya emitida, volver a
//      emitir (ARCA rechazó la anterior) o bloqueada, con el motivo en criollo;
//   4. el comprobante que sale de una regla (`armarComprobante`), en la forma que pide el motor
//      (`CreateInvoiceInput` de invoice-core, sin el tenantId ni el origen). Monotributo y exento:
//      Factura C con `calcularImpuestos`. Responsable inscripto: IVA declarado por renglón con
//      `montosDeRenglones` del motor, a la alícuota general (21 %).
//
// Dónde se guardan las reglas y cómo se emite sin duplicar (origen ABONO del motor):
// src/lib/cartera-abonos.ts.

import { cuitValido, normalizarCuit } from "@/plugins/bancos/domain/cuit";
import { leerImporte } from "@/lib/dinero/leer";
import { admiteCentavos, sumarAlCentavo } from "@/lib/dinero/redondeo";
import { calcularImpuestos } from "@/lib/fiscal/impuestos-por-alicuota";
import { montosDeRenglones } from "@/lib/facturacion/renglones";
import { UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL, vigenteEn } from "@/lib/fiscal/vigencias";
import { diasDelMes, esMesKey, nombreDelMes, type MesKey } from "@/lib/libros/fecha-fiscal";

// ── Vocabulario ──────────────────────────────────────────────────────────────

export type ConceptoAbono = "servicios" | "productos";
export type DocReceptor = "CUIT" | "DNI" | "CF";
export type CondicionReceptor = "RESPONSABLE_INSCRIPTO" | "MONOTRIBUTO" | "EXENTO" | "CONSUMIDOR_FINAL";

export const CONDICIONES_RECEPTOR: readonly { valor: CondicionReceptor; etiqueta: string }[] = [
  { valor: "CONSUMIDOR_FINAL", etiqueta: "Consumidor final" },
  { valor: "MONOTRIBUTO", etiqueta: "Monotributista" },
  { valor: "RESPONSABLE_INSCRIPTO", etiqueta: "Responsable inscripto" },
  { valor: "EXENTO", etiqueta: "IVA exento" },
];

/** Importe máximo de una regla: un abono de más de mil millones es un error de tipeo. */
export const IMPORTE_MAXIMO = 1_000_000_000;
export const DIAS_VENCIMIENTO_DEFAULT = 10;
export const DIAS_VENCIMIENTO_MAX = 60;
export const DESCRIPCION_MAX = 120;

export interface ReglaAbono {
  /** Id estable de la regla: las versiones y la baja cuelgan de él. */
  id: string;
  clienteTenantId: string;
  receptorNombre: string;
  receptorDocTipo: DocReceptor;
  /** `null` para consumidor final sin identificar. */
  receptorDocNro: string | null;
  receptorCondicionIva: CondicionReceptor;
  /** Lo que la contadora escribe para reconocerla («Honorarios», «Alquiler local»). */
  descripcion: string;
  /** Total final, en pesos, con IVA incluido si correspondiera. */
  importe: number;
  concepto: ConceptoAbono;
  /** Primer mes que se factura ("AAAA-MM"). */
  desde: MesKey;
  /** Último mes que se factura, o `null` = hasta que se dé de baja. */
  hasta: MesKey | null;
  /** Servicios: el vencimiento del pago, a cuántos días de la fecha del comprobante. */
  diasVencimiento: number;
}

export type DatosRegla = Omit<ReglaAbono, "id">;

export type ValidacionRegla = { ok: true; regla: DatosRegla } | { ok: false; error: string; campo: string };

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/**
 * Valida lo que escribió la contadora. Recibe texto crudo (un formulario) y devuelve la regla
 * normalizada o el PRIMER error, con el campo, para marcarlo. No redondea ni corrige nada en
 * silencio: un importe raro o un CUIT con un dígito mal es un error, no un «casi».
 */
export function validarReglaAbono(input: Record<string, unknown>): ValidacionRegla {
  const clienteTenantId = texto(input.clienteTenantId);
  if (!clienteTenantId) return { ok: false, campo: "clienteTenantId", error: "Elegí a qué cliente de tu cartera le vas a facturar." };

  const receptorDocTipo = texto(input.receptorDocTipo) as DocReceptor;
  if (!["CUIT", "DNI", "CF"].includes(receptorDocTipo)) {
    return { ok: false, campo: "receptorDocTipo", error: "Elegí cómo se identifica a quién se le factura: CUIT, DNI o consumidor final." };
  }

  let receptorDocNro: string | null = null;
  if (receptorDocTipo === "CUIT") {
    const cuit = normalizarCuit(texto(input.receptorDocNro));
    if (!cuitValido(cuit)) return { ok: false, campo: "receptorDocNro", error: "El CUIT de a quién le facturás no es válido: revisá los 11 números." };
    receptorDocNro = cuit;
  } else if (receptorDocTipo === "DNI") {
    const dni = texto(input.receptorDocNro).replace(/[\s.]/g, "");
    if (!/^\d{7,8}$/.test(dni)) return { ok: false, campo: "receptorDocNro", error: "El DNI va con 7 u 8 números, sin puntos." };
    receptorDocNro = dni;
  }

  const condicionRaw = texto(input.receptorCondicionIva) || (receptorDocTipo === "CUIT" ? "" : "CONSUMIDOR_FINAL");
  if (!CONDICIONES_RECEPTOR.some((c) => c.valor === condicionRaw)) {
    return { ok: false, campo: "receptorCondicionIva", error: "Elegí la condición frente al IVA de a quién le facturás." };
  }
  const receptorCondicionIva = condicionRaw as CondicionReceptor;
  if (receptorDocTipo !== "CUIT" && receptorCondicionIva !== "CONSUMIDOR_FINAL") {
    return {
      ok: false,
      campo: "receptorCondicionIva",
      error: "Con DNI o sin identificar, ARCA lo toma como consumidor final. Si es monotributista o inscripto, cargale el CUIT.",
    };
  }

  const receptorNombre = texto(input.receptorNombre);
  if (receptorNombre.length < 2) return { ok: false, campo: "receptorNombre", error: "Poné el nombre o la razón social de a quién le facturás." };

  const descripcion = texto(input.descripcion);
  if (descripcion.length < 2) return { ok: false, campo: "descripcion", error: "Poné qué se factura (por ejemplo, «Honorarios mensuales»)." };
  if (descripcion.length > DESCRIPCION_MAX) {
    return { ok: false, campo: "descripcion", error: `La descripción va con hasta ${DESCRIPCION_MAX} caracteres.` };
  }

  const lectura = leerImporte(texto(input.importe));
  if (lectura.estado !== "ok" || lectura.valor <= 0) {
    return { ok: false, campo: "importe", error: "Poné el importe del mes en pesos, por ejemplo 150000 o 150.000,50." };
  }
  if (!admiteCentavos(lectura.valor)) {
    return { ok: false, campo: "importe", error: "El importe va con hasta dos decimales (centavos)." };
  }
  if (lectura.valor > IMPORTE_MAXIMO) return { ok: false, campo: "importe", error: "Ese importe es demasiado grande: revisalo." };

  // Consumidor final sin identificar: desde el umbral vigente, ARCA pide su documento (RG 5700 y la
  // tabla de vigencias del motor). Se frena acá para no generar un rechazo por mes. El umbral se
  // toma al primer día del mes de inicio; si la norma cambia después, el motor frena el
  // comprobante y el rechazo lo explica.
  if (receptorDocTipo === "CF" && esMesKey(texto(input.desde))) {
    const umbral = vigenteEn(UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL, `${texto(input.desde)}-01`);
    if (umbral && lectura.valor >= umbral.valor) {
      return {
        ok: false,
        campo: "receptorDocTipo",
        error: `Desde ${pesos(umbral.valor)}, ARCA pide identificar al comprador: cargale CUIT o DNI.`,
      };
    }
  }

  const concepto = texto(input.concepto) as ConceptoAbono;
  if (concepto !== "servicios" && concepto !== "productos") {
    return { ok: false, campo: "concepto", error: "Elegí si lo que se factura es un servicio o productos." };
  }

  const desde = texto(input.desde);
  if (!esMesKey(desde)) return { ok: false, campo: "desde", error: "Elegí desde qué mes se factura." };
  const hastaRaw = texto(input.hasta);
  let hasta: MesKey | null = null;
  if (hastaRaw) {
    if (!esMesKey(hastaRaw)) return { ok: false, campo: "hasta", error: "El mes de fin no es válido. Dejalo vacío si no tiene fin." };
    if (hastaRaw < desde) return { ok: false, campo: "hasta", error: "El mes de fin no puede ser antes que el de inicio." };
    hasta = hastaRaw;
  }

  const diasRaw = texto(input.diasVencimiento);
  const diasVencimiento = diasRaw === "" ? DIAS_VENCIMIENTO_DEFAULT : Number(diasRaw);
  if (!Number.isInteger(diasVencimiento) || diasVencimiento < 0 || diasVencimiento > DIAS_VENCIMIENTO_MAX) {
    return { ok: false, campo: "diasVencimiento", error: `El vencimiento del pago va de 0 a ${DIAS_VENCIMIENTO_MAX} días.` };
  }

  return {
    ok: true,
    regla: {
      clienteTenantId,
      receptorNombre,
      receptorDocTipo,
      receptorDocNro,
      receptorCondicionIva,
      descripcion,
      importe: lectura.valor,
      concepto,
      desde,
      hasta,
      diasVencimiento,
    },
  };
}

// ── La fila de `ReglaFacturacion` (tabla del motor) ↔ la regla de la pantalla ─

/** Lo que trae una fila de `ReglaFacturacion` (el Decimal ya pasado a número en el borde). */
export interface FilaRegla {
  id: string;
  clienteTenantId: string;
  receptorNombre: string;
  receptorDocTipo: number;
  receptorDocNro: string | null;
  receptorCondicionIva: string;
  descripcion: string;
  importe: number;
  concepto: number;
  desde: string;
  hasta: string | null;
  diasVencimiento: number;
}

const DOC_TIPO: Readonly<Record<DocReceptor, number>> = { CUIT: 80, DNI: 96, CF: 99 };

/** Los datos de la regla en las columnas de la tabla (códigos de ARCA). PURA. */
export function filaDesdeRegla(r: DatosRegla): Omit<FilaRegla, "id"> {
  return {
    clienteTenantId: r.clienteTenantId,
    receptorNombre: r.receptorNombre,
    receptorDocTipo: DOC_TIPO[r.receptorDocTipo],
    receptorDocNro: r.receptorDocNro,
    receptorCondicionIva: r.receptorCondicionIva,
    descripcion: r.descripcion,
    importe: r.importe,
    concepto: r.concepto === "servicios" ? 2 : 1,
    desde: r.desde,
    hasta: r.hasta,
    diasVencimiento: r.diasVencimiento,
  };
}

/**
 * Una fila de la tabla como regla de la pantalla. Se revalida con las mismas reglas del formulario:
 * una fila que no las cumple (cargada por otro camino) no entra al lote. PURA.
 */
export function reglaDesdeFila(f: FilaRegla): ReglaAbono | null {
  const docTipo = f.receptorDocTipo === 80 ? "CUIT" : f.receptorDocTipo === 96 ? "DNI" : f.receptorDocTipo === 99 ? "CF" : null;
  if (!docTipo || (f.concepto !== 1 && f.concepto !== 2)) return null;
  const v = validarReglaAbono({
    clienteTenantId: f.clienteTenantId,
    receptorNombre: f.receptorNombre,
    receptorDocTipo: docTipo,
    receptorDocNro: f.receptorDocNro ?? "",
    receptorCondicionIva: f.receptorCondicionIva,
    descripcion: f.descripcion,
    importe: String(f.importe).replace(".", ","),
    concepto: f.concepto === 2 ? "servicios" : "productos",
    desde: f.desde,
    hasta: f.hasta ?? "",
    diasVencimiento: String(f.diasVencimiento),
  });
  return v.ok ? { id: f.id, ...v.regla } : null;
}

/** ¿La regla factura ese mes? */
export function vigenteEnMes(r: Pick<ReglaAbono, "desde" | "hasta">, mes: MesKey): boolean {
  return r.desde <= mes && (r.hasta === null || mes <= r.hasta);
}

/** «Todos los meses desde octubre 2026», «de octubre a diciembre 2026». */
export function textoVigencia(r: Pick<ReglaAbono, "desde" | "hasta">): string {
  const et = (m: MesKey) => `${nombreDelMes(m)} ${m.slice(0, 4)}`;
  return r.hasta ? `De ${et(r.desde)} a ${et(r.hasta)}` : `Todos los meses desde ${et(r.desde)}`;
}

// ── El lote del mes ──────────────────────────────────────────────────────────

/** Lo que el lote necesita saber de cada cliente (sale de la cartera + Tenant, ya verificado). */
export interface ClienteDelLote {
  clienteTenantId: string;
  alias: string;
  estado: "activa" | "pausada" | "baja";
  /** `Tenant.arcaCondicionIva` (null = sin cargar). */
  condicionIva: string | null;
  cuit: string | null;
  puntoVenta: number | null;
  /** `true` si no se pudo leer qué se le emitió: sin ese dato no se le emite nada (no se duplica). */
  sinLeer?: boolean;
}

/** La factura que ya salió de una regla en el mes del lote (origen ABONO), con su estado. */
export interface EmisionPrevia {
  reglaId: string;
  status: "PENDING" | "AUTHORIZED" | "REJECTED" | "DESCONOCIDO";
}

export type EstadoRenglonLote = "para_emitir" | "reemitir" | "ya_emitida" | "bloqueada";

export interface RenglonLote {
  regla: ReglaAbono;
  alias: string;
  estado: EstadoRenglonLote;
  /** Por qué está así, en criollo (vacío si va a emitirse sin más). */
  motivo: string;
}

/**
 * ¿Se emite esta regla este mes, dadas las emisiones anteriores? Una factura pendiente o
 * autorizada ya cuenta: no se emite otra. Si TODAS las anteriores fueron rechazadas, se vuelve a
 * emitir (con los datos que tenga hoy la regla). Una factura que ya no se encuentra (DESCONOCIDO)
 * se trata como emitida: ante la duda, no se duplica.
 */
export function decidirEmision(previas: readonly Pick<EmisionPrevia, "status">[]): "emitir" | "reemitir" | "ya_emitida" {
  if (previas.length === 0) return "emitir";
  return previas.every((p) => p.status === "REJECTED") ? "reemitir" : "ya_emitida";
}

/** Por qué un cliente no puede emitir abonos todavía. `null` = puede. */
export function bloqueoDelCliente(c: ClienteDelLote | undefined): string | null {
  if (!c || c.estado === "baja") return "El cliente ya no está en tu cartera.";
  if (c.sinLeer) return "No se pudo leer lo que ya se le emitió este mes: volvé a cargar la página antes de emitir.";
  if (c.estado === "pausada") return "El cliente está en pausa: reactivalo para facturarle.";
  if (!c.cuit) return "Le falta el CUIT: pedíselo a Soporte GSG desde su ficha.";
  if (!c.puntoVenta) return "Le falta el punto de venta: pedíselo a Soporte GSG desde su ficha.";
  return null;
}

/**
 * El lote del mes: una fila por regla vigente en `mes`. PURA. Orden: lo que se va a emitir
 * primero, después lo bloqueado (para que se vea qué destrabar), al final lo ya emitido.
 */
export function prepararLote(
  reglas: readonly ReglaAbono[],
  clientes: ReadonlyMap<string, ClienteDelLote>,
  previas: readonly EmisionPrevia[],
  mes: MesKey,
): RenglonLote[] {
  const porRegla = new Map<string, EmisionPrevia[]>();
  for (const p of previas) porRegla.set(p.reglaId, [...(porRegla.get(p.reglaId) ?? []), p]);
  const orden: Record<EstadoRenglonLote, number> = { para_emitir: 0, reemitir: 1, bloqueada: 2, ya_emitida: 3 };
  return reglas
    .filter((r) => vigenteEnMes(r, mes))
    .map((regla): RenglonLote => {
      const c = clientes.get(regla.clienteTenantId);
      const alias = c?.alias ?? "Cliente que ya no está en tu cartera";
      const decision = decidirEmision(porRegla.get(regla.id) ?? []);
      if (decision === "ya_emitida") {
        return { regla, alias, estado: "ya_emitida", motivo: `Ya se emitió la de ${nombreDelMes(mes)}.` };
      }
      const bloqueo = bloqueoDelCliente(c);
      if (bloqueo) return { regla, alias, estado: "bloqueada", motivo: bloqueo };
      return decision === "reemitir"
        ? { regla, alias, estado: "reemitir", motivo: "ARCA rechazó la anterior: se vuelve a emitir con los datos de hoy." }
        : c?.condicionIva === "RESPONSABLE_INSCRIPTO"
        ? { regla, alias, estado: "para_emitir", motivo: "Responsable inscripto: sale con IVA 21 % discriminado." }
        : { regla, alias, estado: "para_emitir", motivo: "" };
    })
    .sort(
      (a, b) =>
        orden[a.estado] - orden[b.estado] ||
        a.alias.localeCompare(b.alias, "es") ||
        a.regla.descripcion.localeCompare(b.regla.descripcion, "es") ||
        a.regla.id.localeCompare(b.regla.id),
    );
}

export interface ResumenLote {
  paraEmitir: number;
  importeParaEmitir: number;
  bloqueadas: number;
  yaEmitidas: number;
}

export function resumirLote(renglones: readonly RenglonLote[]): ResumenLote {
  const emiten = renglones.filter((r) => r.estado === "para_emitir" || r.estado === "reemitir");
  return {
    paraEmitir: emiten.length,
    importeParaEmitir: sumarAlCentavo(emiten.map((r) => r.regla.importe)),
    bloqueadas: renglones.filter((r) => r.estado === "bloqueada").length,
    yaEmitidas: renglones.filter((r) => r.estado === "ya_emitida").length,
  };
}

// ── El comprobante que sale de una regla ─────────────────────────────────────

export interface EmisorAbono {
  cuit: number;
  condicionIva: "RESPONSABLE_INSCRIPTO" | "MONOTRIBUTO" | "EXENTO" | "CONSUMIDOR_FINAL";
  puntoVenta: number;
}

/** "20261031" + N días → "20261110" (anclado a mediodía UTC: sin corrimientos de zona). */
export function sumarDias(aaaammdd: string, dias: number): string {
  const d = new Date(Date.UTC(Number(aaaammdd.slice(0, 4)), Number(aaaammdd.slice(4, 6)) - 1, Number(aaaammdd.slice(6, 8)), 12));
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Código de ARCA de la alícuota general del IVA (21 %): la de los abonos de un inscripto. */
export const ALICUOTA_GENERAL = 5;

/**
 * El comprobante de la regla para `mes`, emitido HOY (`hoy` = AAAAMMDD del negocio): la fecha del
 * día siempre cae dentro del plazo de ARCA. En servicios va el período del mes facturado y el
 * vencimiento del pago. Monotributo y exento: Factura C (`calcularImpuestos`, lo mismo que el resto
 * de la facturación automática). Responsable inscripto: el importe es IVA incluido y el IVA va
 * DECLARADO por renglón a la alícuota general (`montosDeRenglones`, del motor). La `descripcion`
 * lleva el mes («Honorarios mensuales · octubre 2026»): sale en el PDF y en el CSV. PURA.
 */
export function armarComprobante(regla: ReglaAbono, emisor: EmisorAbono, mes: MesKey, hoy: string) {
  let montos: { neto: number; iva: ReturnType<typeof calcularImpuestos>["iva"]; total: number; ivaPorProducto?: true };
  if (emisor.condicionIva === "RESPONSABLE_INSCRIPTO") {
    const m = montosDeRenglones("RESPONSABLE_INSCRIPTO", [{ total: regla.importe, alicuotaIva: ALICUOTA_GENERAL }]);
    if (!m.ok) return { ok: false as const, error: m.error };
    montos = { neto: m.neto, iva: m.iva, total: m.total, ...(m.ivaPorProducto ? { ivaPorProducto: true as const } : {}) };
  } else {
    montos = calcularImpuestos(emisor.condicionIva, regla.importe);
  }
  const compacto = mes.replace("-", "");
  const servicio =
    regla.concepto === "servicios"
      ? {
          servicioDesde: `${compacto}01`,
          servicioHasta: `${compacto}${String(diasDelMes(mes)).padStart(2, "0")}`,
          vencimientoPago: sumarDias(hoy, regla.diasVencimiento),
        }
      : {};
  return {
    ok: true as const,
    comprobante: {
      concepto: regla.concepto === "servicios" ? 2 : 1,
      fecha: hoy,
      emisor: { cuit: emisor.cuit, condicionIva: emisor.condicionIva, puntoVenta: emisor.puntoVenta },
      receptor: {
        docTipo: DOC_TIPO[regla.receptorDocTipo],
        docNro: regla.receptorDocNro ? Number(regla.receptorDocNro) : 0,
        condicionIva: regla.receptorCondicionIva,
      },
      ...montos,
      ...servicio,
      descripcion: `${regla.descripcion} · ${nombreDelMes(mes)} ${mes.slice(0, 4)}`,
    },
  };
}
