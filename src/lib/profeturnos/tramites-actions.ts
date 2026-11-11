"use server";
// PROFETURNOS · Server action del Botón de arrepentimiento y del Botón de baja (públicos, SIN cuenta:
// Res. SCI 424/2020 y Res. 316/2018). Mismo núcleo que Factoque (src/lib/factoque-tramites.ts) con el
// producto PROFETURNOS; registra en src/lib/profeturnos/tramites.server.ts.
//
// Mail FAIL-CLOSED: sin las claves de Resend el trámite se registra igual, el número sale en pantalla
// y el mensaje dice «guardá este número». Si el envío falla, queda en el log (sin direcciones ni
// claves). Nunca se cae en silencio y nunca se imprime un secreto.
// Con la sesión del profe (procesar en el acto): «Mi plan» (src/app/admin/(dashboard)/clases/plan/_acciones.ts).

import { headers } from "next/headers";
import { after } from "next/server";
import { registrarTramiteProfeturnosPublico } from "@/lib/profeturnos/tramites.server";
import { createRateLimiter } from "@/lib/rate-limit";
import { enviarMailInterno, mailConectado } from "@/lib/notifications";
import {
  avisoParaGsg,
  constanciaPorMail,
  esTipoTramite,
  leerFormularioTramiteProfeturnos,
  mensajeDelTramite,
  NOMBRE_TRAMITE,
  numeroDeTramite,
  PROFETURNOS,
} from "@/lib/factoque-tramites";
import type { ResultadoTramite } from "@/lib/factoque-tramites-actions";
import { fechaFiscalDelDia } from "@/lib/bancos-glue";
import { logger } from "@/lib/logger";
import { canalGsg, linkCanal } from "@/app/facturita/contacto";

// Contra el spam en el AuditLog del negocio, como Factoque: por IP y por usuario del link.
const porIp = createRateLimiter({ max: 10, windowMs: 60 * 60 * 1000 });
const porUsuario = createRateLimiter({ max: 3, windowMs: 24 * 60 * 60 * 1000 });
const DEMASIADOS = "Ya recibimos varios pedidos desde acá. Si es urgente, escribinos directamente y lo resolvemos.";

async function ipDelPedido(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconocida";
}

export async function tramiteProfeturnosAction(_: ResultadoTramite | null, formData: FormData): Promise<ResultadoTramite> {
  const tipo = formData.get("tipo");
  if (!esTipoTramite(tipo)) return { ok: false, error: "No entendimos qué trámite querés hacer." };
  const lectura = leerFormularioTramiteProfeturnos(formData.get("email"), formData.get("usuario"), formData.get("motivo"));
  if (!lectura.ok) return { ok: false, error: lectura.error, campo: lectura.campo };
  const datos = lectura.datos;

  // Pasado el tope por usuario no se traba a nadie (Res. 424: sin trabas): número igual, sin otra fila
  // ni otro mail. El de IP sí frena: traba sólo a quien manda la ráfaga.
  const ip = await ipDelPedido();
  if (porIp.blocked(ip)) return { ok: false, error: DEMASIADOS };
  porIp.fail(ip);
  const clave = `${tipo}:${datos.usuario}`;
  const repetido = porUsuario.blocked(clave);
  if (!repetido) porUsuario.fail(clave);

  try {
    const numero = numeroDeTramite(tipo, fechaFiscalDelDia(new Date()));
    const efecto = "registrado" as const;
    if (!repetido) {
      // Después de responder: misma respuesta y mismo tiempo sea o no cliente.
      after(async () => {
        try {
          await registrarTramiteProfeturnosPublico(tipo, numero, datos);
        } catch (e) {
          logger.error("profeturnos", "no se pudo registrar el trámite público", e, { tipo, numero });
        }
      });
    }
    const conMail = mailConectado();
    if (!conMail) {
      logger.warn("profeturnos", "mail sin conectar: la constancia del trámite la manda GSG a mano", { tipo, numero });
    } else if (!repetido) {
      const cuando = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
      after(async () => {
        const c = constanciaPorMail(tipo, numero, datos, efecto, cuando, PROFETURNOS);
        try {
          const r = await enviarMailInterno({ tenantId: "profeturnos-publico", para: datos.email, asunto: c.asunto, cuerpo: c.cuerpo });
          if (!r.sent) logger.error("profeturnos", "no salió la constancia del trámite", undefined, { tipo, numero, motivo: r.reason });
        } catch (e) {
          logger.error("profeturnos", "no salió la constancia del trámite", e, { tipo, numero });
        }
      });
    }
    const canal = canalGsg();
    return {
      ok: true,
      numero,
      mensaje: mensajeDelTramite(tipo, efecto, conMail, PROFETURNOS),
      avisoHref: linkCanal(canal, `${PROFETURNOS.nombre} · ${NOMBRE_TRAMITE[tipo]} ${numero}`, avisoParaGsg(tipo, numero, datos, efecto, PROFETURNOS)),
      canal: canal.tipo,
    };
  } catch (e) {
    logger.error("profeturnos", "no se pudo registrar el trámite", e, { tipo });
    return { ok: false, error: "No pudimos registrar el trámite. Probá de nuevo en unos minutos o escribinos." };
  }
}
