// Cableado del alta web de Factoque: las dependencias de verdad de alta-web.server.ts.
//
// Direcciones (provisional a confirmar con plataforma: el comodín *.gsgapp.com.ar en Vercel):
//  - FACTOQUE_ORIGEN_PUBLICO: de dónde sale el enlace del mail. Default https://factoque.gsgapp.com.ar.
//  - FACTOQUE_ORIGEN_NEGOCIO: plantilla con {subdominio}. Default https://{subdominio}.<APP_BASE_DOMAIN
//    o gsgapp.com.ar>. En local, ej. http://{subdominio}.localhost:3000.
// Mail: RESEND_API_KEY + RESEND_FROM_EMAIL (notifications.ts); sin ellas el mail no sale y la
// pantalla responde igual. FACTOQUE_ALTA_BUZON_LOCAL (sólo fuera de producción) deja el mail en un
// archivo para la QA local: nunca corre en producción.

import { appendFileSync } from "node:fs";
import { authSecret } from "@/lib/auth";
import { enviarMailInterno } from "@/lib/notifications";
import { operatorPrisma } from "@/lib/operator-db";
import { DOMINIO_POR_DEFECTO } from "./alta-negocio-core";
import type { Correo } from "./alta-negocio.server";
import { REGLAS_DEL_ALTA, crearLimites, type Limites } from "./alta-web-core";
import type { DepsAltaWeb } from "./alta-web.server";

const g = globalThis as unknown as { limitesAltaFactoque?: Limites };
const limites = (g.limitesAltaFactoque ??= crearLimites(REGLAS_DEL_ALTA));

function correo(): Correo {
  const buzon = process.env.FACTOQUE_ALTA_BUZON_LOCAL?.trim();
  if (buzon && process.env.NODE_ENV !== "production") {
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
  };
}
