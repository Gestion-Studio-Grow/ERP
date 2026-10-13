import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { reciboPublico } from "@/lib/inmobiliaria/datos.server";
import { origenDelSitio } from "@/lib/inmobiliaria/sitio.server";
import { marcaInmo } from "@/lib/inmobiliaria/marca";
import { Marco } from "@/components/inmobiliaria/Sitio";
import { Recibo } from "@/components/inmobiliaria/Recibo";
import { AccionesRecibo } from "@/components/inmobiliaria/recibo-piezas";

// El recibo que ve el inquilino desde su link. Sin login: la llave es el token del contrato y
// el cobro tiene que ser de ese contrato. No se indexa.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recibo de alquiler", robots: { index: false, follow: false } };

export default async function ReciboDelInquilino({ params }: { params: Promise<{ token: string; pagoId: string }> }) {
  const { token, pagoId } = await params;
  const origen = await origenDelSitio();
  const d = await reciboPublico(token, pagoId, origen).catch(() => null);
  if (!d) notFound();
  const marca = marcaInmo(d.negocio.slug);
  return (
    <Marco negocio={d.negocio} marca={marca} mensajeWhatsApp={`Hola ${d.negocio.nombre}! Consulto por el recibo ${d.numero}.`}>
      <div style={{ padding: "28px 16px 48px" }}>
        <Recibo d={d} marca={marca} />
        <AccionesRecibo link={d.link} volver={{ href: `/alquiler/${token}`, texto: "Ver mi cuenta" }} />
      </div>
    </Marco>
  );
}
