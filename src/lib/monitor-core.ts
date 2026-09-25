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
 * en `recolectarCliente` (cartera-core) y la única puerta es `monitorCarteraAction`.
 *
 * SEÑALES DE CLIENTE vs AVISOS DE PLATAFORMA. Hay condiciones que no son de ningún
 * cliente: la emisión apagada por entorno (`ARCA_INVOICING_ENABLED`), ARCA en modo
 * simulado (`ARCA_MODO=stub`), cuántos clientes están en prueba. Si se repitieran
 * por fila, los N clientes saldrían con la misma alerta y la bandeja dejaría de
 * leerse. Van UNA vez, arriba (`avisosDePlataforma`).
 *
 * REGLA DE AISLAMIENTO heredada de `cartera-core`: nada acá evade RLS. Este
 * módulo no lee; solo interpreta.
 */

import type { EstadoCartera } from "@/lib/cartera-core";
import { dateStrInBusinessTz } from "@/lib/datetime";

// ── Umbrales (explícitos y exportados: son política, no magia) ───────────────

/**
 * % del límite de facturas automáticas del plan desde el que el cliente entra en alerta
 * (espeja UMBRAL_ALERTA_CAP).
 */
export const UMBRAL_CAP_ATENCION = 0.8;

/** Reintentos del outbox a partir de los cuales el despacho se considera trabado. */
export const UMBRAL_OUTBOX_TRABADO = 3;

/** Días de anticipación con que se avisa el vencimiento del certificado de ARCA. */
export const DIAS_AVISO_CERT = 30;

/** Días sin actividad tras los que un cliente activo se considera "en silencio". */
export const DIAS_SILENCIO = 10;

/** Días que una propuesta puede esperar en la cola de revisión antes de alertar. */
export const DIAS_COLA_ESTANCADA = 7;

/**
 * Días COMPLETOS con movimientos de caja sin cerrar a partir de los cuales se avisa.
 * Hoy no cuenta (el día todavía no terminó): con 1, avisa si ayer quedó sin cerrar.
 */
export const DIAS_CAJA_SIN_CERRAR = 1;

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

/**
 * Modo de ARCA de la PLATAFORMA (`ARCA_MODO`). Espejo del `ModoArca` del plugin ARCA,
 * repetido acá para que este módulo puro no importe el plugin.
 *  - `stub`: no se firma ni se habla con ARCA → el certificado no se usa todavía.
 *  - `homologacion`: se habla con el ARCA de prueba, con el certificado de cada cliente.
 *  - `real`: producción.
 */
export type ModoArca = "stub" | "homologacion" | "real";

/** Lo que es de la PLATAFORMA y no de un cliente. Entra por parámetro, como el reloj. */
export interface ContextoPlataforma {
  /** `ARCA_INVOICING_ENABLED`: flag GLOBAL de entorno, igual para todos los clientes. */
  emisionHabilitada: boolean;
  modoArca: ModoArca;
}

export type SenalId =
  | "perfil_fiscal_incompleto"
  | "cert_vencido"
  | "cert_por_vencer"
  | "sin_credencial"
  | "facturas_rechazadas"
  | "outbox_trabado"
  | "cupo_del_plan"
  | "cerca_del_cupo"
  | "cola_estancada"
  | "silencio_de_ingesta"
  | "caja_sin_cerrar";

/**
 * Quién puede resolver la señal. El contador resuelve lo que se arregla en el
 * backoffice del cliente (`ruta`); el punto de venta y el certificado los carga
 * Gestión Studio Grow desde la consola de operador, así que la acción honesta es
 * pedírselo — un botón que lo mande a una pantalla donde no puede hacerlo es un
 * callejón sin salida.
 */
export type Resolucion = { quien: "estudio"; ruta: string } | { quien: "gsg" };

/** Una señal concreta sobre un cliente, redactada para que el contador actúe. */
export interface Senal {
  id: SenalId;
  severidad: Severidad;
  /** Titular corto, el que entra en la línea de la bandeja. */
  titulo: string;
  /** El dato duro que lo justifica (con el número real). */
  detalle: string;
  /** Qué hacer al respecto, en una línea. */
  accion: string;
  resuelve: Resolucion;
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
  /** ¿Hay credencial de ARCA cargada para este cliente? */
  credencialCargada: boolean;
  /**
   * Vencimiento del certificado ARCA (ISO). `null` con credencial cargada = no se pudo leer
   * el vencimiento del certificado: no se inventa una señal por eso.
   */
  certVenceAt: string | null;

  // El mes en curso, los dos por el reloj de EMISIÓN (`Invoice.createdAt`, bordes en hora
  // argentina): el LÍMITE DE FACTURAS AUTOMÁTICAS DEL PLAN cuenta todo lo emitido;
  // `rechazadasMes`, lo emitido que ARCA rechazó.
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

  /**
   * Caja del cliente. `null` = no tiene caja (la cartera nace con facturación pura y sin
   * ningún movimiento de caja). `pendienteDesde` = el día (AAAA-MM-DD) más viejo, ANTERIOR
   * a hoy, con movimientos posteriores al último cierre; `null` = todo cerrado.
   */
  caja: { pendienteDesde: string | null } | null;
}

/** Un cliente ya evaluado: lo que pinta una línea de la bandeja. */
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

/** Condición de la plataforma, dicha UNA vez arriba de la bandeja (nunca por fila). */
export interface AvisoPlataforma {
  id: "emision_apagada" | "arca_simulado" | "arca_homologacion" | "clientes_en_prueba";
  texto: string;
}

// ── Helpers puros ────────────────────────────────────────────────────────────

/** Días enteros entre dos instantes ISO (negativo si `hasta` ya pasó). */
export function diasEntre(desdeIso: string, hastaIso: string): number {
  const d = Date.parse(desdeIso);
  const h = Date.parse(hastaIso);
  if (Number.isNaN(d) || Number.isNaN(h)) return NaN;
  return Math.floor((h - d) / MS_POR_DIA);
}

/** Días de calendario entre dos días AAAA-MM-DD (anclados a mediodía UTC: sin corrimientos). */
function diasEntreDias(desde: string, hasta: string): number {
  const d = Date.parse(`${desde}T12:00:00.000Z`);
  const h = Date.parse(`${hasta}T12:00:00.000Z`);
  if (Number.isNaN(d) || Number.isNaN(h)) return NaN;
  return Math.round((h - d) / MS_POR_DIA);
}

/** "2026-09-03" → "03/09/2026". */
function diaLegible(dia: string): string {
  const [a, m, d] = dia.split("-");
  return a && m && d ? `${d}/${m}/${a}` : dia;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/**
 * ¿La identidad fiscal alcanza para emitir? Espeja la validación de
 * `construirPerfilFiscal` (fix 885758b): sin CUIT válido de 11 dígitos, con el
 * viejo placeholder, o sin punto de venta, la emisión LANZA en vez de emitir mal.
 * Acá se detecta ANTES de que falle, que es todo el punto del monitoreo.
 */
export function perfilFiscalCompleto(h: Pick<HechosCliente, "arcaCuit" | "arcaPuntoVenta">): boolean {
  return cuitUtil(h.arcaCuit) && puntoVentaUtil(h.arcaPuntoVenta);
}

function cuitUtil(arcaCuit: string | null): boolean {
  const cuit = (arcaCuit ?? "").replace(/\D/g, "");
  return cuit.length === 11 && cuit !== "20000000000"; // placeholder histórico
}

function puntoVentaUtil(pv: number | null): boolean {
  return pv !== null && pv > 0;
}

/**
 * ¿Lo que emite este cliente tiene validez fiscal? Sólo con ARCA en producción Y el
 * cliente fuera de homologación. En `homologacion` la plataforma fuerza el ARCA de
 * prueba aunque el tenant diga otra cosa (factory.ts, `configParaModo`), y en `stub`
 * el CAE lo inventa el simulador. Un CAE de prueba no es una factura.
 */
export function emiteConValidezFiscal(arcaHomologacion: boolean, modoArca: ModoArca): boolean {
  return modoArca === "real" && !arcaHomologacion;
}

const pesoSeveridad: Record<Severidad, number> = { critico: 100, atencion: 10 };

// ── Evaluación (el corazón, PURO) ────────────────────────────────────────────

/**
 * Evalúa un cliente contra el catálogo de señales.
 *
 * `ahoraIso` entra por parámetro (nunca `new Date()` acá dentro) para que el
 * test fije el reloj y para que una corrida del cron sea reproducible. La
 * plataforma también: el modo de ARCA decide si el certificado importa.
 *
 * Un cliente `pausada` no genera señales: el contador lo pausó a propósito, y
 * llenarlo de alertas es la forma más rápida de que deje de mirar el tablero.
 */
export function evaluarCliente(
  h: HechosCliente,
  ahoraIso: string,
  plataforma: ContextoPlataforma,
): FilaMonitor {
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
  const gsg: Resolucion = { quien: "gsg" };

  // 1. No puede emitir: falta identidad fiscal. La más grave porque es MUDA.
  if (!perfilFiscalCompleto(h)) {
    const faltaCuit = !cuitUtil(h.arcaCuit);
    senales.push({
      id: "perfil_fiscal_incompleto",
      severidad: "critico",
      titulo: "No puede emitir",
      detalle: faltaCuit
        ? h.arcaCuit
          ? `El CUIT cargado (${h.arcaCuit}) no es válido.`
          : "No tiene CUIT cargado."
        : "Falta el punto de venta de ARCA: sin él no sale ningún comprobante.",
      accion: faltaCuit
        ? "Pedíselo a Gestión Studio Grow: el CUIT del emisor se corrige desde su consola."
        : "Pedíselo a Gestión Studio Grow: el punto de venta lo cargan ellos.",
      resuelve: gsg,
    });
  }

  // 2. Certificado: sin credencial, vencido, o por vencer. En modo SIMULADO no se firma
  //    nada y el certificado no se usa: avisarlo por fila sería ruido (va en el aviso de
  //    plataforma). En homologación y en producción SÍ bloquea: la credencial se resuelve
  //    por cliente y sin ella el despacho falla cerrado (arca-dispatch.ts, `crearClientePara`).
  if (plataforma.modoArca !== "stub") {
    if (!h.credencialCargada) {
      senales.push({
        id: "sin_credencial",
        severidad: "critico",
        titulo: "Sin certificado",
        detalle: "No hay certificado de ARCA cargado para este cliente.",
        accion: "Pedíselo a Gestión Studio Grow: el certificado del emisor lo cargan ellos.",
        resuelve: gsg,
      });
    } else if (h.certVenceAt !== null) {
      const dias = diasEntre(ahoraIso, h.certVenceAt);
      if (!Number.isNaN(dias)) {
        if (dias < 0) {
          senales.push({
            id: "cert_vencido",
            severidad: "critico",
            titulo: "Certificado vencido",
            detalle: `Venció hace ${Math.abs(dias)} ${plural(Math.abs(dias), "día", "días")}.`,
            accion: "Renovarlo en ARCA y pedirle a Gestión Studio Grow que cargue el nuevo.",
            resuelve: gsg,
          });
        } else if (dias <= DIAS_AVISO_CERT) {
          senales.push({
            id: "cert_por_vencer",
            severidad: "atencion",
            titulo: "Certificado por vencer",
            detalle: `Vence en ${dias} ${plural(dias, "día", "días")}.`,
            accion: "Renovarlo en ARCA antes de la fecha y pedirle a Gestión Studio Grow que cargue el nuevo.",
            resuelve: gsg,
          });
        }
      }
    }
  }

  // 3. Ya emitió mal: ARCA rechazó comprobantes emitidos este mes. Se cuentan por el
  //    instante de EMISIÓN y no por la fecha del comprobante: el del banco lleva la fecha
  //    del movimiento (bancos-glue.ts, `fecha: mov.fecha`), así que un extracto de agosto
  //    emitido y rechazado en septiembre, por fecha no quedaría en el monitor de septiembre.
  //    No se sabe si ya se reemitió (Invoice no guarda ese enlace): sigue crítico en el mes.
  if (h.rechazadasMes > 0) {
    senales.push({
      id: "facturas_rechazadas",
      severidad: "critico",
      titulo: "Comprobantes rechazados",
      detalle: `ARCA rechazó ${h.rechazadasMes} ${plural(h.rechazadasMes, "comprobante emitido", "comprobantes emitidos")} este mes.`,
      accion: "Revisar el motivo del rechazo y reemitir.",
      resuelve: { quien: "estudio", ruta: "/admin/facturacion" },
    });
  }

  // 4. El despacho está trabado: hay comprobantes que no llegan a ARCA.
  if (h.outboxTrabados > 0) {
    senales.push({
      id: "outbox_trabado",
      severidad: "critico",
      titulo: "Emisión trabada",
      detalle: `${h.outboxTrabados} ${plural(h.outboxTrabados, "comprobante", "comprobantes")} con ${UMBRAL_OUTBOX_TRABADO} o más reintentos fallidos.`,
      accion: "Ver el último error del despacho: suele ser credencial o dato del receptor.",
      resuelve: { quien: "estudio", ruta: "/admin/facturacion" },
    });
  }

  // 5. LÍMITE DE FACTURAS AUTOMÁTICAS DEL PLAN. Es una regla COMERCIAL del producto (159
  //    facturas automáticas por mes, plugins/bancos/domain/reglas.ts), no un tope fiscal ni la
  //    categoría del monotributo: esa depende de los ingresos de 12 meses, superficie, energía
  //    y alquileres, y se revisa por semestre. Nombrarlo "tope" o "cupo" a secas lo hacía
  //    parecer fiscal. Alcanzado frena el automático (banco y Mercado Pago), no la factura
  //    manual. Los ids (`cupo_del_plan`, `cerca_del_cupo`) quedan: son internos.
  if (cap > 0 && h.facturasMes >= cap) {
    senales.push({
      id: "cupo_del_plan",
      severidad: "critico",
      titulo: "Llegó al límite del plan",
      detalle: `Llegó al límite de facturas automáticas del plan: ${h.facturasMes} de ${cap} este mes.`,
      accion: "Ampliar el límite de facturas automáticas del plan en la configuración de su facturación automática.",
      resuelve: { quien: "estudio", ruta: "/admin/facturacion/bancos/configuracion" },
    });
  } else if (cap > 0 && pctCap >= UMBRAL_CAP_ATENCION) {
    senales.push({
      id: "cerca_del_cupo",
      severidad: "atencion",
      titulo: "Cerca del límite del plan",
      detalle: `${h.facturasMes} de ${cap} facturas automáticas del mes (${Math.round(pctCap * 100)}% del límite del plan).`, // no-es-plata: porcentaje
      accion: "Ampliar el límite de facturas automáticas del plan antes de que frene la emisión automática.",
      resuelve: { quien: "estudio", ruta: "/admin/facturacion/bancos/configuracion" },
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
        detalle: `${h.pendientesRevision} ${plural(h.pendientesRevision, "pendiente", "pendientes")}, la más vieja hace ${dias} días.`,
        accion: "Resolver la cola: son ventas que todavía no se facturaron.",
        resuelve: { quien: "estudio", ruta: "/admin/facturacion/bancos#cola-revision" },
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
      resuelve: { quien: "estudio", ruta: "/admin/facturacion/bancos" },
    });
  } else {
    const dias = diasEntre(h.ultimaActividadAt, ahoraIso);
    if (!Number.isNaN(dias) && dias >= DIAS_SILENCIO) {
      senales.push({
        id: "silencio_de_ingesta",
        severidad: "atencion",
        titulo: "En silencio",
        detalle: `Hace ${dias} días que no registra actividad.`,
        accion: "Verificar la conexión de Mercado Pago o pedir el extracto del mes.",
        resuelve: { quien: "estudio", ruta: "/admin/facturacion/bancos" },
      });
    }
  }

  // 8. Caja sin cerrar (sólo clientes CON caja): días con plata registrada que nadie cerró.
  //    Es lo que después impide cerrar el mes. Atención y no crítico: no frena la emisión.
  const pendiente = h.caja?.pendienteDesde ?? null;
  if (pendiente && !Number.isNaN(Date.parse(ahoraIso))) {
    const dias = diasEntreDias(pendiente, dateStrInBusinessTz(new Date(ahoraIso)));
    if (!Number.isNaN(dias) && dias >= DIAS_CAJA_SIN_CERRAR) {
      senales.push({
        id: "caja_sin_cerrar",
        severidad: "atencion",
        titulo: "Caja sin cerrar",
        detalle: `Hay movimientos sin cerrar desde el ${diaLegible(pendiente)}: hace ${dias} ${plural(dias, "día", "días")}.`,
        accion: "Que el negocio cierre esos días en su caja: sin cierre diario no se puede cerrar el mes.",
        resuelve: { quien: "estudio", ruta: "/admin/caja/cierre" },
      });
    }
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

/** La señal que va en la línea de la bandeja: la primera crítica, o la primera que haya. */
export function peorSenal(fila: FilaMonitor): Senal | null {
  return fila.senales.find((s) => s.severidad === "critico") ?? fila.senales[0] ?? null;
}

// ── Agregación del tablero ───────────────────────────────────────────────────

/**
 * Orden del monitor: primero lo que hay que resolver hoy. Desempata por alias y,
 * si dos clientes comparten alias, por id: la lista es ESTABLE entre recargas (si
 * salta de orden con los mismos datos, el contador deja de confiar en ella).
 */
export function ordenarPorUrgencia(filas: FilaMonitor[]): FilaMonitor[] {
  return [...filas].sort(
    (a, b) =>
      b.urgencia - a.urgencia ||
      a.alias.localeCompare(b.alias, "es") ||
      a.clienteTenantId.localeCompare(b.clienteTenantId),
  );
}

/** Las señales que dejan al cliente SIN poder emitir hoy. */
const BLOQUEAN_EMISION: readonly SenalId[] = [
  "perfil_fiscal_incompleto",
  "sin_credencial",
  "cert_vencido",
  "cupo_del_plan",
];

/** ¿Esta fila no puede emitir hoy? */
export function noPuedeEmitir(fila: FilaMonitor): boolean {
  return fila.senales.some((s) => BLOQUEAN_EMISION.includes(s.id));
}

/** Cabecera del monitor. PURA. */
export function resumirMonitor(filas: FilaMonitor[]): ResumenMonitor {
  return {
    total: filas.length,
    criticos: filas.filter((f) => f.estado === "critico").length,
    enAtencion: filas.filter((f) => f.estado === "atencion").length,
    ok: filas.filter((f) => f.estado === "ok").length,
    pausados: filas.filter((f) => f.estado === "pausado").length,
    sinPoderEmitir: filas.filter(noPuedeEmitir).length,
  };
}

/**
 * Condiciones de la PLATAFORMA, una sola vez. PURA.
 *
 * "En prueba" se cuenta sobre los ACTIVOS (los pausados no se muestran en ningún lado de
 * la bandeja). Con ARCA en homologación para toda la plataforma no se cuenta por cliente:
 * ninguno tiene validez fiscal y decirlo una vez alcanza.
 */
export function avisosDePlataforma(
  hechos: HechosCliente[],
  plataforma: ContextoPlataforma,
): AvisoPlataforma[] {
  const avisos: AvisoPlataforma[] = [];
  if (!plataforma.emisionHabilitada) {
    avisos.push({
      id: "emision_apagada",
      texto:
        "La facturación electrónica está apagada en toda la plataforma: ningún comprobante sale hacia ARCA hasta que Gestión Studio Grow la encienda.",
    });
  }
  if (plataforma.modoArca === "stub") {
    avisos.push({
      id: "arca_simulado",
      texto:
        "ARCA está en modo simulado: los comprobantes no llegan a ARCA y sus CAE no son reales. Por eso todavía no se revisan los certificados.",
    });
  } else if (plataforma.modoArca === "homologacion") {
    avisos.push({
      id: "arca_homologacion",
      texto:
        "ARCA está en homologación para toda la plataforma: todo lo que se emite es de prueba y no tiene validez fiscal.",
    });
  } else {
    const enPrueba = hechos.filter((h) => h.estadoCartera === "activa" && h.arcaHomologacion).length;
    if (enPrueba > 0) {
      avisos.push({
        id: "clientes_en_prueba",
        texto: `${enPrueba} ${plural(enPrueba, "cliente está", "clientes están")} en prueba (homologación): lo que ${plural(enPrueba, "emite", "emiten")} no tiene validez fiscal.`,
      });
    }
  }
  return avisos;
}

/** El titular de la bandeja: lo primero que lee el contador. */
export interface TitularMonitor {
  texto: string;
  tono: "peligro" | "neutro";
  /** Una línea más, cuando el titular solo esconde algo que hay que resolver igual. */
  nota: string | null;
}

/**
 * Titular de la bandeja. PURA.
 *
 * Con la emisión apagada en la plataforma ningún comprobante llega a ARCA (el cron del
 * outbox no despacha y `emitirPropuestas` tampoco), así que "Todos pueden emitir"
 * contradice el aviso que va justo abajo. Ahí manda la plataforma; si además hay clientes
 * con un bloqueo PROPIO (punto de venta, certificado, límite del plan), se dice en la nota:
 * son los que siguen sin poder emitir el día que se encienda.
 */
export function titularMonitor(resumen: ResumenMonitor, avisos: readonly AvisoPlataforma[]): TitularMonitor {
  const n = resumen.sinPoderEmitir;
  if (avisos.some((a) => a.id === "emision_apagada")) {
    return {
      texto: "La facturación está apagada: nada sale hacia ARCA",
      tono: "peligro",
      nota:
        n > 0
          ? `Además, ${n} ${plural(n, "tiene", "tienen")} un bloqueo propio que ${plural(n, "le", "les")} va a impedir emitir cuando se encienda.`
          : null,
    };
  }
  if (n > 0) {
    return { texto: `${n} no ${plural(n, "puede", "pueden")} emitir`, tono: "peligro", nota: null };
  }
  return { texto: "Todos pueden emitir", tono: "neutro", nota: null };
}

/** Evalúa la cartera entera y la devuelve ordenada, con su cabecera y los avisos de plataforma. */
export function evaluarCartera(
  hechos: HechosCliente[],
  ahoraIso: string,
  plataforma: ContextoPlataforma,
): { filas: FilaMonitor[]; resumen: ResumenMonitor; avisos: AvisoPlataforma[] } {
  const filas = ordenarPorUrgencia(hechos.map((h) => evaluarCliente(h, ahoraIso, plataforma)));
  return { filas, resumen: resumirMonitor(filas), avisos: avisosDePlataforma(hechos, plataforma) };
}
