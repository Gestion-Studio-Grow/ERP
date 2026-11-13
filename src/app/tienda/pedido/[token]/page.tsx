// ============================================================================
// DELIVERY LOCAL · EL SEGUIMIENTO PÚBLICO DEL PEDIDO — /tienda/pedido/<token>.
// ============================================================================
//
// Lo abre el cliente después de pedir (placeOnlineOrder lo redirige acá) o desde el WhatsApp que le
// manda el local. Sin sesión: lo que habilita es el TOKEN, firmado para ESTE pedido de ESTE negocio
// (src/lib/delivery-local/seguimiento.ts). El negocio sale del host, como /tienda (fail-closed), y
// el pedido se lee por {id, tenantId} con el mismo cliente que la vidriera (RLS por request).
//
// Se muestra sólo lo que el cliente ya sabe: número, estado, lo que pidió, total y cómo pagar.
// NUNCA la dirección, el teléfono ni la ubicación: un link reenviado no expone a nadie. Sin
// indexar y sin referrer (el token no viaja a wa.me ni a nadie).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { authSecret } from "@/lib/auth";
import { transferenciaPublicable } from "@/lib/delivery-local/pago";
import { buildWhatsAppHref, whatsappCanonico } from "@/lib/whatsapp-cta";
import { fmtMoneyARS } from "@/components/ui/format";
import { formatearCantidad } from "@/lib/pos-peso";
import SelloGSG from "@/components/marca/SelloGSG";
import { configDeliveryLocal } from "@/lib/delivery-local/config";
import { pagoParaElCliente, verificarToken, vistaDelSeguimiento, type EstadoDelPedido } from "@/lib/delivery-local/seguimiento";
import { ACCION_SALIO, pagoDelAlta } from "@/lib/delivery-local/salida";
import { mensajeDeCancelacion } from "../../local/carta";
import Link from "next/link";
import Refresco from "./Refresco";
import RecordarSeguimiento from "./RecordarSeguimiento";
import CopiarAlias from "./CopiarAlias";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu pedido",
  generator: "Gestión Studio Grow",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

async function leerSeguimiento(token: string) {
  const tenantId = await getCurrentTenantId();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, name: true } });
  const cfg = configDeliveryLocal(tenant?.slug);
  if (!cfg) return null;
  let secreto: string;
  try {
    secreto = authSecret();
  } catch {
    return null; // sin secreto no se puede verificar ningún link: 404, no 500
  }
  const orderId = verificarToken(secreto, tenantId, token);
  if (!orderId) return null;
  const [pedido, alta, salio, settings] = await Promise.all([
    prisma.order.findFirst({
      where: { id: orderId, tenantId },
      select: {
        code: true,
        status: true,
        fulfillment: true,
        total: true,
        paid: true,
        createdAt: true,
        items: { select: { name: true, quantity: true, saleUnit: true, lineTotal: true }, orderBy: { id: "asc" } },
      },
    }),
    prisma.auditLog.findFirst({
      where: { tenantId, entity: "Order", entityId: orderId, action: "create" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { changes: true },
    }),
    prisma.auditLog.findFirst({ where: { tenantId, entity: "Order", entityId: orderId, action: ACCION_SALIO }, select: { id: true } }),
    prisma.businessSettings.findUnique({ where: { tenantId }, select: { whatsapp: true } }),
  ]);
  if (!pedido) return null;
  return { cfg, slug: tenant?.slug ?? "", pedido, pago: pagoDelAlta(alta?.changes), enCamino: Boolean(salio), whatsapp: whatsappCanonico(settings?.whatsapp) };
}

export default async function SeguimientoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const datos = await leerSeguimiento(token);
  if (!datos) notFound();
  const { cfg, slug, pedido, pago, enCamino, whatsapp } = datos;
  const envio = pedido.fulfillment === "DELIVERY";
  const vista = vistaDelSeguimiento({
    status: pedido.status as EstadoDelPedido,
    envio,
    enCamino,
    paid: pedido.paid,
    medio: pago?.medio ?? null,
    creadoEn: pedido.createdAt,
    ahora: new Date(),
    demoraMin: cfg.demoraMin ?? null,
  });
  // Vencido el plazo de los términos sin confirmar: el mismo WhatsApp del botón de arrepentimiento.
  const bajarlo = vista.vencido && whatsapp ? buildWhatsAppHref(whatsapp, mensajeDeCancelacion(cfg.nombre, pedido.code)) : null;
  const transferir = pago?.medio === "transferencia" && !pedido.paid && pedido.status !== "CANCELLED" ? transferenciaPublicable(cfg.transferencia) : null;
  // Cómo paga, de la auditoría del alta (`entregaLocal.pago`), nunca de la nota.
  const comoPaga = pagoParaElCliente({
    medio: pago?.medio ?? null,
    pagaCon: pago?.pagaCon ?? null,
    total: Number(pedido.total),
    paid: pedido.paid,
    cancelado: pedido.status === "CANCELLED",
    transferenciaVisible: Boolean(transferir),
  });
  const chat = whatsapp ? buildWhatsAppHref(whatsapp, `Hola, te escribo por mi pedido #${pedido.code}.`) : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 bg-background px-4 py-8 text-body">
      <Refresco activo={!vista.terminado} />
      {/* «Mi cuenta» del dispositivo: el pedido guardado al mandarlo queda atado a este link. */}
      <RecordarSeguimiento slug={slug} token={token} code={String(pedido.code)} estado={vista.titular} terminado={vista.terminado} />
      <nav aria-label="Navegación de la tienda" className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href="/tienda" className="inline-flex min-h-11 items-center font-semibold text-accent-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          ← Volver a la carta
        </Link>
        <Link href="/tienda/mi-cuenta" className="inline-flex min-h-11 items-center font-semibold text-accent-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          Mi cuenta
        </Link>
      </nav>
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">{cfg.nombre}</p>
        <h1 className="text-2xl font-bold text-strong">Pedido #{pedido.code}</h1>
      </header>

      <section aria-labelledby="estado" className="flex flex-col gap-4 rounded-md border border-line bg-surface-raised p-4">
        <div aria-live="polite">
          <h2 id="estado" className="text-lg font-semibold text-strong">
            {vista.titular}
          </h2>
          <p className="mt-1 text-sm">{vista.detalle}</p>
        </div>
        {bajarlo && (
          <a
            href={bajarlo}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-line-strong px-4 text-sm font-semibold text-strong hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Bajar el pedido por WhatsApp
          </a>
        )}
        {vista.vencido && !whatsapp && (
          <p className="text-sm">
            Para bajarlo, usá el{" "}
            <Link href={`/tienda/arrepentimiento?pedido=${pedido.code}`} className="font-semibold text-accent-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              botón de arrepentimiento
            </Link>
            .
          </p>
        )}
        {vista.actual >= 0 && (
          <ol className="flex flex-col gap-2" aria-label={`Paso ${vista.actual + 1} de ${vista.pasos.length}`}>
            {vista.pasos.map((p, i) => {
              const hecho = i <= vista.actual;
              const actual = i === vista.actual;
              return (
                <li key={p.id} aria-current={actual ? "step" : undefined} className={`flex items-center gap-2 text-sm ${actual ? "font-semibold text-strong" : hecho ? "text-body" : "text-muted"}`}>
                  <span aria-hidden className={`inline-block size-2.5 rounded-full ${hecho ? "bg-accent" : "border border-line-strong"}`} />
                  {p.titulo}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {comoPaga && (
        <section aria-labelledby="como-pagas" className="flex flex-col gap-1 rounded-md border border-line bg-surface-raised p-4">
          <h2 id="como-pagas" className="text-base font-semibold text-strong">
            {comoPaga.titulo}
          </h2>
          <p className="text-sm">{comoPaga.detalle}</p>
        </section>
      )}

      {transferir && (
        <section aria-labelledby="transferencia" className="flex flex-col gap-2 rounded-md border border-line bg-surface-raised p-4">
          <h2 id="transferencia" className="text-base font-semibold text-strong">
            Datos para transferir {fmtMoneyARS(pedido.total)}
          </h2>
          <p className="text-sm">
            Alias: <strong className="font-semibold text-strong">{transferir.alias}</strong>
          </p>
          <p className="text-sm">
            Titular: {transferir.titular} · {transferir.banco}
          </p>
          <CopiarAlias alias={transferir.alias} />
        </section>
      )}

      <section aria-labelledby="lleva" className="flex flex-col">
        <h2 id="lleva" className="mb-2 text-base font-semibold text-strong">
          Lo que pediste
        </h2>
        <ul className="flex flex-col">
          {pedido.items.map((l, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-sm">
              <span>
                {formatearCantidad(l.quantity)} {l.saleUnit === "WEIGHT" ? "kg" : "×"} {l.name}
              </span>
              <span className="tabular-nums">{fmtMoneyARS(l.lineTotal)}</span>
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-3 py-2 font-semibold text-strong">
            <span>Total</span>
            <span className="tabular-nums">{fmtMoneyARS(pedido.total)}</span>
          </li>
        </ul>
        <p className="text-sm text-muted">{pedido.paid ? "Ya figura pagado." : envio ? "Envío propio del local, sin comisión." : "Lo retirás en el local."}</p>
      </section>

      {chat && (
        <a
          href={chat}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Escribirle al local por WhatsApp
        </a>
      )}

      <footer className="mt-auto flex flex-col gap-2 pt-6 text-center text-xs text-muted">
        {cfg.provisional && <p>Algunos datos del local son provisionales a confirmar.</p>}
        <p>Esta página se actualiza sola cada 30 segundos.</p>
        <SelloGSG />
      </footer>
    </main>
  );
}
