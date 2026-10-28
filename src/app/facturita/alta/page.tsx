// FACTURITA · Alta self-serve (/facturita/alta). Estática y sin base (PD-1).
//
// Hoy el asistente NO crea un negocio: junta los datos en el navegador, enseña a delegar el
// servicio en ARCA y termina con un mensaje para que GSG active la cuenta en el día (alta
// operada, ADR-076 "hasta entonces, altas operadas"). Nada se guarda en el servidor ni en la base:
// ciclo demo → venta → inversión (ADR-030) y DX-1. El cableado a la fábrica de tenants (ADR-074)
// queda pedido a plataforma (docs/producto/facturita/PEDIDOS-A-PLATAFORMA.md).

import type { Metadata } from "next";
import { buildWhatsAppHref, sanitizePhone } from "@/lib/whatsapp-cta";
import VidrieraMarco from "../VidrieraMarco";
import AltaAsistente from "./AltaAsistente";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Empezá gratis — Facturita",
  description: "Pedí tu Facturita en cinco pasos cortos: tu CUIT, cómo estás inscripto y tu punto de venta.",
  generator: "Gestión Studio Grow",
};

export default function FacturitaAltaPage() {
  // El WhatsApp de GSG sale de la variable de entorno (la misma del login y de /admin/usuarios/plan).
  // Sin número cargado no se inventa uno (DX-4): el asistente ofrece copiar el resumen.
  const numero = sanitizePhone(process.env.WHATSAPP_GSG);
  const baseWhatsApp = numero.length >= 10 ? buildWhatsAppHref(numero, "") : null;

  return (
    <VidrieraMarco>
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="font-display text-3xl tracking-[-0.02em] text-strong sm:text-4xl">Empezá gratis</h1>
        <p className="mt-2 text-muted">
          Cinco pasos cortos. No te pedimos tarjeta ni tu clave fiscal.
        </p>
        <AltaAsistente baseWhatsApp={baseWhatsApp} />
      </div>
    </VidrieraMarco>
  );
}
