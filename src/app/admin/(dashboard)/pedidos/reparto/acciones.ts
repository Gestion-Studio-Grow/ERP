"use server";

// ============================================================================
// EL REPARTO — las acciones de «Armar reparto» y «Rendición del cadete» (Magra, tanda 2 · 2C).
// ============================================================================
//
// Cada export de un archivo "use server" es un endpoint: todos piden `orders:manage` (el
// recordatorio, `orders:read`, como la constancia de siempre), exigen el mostrador boutique prendido
// en un comercio y acotan todo por el `tenantId` de la sesión. Un id de otro negocio no se
// encuentra: rechazo y nada grabado.
//
// LA PLATA NO SE MUEVE ACÁ. Cobrar y entregar lo hacen las acciones de siempre, con sus reglas:
// `cobrarPedido` (medio obligatorio, día cerrado, sólo lo que no estaba cobrado, el total de la
// BASE, idempotente por la clave del cobro) y `entregarPedido` (compare-and-set sobre Listo). Lo
// único que escribe este archivo son las marcas del reparto en la auditoría del pedido
// (reparto-core.ts): salió, volvió, se rindió. La de «se rindió», una sola por pedido (candado).

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditAdmin } from "@/lib/audit-core";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { mostradorBoutiquePrendido } from "@/cambios/interruptores";
import { cobrarPedido, entregarPedido, type OrderActionState } from "@/lib/order-actions";
import { leerPagos } from "@/lib/cobro/leer-pagos";
import { leerMedioDeCobro } from "@/lib/caja/medio-cobro";
import { textoPlata } from "@/lib/cobro/pie-de-cobro-core";
import { decidirFiadoDeLaEntrega } from "@/lib/clientes/fiado.server";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentUser } from "@/lib/session";
import { logger } from "@/lib/logger";
import {
  ACCION_REPARTO,
  cobradoAntesDeSalir,
  cobroDelLibro,
  idDeReparto,
  leerMarcaDeReparto,
  rendicionDelYaPago,
  mensajeDeLoDejadoSinCobrar,
  type MarcaDeReparto,
  type ResultadoDeRendicion,
} from "./reparto-core";
import { consultaDeVentasDelLibro, ultimaMarcaConFecha, ultimaMarcaDelPedido, ventasDeLasFilas, ventasDelLibro } from "./datos.server";
import { mensajeDeRendirTodo, type EnvioRendidoDeUnaVez } from "./rendicion/rendir-todo";

const RUTAS = ["/admin/pedidos", "/admin/pedidos/reparto", "/admin/pedidos/reparto/rendicion"];
const MAX_POR_SALIDA = 60;
const MAX_TEXTO = 120;

const APAGADO = "El reparto es parte del mostrador nuevo y no está prendido en este negocio.";

async function mostradorBoutique(): Promise<boolean> {
  const [identidad, interruptores] = await Promise.all([getTenantIdentity(), interruptoresDelNegocio()]);
  return identidad.isRetail && mostradorBoutiquePrendido(interruptores);
}

function revalidar() {
  for (const r of RUTAS) revalidatePath(r);
}

function texto(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXTO);
  return s || null;
}

async function marcar(orderId: string, marca: MarcaDeReparto) {
  await auditAdmin({ action: ACCION_REPARTO, entity: "Order", entityId: orderId, changes: marca });
}

export type ResultadoDeSalida = { ok: true; mensaje: string; salieron: number[] } | { ok: false; error: string };

/**
 * «Salió el cadete»: marca en la calle los envíos LISTOS de la hoja (`id`, uno por envío). Los que
 * ya salieron no se vuelven a marcar y los que todavía no están listos no salen (se dice cuáles).
 * Si algún id no es un envío de este negocio, no se marca ninguno.
 */
export async function salioElReparto(formData: FormData): Promise<ResultadoDeSalida> {
  await requireCapability("orders:manage");
  if (!(await mostradorBoutique())) return { ok: false, error: APAGADO };
  const tenantId = await getCurrentTenantId();
  const ids = [...new Set(formData.getAll("id").map((v) => String(v).trim()).filter(Boolean))];
  if (ids.length === 0) return { ok: false, error: "No hay envíos listos en esta hoja: no salió nada." };
  if (ids.length > MAX_POR_SALIDA) return { ok: false, error: `Son muchos envíos para una salida (hasta ${MAX_POR_SALIDA}).` };

  const ordenes = await prisma.order.findMany({
    where: { tenantId, id: { in: ids }, fulfillment: "DELIVERY" },
    select: { id: true, code: true, status: true },
  });
  if (ordenes.length !== ids.length) {
    return { ok: false, error: "Algún envío de la hoja ya no está (o no es de este negocio). Recargá la hoja: no salió nada." };
  }
  const reparto = idDeReparto(new Date(), Math.random());
  const franja = texto(formData.get("franja"));
  const cadete = texto(formData.get("cadete"));
  const salieron: number[] = [];
  const sinListo: number[] = [];
  for (const o of ordenes.sort((a, b) => a.code - b.code)) {
    if (o.status !== "READY") {
      sinListo.push(o.code);
      continue;
    }
    // Ya en la calle (otra pantalla, o el doble toque): no se marca de nuevo.
    if ((await ultimaMarcaDelPedido(tenantId, o.id))?.tipo === "salio") continue;
    await marcar(o.id, { tipo: "salio", reparto, franja, cadete });
    salieron.push(o.code);
  }
  revalidar();
  const partes = [
    salieron.length === 0
      ? "No salió ninguno nuevo: los listos ya estaban en la calle."
      : `${salieron.length === 1 ? "Salió 1 envío" : `Salieron ${salieron.length} envíos`} con el cadete (${salieron.map((c) => `#${c}`).join(", ")}).`,
  ];
  if (sinListo.length) partes.push(`No salieron porque no están listos: ${sinListo.map((c) => `#${c}`).join(", ")}.`);
  return { ok: true, mensaje: partes.join(" "), salieron };
}

const RESULTADOS = new Set(["cobrado", "ya-pago", "a-cobrar", "volvio"]);
type ComoSeRinde = "cobrado" | "ya-pago" | "a-cobrar" | "volvio" | "como-salio";

function formularioDe(pares: [string, string][]): FormData {
  const fd = new FormData();
  for (const [k, v] of pares) fd.append(k, v);
  return fd;
}

type MarcaRendido = Extract<MarcaDeReparto, { tipo: "rendido" }>;

/**
 * La marca «rendido» se graba UNA vez por pedido (doble envío, dos puestos, «Rindió todo» dos
 * veces): con el candado de la transacción sobre el pedido, se relee la última marca y, si ya es
 * «rendido», no se escribe otra. La segunda espera a que la primera termine y la ve. El candado
 * se suelta solo al cerrar la transacción (xact), así que con el pooler no queda colgado.
 * Como la auditoría de siempre, no lanza: la plata ya quedó en su lugar con sus propias reglas.
 *
 * CERT-magra-tpractica (carrera de dos puestos): «a cobrar» se decidió con el pedido leído FUERA
 * del candado; si el otro puesto lo cobró mientras tanto («Cobró» efectivo), la marca mentiría
 * (efectivo 0 y «a cobrar» en el resumen). Por eso, dentro del candado y con la fila del pedido
 * tomada (espera a un cobro en vuelo), se relee el pedido y el libro: cobrado → se graba lo que
 * dice el libro (`rendicionDelYaPago`, «cobrado» con sus pagos). Y si el cobro llega DESPUÉS de un
 * «rendido a cobrar» (no al fiado), su «cobrado» con pagos lo reemplaza: manda la última marca.
 */
async function marcarRendidoUnaVez(
  tenantId: string,
  orderId: string,
  marca: MarcaRendido,
  salio: Date | null,
): Promise<{ estado: "grabada"; marca: MarcaRendido } | { estado: "ya-estaba" } | { estado: "fallo" }> {
  const user = await getCurrentUser();
  const actor = user ? `user:${user.id}` : "admin";
  try {
    return await tenantTransaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('lock_timeout', '5000', true)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reparto-rendido:${tenantId}:${orderId}`}))`;
        let aGrabar = marca;
        if (marca.resultado === "a-cobrar" && !marca.aCuenta) {
          // La fila del pedido: si hay un cobro en vuelo, se espera a que cierre y se lo ve.
          await tx.$queryRaw`SELECT 1 FROM "Order" WHERE id = ${orderId} AND "tenantId" = ${tenantId} FOR UPDATE`;
          const ahora = await tx.order.findFirst({ where: { id: orderId, tenantId }, select: { paid: true, paymentMethod: true } });
          if (ahora?.paid) {
            const filas = await tx.cashMovement.findMany(consultaDeVentasDelLibro(tenantId, orderId));
            const libro = cobroDelLibro(ventasDeLasFilas(filas), ahora.paymentMethod);
            if (libro.pagos.length > 0) {
              const d = rendicionDelYaPago({ paid: true, salio, libro });
              aGrabar = { tipo: "rendido", reparto: marca.reparto, resultado: d.resultado, code: marca.code, cliente: marca.cliente, total: marca.total, pagos: d.pagos };
            }
          }
        }
        const ultima = await tx.auditLog.findFirst({
          where: { tenantId, entity: "Order", action: ACCION_REPARTO, entityId: orderId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { changes: true },
        });
        const previa = leerMarcaDeReparto(ultima?.changes);
        if (previa?.tipo === "rendido") {
          const reemplaza = previa.resultado === "a-cobrar" && !previa.aCuenta && aGrabar.resultado === "cobrado" && aGrabar.pagos.length > 0;
          if (!reemplaza) return { estado: "ya-estaba" as const };
        }
        await tx.auditLog.create({
          data: { tenantId, actor, action: ACCION_REPARTO, entity: "Order", entityId: orderId, changes: JSON.parse(JSON.stringify(aGrabar)), channel: "admin" },
        });
        return { estado: "grabada" as const, marca: aGrabar };
      },
      { tenantId },
    );
  } catch (err) {
    logger.error("reparto", "no se pudo grabar la marca de lo rendido", err, { entity: "Order", entityId: orderId });
    return { estado: "fallo" };
  }
}

type RendicionDeUnEnvio = { r: OrderActionState; como?: ResultadoDeRendicion; total?: number; aCuenta?: boolean };

/**
 * Rendir UN envío que volvió con el cadete (MG-056). `resultado`:
 *   · `cobrado`  — lo cobró: con los campos del PieDeCobro (`paymentMethod`, `pago.*`, `recibido`),
 *                  se cobra con `cobrarPedido` y se entrega con `entregarPedido`;
 *   · `ya-pago`  — ya estaba pago: se entrega;
 *   · `a-cobrar` — lo dejó sin cobrar: se entrega «Queda a cobrar» (pasa a la columna A cobrar);
 *   · `volvio`   — no lo entregó (`motivo`): vuelve a Listos, nada de plata.
 *   · `como-salio` — «Rindió todo como salió»: si figura cobrado, `ya-pago` (que rinde «cobrado» con
 *                  los pagos del LIBRO si se cobró en la calle); si no, `a-cobrar`. Nunca cobra.
 * Rendir dos veces el mismo envío contesta «ya estaba rendido» sin tocar nada.
 */
async function rendirUnEnvio(tenantId: string, id: string, pedido: ComoSeRinde, formData: FormData, salida: string | null): Promise<RendicionDeUnEnvio> {
  const o = await prisma.order.findFirst({
    where: { id, tenantId },
    select: { id: true, code: true, status: true, paid: true, paymentMethod: true, total: true, fulfillment: true, customerName: true },
  });
  if (!o || o.fulfillment !== "DELIVERY") return { r: { ok: false, error: "No se encontró ese envío. Recargá la rendición." } };
  const conFecha = await ultimaMarcaConFecha(tenantId, id);
  const ultima = conFecha?.marca ?? null;
  const yaRendido = (): RendicionDeUnEnvio => {
    revalidar();
    return { r: { ok: true, mensaje: `El pedido #${o.code} ya estaba rendido.`, yaEstaba: true } };
  };
  if (ultima?.tipo === "rendido") return yaRendido();
  if (ultima?.tipo !== "salio") return { r: { ok: false, error: `El pedido #${o.code} no figura en la calle con el cadete. Recargá la rendición.` } };
  if (o.status === "CANCELLED") return { r: { ok: false, error: `El pedido #${o.code} está anulado: no se rinde.` } };
  if (o.status !== "READY") {
    return { r: { ok: false, error: `El pedido #${o.code} ya no está Listo (alguien lo movió desde la bandeja). Recargá la rendición.` } };
  }
  const reparto = ultima.reparto;
  if (salida && reparto !== salida) return { r: { ok: false, error: `El pedido #${o.code} salió en otra salida. Recargá la rendición.` } };
  const resultado = pedido === "como-salio" ? (o.paid ? "ya-pago" : "a-cobrar") : pedido;
  const total = Number(o.total);
  const soloId = formularioDe([["id", id]]);
  const rendido = (
    r: ResultadoDeRendicion,
    pagos: { medio: "EFECTIVO" | "MERCADOPAGO" | "TRANSFERENCIA"; monto: number }[],
    aCuenta = false,
  ) =>
    marcarRendidoUnaVez(
      tenantId,
      id,
      { tipo: "rendido", reparto, resultado: r, code: o.code, cliente: o.customerName, total, pagos, ...(aCuenta ? { aCuenta: true as const } : {}) },
      conFecha?.en ?? null,
    );

  if (resultado === "volvio") {
    const motivo = texto(formData.get("motivo")) ?? "Volvió sin entregar";
    await marcar(id, { tipo: "volvio", reparto, motivo });
    revalidar();
    return { r: { ok: true, mensaje: `El pedido #${o.code} volvió (${motivo}): queda en Listos para el próximo reparto.` } };
  }

  if (resultado === "ya-pago") {
    if (!o.paid) return { r: { ok: false, error: `El pedido #${o.code} no figura cobrado: rendilo con el medio con que pagó o «Lo dejó sin cobrar».` } };
    // O-3 (recertificación): «Ya pagó» de un pedido cobrado en ESTE reparto (el puesto 1 cobró y
    // la entrega falló; el puesto 2 lo ve pago) se rinde «cobrado» con los pagos del LIBRO: si no,
    // el efectivo que trae el cadete desaparecería del resumen. El formulario no trae pagos.
    const yaPagoDe = rendicionDelYaPago({
      paid: o.paid,
      salio: conFecha?.en ?? null,
      libro: cobroDelLibro(await ventasDelLibro(tenantId, id), o.paymentMethod),
    });
    const r = await entregarPedido(null, soloId);
    if (!r?.ok) return { r };
    if ((await rendido(yaPagoDe.resultado, yaPagoDe.pagos)).estado === "ya-estaba") return yaRendido();
    revalidar();
    return {
      r: {
        ok: true,
        mensaje:
          yaPagoDe.resultado === "cobrado"
            ? `Pedido #${o.code} entregado: se cobró en este reparto (${textoPlata(yaPagoDe.pagos.reduce((s, p) => s + p.monto, 0))}), va en la rendición.`
            : `Pedido #${o.code} entregado (ya estaba pago).`,
      },
      como: yaPagoDe.resultado,
      total,
    };
  }

  if (resultado === "a-cobrar") {
    if (o.paid) return { r: { ok: false, error: `El pedido #${o.code} ya está cobrado: rendilo como «Ya pagó».` } };
    // La entrega de siempre decide el fiado (2D, `decidirFiadoDeLaEntrega`): con las cuentas
    // corrientes prendidas y el pedido con ficha, la deuda queda en la cuenta del cliente y el
    // pedido sale de «A cobrar» (saldado contra la cuenta: `paid` sin medio). Se lee cómo quedó.
    const r = await entregarPedido(null, formularioDe([["id", id], ["quedaACobrar", "on"]]));
    if (!r?.ok) return { r };
    const quedo = await prisma.order.findFirst({ where: { id, tenantId }, select: { paid: true, paymentMethod: true } });
    const alFiado = Boolean(quedo?.paid && !quedo.paymentMethod);
    const grabado = await rendido("a-cobrar", [], alFiado);
    if (grabado.estado === "ya-estaba") return yaRendido();
    // La carrera: el otro puesto lo cobró mientras se entregaba; la marca dice lo del libro.
    if (grabado.estado === "grabada" && grabado.marca.resultado !== "a-cobrar") {
      revalidar();
      const como = grabado.marca.resultado;
      return {
        r: {
          ok: true,
          mensaje:
            como === "cobrado"
              ? `Pedido #${o.code} entregado: otro puesto lo cobró en este reparto (${textoPlata(grabado.marca.pagos.reduce((s, p) => s + p.monto, 0))}), va en la rendición.`
              : `Pedido #${o.code} entregado (ya estaba pago).`,
        },
        como,
        total,
      };
    }
    // O-2: sin fiado, por qué (con las cuentas corrientes prendidas y sin la app, se avisa).
    const decision = alFiado ? null : await decidirFiadoDeLaEntrega(tenantId, id);
    revalidar();
    return {
      r: {
        ok: true,
        // Al fiado, el mensaje de la entrega: «… quedó en la cuenta de Ana, que debe $X …».
        mensaje: mensajeDeLoDejadoSinCobrar({
          code: o.code,
          total,
          alFiado,
          mensajeDeLaEntrega: r.mensaje,
          motivoSinFiado: decision && !decision.va ? decision.motivo : null,
        }),
      },
      como: "a-cobrar",
      total,
      aCuenta: alFiado,
    };
  }

  // COBRADO: primero el cobro (la acción de siempre: si se rechaza, no se entrega ni se marca),
  // después la entrega. Cobrado y Listo es un estado verdadero: si la entrega no llega a correr,
  // el reintento contesta «ya estaba cobrado» con el mismo medio y entrega.
  const pagos = leerPagos((campo) => formData.getAll(campo).map(String));
  if (!pagos.ok) return { r: { ok: false, error: pagos.error } };
  // O-3: «ya pagó» sólo si el cobro es ANTERIOR a la salida del cadete. Cobrado en este reparto
  // (el reintento tras una entrega que falló, o el doble envío que encontró el cobro hecho), la
  // marca lleva los pagos: si no, el resumen perdería el efectivo que trae el cadete.
  // El libro incluye las VENTAs del pago mixto (cuelgan del cobro, no del pedido).
  const primeraVenta = o.paid ? cobroDelLibro(await ventasDelLibro(tenantId, id), o.paymentMethod).primeraVenta : null;
  const yaPago = cobradoAntesDeSalir({ paid: o.paid, primeraVenta, salio: conFecha?.en ?? null });
  const cobro = await cobrarPedido(null, formData);
  if (!cobro?.ok) return { r: cobro };
  const entrega = await entregarPedido(null, soloId);
  if (!entrega?.ok) {
    revalidar();
    return {
      r: {
        ok: false,
        error: `El pedido #${o.code} quedó cobrado, pero no se pudo marcar entregado: ${entrega?.error ?? "volvé a intentar"}. Al reintentar no se cobra dos veces.`,
      },
    };
  }
  // F-3 (recertificación): la marca lleva los pagos DEL LIBRO, cobro fresco o «ya estaba cobrado»
  // (el puesto 1 cobró mixto y el puesto 2 manda el pie por defecto): el formulario sólo decide el
  // cobro, nunca lo que rinde el cadete. Sin VENTAs en el libro, lo que se cobró recién.
  const medio = leerMedioDeCobro(pagos.medio);
  const delFormulario = pagos.asientos ? pagos.asientos.map((a) => ({ medio: a.medio, monto: a.monto })) : medio ? [{ medio, monto: total }] : [];
  const libro = yaPago
    ? null
    : cobroDelLibro(
        await ventasDelLibro(tenantId, id),
        (await prisma.order.findFirst({ where: { id, tenantId }, select: { paymentMethod: true } }))?.paymentMethod ?? null,
      );
  if ((await rendido(yaPago ? "ya-pago" : "cobrado", yaPago ? [] : libro && libro.pagos.length ? libro.pagos : delFormulario)).estado === "ya-estaba") {
    return yaRendido();
  }
  revalidar();
  return {
    r: {
      ok: true,
      mensaje: yaPago ? `El pedido #${o.code} ya estaba cobrado: quedó entregado.` : `Pedido #${o.code} cobrado y entregado: ${textoPlata(total)}.`,
      ...(cobro.vuelto !== undefined ? { vuelto: cobro.vuelto } : {}),
      ...(cobro.venta ? { venta: cobro.venta } : {}),
    },
    como: yaPago ? "ya-pago" : "cobrado",
    total,
  };
}

/** Rendir UN envío (la tarjeta de la rendición): ver `rendirUnEnvio`. */
export async function rendirPedido(formData: FormData): Promise<OrderActionState> {
  await requireCapability("orders:manage");
  if (!(await mostradorBoutique())) return { ok: false, error: APAGADO };
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id") || "").trim();
  const resultado = String(formData.get("resultado") || "").trim();
  if (!id) return { ok: false, error: "Falta identificar el envío a rendir." };
  if (!RESULTADOS.has(resultado)) return { ok: false, error: "Elegí qué pasó con el envío: cobrado, ya pagado, sin cobrar o volvió." };
  return (await rendirUnEnvio(tenantId, id, resultado as ComoSeRinde, formData, null)).r;
}

export type ResultadoDeRendirTodo =
  | { ok: true; mensaje: string; rendidos: number[]; yaEstaban: number[]; fallaron: { code: number; error: string }[] }
  | { ok: false; error: string };

/**
 * «Rindió todo como salió»: rinde los envíos de UNA salida (`reparto` + un `id` por envío) tal como
 * los dice el libro: el que salió pago, entregado («ya pagó», o «cobrado» con los pagos del libro
 * si se cobró en la calle); el que salió a cobrar, entregado «a cobrar» (o a la cuenta del cliente
 * con el fiado). No cobra nada ni recibe montos: si el cadete cobró alguno, se rinde uno por uno.
 * Si algún id no es un envío de este negocio, no se rinde ninguno. Uno que no se pudo no frena a
 * los demás y se dice por qué. Mandarla dos veces deja una sola marca por pedido.
 */
export async function rendirTodoComoSalio(formData: FormData): Promise<ResultadoDeRendirTodo> {
  await requireCapability("orders:manage");
  if (!(await mostradorBoutique())) return { ok: false, error: APAGADO };
  const tenantId = await getCurrentTenantId();
  const salida = texto(formData.get("reparto"));
  const ids = [...new Set(formData.getAll("id").map((v) => String(v).trim()).filter(Boolean))];
  if (!salida) return { ok: false, error: "Falta la salida a rendir. Recargá la rendición." };
  if (ids.length === 0) return { ok: false, error: "No hay envíos en esta salida: no se rindió nada." };
  if (ids.length > MAX_POR_SALIDA) return { ok: false, error: `Son muchos envíos para una salida (hasta ${MAX_POR_SALIDA}).` };

  const ordenes = await prisma.order.findMany({
    where: { tenantId, id: { in: ids }, fulfillment: "DELIVERY" },
    select: { id: true, code: true },
  });
  if (ordenes.length !== ids.length) {
    return { ok: false, error: "Algún envío de la salida ya no está (o no es de este negocio). Recargá la rendición: no se rindió nada." };
  }
  const rendidos: EnvioRendidoDeUnaVez[] = [];
  const yaEstaban: number[] = [];
  const fallaron: { code: number; error: string }[] = [];
  for (const o of ordenes.sort((a, b) => a.code - b.code)) {
    const { r, como, total, aCuenta } = await rendirUnEnvio(tenantId, o.id, "como-salio", formularioDe([["id", o.id]]), salida);
    if (!r?.ok) fallaron.push({ code: o.code, error: r?.error ?? "no se pudo rendir" });
    else if (r.yaEstaba || !como) yaEstaban.push(o.code);
    else rendidos.push({ code: o.code, como, total: total ?? 0, aCuenta: aCuenta === true });
  }
  revalidar();
  return {
    ok: true,
    mensaje: mensajeDeRendirTodo({ rendidos, yaEstaban, fallaron }),
    rendidos: rendidos.map((r) => r.code),
    yaEstaban,
    fallaron,
  };
}

/**
 * Constancia del «Recordarle» el pago de un pedido entregado sin cobrar (el WhatsApp lo abre una
 * persona; esto sólo deja escrito que se le recordó). Nunca lanza hacia la pantalla.
 */
export async function registrarRecordatorioDeCobro(orderId: string): Promise<void> {
  await requireCapability("orders:read");
  const tenantId = await getCurrentTenantId();
  const id = String(orderId ?? "").trim();
  if (!id) return;
  const o = await prisma.order.findFirst({ where: { id, tenantId }, select: { code: true } });
  if (!o) return;
  await auditAdmin({ action: "whatsapp", entity: "Order", entityId: id, changes: { tipo: "recordatorio-cobro", code: o.code } });
}
