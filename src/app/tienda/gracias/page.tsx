// Confirmación de pedido de la vidriera. Muestra el nº de pedido (correlativo por
// tenant) que devolvió `placeOnlineOrder`. Server component; en Next 16
// `searchParams` es una Promise. Usa el acento del tenant para la marca.

import Link from "next/link";
import type { Metadata } from "next";
import { cache } from "react";
import { getTenantAccent } from "@/lib/branding";
import { getStorefront } from "@/lib/order-actions";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { editorialFrontFor, getTenantIdentity } from "@/lib/identidad-rubro";
import { resolveMagraLocal } from "@/tenants/magra-content";
import { sanitizePhone } from "@/lib/whatsapp-cta";
import GraciasNueva from "../vidriera/GraciasNueva";
import { marcaDeLaVidriera, usaVidrieraNueva } from "../vidriera/marcas";
import { textoDeMediosDePago } from "../reglas-tienda";

export const dynamic = "force-dynamic";

// Una sola lectura del storefront por pedido, compartida entre la metadata y la página nueva.
const leerTienda = cache(getStorefront);

// Título POR TENANT (no el "Panel de gestión" del layout raíz, que el CLIENTE veía en la pestaña
// de su propia página de gracias). Sale del nombre del storefront, igual que /tienda.
export async function generateMetadata(): Promise<Metadata> {
  try {
    const { name } = await leerTienda();
    return { title: `Pedido recibido · ${name}` };
  } catch {
    return { title: "Pedido recibido" };
  }
}

export default async function GraciasPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string }>;
}) {
  const [{ pedido }, accent, nuevo, identity] = await Promise.all([
    searchParams,
    getTenantAccent(),
    disenoNuevo(),
    getTenantIdentity(),
  ]);

  // DISEÑO NUEVO (interruptor del negocio): el número del pedido y cómo sigue, con la marca de la
  // tienda. Apagado, lo de siempre (abajo, sin cambios). Sólo negocios de mostrador o con marca.
  const front = editorialFrontFor(identity);
  if (usaVidrieraNueva(nuevo, identity, front)) {
    const tienda = await leerTienda();
    const marca = marcaDeLaVidriera(front, identity.brandId);
    const whatsapp = marca === "magra" ? resolveMagraLocal(tienda.branding).whatsapp : sanitizePhone(tienda.branding?.whatsapp);
    const medios = textoDeMediosDePago(tienda.copy?.paymentMethods ?? []);
    const pago =
      marca === "magra"
        ? `Te lo llevamos o lo retirás. Pagás al recibir: ${medios.charAt(0).toLowerCase()}${medios.slice(1)}`
        : marca === "shinevelas"
          ? `Te lo mandamos o lo retirás. El pago se coordina al confirmar: ${medios.charAt(0).toLowerCase()}${medios.slice(1)}`
          : "Te lo mandamos o lo retirás. El medio de pago y el envío te los confirmamos antes de cobrar.";
    return (
      <GraciasNueva
        marca={marca}
        tenantKey={identity.slug ?? "default"}
        nombre={tienda.name}
        pedido={pedido && /^\d{1,9}$/.test(pedido) ? pedido : null}
        whatsapp={whatsapp}
        pago={pago}
      />
    );
  }

  return (
    <div
      style={{
        background: "#f4efe6",
        color: "#2a211c",
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        fontFamily: "system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid #e9e1d3",
          borderRadius: 18,
          padding: "40px 32px",
          maxWidth: 460,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 40 }}>🛍️</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "10px 0 6px", color: accent }}>
          ¡Pedido recibido!
        </h1>
        {pedido && (
          <p style={{ fontSize: 15 }}>
            Tu número de pedido es <strong style={{ color: accent }}>#{pedido}</strong>.
          </p>
        )}
        <p style={{ color: "#6b5d52", marginTop: 10, lineHeight: 1.5 }}>
          Te vamos a contactar para confirmar el pedido y coordinar el retiro o envío. El pago se
          coordina al recibirlo.
        </p>
        <Link
          href="/tienda"
          style={{
            display: "inline-block",
            marginTop: 20,
            background: accent,
            color: "#fff",
            textDecoration: "none",
            padding: "11px 20px",
            borderRadius: 11,
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Volver a la tienda
        </Link>
      </div>
    </div>
  );
}
