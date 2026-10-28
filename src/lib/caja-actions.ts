"use server";

// Capability CAJA del POS — turno de mostrador + arqueo (cierra el agujero del
// vertical retail). Server Actions scoped por tenant, mismo patrón que
// order-actions.ts: requireCapability al tope, getCurrentTenantId (fail-closed
// ADR-015) en cada write, audit + revalidatePath al terminar.
//
// La ARITMÉTICA del arqueo NO vive acá: el esperado es el saldo en efectivo del libro
// (src/lib/caja/saldo-cajon.ts, ADR-101) y la diferencia de apertura es pura en
// src/lib/caja/cierre-marca.ts. Estas acciones solo orquestan la persistencia.
//
// Reusa la capability `orders:manage` (mostrador): abrir/cerrar caja y registrar
// movimientos es trabajo de mostrador del mismo tenor que tomar y cobrar pedidos.
// No se agrega una capability nueva para no inflar el modelo RBAC (gobierno
// calidad-vs-costo); si más adelante hace falta separar "arqueo" de "vender", se
// agrega un renglón en capabilities.ts sin tocar estos guardas.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/audit-core";
// GUARDA DE DÍA CERRADO — el QA de recorrido la encontró faltando acá y el agujero era
// real: con el 07/09 ya cerrado y congelado desde el libro, esta pantalla dejaba registrar
// un egreso CON FECHA 07/09 sin decir nada, y el saldo del día siguiente pasaba de los
// $2.400 contados a −$5.300. O sea: el sistema decía "este día está congelado" en una
// pantalla y lo movía desde otra. La frontera es una sola y ahora la miran las dos.
import { lastClosedDay, lastClosedDayTx } from "@/lib/caja/frontera-cierre";
import { ajusteDeArqueoTurno, diferenciaDeApertura } from "@/lib/caja/cierre-marca";
import { arqueoContraElLibro, finDelDiaDelNegocio, saldoEfectivoDelLibro } from "@/lib/caja/saldo-cajon";
import { CAMPO_ESPERADO_CONFIRMADO, esperadoConfirmadoVigente } from "@/lib/caja/esperado-del-cajon";
import { isFrozenDay, frozenDayMessage, notaFaltanteDelArqueo } from "@/lib/caja/cierre-diario";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { tenantTransaction } from "@/lib/rls";
import { Prisma } from "@/generated/prisma/client";
import { isDemoSandbox, getDemoCajaData, DEMO_WRITE_BLOCKED } from "@/lib/demo-sandbox";
import { leerImporte } from "@/lib/pos-peso";
import { round2 } from "@/lib/round";
import {
  APERTURA_A_CIEGAS_ACTION,
  aperturaPideMotivo,
  detalleConMotivo,
  detalleDeAperturaTrasConteoCiego,
  leerConteoACiegas,
  leerMotivoDeApertura,
  recuentoACiegasPideMotivo,
  textoDelMotivoDeApertura,
  textoDelRecuentoACiegas,
  type ConteoACiegas,
} from "@/lib/caja/apertura-sugerida";
import { tarjetaHabilitadaPor } from "@/lib/caja/medio-cobro";
import { arqueoCiegoDelNegocio } from "@/lib/caja/arqueo-ciego";
import { cajaALaVista } from "@/lib/caja/arqueo-ciego-core";

const CAJA_PATH = "/admin/caja";
const VENDER_PATH = "/admin/vender";

// Resultado de las acciones de formulario de caja, para `useActionState` en la UI.
// `null` = estado inicial (ocioso). En vez de lanzar (que rompe el flujo con la
// pantalla de error de Next), las acciones DEVUELVEN el error de validación/dominio
// para mostrarlo inline junto al formulario. Los mensajes ya son texto amable en
// español (van directo a la UI del mostrador).
export type CajaActionState =
  | { ok: true }
  // `yaAbierta`: el rechazo es porque YA hay una caja abierta (otra pestaña, el doble toque). La
  // tarjeta de Vender (AbrirCajaEnLinea) lo toma como «listo» y recarga; el formulario de Caja
  // muestra el texto como siempre.
  | { ok: false; error: string; yaAbierta?: true; pideMotivo?: undefined }
  // `pideMotivo` (N2 · M1-C3): el conteo de la apertura no coincide con el libro y falta el porqué.
  // No se grabó nada. Trae el esperado para mostrarlo RECIÉN AHORA (a ciegas no se vio antes) y que
  // el segundo envío lo confirme junto con el motivo.
  // `primerConteo`: hubo un conteo a ciegas que no cuadró (queda en la Auditoría); el motivo se pide
  // aunque el recuento cuadre, y la pantalla dice los dos números.
  | { ok: false; error: string; pideMotivo: { esperado: number; diferencia: number; primerConteo?: number }; yaAbierta?: undefined }
  | null;

/** El rechazo de abrir con una caja ya abierta (lo lee `openCashSession` para marcar `yaAbierta`). */
const YA_HAY_CAJA_ABIERTA = "Ya hay una caja abierta. Cerrá el turno actual antes de abrir otro.";

// Traduce un error (de validación propia o de dominio lanzado dentro de la
// transacción) al estado de error de la UI. Un error inesperado no filtra detalles
// internos: cae a un mensaje genérico.
function toActionError(err: unknown): { ok: false; error: string } {
  const msg = err instanceof Error && err.message ? err.message : "No se pudo completar la operación.";
  return { ok: false, error: msg };
}

function parseAmount(raw: FormDataEntryValue | null): number {
  // Plata escrita como se escribe acá: "12.500" son doce mil quinientos y "12,5" doce con
  // cincuenta. Antes era `Number(raw.replace(",", "."))`, que leía "12.500" como 12,5 y
  // "1.234,56" como NaN. Lo ilegible y lo vacío vuelven NaN: el llamador lo rechaza con
  // mensaje en vez de asentar un número que nadie tipeó.
  const l = leerImporte(String(raw ?? ""));
  return l.estado === "ok" ? l.valor : NaN;
}

// ¿El negocio abre la caja a ciegas? → `arqueoCiegoDelNegocio` (caja/arqueo-ciego.ts): la misma
// lectura la usa `getCierreDiarioData` para no pintar el efectivo al lado del formulario (cert F7).

/** No se graba nada: la apertura necesita el motivo de la diferencia (vuelve como `pideMotivo`). */
class PideMotivoDeApertura extends Error {
  constructor(
    readonly esperado: number,
    readonly diferencia: number,
    readonly contado: number,
    /** El conteo a ciegas que no cuadró y ya quedó escrito (o null: éste es el primero). */
    readonly ciego: ConteoACiegas | null = null,
    /** ¿Este envío fue a ciegas (sin ver el esperado)? Entonces el conteo se guarda. */
    readonly fueACiegas = false,
  ) {
    super(ciego ? textoDelRecuentoACiegas(ciego, contado, esperado) : textoDelMotivoDeApertura(contado, esperado));
  }
}

/** El día se cerró mientras se abría el turno (releído adentro de la transacción): no se abre. */
class DiaCerradoAlAbrir extends Error {}

/**
 * A ciegas (cert F6): llegó un esperado «confirmado» sin un conteo a ciegas escrito, y el fondo
 * coincide con el libro. No se abre (no hubo conteo a ciegas) y el mensaje NO dice el número.
 */
class EsperadoVistoSinContarACiegas extends Error {
  constructor() {
    super("Con el arqueo a ciegas, la caja se abre contando sin ver lo que dice el sistema. No se abrió: recargá la página y volvé a contar el cajón.");
  }
}

/**
 * El primer conteo a ciegas que no cuadró y todavía no terminó en una apertura (N2 · M1-C3): la
 * fila `caja.apertura-a-ciegas` posterior al último turno abierto del negocio. Adentro de la
 * transacción de la apertura. Sólo lectura.
 */
async function conteoACiegasPendiente(tx: Prisma.TransactionClient, tenantId: string): Promise<ConteoACiegas | null> {
  const ultimoTurno = await tx.cashSession.findFirst({ where: { tenantId }, orderBy: { openedAt: "desc" }, select: { openedAt: true } });
  const fila = await tx.auditLog.findFirst({
    where: {
      tenantId,
      entity: "CashSession",
      action: APERTURA_A_CIEGAS_ACTION,
      ...(ultimoTurno ? { createdAt: { gt: ultimoTurno.openedAt } } : {}),
    },
    // El PRIMERO: el conteo a ciegas de verdad (los recuentos que siguen ya vieron el esperado).
    orderBy: { createdAt: "asc" },
    select: { changes: true },
  });
  return fila ? leerConteoACiegas(fila.changes) : null;
}

/**
 * ¿Se puede cobrar con Tarjeta en este negocio? (N2 · M1-C1). Hacen falta las dos cosas: el valor
 * `TARJETA` en el enum `PaymentMethod` de la base (N2_enums.sql, probe con caché por proceso) y en
 * el cliente de Prisma generado (prisma/schema.prisma, `// N2-enum: TARJETA`). Con una sola, Prisma
 * rechaza el alta o rompe la lectura de pedidos (ver medio-cobro.ts). Sólo lectura.
 */
export async function tarjetaHabilitada(): Promise<boolean> {
  await requireCapability("orders:read");
  const { PaymentMethod } = await import("@/generated/prisma/enums");
  const enElCliente = (Object.values(PaymentMethod) as string[]).includes("TARJETA");
  if (!enElCliente) return false;
  const { hayValorEnum } = await import("@/lib/schema-probe");
  return tarjetaHabilitadaPor({ enLaBase: await hayValorEnum("PaymentMethod", "TARJETA"), enElCliente });
}

// --- Loader de la pantalla de caja ---
//
// Devuelve la sesión ABIERTA del tenant (si hay) con sus movimientos, más las
// últimas sesiones cerradas para el histórico. Guard de lectura por `orders:read`.
export async function getCajaData() {
  await requireCapability("orders:read");
  if (isDemoSandbox()) return { ...getDemoCajaData(), esperadoEnElCajon: null, aperturaACiegas: false };
  const tenantId = await getCurrentTenantId();
  const [open, recentClosed] = await Promise.all([
    prisma.cashSession.findFirst({
      where: { tenantId, status: "OPEN" },
      orderBy: { openedAt: "desc" },
      include: { movements: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.cashSession.findMany({
      where: { tenantId, status: "CLOSED" },
      orderBy: { closedAt: "desc" },
      take: 10,
    }),
  ]);
  // El MISMO número con el que `openCashSession` y `closeCashSession` comparan el conteo
  // (ADR-101): el saldo en efectivo del libro. Las pantallas lo muestran como «Efectivo esperado
  // en el cajón» (`esperadoDelCajon`, esperado-del-cajon.ts) y el formulario lo devuelve al
  // grabar, así lo confirmado y lo asentado son el mismo número. Con o sin turno abierto: al
  // abrir también se cuenta contra él.
  // A CIEGAS (interruptor «arqueo-ciego», cert F6): sin turno abierto, la pantalla Caja abre
  // contando sin ver el esperado. El número ni viaja a la pantalla: lo dice el servidor si no cuadra.
  // EL BORDE (cert F8): la salida pasa por `cajaALaVista`, que además saca los turnos cerrados
  // («contó X sobre Y»: lo esperado al cerrar el último turno es el libro al abrir el siguiente).
  // A ciegas no se paga la consulta del saldo, que igual se blanquearía.
  const aperturaACiegas = !open && (await arqueoCiegoDelNegocio(tenantId));
  const esperadoEnElCajon: number | null = aperturaACiegas
    ? null
    : await tenantTransaction((tx) => saldoEfectivoDelLibro(tx, tenantId, finDelDiaDelNegocio(new Date())), { tenantId });
  return cajaALaVista({ open, recentClosed, esperadoEnElCajon, aperturaACiegas });
}

// --- Abrir turno de caja ---
//
// Crea la sesión OPEN con el fondo inicial declarado y materializa un movimiento
// APERTURA (para que el ledger del turno arranque completo). El fondo es un CONTEO del cajón:
// si no coincide con el saldo en efectivo del libro, la diferencia se asienta ACÁ, una vez, con
// la marca del turno (ADR-101). Así libro, turno y cierre del día parten del mismo número. Falla si ya hay una
// sesión abierta: un solo mostrador por tenant (invariante de dominio, no de
// schema). Todo dentro de una transacción tenant-aware.
//
// M-1 · CONCURRENCIA: el check-then-insert (leer "no hay OPEN" → crear OPEN) en
// ReadCommitted deja pasar DOS aperturas simultáneas —ambas leen "no hay" antes de que
// cualquiera inserte→ y quedan dos turnos OPEN, con lo que el arqueo no cuadra. Se cierra
// con el MISMO patrón que el overbooking (ADR-004/023, `bookingTransaction`): nivel
// SERIALIZABLE + reintento. Postgres SSI detecta la dependencia lectura↔escritura de las
// dos aperturas y aborta una con serialization_failure (P2034); `tenantTransaction`
// reintenta, y en la 2ª pasada la apertura ya commiteada es visible → el check dispara el
// error de dominio "ya hay una caja abierta". Sin índice ni migración: efectivo ya.
export async function openCashSession(
  _prev: CajaActionState,
  formData: FormData,
): Promise<CajaActionState> {
  const user = await requireCapability("orders:manage");
  if (isDemoSandbox()) return DEMO_WRITE_BLOCKED;
  const tenantId = await getCurrentTenantId();
  const openingFloat = parseAmount(formData.get("openingFloat"));
  if (!Number.isFinite(openingFloat) || openingFloat < 0) {
    return { ok: false, error: "El fondo inicial tiene que ser un monto válido (0 o más)." };
  }
  const actor = `user:${user.id}`;
  const motivo = leerMotivoDeApertura(formData.get("motivo"));

  const congelado = await rechazarSiElDiaEstaCerrado(tenantId);
  if (congelado) return congelado;
  // A CIEGAS (N2 · M1-C3): el primer envío llega sin el esperado (el cajero no lo vio). Si cuadra,
  // abre; si no, no se graba nada y se contesta con el esperado y el pedido de motivo. Con el
  // interruptor prendido la diferencia SIEMPRE lleva motivo, venga de la pantalla que venga.
  const aCiegas = await arqueoCiegoDelNegocio(tenantId);
  const crudoConfirmado = formData.get(CAMPO_ESPERADO_CONFIRMADO);
  const sinVerElEsperado = aCiegas && (typeof crudoConfirmado !== "string" || crudoConfirmado.trim() === "");

  let session: { id: string; saldoDelLibro: number; diferenciaDeApertura: number; ciego: ConteoACiegas | null };
  try {
    session = await tenantTransaction(async (tx) => {
      // M1-C5 (cert F4): el MISMO candado por negocio que cerrar el día (`cerrarDia`) y reabrirlo, y
      // la frontera releída ADENTRO: un cierre que corre a la vez termina antes y esta apertura lo ve
      // (o el ciclo SSI frontera↔turno la aborta y el reintento lo ve). Nunca un día cerrado con un
      // turno abierto.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cierre-dia:${tenantId}`}))`;
      const cerradoHasta = await lastClosedDayTx(tx, tenantId);
      const hoyDelNegocio = dateStrInBusinessTz(new Date());
      if (cerradoHasta && isFrozenDay(hoyDelNegocio, cerradoHasta)) throw new DiaCerradoAlAbrir(frozenDayMessage(hoyDelNegocio, cerradoHasta));
      const already = await tx.cashSession.findFirst({
        where: { tenantId, status: "OPEN" },
        select: { id: true },
      });
      if (already) {
        throw new Error(YA_HAY_CAJA_ABIERTA);
      }
      const ahora = new Date();
      // Leído en la MISMA transacción Serializable: una venta que entre en paralelo aborta una
      // de las dos y el reintento vuelve a leer, así la diferencia nunca se calcula sobre un
      // saldo viejo.
      const saldoDelLibro = await saldoEfectivoDelLibro(tx, tenantId, finDelDiaDelNegocio(ahora));
      const diferenciaContada = round2(openingFloat - saldoDelLibro);
      // Un conteo a ciegas anterior que no cuadró (ya escrito): el motivo se pide aunque éste cuadre,
      // y la apertura lleva los dos números (cert F3: «recontar» al número del libro no lo borra).
      const ciego = aCiegas ? await conteoACiegasPendiente(tx, tenantId) : null;
      // A ciegas, el esperado sólo se pudo ver si el servidor lo dijo: después de un conteo a ciegas
      // escrito. Uno que llega SIN ese conteo (una pantalla que lo mostró, un envío a mano, un número
      // inventado) no se confirma (cert F6): si cuadra, no abre y no se dice nada; si no cuadra, es
      // un conteo a ciegas más: queda escrito y recién ahí se dice el esperado y se pide el motivo.
      const vioSinContarACiegas = aCiegas && !sinVerElEsperado && ciego === null;
      if (vioSinContarACiegas && diferenciaContada === 0) throw new EsperadoVistoSinContarACiegas();
      const fueACiegas = sinVerElEsperado || vioSinContarACiegas;
      // Lo que la cajera vio antes de confirmar tiene que ser lo que se asienta: si el libro se
      // movió mientras contaba, no se abre y se le dice el número nuevo.
      // A ciegas, el primer envío no trae esperado: no hay nada que confirmar todavía.
      if (!fueACiegas) {
        const vigente = esperadoConfirmadoVigente(crudoConfirmado, saldoDelLibro);
        if (!vigente.ok) throw new Error(vigente.error);
      }
      if (recuentoACiegasPideMotivo({ ciego, motivo })) {
        // Un recuento que tampoco cuadra y tampoco vio el esperado (otra pestaña) también queda escrito.
        throw new PideMotivoDeApertura(saldoDelLibro, diferenciaContada, openingFloat, ciego, fueACiegas && diferenciaContada !== 0);
      }
      // Con diferencia: a ciegas sin haber visto el esperado, o sin motivo → no se graba nada.
      if (diferenciaContada !== 0 && (fueACiegas || aperturaPideMotivo({ diferencia: diferenciaContada, motivo, exigido: aCiegas }))) {
        throw new PideMotivoDeApertura(saldoDelLibro, diferenciaContada, openingFloat, null, fueACiegas);
      }
      const creada = await tx.cashSession.create({
        data: {
          tenantId,
          status: "OPEN",
          openedBy: actor,
          openingFloat,
          openedAt: ahora,
          movements: {
            create: {
              tenantId,
              type: "APERTURA",
              amount: openingFloat,
              reason: ciego ? detalleDeAperturaTrasConteoCiego(ciego, openingFloat, motivo) : "Fondo inicial de caja",
              occurredAt: ahora,
              createdBy: actor,
            },
          },
        },
        select: { id: true },
      });
      // `sessionId` NULL a propósito: la diferencia ya está adentro del fondo contado, y el
      // esperado en vivo de la pantalla (fondo + movimientos del turno) la contaría dos veces.
      // El rastro al turno va en la marca (`apertura-turno:<id>`): quién es su `openedBy`.
      const diferencia = diferenciaDeApertura(openingFloat, saldoDelLibro, creada.id);
      if (diferencia) {
        await tx.cashMovement.create({
          data: { tenantId, sessionId: null, occurredAt: ahora, ...diferencia, reason: detalleConMotivo(diferencia.reason, motivo) },
        });
      }
      const conSigno = diferencia ? (diferencia.type === "INGRESO" ? diferencia.amount : -diferencia.amount) : 0;
      return { id: creada.id, saldoDelLibro, diferenciaDeApertura: conSigno, ciego };
    }, { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (err) {
    if (err instanceof Error && err.message === YA_HAY_CAJA_ABIERTA) return { ok: false, error: YA_HAY_CAJA_ABIERTA, yaAbierta: true };
    if (err instanceof DiaCerradoAlAbrir) return { ok: false, error: err.message };
    if (err instanceof EsperadoVistoSinContarACiegas) return { ok: false, error: err.message };
    if (err instanceof PideMotivoDeApertura) {
      // A ciegas y sin cuadrar: el conteo queda escrito ANTES de revelar el esperado (cert F3). Es la
      // fila que después obliga al motivo y deja los dos números en la apertura.
      if (err.fueACiegas) {
        await tenantTransaction(
          (tx) =>
            tx.auditLog.create({
              data: {
                tenantId,
                actor,
                action: APERTURA_A_CIEGAS_ACTION,
                entity: "CashSession",
                entityId: null,
                channel: "admin",
                changes: { contadoACiegas: err.contado, esperado: err.esperado, diferencia: err.diferencia, por: user.name },
              },
            }),
          { tenantId },
        );
      }
      return {
        ok: false,
        error: err.message,
        pideMotivo: { esperado: err.esperado, diferencia: err.diferencia, ...(err.ciego ? { primerConteo: err.ciego.contado } : {}) },
      };
    }
    return toActionError(err);
  }

  await auditAdmin({
    action: "open",
    entity: "CashSession",
    entityId: session.id,
    changes: {
      openingFloat,
      saldoDelLibro: session.saldoDelLibro,
      diferenciaDeApertura: session.diferenciaDeApertura,
      ...(aCiegas ? { aCiegas: true } : {}),
      ...(motivo && (session.diferenciaDeApertura !== 0 || session.ciego) ? { motivo } : {}),
      ...(session.ciego ? { contadoACiegas: session.ciego.contado, esperadoACiegas: session.ciego.esperado } : {}),
    },
  });
  revalidatePath(CAJA_PATH);
  // La tarjeta «Abrí la caja» de Vender (Magra, tanda 2 · 2D) abre desde ahí: Vender también cambia.
  revalidatePath(VENDER_PATH);
  return { ok: true };
}

// --- Abrir la caja desde Vender (Magra, tanda 2 · 2D; magra-DISENO.md E21 · MG-057) ---
//
// Lo que necesita la tarjeta «Abrí la caja: ayer quedaron $X en el cajón» (vender/AbrirCajaEnLinea):
// el FONDO SUGERIDO y desde cuándo. El fondo sugerido es el MISMO número contra el que
// `openCashSession` cuenta (ADR-101): el saldo en efectivo del libro, que después de un cierre es
// lo que se contó al cerrar (con su diferencia ya asentada) más lo que se movió después (un retiro
// del dueño, por ejemplo). Así «Abrir con $X» abre SIN diferencia, y «Conté otro» deja asentada la
// diferencia una sola vez, con la regla de siempre. La apertura en sí es `openCashSession`: acá no
// se escribe nada.
//
// `null` cuando no corresponde la tarjeta: ya hay una caja abierta, hoy ya está cerrado (no se
// puede abrir) o es la demo. Pide `orders:manage`: lo mismo que abrir.
export type AperturaSugerida = {
  /** El fondo sugerido: el efectivo que el libro dice que hay en el cajón. */
  esperado: number;
  /** El último día cerrado (`lastClosedDay`), o null si nunca se cerró uno. */
  ultimoCierre: string | null;
  /** Hoy, en el día del negocio. */
  hoy: string;
  /**
   * A ciegas (interruptor «arqueo-ciego», N2 · M1-C3): la tarjeta pide contar sin mostrar el número,
   * y `esperado` viaja en 0 para que ni siquiera llegue al navegador.
   */
  aCiegas: boolean;
};

export async function getAperturaEnVender(): Promise<AperturaSugerida | null> {
  await requireCapability("orders:manage");
  if (isDemoSandbox()) return null;
  const tenantId = await getCurrentTenantId();
  const hoy = dateStrInBusinessTz(new Date());
  const ultimoCierre = await lastClosedDay(tenantId);
  if (ultimoCierre && isFrozenDay(hoy, ultimoCierre)) return null;
  const aCiegas = await arqueoCiegoDelNegocio(tenantId);
  return tenantTransaction(
    async (tx) => {
      const abierta = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
      if (abierta) return null;
      if (aCiegas) return { esperado: 0, ultimoCierre: ultimoCierre ?? null, hoy, aCiegas };
      const esperado = await saldoEfectivoDelLibro(tx, tenantId, finDelDiaDelNegocio(new Date()));
      return { esperado, ultimoCierre: ultimoCierre ?? null, hoy, aCiegas };
    },
    { tenantId },
  );
}

// El alta manual de movimientos se fue de acá: la escribe `addLibroEntry`
// (src/lib/libro-caja-actions.ts), que es el único camino manual del negocio. Esta acción
// no tenía selector de medio —toda fila caía en `@default(EFECTIVO)`— y además exigía un
// turno de cajero abierto, que en un negocio de servicios no existe nunca: desde la Caja no
// se podía registrar un gasto en absoluto. `addLibroEntry` engancha el asiento al turno
// abierto cuando lo hay, así que el mostrador con cajón no pierde nada.

/**
 * Frena cualquier escritura de caja sobre un día ya cerrado. Se llama ANTES de abrir la
 * transacción y devuelve el mismo mensaje que el libro, para que la persona lea siempre lo mismo.
 * Es el aviso temprano: un cierre puede commitear entre esta lectura y la escritura, por eso
 * `openCashSession` la vuelve a leer adentro de su transacción, con el candado del cierre (cert F4).
 */
async function rechazarSiElDiaEstaCerrado(tenantId: string): Promise<CajaActionState | null> {
  const cerradoHasta = await lastClosedDay(tenantId);
  if (!cerradoHasta) return null;
  const hoy = dateStrInBusinessTz(new Date());
  if (!isFrozenDay(hoy, cerradoHasta)) return null;
  return { ok: false, error: frozenDayMessage(hoy, cerradoHasta) };
}

// --- Cerrar turno de caja (arqueo) ---
//
// Toma el efectivo CONTADO declarado, lo arquea contra el saldo en efectivo del LIBRO (el
// mismo esperado que el cierre del día, ADR-101; antes era `reconcileCash` sobre el fondo
// tipeado + los movimientos del turno, y los dos esperados se separaban) y CONGELA el
// arqueo en la sesión (closingExpected/closingCounted/closingDiff). El histórico
// queda inmutable: no recalcula después aunque se toque algo.
export async function closeCashSession(
  _prev: CajaActionState,
  formData: FormData,
): Promise<CajaActionState> {
  const user = await requireCapability("orders:manage");
  if (isDemoSandbox()) return DEMO_WRITE_BLOCKED;
  const tenantId = await getCurrentTenantId();
  const counted = parseAmount(formData.get("counted"));
  if (!Number.isFinite(counted) || counted < 0) {
    return { ok: false, error: "El efectivo contado tiene que ser un monto válido (0 o más)." };
  }
  const note = String(formData.get("note") || "").trim() || null;
  const actor = `user:${user.id}`;

  // También al CERRAR. La primera pasada de esta guarda cubrió los dos caminos que
  // escriben un `CashMovement` (abrir y registrar), y el cierre del turno no escribe
  // ninguno — pero congela `closingDiff` en la sesión, o sea deja un SEGUNDO faltante
  // declarado sobre un día que el libro ya dio por contado, y que ningún libro lee.
  // Es el defecto de la planilla —el faltante anotado al margen— con otra ropa.
  const diaCerrado = await rechazarSiElDiaEstaCerrado(tenantId);
  if (diaCerrado) return diaCerrado;

  let result: { id: string } & ReturnType<typeof arqueoContraElLibro>;
  try {
    result = await tenantTransaction(async (tx) => {
      const session = await tx.cashSession.findFirst({
        where: { tenantId, status: "OPEN" },
        select: { id: true },
      });
      if (!session) {
        throw new Error("No hay una caja abierta para cerrar.");
      }
      // UN SOLO ESPERADO (ADR-101): el saldo en efectivo del libro hasta el final de hoy, con la
      // misma cuenta y el mismo borde que el cierre del día. Incluye el efectivo que no pasó por
      // el turno (una reversa de un cobro de otro turno, un asiento sin turno): sale del cajón
      // igual, y si el turno no lo ve, el día lo asienta como faltante.
      const saldoDelLibro = await saldoEfectivoDelLibro(tx, tenantId, finDelDiaDelNegocio(new Date()));
      // El esperado que el cajero confirmó en la pantalla («Contaste X y se esperaba Y») tiene
      // que ser este mismo: si no, no se cierra (entró un movimiento mientras contaba).
      const vigente = esperadoConfirmadoVigente(formData.get(CAMPO_ESPERADO_CONFIRMADO), saldoDelLibro);
      if (!vigente.ok) throw new Error(vigente.error);
      const arqueo = arqueoContraElLibro(saldoDelLibro, counted);
      // Con diferencia, la nota es obligatoria (como en el cierre del día): un faltante sin
      // porqué es justo lo que después nadie puede explicar. Se decide con el arqueo de ACÁ
      // (el del libro), no con el de la pantalla.
      const faltaNota = notaFaltanteDelArqueo(arqueo.diff, note);
      if (faltaNota) throw new Error(faltaNota);

      await tx.cashSession.update({
        where: { id: session.id },
        data: {
          status: "CLOSED",
          closedBy: actor,
          closingExpected: arqueo.expected,
          closingCounted: arqueo.counted,
          closingDiff: arqueo.diff,
          closingNote: note,
          closedAt: new Date(),
        },
      });

      // La diferencia del arqueo SE ASIENTA EN EL LIBRO, en la misma transacción.
      //
      // Antes vivía sólo en `closingDiff`, y el libro deriva su saldo SUMANDO movimientos:
      // un faltante contado en el cajón no llegaba a ningún lado. El 07/09 quedó un turno
      // con la diferencia varada en la sesión mientras el libro seguía diciendo otra cosa.
      //
      // Signo: el conteo físico manda. Contado > esperado ⇒ entró plata que el sistema no
      // tenía (INGRESO); contado < esperado ⇒ falta (EGRESO). Siempre EFECTIVO: el arqueo
      // de turno cuenta el cajón y nada más.
      //
      // `sessionId` va apuntando al turno que la produjo, pero eso NO la mete en el arqueo
      // de ese turno: la sesión ya quedó CLOSED en esta misma transacción y su esperado
      // quedó congelado arriba. Es trazabilidad, no aritmética.
      const ajuste = ajusteDeArqueoTurno(arqueo.diff, session.id);
      if (ajuste) {
        await tx.cashMovement.create({ data: { tenantId, sessionId: session.id, ...ajuste } });
      }

      return { id: session.id, ...arqueo };
    }, { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (err) {
    return toActionError(err);
  }

  await auditAdmin({
    action: "close",
    entity: "CashSession",
    entityId: result.id,
    changes: { expected: result.expected, counted: result.counted, diff: result.diff },
  });
  revalidatePath(CAJA_PATH);
  return { ok: true };
}
