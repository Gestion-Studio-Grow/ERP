import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { prisma } from "@/lib/prisma";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { mostradorBoutiquePrendido } from "@/cambios/interruptores";
import { entregaDelRubro } from "@/blueprints/retail/rubros";
import { etiquetaDeHorario, ESTADOS_EN_CURSO } from "@/lib/order-anulacion";
import { todayInBusinessTz } from "@/lib/datetime";
import { leerCuponDelPedido, whereCuponDelPedido } from "@/lib/venta-reglas";
import { balanzaDeVender } from "../../../vender/balanza.server";
import { ACCION_PEDIDO_ORIGINAL, leerPedidoOriginal, type LineaDelPedido } from "./armar-core";
import ArmarPedido from "./ArmarPedido";

// ============================================================================
// ARMAR Y PESAR #128 — pantalla completa para la tablet en la cámara (Magra, tanda 1 · 1C).
// ============================================================================
//
// Detrás del interruptor «mostrador-boutique»: apagado, esta ruta vuelve a la bandeja y nada
// cambia. Lee UNA vez lo que hace falta (Neon, plan gratuito): el pedido con sus renglones, los
// productos de esos renglones (código y precio, para leer la etiqueta), lo que pidió la clienta
// (la fila `pedido-original`, si ya se ajustó), el cupón (si tuvo descuento) y el formato de la
// balanza. Todo acotado por el `tenantId` de la sesión.

export const dynamic = "force-dynamic";
export const metadata = { title: "Armar pedido", generator: "Gestión Studio Grow" };

const EN_CURSO: ReadonlySet<string> = new Set(ESTADOS_EN_CURSO);

export default async function ArmarPedidoPage({ params }: { params: Promise<{ code: string }> }) {
  const user = await requireApp("pedidos");
  const [{ code: codeRaw }, interruptores, identidad] = await Promise.all([params, interruptoresDelNegocio(), getTenantIdentity()]);
  if (!identidad.isRetail || !mostradorBoutiquePrendido(interruptores)) redirect("/admin/pedidos");
  if (!roleHasCapability(user.role, "orders:manage")) redirect("/admin/pedidos");
  const code = Number(codeRaw);
  if (!Number.isInteger(code) || code <= 0) notFound();

  const tenantId = await getCurrentTenantId();
  const o = await prisma.order.findFirst({
    where: { tenantId, code },
    select: {
      id: true,
      code: true,
      status: true,
      paid: true,
      subtotal: true,
      discount: true,
      total: true,
      customerName: true,
      customerPhone: true,
      fulfillment: true,
      scheduledFor: true,
      items: {
        select: { productId: true, name: true, saleUnit: true, quantity: true, unitPrice: true, lineTotal: true },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!o) notFound();

  const entrega = entregaDelRubro(identidad.rubro);
  const horario = o.scheduledFor ? etiquetaDeHorario(o.scheduledFor, o.fulfillment, todayInBusinessTz(), entrega.corto) : null;
  const encabezado = `${o.customerName}${o.fulfillment === "DELIVERY" ? " · Envío" : ` · ${entrega.corto}`}${horario ? ` · ${horario.texto}` : ""}`;

  // Cobrado o fuera de curso: no se arma (el precio y el stock ya quedaron en la venta).
  if (o.paid || !EN_CURSO.has(o.status)) {
    return (
      <main data-ui="pagina" className="mx-auto w-full max-w-3xl px-4 py-6">
        <Link href="/admin/pedidos" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-ink underline underline-offset-4">
          ← Pedidos
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-strong">Armar #{o.code}</h1>
        <p className="mt-1 text-muted">{encabezado}</p>
        <p role="status" className="mt-6 rounded-lg border border-line bg-surface-raised p-4 text-body">
          {o.paid
            ? "Este pedido ya está cobrado: no se puede pesar de nuevo. Si hay que cambiarlo, anulalo desde la bandeja y tomalo otra vez."
            : "Este pedido ya no está para armar (entregado o anulado)."}
        </p>
      </main>
    );
  }

  const items: LineaDelPedido[] = o.items.map((it) => ({
    productId: it.productId,
    name: it.name,
    saleUnit: it.saleUnit === "WEIGHT" ? "WEIGHT" : "UNIT",
    quantity: Number(it.quantity),
    unitPrice: Number(it.unitPrice),
    lineTotal: Number(it.lineTotal),
  }));
  const ids = [...new Set(items.map((it) => it.productId).filter((x): x is string => !!x))];

  const [productos, fila, filaCupon, negocio] = await Promise.all([
    ids.length
      ? prisma.product.findMany({
          where: { tenantId, id: { in: ids } },
          select: { id: true, name: true, codigo: true, saleUnit: true, price: true, pricePerKg: true },
        })
      : Promise.resolve([]),
    prisma.auditLog.findFirst({
      where: { tenantId, entity: "Order", action: ACCION_PEDIDO_ORIGINAL, entityId: o.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { changes: true },
    }),
    Number(o.discount) > 0
      ? prisma.auditLog.findFirst({ where: whereCuponDelPedido(tenantId, o.id), orderBy: { createdAt: "asc" }, select: { changes: true } })
      : Promise.resolve(null),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);
  const balanza = await balanzaDeVender(
    tenantId,
    productos.map((p) => ({ saleUnit: p.saleUnit, codigo: p.codigo })),
    user.role,
  );
  const original = fila ? leerPedidoOriginal(fila.changes) : null;

  return (
    <ArmarPedido
      pedido={{
        id: o.id,
        code: o.code,
        cliente: o.customerName,
        telefono: o.customerPhone,
        encabezado,
        subtotal: Number(o.subtotal),
        descuento: Number(o.discount),
        total: Number(o.total),
        items,
      }}
      original={original}
      cupon={filaCupon ? leerCuponDelPedido(filaCupon.changes) : null}
      productos={productos.map((p) => ({
        id: p.id,
        name: p.name,
        codigo: p.codigo,
        saleUnit: p.saleUnit === "WEIGHT" ? "WEIGHT" : "UNIT",
        pricePerKg: p.pricePerKg,
        price: p.price,
      }))}
      balanza={balanza ? { formato: balanza.formato } : null}
      negocio={negocio?.name ?? "el local"}
      negocioId={tenantId}
    />
  );
}
