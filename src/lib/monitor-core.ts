/**
 * CORE del MONITOREO de cartera (producto Contador). Responde la única pregunta
 * que el contador se hace cada mañana: **¿de cuál de mis clientes me tengo que
 * ocupar hoy?**
 *
 * El panel de cartera (`cartera-core.ts`) ya contesta "cuánto facturó cada uno
 * este mes". Eso es un TABLERO DE VOLUMEN: mira lo que pasó. El monitoreo mira
 * lo que está ROTO o a punto de romperse — y sobre todo lo que falla EN SILENCIO:
 *
 *  - los cinco caminos de emisión envuelven la facturación en try/catch
 *    best-effort (el turno se cierra y el pedido se toma igual aunque no se
 *    emita). Un cliente sin CUIT cargado deja de facturar y NADIE se entera:
 *    su fila del panel simplemente muestra 0, que es indistinguible de "no
 *    vendió". La señal `perfil_fiscal_incompleto` existe por eso.
 *  - un certificado vencido no avisa: falla la próxima emisión, no la de hoy.
 *  - el outbox reintenta solo; si un comprobante queda trabado, el panel de
 *    volumen no lo muestra en ningún lado.
 *
 * DISEÑO: este archivo es PURO. Recibe HECHOS ya recolectados (`HechosCliente`)
 * y devuelve SEÑALES con severidad. No sabe de Prisma, de RLS ni de fechas del
 * sistema: el "ahora" entra por parámetro. Así se testea sin DB y sin reloj, y
 * la recolección —que sí cruza tenants, siempre vía `tenantTransaction`— queda
 * del lado de las actions, igual que en `cartera-core`/`bancos-glue`.
 *
 * REGLA DE AISLAMIENTO heredada de `cartera-core`: nada acá evade RLS. Este
 * módulo no lee; solo interpreta.
 */

import type { EstadoCartera } from "@/lib/cartera-core";

// ── Umbrales (explícitos y exportados: son política, no magia) ───────────────

/** % del cap mensual desde el que el cliente entra en alerta (espeja UMBRAL_ALERTA_CAP). */
export const UMBRAL_CAP_ATENCION = 0.8;

/** Reintentos del outbox a partir de los cuales el despacho se considera trabado. */
export const UMBRAL_OUTBOX_TRABADO = 3;

/** Días de anticipación con que se avisa el vencimiento del certificado de ARCA. */
export const DIAS_AVISO_CERT = 30;

/** Días sin actividad tras los que un cliente activo se considera "en silencio". */
export const DIAS_SILENCIO = 10;

/** Días que una propuesta puede esperar en la cola de revisión antes de alertar. */
export const DIAS_COLA_ESTANCADA = 7;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// ── Vocabulario ──────────────────────────────────────────────────────────────

/**
 * Severidad de una señal.
 *  - `critico`: el cliente NO puede emitir, o ya emitió mal. Se rompe hoy.
 *  - `atencion`: se va a romper, o hay trabajo humano esperando.
 */
export type Severidad = "critico" | "atencion";

/** Estado del semáforo de un cliente: la peor severidad de sus señales. */
export type EstadoCliente = "critico" | "atencion" | "ok" | "pausado";

export type SenalId =
  | "perfil_fiscal_incompleto"
  | "cert_vencido"
  | "cert_por_vencer"
  | "sin_credencial"
  | "facturas_rechazadas"
  | "outbox_trabado"
  | "tope_alcanzado"
  | "cerca_del_tope"
  | "cola_estancada"
  | "silencio_de_ingesta"
  | "emision_apagada";

/** Una señal concreta sobre un cliente, redactada para que el contador actúe. */
export interface Senal {
  id: SenalId;
  severidad: Severidad;
  /** Titular corto, el que entra en la fila de la tabla. */
  titulo: string;
  /** El dato duro que lo justifica (con el número real). */
  detalle: string;
  /** Qué hacer al respecto, en una línea. */
  accion: string;
}

/**
 * HECHOS de un cliente: lo que el recolector trae de la DB del cliente (vía
 * `tenantTransaction`) más su config fiscal. Todo lo que necesita el evaluador.
 */
export interface HechosCliente {
  clienteTenantId: string;
  alias: string;
  estadoCartera: EstadoCartera;

  // Identidad fiscal del emisor (Tenant.arca*) — sin esto no se emite nada.
  arcaCuit: string | null;
  arcaPuntoVenta: number | null;
  arcaHomologacion: boolean;
  /** `true` si el entorno del cliente tiene la emisión encendida. */
  emisionHabilitada: boolean;
  /** Vencimiento del certificado ARCA (ISO). `null` = no hay credencial cargada. */
  certVenceAt: string | null;

  // Volumen del mes en curso.
  facturasMes: number;
  capFacturasMes: number;
  rechazadasMes: number;

  // Pipeline de emisión y de revisión humana.
  outboxTrabados: number;
  pendientesRevision: number;
  /** Fecha (ISO) de la propuesta más vieja sin revisar. `null` si no hay cola. */
  revisionMasViejaAt: string | null;

  /** Última señal de vida fiscal: importación de extracto o comprobante emitido. */
  ultimaActividadAt: string | null;
}

/** Un cliente ya evaluado: lo que pinta una fila del monitor. */
export interface FilaMonitor {
  clienteTenantId: string;
  alias: string;
  estado: EstadoCliente;
  senales: Senal[];
  /** Para ordenar: cuanto más alto, más arriba en la lista. */
  urgencia: number;
  pctCap: number;
}

/** Cabecera del monitor: cuántos clientes hay en cada estado. */
export interface ResumenMonitor {
  total: number;
  criticos: number;
  enAtencion: number;
  ok: number;
  pausados: number;
  /** Clientes que HOY no pueden emitir (la cifra que se mira primero). */
  sinPoderEmitir: number;
}

// ── Helpers puros ────────────────────────────────────────────────────────────

/** Días enteros entre dos instantes ISO (negativo si `hasta` ya pasó). */
export function diasEntre(desdeIso: string, hastaIso: string): number {
  const d = Date.parse(desdeIso);
  const h = Date.parse(hastaIso);
  if (Number.isNaN(d) || Number.isNaN(h)) return NaN;
  return Math.floor((h - d) / MS_POR_DIA);
}

/**
 * ¿La identidad fiscal alcanza para emitir? Espeja la validación de
 * `construirPerfilFiscal` (fix 885758b): sin CUIT válido de 11 dígitos, con el
 * viejo placeholder, o sin punto de venta, la emisión LANZA en vez de emitir mal.
 * Acá se detecta ANTES de que falle, que es todo el punto del monitoreo.
 */
export function perfilFiscalCompleto(h: HechosCliente): boolean {
  const cuit = (h.arcaCuit ?? "").replace(/\D/g, "");
  if (cuit.length !== 11) return false;
  if (cuit === "20000000000") return false; // placeholder histórico
  return h.arcaPuntoVenta !== null && h.arcaPuntoVenta > 0;
}

const pesoSeveridad: Record<Severidad, number> = { critico: 100, atencion: 10 };

// ── Evaluación (el corazón, PURO) ────────────────────────────────────────────

/**
 * Evalúa un cliente contra el catálogo de señales.
 *
 * `ahoraIso` entra por parámetro (nunca `new Date()` acá dentro) para que el
 * test fije el reloj y para que una corrida del cron sea reproducible.
 *
 * Un cliente `pausada` no genera señales: el contador lo pausó a propósito, y
 * llenarlo de alertas es la forma más rápida de que deje de mirar el tablero.
 */
export function evaluarCliente(h: HechosCliente, ahoraIso: string): FilaMonitor {
  const cap = h.capFacturasMes > 0 ? h.capFacturasMes : 0;
  const pctCap = cap > 0 ? h.facturasMes / cap : 0;

  if (h.estadoCartera !== "activa") {
    return {
      clienteTenantId: h.clienteTenantId,
      alias: h.alias,
      estado: "pausado",
      senales: [],
      urgencia: 0,
      pctCap,
    };
  }

  const senales: Senal[] = [];

  // 1. No puede emitir: falta identidad fiscal. La más grave porque es MUDA.
  if (!perfilFiscalCompleto(h)) {
    senales.push({
      id: "perfil_fiscal_incompleto",
      severidad: "critico",
      titulo: "No puede emitir",
      detalle: h.arcaCuit
        ? `CUIT o punto de venta inválidos (CUIT ${h.arcaCuit}, PV ${h.arcaPuntoVenta ?? "—"}).`
        : "No tiene CUIT cargado.",
      accion: "Cargar CUIT y punto de venta en la ficha fiscal del cliente.",
    });
  }

  // 2. Certificado: sin credencial, vencido, o por vencer.
  if (h.certVenceAt === null) {
    senales.push({
      id: "sin_credencial",
      severidad: "critico",
      titulo: "Sin certificado",
      detalle: "No hay certificado de ARCA cargado para este cliente.",
      accion: "Subir el certificado del emisor desde la ficha fiscal.",
    });
  } else {
    const dias = diasEntre(ahoraIso, h.certVenceAt);
    if (!Number.isNaN(dias)) {
      if (dias < 0) {
        senales.push({
          id: "cert_vencido",
          severidad: "critico",
          titulo: "Certificado vencido",
          detalle: `Venció hace ${Math.abs(dias)} día(s).`,
          accion: "Renovar el certificado en ARCA y volver a subirlo.",
        });
      } else if (dias <= DIAS_AVISO_CERT) {
        senales.push({
          id: "cert_por_vencer",
          severidad: "atencion",
          titulo: "Certificado por vencer",
          detalle: `Vence en ${dias} día(s).`,
          accion: "Renovarlo antes de la fecha para no cortar la emisión.",
        });
      }
    }
  }

  // 3. Ya emitió mal: ARCA rechazó comprobantes este mes.
  if (h.rechazadasMes > 0) {
    senales.push({
      id: "facturas_rechazadas",
      severidad: "critico",
      titulo: "Comprobantes rechazados",
      detalle: `${h.rechazadasMes} rechazado(s) por ARCA este mes.`,
      accion: "Revisar el motivo del rechazo y reemitir.",
    });
  }

  // 4. El despacho está trabado: hay comprobantes que no llegan a ARCA.
  if (h.outboxTrabados > 0) {
    senales.push({
      id: "outbox_trabado",
      severidad: "critico",
      titulo: "Emisión trabada",
      detalle: `${h.outboxTrabados} comprobante(s) con ${UMBRAL_OUTBOX_TRABADO}+ reintentos fallidos.`,
      accion: "Ver el último error del despacho: suele ser credencial o dato del receptor.",
    });
  }

  // 5. Tope del monotributo: alcanzado bloquea, cerca avisa.
  if (cap > 0 && h.facturasMes >= cap) {
    senales.push({
      id: "tope_alcanzado",
      severidad: "critico",
      titulo: "Tope del mes alcanzado",
      detalle: `${h.facturasMes} de ${cap} facturas. La emisión automática está bloqueada.`,
      accion: "Ampliar el tope del cliente o revisar si corresponde recategorizar.",
    });
  } else if (cap > 0 && pctCap >= UMBRAL_CAP_ATENCION) {
    senales.push({
      id: "cerca_del_tope",
      severidad: "atencion",
      titulo: "Cerca del tope",
      detalle: `${h.facturasMes} de ${cap} facturas (${Math.round(pctCap * 100)}%).`,
      accion: "Anticipar la recategorización antes de que bloquee.",
    });
  }

  // 6. Trabajo humano esperando hace demasiado.
  if (h.pendientesRevision > 0 && h.revisionMasViejaAt) {
    const dias = diasEntre(h.revisionMasViejaAt, ahoraIso);
    if (!Number.isNaN(dias) && dias >= DIAS_COLA_ESTANCADA) {
      senales.push({
        id: "cola_estancada",
        severidad: "atencion",
        titulo: "Cola de revisión estancada",
        detalle: `${h.pendientesRevision} pendiente(s), la más vieja hace ${dias} día(s).`,
        accion: "Resolver la cola: son ventas que todavía no se facturaron.",
      });
    }
  }

  // 7. Silencio: un cliente activo que hace días no da señales de vida fiscal.
  //    Es la señal que evita el peor error del contador: olvidarse de alguien.
  if (h.ultimaActividadAt === null) {
    senales.push({
      id: "silencio_de_ingesta",
      severidad: "atencion",
      titulo: "Sin actividad registrada",
      detalle: "Nunca importó movimientos ni emitió comprobantes.",
      accion: "Confirmar que el cliente esté operando y con la ingesta conectada.",
    });
  } else {
    const dias = diasEntre(h.ultimaActividadAt, ahoraIso);
    if (!Number.isNaN(dias) && dias >= DIAS_SILENCIO) {
      senales.push({
        id: "silencio_de_ingesta",
        severidad: "atencion",
        titulo: "En silencio",
        detalle: `Hace ${dias} día(s) que no registra actividad.`,
        accion: "Verificar la conexión de Mercado Pago o pedir el extracto del mes.",
      });
    }
  }

  // 8. Emisión apagada o en homologación: emite "en borrador" sin saberlo.
  if (!h.emisionHabilitada) {
    senales.push({
      id: "emision_apagada",
      severidad: "atencion",
      titulo: "Emisión apagada",
      detalle: "La facturación electrónica está deshabilitada para este cliente.",
      accion: "Encender la emisión cuando el cliente esté listo para producción.",
    });
  } else if (h.arcaHomologacion) {
    senales.push({
      id: "emision_apagada",
      severidad: "atencion",
      titulo: "En homologación",
      detalle: "Emite contra el entorno de prueba de ARCA: los CAE no son válidos.",
      accion: "Pasar el cliente a producción cuando termine la prueba.",
    });
  }

  const peor: EstadoCliente = senales.some((s) => s.severidad === "critico")
    ? "critico"
    : senales.length > 0
      ? "atencion"
      : "ok";

  return {
    clienteTenantId: h.clienteTenantId,
    alias: h.alias,
    estado: peor,
    senales,
    urgencia: senales.reduce((s, x) => s + pesoSeveridad[x.severidad], 0),
    pctCap,
  };
}

// ── Agregación del tablero ───────────────────────────────────────────────────

/**
 * Orden del monitor: primero lo que hay que resolver hoy. Desempata por alias
 * para que la lista sea ESTABLE entre recargas (si salta de orden con los mismos
 * datos, el contador deja de confiar en ella).
 */
export function ordenarPorUrgencia(filas: FilaMonitor[]): FilaMonitor[] {
  return [...filas].sort(
    (a, b) => b.urgencia - a.urgencia || a.alias.localeCompare(b.alias, "es"),
  );
}

/** Cabecera del monitor. PURA. */
export function resumirMonitor(filas: FilaMonitor[]): ResumenMonitor {
  const bloquea: SenalId[] = [
    "perfil_fiscal_incompleto",
    "sin_credencial",
    "cert_vencido",
    "tope_alcanzado",
  ];
  return {
    total: filas.length,
    criticos: filas.filter((f) => f.estado === "critico").length,
    enAtencion: filas.filter((f) => f.estado === "atencion").length,
    ok: filas.filter((f) => f.estado === "ok").length,
    pausados: filas.filter((f) => f.estado === "pausado").length,
    sinPoderEmitir: filas.filter((f) => f.senales.some((s) => bloquea.includes(s.id))).length,
  };
}

/** Evalúa la cartera entera y la devuelve ordenada, con su cabecera. */
export function evaluarCartera(
  hechos: HechosCliente[],
  ahoraIso: string,
): { filas: FilaMonitor[]; resumen: ResumenMonitor } {
  const filas = ordenarPorUrgencia(hechos.map((h) => evaluarCliente(h, ahoraIso)));
  return { filas, resumen: resumirMonitor(filas) };
}
