// El pie burdeos: el slogan, el cierre del catálogo (p21), envíos, medios de pago, WhatsApp sólo si el
// negocio cargó su número, y el acceso al panel. Sin firma visible de GSG (ADR-043: va en la metadata).

import Link from "next/link";
import type { StorefrontCopy } from "@/tenants/storefront";
import { CIERRE } from "./catalogo";

export default function Pie({ copy, hayWhatsApp, alEscribir }: { copy: StorefrontCopy; hayWhatsApp: boolean; alEscribir: () => void }) {
  return (
    <footer className="sh-pie" id="contacto">
      <p className="sh-pie-lema">Que tu luz nunca se apague.</p>
      {/* «¡consultanos!» sin un medio para hacerlo es un callejón: sin WhatsApp no se dice (QA 29/10, MEDIA-4). */}
      {hayWhatsApp && <p className="sh-pie-cierre">{CIERRE}</p>}
      <div className="sh-pie-cols">
        <div>
          <h2>Envíos</h2>
          <p>{copy.deliveryZones.join(" · ")}</p>
        </div>
        <div>
          <h2>Medios de pago</h2>
          <p>{copy.paymentMethods.join(" · ")}</p>
        </div>
        {hayWhatsApp && (
          <div>
            <h2>Contacto</h2>
            <button type="button" className="sh-link sh-link-claro" onClick={alEscribir}>
              Escribinos por WhatsApp
            </button>
          </div>
        )}
      </div>
      <div className="sh-pie-legal">
        <span>© {new Date().getFullYear()} Shine · Velas y aromas</span>
        <Link href="/admin" className="sh-admin">
          Acceso administrador
        </Link>
      </div>
    </footer>
  );
}
