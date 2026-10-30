// Confirmación de pedido de la vidriera. Muestra el nº de pedido (correlativo por
// tenant) que devolvió `placeOnlineOrder`. Server component; en Next 16
// `searchParams` es una Promise. Usa el acento del tenant para la marca.

import type { Metadata } from "next";
import { cache } from "react";
import { getTenantAccent } from "@/lib/branding";
import { getStorefront } from "@/lib/order-actions";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { editorialFrontFor, getTenantIdentity } from "@/lib/identidad-rubro";
import { resolveMagraLocal } from "@/tenants/magra-content";
import { sanitizePhone } from "@/lib/whatsapp-cta";
import Gracias from "@/components/vidriera/Gracias";
import { CLASES_DE_FUENTES as FUENTES_SHINE } from "../shine/fuentes";
import GraciasNueva from "../vidriera/GraciasNueva";
import GraciasQuebienoles from "../quebienoles/GraciasQuebienoles";
import GraciasMagra from "../magra/GraciasMagra";
import GraciasAdosmanos from "../adosmanos/GraciasAdosmanos";
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
    return { title: `Pedido recibido · ${name}`, generator: "Gestión Studio Grow" };
  } catch {
    return { title: "Pedido recibido", generator: "Gestión Studio Grow" };
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
  // El rubro que declara su vidriera (rubros.ts `vidriera`) sigue con la nueva también acá.
  if (usaVidrieraNueva(nuevo || (!front && identity.rubro?.vidriera != null), identity, front)) {
    const tienda = await leerTienda();
    const marca = marcaDeLaVidriera(front, identity.brandId);
    const whatsapp = marca === "magra" ? resolveMagraLocal(tienda.branding).whatsapp : sanitizePhone(tienda.branding?.whatsapp);
    const medios = textoDeMediosDePago(tienda.copy?.paymentMethods ?? []);
    const pago =
      marca === "magra"
        ? medios
          ? `Te lo llevamos o lo retirás. Pagás al recibir: ${medios.charAt(0).toLowerCase()}${medios.slice(1)}`
          : "Te lo llevamos o lo retirás. El medio de pago te lo confirmamos antes de cobrar."
        : marca === "shinevelas" && medios
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

  // MAGRA: la confirmación con su marca (carbón y oro), los pasos de la casa (se pesa al envasar) y el
  // WhatsApp del local sólo si es de verdad (resolveMagraLocal oculta el relleno «0000 0000»).
  if (front === "magra") {
    const tienda = await leerTienda();
    const medios = textoDeMediosDePago(tienda.copy?.paymentMethods ?? []);
    return (
      <GraciasMagra
        tenantKey={identity.slug ?? "magra"}
        pedido={pedido && /^\d{1,9}$/.test(pedido) ? pedido : null}
        whatsapp={resolveMagraLocal(tienda.branding).whatsapp}
        pago={medios ? `Te lo llevamos o lo retirás. Pagás al recibir: ${medios.charAt(0).toLowerCase()}${medios.slice(1)}` : "Te lo llevamos o lo retirás. El medio de pago te lo confirmamos antes de cobrar."}
      />
    );
  }

  // QUÉ BIEN OLÉS: la confirmación con su marca (negro y oro) y el canal que usa de verdad —
  // Instagram—; no tiene WhatsApp público, así que no se le ofrece un chat que no existe.
  if (front === "quebienoles") {
    const tienda = await leerTienda();
    return (
      <GraciasQuebienoles
        pedido={pedido && /^\d{1,9}$/.test(pedido) ? pedido : null}
        instagram={tienda.branding?.instagram ?? null}
        whatsapp={sanitizePhone(tienda.branding?.whatsapp)}
        tenantKey={identity.slug ?? "quebienoles"}
      />
    );
  }

  // A DOS MANOS: la confirmación con su marca (provisional) y cómo sigue; WhatsApp sólo si lo publicó.
  if (front === "adosmanos") {
    const tienda = await leerTienda();
    return (
      <GraciasAdosmanos
        pedido={pedido && /^\d{1,9}$/.test(pedido) ? pedido : null}
        whatsapp={sanitizePhone(tienda.branding?.whatsapp) || null}
        tenantKey={identity.slug ?? "adosmanos"}
      />
    );
  }

  // SHINE (ronda 2, P0-3): su confirmación con lino y vino, sin emoji, con el canal real (WhatsApp si lo publicó; si
  // no, Instagram; si tampoco, ninguno) y cómo se coordina el pago y el envío, sin prometer una tarifa que no tiene.
  if (front === "shinevelas") {
    const tienda = await leerTienda();
    const wa = sanitizePhone(tienda.branding?.whatsapp);
    const ig = tienda.branding?.instagram?.trim().replace(/^@/, "") || null;
    const numero = pedido && /^\d{1,9}$/.test(pedido) ? pedido : null;
    const medios = textoDeMediosDePago(tienda.copy?.paymentMethods ?? []);
    return (
      <Gracias
        marca="Shine Velas"
        tenantKey={identity.slug ?? "shinevelas"}
        pedido={numero}
        titulo="Tu pedido ya está en el taller."
        bajada="Gracias por elegir una vela hecha a mano. Ahora la preparamos con el aroma que elegiste."
        pasos={[
          "Te escribimos para confirmar el pedido, el aroma y la entrega.",
          `El envío o el retiro se coordinan con vos: el costo del envío te lo confirmamos antes de cobrar.${medios ? ` Medios de pago: ${medios.charAt(0).toLowerCase()}${medios.slice(1)}` : ""}`,
          "La preparamos y te avisamos cuando está lista.",
        ]}
        canal={wa ? { href: `https://wa.me/${wa}`, texto: "Escribirnos por WhatsApp" } : ig ? { href: `https://instagram.com/${ig}`, texto: "Escribirnos por Instagram" } : null}
        volver={{ href: "/tienda", texto: "Volver a la tienda" }}
        piel={{
          fondo: "#f3ebe1",
          hoja: "#fdf8f2",
          tinta: "#3a2429",
          tenue: "#75504f",
          linea: "#d0aeac",
          acento: "#671128",
          sobreAcento: "#fdf8f2",
          letraTitulo: 'var(--sh-cormorant), "Cormorant Garamond", Georgia, serif',
          letraCuerpo: 'var(--sh-kumbh), "Kumbh Sans", system-ui, sans-serif',
          radio: 12,
          claseDeFuentes: FUENTES_SHINE,
        }}
      />
    );
  }

  // Cualquier otra tienda: la confirmación compartida (ronda 2), con el acento del negocio y sin emoji.
  const { name } = await leerTienda();
  return (
    <Gracias
      marca={name}
      tenantKey={identity.slug ?? "default"}
      pedido={pedido && /^\d{1,9}$/.test(pedido) ? pedido : null}
      titulo="Recibimos tu pedido."
      bajada="Te vamos a contactar para confirmar el pedido y coordinar el retiro o el envío. El pago se coordina al recibirlo."
      pasos={[]}
      canal={null}
      volver={{ href: "/tienda", texto: "Volver a la tienda" }}
      piel={{ fondo: "#f4efe6", hoja: "#ffffff", tinta: "#2a211c", tenue: "#5f544b", linea: "#e3d9c8", acento: accent, sobreAcento: "#ffffff", letraTitulo: "system-ui, sans-serif", letraCuerpo: "system-ui, sans-serif", radio: 16 }}
    />
  );
}
