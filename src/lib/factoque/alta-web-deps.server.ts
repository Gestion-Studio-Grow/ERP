// Cableado del alta web de Factoque: las dependencias de verdad de alta-web.server.ts.
//
// Direcciones (provisional a confirmar con plataforma: el comodín *.gsgapp.com.ar en Vercel):
//  - FACTOQUE_ORIGEN_PUBLICO: de dónde sale el enlace del mail. Default https://factoque.gsgapp.com.ar.
//  - FACTOQUE_ORIGEN_NEGOCIO: plantilla con {subdominio}. Default https://{subdominio}.<APP_BASE_DOMAIN
//    o gsgapp.com.ar>. En local, ej. http://{subdominio}.localhost:3000.
// Mail: RESEND_API_KEY + RESEND_FROM_EMAIL (notifications.ts); sin ellas el mail no sale y la
// pantalla NO promete un mail: deriva a activar por WhatsApp (WHATSAPP_GSG) o, sin número, por la
// casilla de GSG (fix 11/11: prod decía «revisá tu mail» sin mail configurado). FACTOQUE_ALTA_BUZON_LOCAL (sólo fuera de producción) deja el mail en un
// archivo para la QA local: nunca corre en producción.

import { appendFileSync } from "node:fs";
import { authSecret } from "@/lib/auth";
import { enviarMailInterno, mailConectado } from "@/lib/notifications";
import { canalGsg } from "@/app/facturita/contacto";
import { operatorPrisma } from "@/lib/operator-db";
import { DOMINIO_POR_DEFECTO } from "./alta-negocio-core";
import type { Correo } from "./alta-negocio.server";
import { REGLAS_DEL_ALTA, crearLimites, type Limites } from "./alta-web-core";
import type { DepsAltaWeb } from "./alta-web.server";

const g = globalThis as unknown as { limitesAltaFactoque?: Limites };
const limites = (g.limitesAltaFactoque ??= crearLimites(REGLAS_DEL_ALTA));

const buzonLocal = (): string | null => {
  const buzon = process.env.FACTOQUE_ALTA_BUZON_LOCAL?.trim();
  return buzon && process.env.NODE_ENV !== "production" ? buzon : null;
};

function correo(): Correo {
  const buzon = buzonLocal();
  if (buzon) {
    return {
      enviar: async (m) => {
        appendFileSync(buzon, JSON.stringify({ para: m.para, asunto: m.asunto, cuerpo: m.cuerpo }) + "\n", { mode: 0o600 });
        return { sent: true };
      },
    };
  }
  return { enviar: enviarMailInterno };
}

export function depsAltaWeb(): DepsAltaWeb {
  const dominio = process.env.APP_BASE_DOMAIN?.trim() || DOMINIO_POR_DEFECTO;
  const plantilla = process.env.FACTOQUE_ORIGEN_NEGOCIO?.trim() || `https://{subdominio}.${dominio}`;
  return {
    prisma: operatorPrisma,
    correo: correo(),
    secreto: authSecret(),
    ahora: Date.now,
    limites,
    origenPublico: (process.env.FACTOQUE_ORIGEN_PUBLICO?.trim() || "https://factoque.gsgapp.com.ar").replace(/\/+$/, ""),
    origenDelNegocio: (sub) => plantilla.replace("{subdominio}", sub).replace(/\/+$/, ""),
    dominio,
    // El buzón local de QA cuenta como mail que sale (fuera de producción).
    mailConectado: () => buzonLocal() !== null || mailConectado(),
    canalDeActivacion: () => canalGsg(),
  };
}
