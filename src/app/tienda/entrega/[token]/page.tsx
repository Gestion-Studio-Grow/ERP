// ============================================================================
// DELIVERY LOCAL · «ENTREGUÉ» DEL REPARTIDOR — /tienda/entrega/<token>.
// ============================================================================
//
// La abre el repartidor desde el WhatsApp del local. Muestra SÓLO «Pedido #N» y el botón: ningún
// dato del cliente (un link reenviado no expone a nadie). Abrirla no graba nada (la vista previa de
// WhatsApp también la abre): el aviso sale del toque (acción del servidor). Sin indexar y sin
// referrer.

import type { Metadata } from "next";
import SelloGSG from "@/components/marca/SelloGSG";
import { vistaDeLaEntrega } from "@/lib/delivery-local/entrega";
import { configDeliveryLocal } from "@/lib/delivery-local/config";
import { contextoDeLaEntrega, depsDeLaEntrega } from "./datos";
import Entregue from "./Entregue";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entregué",
  generator: "Gestión Studio Grow",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function EntregaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await contextoDeLaEntrega(token);
  const vista = await vistaDeLaEntrega(ctx, depsDeLaEntrega);
  const negocio = configDeliveryLocal(ctx.slug)?.nombre ?? null;
  const titulo = vista.code !== null ? `Pedido #${vista.code} · Entregué` : "Entregué";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 bg-background px-4 py-8 text-body">
      <header className="flex flex-col gap-1">
        {negocio && <p className="text-sm font-medium text-muted">{negocio} · para el repartidor</p>}
        <h1 className="text-2xl font-bold text-strong">{titulo}</h1>
      </header>
      <section aria-label="Avisar la entrega" className="flex flex-col gap-4 rounded-md border border-line bg-surface-raised p-4">
        {vista.estado === "para-marcar" && (
          <>
            <p className="text-base">Tocá el botón cuando el pedido esté en manos del cliente. El local lo ve al instante y lo cierra.</p>
            <Entregue token={token} code={vista.code} />
          </>
        )}
        {vista.estado === "ya-avisado" && (
          <p role="status" className="text-base text-strong">
            Ya avisaste que entregaste el pedido #{vista.code}. No hace falta tocar nada más.
          </p>
        )}
        {vista.estado === "sin-efecto" && (
          <p role="status" className="text-base text-strong">
            {vista.mensaje}
          </p>
        )}
      </section>
      <footer className="mt-auto flex flex-col gap-2 pt-6 text-center text-xs text-muted">
        <SelloGSG />
      </footer>
    </main>
  );
}
