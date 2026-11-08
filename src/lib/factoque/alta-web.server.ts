// Alta WEB autoservicio de Factoque — el flujo (lo puro está en alta-web-core.ts; la escritura del
// negocio, en alta-negocio.server.ts → `altaNegocioFactoqueWeb`).
//
//   1. pedirAlta    → valida, frena abusos (trampa + límites) y manda el mail con el enlace sellado.
//                     No escribe NADA en la base. Responde siempre lo mismo (no revela mails ni CUIT).
//   2. confirmarAlta → abre el sello y crea el negocio en una transacción (CUIT libre, bajo candado).
//                     Devuelve el enlace para elegir la clave, en la dirección del negocio nuevo.
//   3. elegirClave   → con el sello de clave (atado al hash vigente) guarda la contraseña elegida y
//                     marca el ingreso en el mismo UPDATE condicional: un solo uso, también en carrera.
//
// Todas las dependencias se inyectan (base, mail, reloj, secreto, límites, direcciones): el test de
// Postgres corre esto entero sin red. Las acciones de la pantalla: src/app/facturita/alta/acciones.ts
// y src/app/facturita/clave/acciones.ts.

import type { PrismaClient } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth-password";
import { validatePasswordStrength } from "@/lib/password-policy";
import { enElNegocio } from "@/lib/operator-db";
import { altaNegocioFactoqueWeb, CuitYaRegistrado, RechazoDelAlta, type Correo } from "./alta-negocio.server";
import {
  RESPUESTA_DEL_PEDIDO,
  abrirClave,
  abrirConfirmacion,
  azarDelSlug,
  cayoEnLaTrampa,
  huellaDelHash,
  mailDeConfirmacion,
  mailDeReclamo,
  mailSinAlta,
  mismaHuella,
  selloDeClave,
  selloDeConfirmacion,
  situacionDelCuit,
  slugParaElAlta,
  validarPedido,
  type AltaPendiente,
  type CampoDelPedido,
  type Limites,
  type PedidoDeAlta,
} from "./alta-web-core";
import { tenedoresDelCuit } from "./tenedores-del-cuit.server";

export interface DepsAltaWeb {
  /** La conexión del plano de operador (sujeta a RLS; la escritura para la transacción en el negocio). */
  prisma: PrismaClient;
  correo: Correo;
  secreto: string;
  ahora: () => number;
  limites: Limites;
  /** Origen FIJO de la vidriera (nunca el Host del pedido: un Host falso no puede envenenar el enlace). */
  origenPublico: string;
  /** Origen de la dirección de un negocio, ej. `https://kiosco-ab12.gsgapp.com.ar`. */
  origenDelNegocio: (subdominio: string) => string;
  /** Dominio de las direcciones (para la URL que guarda el alta). */
  dominio?: string;
  azar?: () => string;
}

const ETIQUETA_MAIL = "factoque-alta-web";

export type RespuestaDelPedido =
  | { ok: true; mensaje: string }
  | { ok: false; errores: Partial<Record<CampoDelPedido, string>> }
  | { ok: false; frenado: true; mensaje: string };

const FRENADO = "Recibimos varios pedidos seguidos desde acá. Esperá un rato y probá de nuevo.";

export async function pedirAlta(deps: DepsAltaWeb, pedido: PedidoDeAlta, ip: string): Promise<RespuestaDelPedido> {
  // El robot que llenó el campo trampa recibe lo mismo que una persona, y no pasa nada.
  if (cayoEnLaTrampa(pedido.trampa)) return { ok: true, mensaje: RESPUESTA_DEL_PEDIDO };
  const v = validarPedido(pedido);
  if (!v.ok) return v;
  const a = v.alta;
  if (!deps.limites.pasa([`alta-ip:${ip}`, `alta-mail:${a.email}`, `alta-cuit:${a.cuit}`])) {
    return { ok: false, frenado: true, mensaje: FRENADO };
  }

  // Pase lo que pase con ese CUIT, sale UN mail a la casilla que lo pidió y la pantalla dice lo mismo.
  //  - libre o de este mismo mail (perdió el mail): enlace de confirmación;
  //  - ocupado por un alta web sin verificar: enlace para reclamarlo (gana quien conecte ARCA);
  //  - ocupado por un negocio verificado o de GSG: «no pudimos», sin enlace.
  const situacion = await deps.prisma.$transaction(async (tx) => situacionDelCuit(await tenedoresDelCuit(tx, a.cuit), deps.ahora(), a.email));
  const enlace = `${deps.origenPublico}/facturita/alta/confirmar?t=${selloDeConfirmacion(a, deps.ahora(), deps.secreto)}`;
  const m =
    situacion.tipo === "bloqueado"
      ? mailSinAlta()
      : situacion.tipo === "reclamable"
        ? mailDeReclamo({ nombre: a.nombre, enlace })
        : mailDeConfirmacion({ nombre: a.nombre, enlace });
  const r = await deps.correo
    .enviar({ tenantId: ETIQUETA_MAIL, para: a.email, asunto: m.asunto, cuerpo: m.cuerpo })
    .catch(() => ({ sent: false, reason: "el envío falló" }));
  // Sin dirección ni CUIT en el registro (estándar §4).
  if (!r.sent) console.error(`[alta-web] el mail del alta no salió: ${r.reason ?? "sin detalle"}`);
  return { ok: true, mensaje: RESPUESTA_DEL_PEDIDO };
}

export type RespuestaDeConfirmacion =
  | { ok: true; destino: string; nuevo: boolean }
  | { ok: false; motivo: "enlace" | "frenado" | "error" };

/** Lo que muestra la pantalla de confirmar ANTES del botón (sin escribir nada). */
export function leerConfirmacion(deps: Pick<DepsAltaWeb, "secreto" | "ahora">, sello: string): AltaPendiente | null {
  return abrirConfirmacion(sello, deps.ahora(), deps.secreto);
}

export async function confirmarAlta(deps: DepsAltaWeb, sello: string, ip: string): Promise<RespuestaDeConfirmacion> {
  if (!deps.limites.pasa([`enlace-ip:${ip}`])) return { ok: false, motivo: "frenado" };
  const a = abrirConfirmacion(sello, deps.ahora(), deps.secreto);
  if (!a) return { ok: false, motivo: "enlace" };
  const azar = deps.azar ?? azarDelSlug;

  for (let intento = 0; intento < 3; intento++) {
    try {
      const r = await altaNegocioFactoqueWeb(
        deps.prisma,
        {
          nombre: a.nombre,
          slug: slugParaElAlta(a.nombre, azar()),
          cuit: a.cuit,
          condicionIva: a.condicionIva,
          puntoVenta: a.puntoVenta,
          email: a.email,
          titular: a.nombre,
          operador: "alta-factoque",
        },
        deps.dominio,
        deps.ahora(),
      );
      return { ok: true, nuevo: true, destino: await enlaceDeClave(deps, r.tenantId, r.titularId, r.subdominio) };
    } catch (e) {
      if (e instanceof CuitYaRegistrado) return retomar(deps, a);
      // Slug tomado (choque del azar o carrera): se sortea otro.
      if (e instanceof RechazoDelAlta || esChoqueDeUnicidad(e)) continue;
      console.error(`[alta-web] el alta falló: ${e instanceof Error ? e.name : "error"}`);
      return { ok: false, motivo: "error" };
    }
  }
  return { ok: false, motivo: "error" };
}

function esChoqueDeUnicidad(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/**
 * El CUIT no se pudo tomar. Si es porque ESTE mismo mail ya tiene su negocio con ese CUIT y todavía
 * no eligió su clave (nunca entró), se le da un enlace de clave nuevo: así quien cerró la pestaña no
 * queda afuera. Si ya entró, el enlace está muerto. Para cualquier otro caso, la misma respuesta que
 * un enlace vencido.
 */
async function retomar(deps: DepsAltaWeb, a: AltaPendiente): Promise<RespuestaDeConfirmacion> {
  const s = await deps.prisma.$transaction(async (tx) => situacionDelCuit(await tenedoresDelCuit(tx, a.cuit), deps.ahora(), a.email));
  if (s.tipo !== "propio" || !s.tenedor.subdomain) return { ok: false, motivo: "enlace" };
  const u = s.tenedor.titulares.find((x) => x.email === a.email && x.lastLoginAt === null);
  if (!u) return { ok: false, motivo: "enlace" };
  return { ok: true, nuevo: false, destino: await enlaceDeClave(deps, s.tenedor.tenantId, u.id, s.tenedor.subdomain) };
}

async function enlaceDeClave(deps: DepsAltaWeb, tenantId: string, usuario: string, subdominio: string): Promise<string> {
  const u = await enElNegocio(
    tenantId,
    (tx) => tx.user.findUniqueOrThrow({ where: { id: usuario }, select: { passwordHash: true } }),
    deps.prisma,
  );
  const sello = selloDeClave({ usuario, negocio: tenantId, passwordHash: u.passwordHash }, deps.ahora(), deps.secreto);
  return `${deps.origenDelNegocio(subdominio)}/facturita/clave?t=${sello}`;
}

/** ¿El enlace de clave sirve en ESTA dirección? Sólo lee. */
export async function enlaceDeClaveVigente(
  deps: Pick<DepsAltaWeb, "prisma" | "secreto" | "ahora">,
  sello: string,
  negocioDelHost: string | null,
): Promise<{ email: string; negocio: string } | null> {
  const s = abrirClave(sello, deps.ahora(), deps.secreto);
  if (!s || s.negocio !== negocioDelHost) return null;
  const u = await enElNegocio(
    s.negocio,
    (tx) =>
      tx.user.findFirst({
        where: { id: s.usuario, tenantId: s.negocio, active: true, deletedAt: null },
        select: { email: true, passwordHash: true, tenant: { select: { name: true } } },
      }),
    deps.prisma,
  );
  if (!u || !mismaHuella(huellaDelHash(u.passwordHash), s.huella)) return null;
  return { email: u.email, negocio: u.tenant.name };
}

export type RespuestaDeClave =
  | { ok: true; usuario: string }
  | { ok: false; motivo: "enlace" | "frenado" }
  | { ok: false; problemas: string[] };

export async function elegirClave(
  deps: Pick<DepsAltaWeb, "prisma" | "secreto" | "ahora" | "limites">,
  p: { sello: string; clave: string; repetida: string; negocioDelHost: string | null },
  ip: string,
): Promise<RespuestaDeClave> {
  if (!deps.limites.pasa([`enlace-ip:${ip}`])) return { ok: false, motivo: "frenado" };
  const s = abrirClave(p.sello, deps.ahora(), deps.secreto);
  // El sello es de UN negocio: en la dirección de otro no sirve (y la sesión se abriría en otro lado).
  if (!s || s.negocio !== p.negocioDelHost) return { ok: false, motivo: "enlace" };
  const f = validatePasswordStrength(p.clave);
  const problemas = [...f.problems];
  if (p.clave !== p.repetida) problemas.push("Las dos contraseñas no coinciden.");
  if (problemas.length) return { ok: false, problemas };

  const nuevo = await hashPassword(p.clave);
  const hecho = await enElNegocio(
    s.negocio,
    async (tx) => {
      const u = await tx.user.findFirst({
        where: { id: s.usuario, tenantId: s.negocio, active: true, deletedAt: null },
        select: { passwordHash: true },
      });
      if (!u || !mismaHuella(huellaDelHash(u.passwordHash), s.huella)) return false;
      // UPDATE condicional al hash leído: si dos pestañas mandan a la vez, gana una sola.
      const r = await tx.user.updateMany({
        where: { id: s.usuario, tenantId: s.negocio, passwordHash: u.passwordHash },
        data: { passwordHash: nuevo, lastLoginAt: new Date(deps.ahora()) },
      });
      if (r.count !== 1) return false;
      await tx.auditLog.create({
        data: { tenantId: s.negocio, actor: "web:alta-factoque", action: "factoque.alta.clave-elegida", entity: "User", entityId: s.usuario },
      });
      return true;
    },
    deps.prisma,
  );
  return hecho ? { ok: true, usuario: s.usuario } : { ok: false, motivo: "enlace" };
}
