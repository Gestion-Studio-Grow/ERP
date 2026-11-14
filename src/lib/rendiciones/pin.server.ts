// El PIN dinámico de ingreso contra la base, el mail y el pase. Reglas puras: pin-core.ts.
//
// Sólo se llega con el pase del primer paso (clave o Google): el usuario y su negocio salen del pase y del host, nunca de
// un mail escrito a mano. El freno vive en la base (hay varias instancias) y cada intento toma la fila FOR UPDATE: dos
// intentos simultáneos no se reparten el contador ni usan dos veces el mismo código.
//
// Anti enumeración y timing: exista o no el usuario, esté bloqueado, vencido o usado, la respuesta es la misma y el trabajo
// también (siempre un HMAC y una transacción con la misma lectura). El motivo real va sólo a la bitácora del servidor.

import "server-only";
import { hkdfSync } from "node:crypto";
import { after } from "next/server";
import { authSecret } from "@/lib/auth";
import { enviarMailInterno } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit";
import { tenantTransaction } from "@/lib/rls";
import { rolDelActor } from "@/lib/proyectos/gestion-core";
import { registrarCambio } from "@/lib/proyectos/gestion.server";
import { esProductora, exigeSegundoPaso, type UsuarioDelIngreso } from "@/lib/proyectos/segundo-factor.server";
import {
  datosDelPedido,
  datosTrasExito,
  datosTrasFallo,
  enlaceWhatsAppDelPin,
  esTablaInexistente,
  estaBloqueado,
  estadoDelPin,
  generarPin,
  hashDelPin,
  MENSAJE_FALLO,
  mensajeDelPedido,
  pinCoincide,
  puedeGenerarPinDe,
  puedePedir,
  ROLES_CON_PIN,
  ROLES_QUE_GENERAN_PIN,
  type ContextoPin,
} from "./pin-core";

// design-lint-ignore: sin interfaz ni animación; el lint toma `Buffer.from(` por el `.from(` de gsap (reducedMotion N/A).
// Derivada de AUTH_SECRET con su propio uso: si se rota, los códigos vivos dejan de servir (vencen en 5 minutos igual).
const clavePin = (): Buffer => Buffer.from(hkdfSync("sha256", authSecret(), "rendiciones-pin-ingreso", "hash", 32));

/** Nadie: el contexto con el que se hace el mismo trabajo cuando no hay usuario. */
const NADIE = "-sin-usuario-";

// Además de la espera de un minuto guardada en la base: 5 pedidos cada 15 minutos por persona y por instancia.
const pedidosPorPersona = createRateLimiter({ max: 5, windowMs: 15 * 60_000 });

// Cuándo pidió cada clave (negocio:usuario, o negocio:-sin-usuario-) por última vez, para el aviso «hace instantes».
// Por instancia y acotado: es sólo el texto del aviso; el freno real vive en la base.
const ultimoPedido = new Map<string, number>();
function anotarPedido(clave: string, ahoraMs: number): number | undefined {
  const anterior = ultimoPedido.get(clave);
  if (ultimoPedido.size > 5000) ultimoPedido.clear();
  ultimoPedido.set(clave, ahoraMs);
  return anterior;
}

const bitacora = (que: string, ctx: ContextoPin) => console.info(`[pin-ingreso] ${que} · negocio ${ctx.tenantId} · usuario ${ctx.userId}`);

/** COMERCIAL/PRODUCCION de una productora que no usan la app de códigos. Quien tiene TOTP (o ve plata) sigue con TOTP. */
export async function exigePin(u: UsuarioDelIngreso): Promise<boolean> {
  if (!(await esProductora(u.tenantId))) return false;
  if (await exigeSegundoPaso(u)) return false;
  const persona = await prisma.proyectoPersona.findFirst({ where: { tenantId: u.tenantId, userId: u.id, activa: true }, select: { rol: true } });
  if (!ROLES_CON_PIN.includes(rolDelActor(persona?.rol, u.role))) return false;
  return tablaDelPinLista(u);
}

/**
 * Hasta que la migración 20261104121000_rendiciones se aplique (Gate 2) la tabla no existe: entonces no se exige PIN y el
 * ingreso sigue como hoy, en vez de romper el login de Comercial/Producción.
 */
async function tablaDelPinLista(u: UsuarioDelIngreso): Promise<boolean> {
  try {
    await prisma.proyectoPinIngreso.findFirst({ where: { tenantId: u.tenantId, userId: u.id }, select: { id: true } });
    return true;
  } catch (e) {
    if (!esTablaInexistente(e)) throw e;
    console.warn("[pin-ingreso] falta la tabla ProyectoPinIngreso (migración sin aplicar): ingreso sin PIN");
    return false;
  }
}

export interface MailDelPin {
  tenantId: string;
  para: string;
  asunto: string;
  cuerpo: string;
}

/** Por defecto, el mail sale después de responder: el tiempo de respuesta no delata si se mandó o no. */
// Es un mail de ingreso de la plataforma: lleva el logo de GSG (marcaGsg), no la marca del negocio.
const enviarDespues = (m: MailDelPin): void => after(() => enviarMailInterno({ ...m, marcaGsg: true }).then(() => undefined));

type Fila = NonNullable<Awaited<ReturnType<typeof prisma.proyectoPinIngreso.findFirst>>>;

/** La fila de esta persona, tomada FOR UPDATE: el resto de los intentos sobre ella espera a que esta transacción cierre. */
async function tomarFila(tx: Parameters<Parameters<typeof tenantTransaction>[0]>[0], ctx: ContextoPin): Promise<Fila | null> {
  await tx.$queryRaw`SELECT id FROM "ProyectoPinIngreso" WHERE "tenantId" = ${ctx.tenantId} AND "userId" = ${ctx.userId} FOR UPDATE`;
  return tx.proyectoPinIngreso.findFirst({ where: { tenantId: ctx.tenantId, userId: ctx.userId } });
}

/**
 * Manda un código nuevo (pisa el vivo, pero no la ventana de fallos ni el bloqueo). Devuelve siempre el mismo mensaje.
 * `tenantId` es el del host; `u`, el usuario del pase dentro de ese negocio (o null si no hay).
 */
export async function pedirPin(
  tenantId: string,
  u: UsuarioDelIngreso | null,
  opciones: { ahoraMs?: number; enviar?: (m: MailDelPin) => unknown } = {},
): Promise<{ mensaje: string }> {
  const ahora = opciones.ahoraMs ?? Date.now();
  const valido = !!u && u.tenantId === tenantId && (await exigePin(u));
  const ctx: ContextoPin = { tenantId, userId: valido ? u.id : NADIE };
  const codigo = generarPin();
  const hash = hashDelPin(codigo, ctx, clavePin());
  const clave = `${ctx.tenantId}:${ctx.userId}`;
  const frenado = pedidosPorPersona.blocked(clave);
  pedidosPorPersona.fail(clave);
  const mensaje = mensajeDelPedido(anotarPedido(clave, ahora), ahora);

  let guardado = false;
  try {
    guardado = await tenantTransaction(
      async (tx) => {
        const f = await tomarFila(tx, ctx);
        if (!valido || frenado || !puedePedir(f, ahora)) return false;
        if (f) await tx.proyectoPinIngreso.updateMany({ where: { id: f.id, tenantId }, data: datosDelPedido(hash, ahora) });
        else await tx.proyectoPinIngreso.create({ data: { tenantId, userId: ctx.userId, ...datosDelPedido(hash, ahora) } });
        return true;
      },
      { tenantId },
    );
  } catch (e) {
    // Dos primeros pedidos simultáneos: la única deja pasar uno; el otro no manda nada.
    if ((e as { code?: string }).code !== "P2002") throw e;
  }

  if (guardado && u) {
    (opciones.enviar ?? enviarDespues)({
      tenantId,
      para: u.email,
      asunto: `Tu código para entrar: ${codigo}`,
      cuerpo: `Tu código para entrar al panel es ${codigo}.\n\nVence en 5 minutos y sirve una sola vez. Si no lo pediste vos, ignorá este mail y avisale a Dirección.`,
    });
    bitacora("código enviado", ctx);
  } else {
    bitacora(valido ? (frenado ? "pedido frenado" : "pedido no enviado (espera o bloqueo)") : "pedido sin usuario con PIN", ctx);
  }
  return { mensaje };
}

export type ResultadoDelPin = { ok: true } | { ok: false; error: string };

/**
 * Un solo uso: el código se marca usado con `updateMany where usadoEl IS NULL AND venceEl > ahora` dentro de la misma
 * transacción que tomó la fila y que, si falla, suma el intento. Quien llama abre la sesión sólo con `ok: true`.
 */
export async function confirmarPin(
  tenantId: string,
  u: UsuarioDelIngreso | null,
  codigo: string,
  opciones: { ahoraMs?: number } = {},
): Promise<ResultadoDelPin> {
  const ahora = opciones.ahoraMs ?? Date.now();
  const valido = !!u && u.tenantId === tenantId && (await exigePin(u));
  const ctx: ContextoPin = { tenantId, userId: valido ? u.id : NADIE };
  const clave = clavePin();

  const { entro, motivo } = await tenantTransaction(
    async (tx) => {
      const f = await tomarFila(tx, ctx);
      const coincide = pinCoincide(codigo, f?.hash ?? null, ctx, clave);
      if (!valido || !f) return { entro: false, motivo: "sin usuario con PIN o sin código pedido" };
      const estado = estadoDelPin(f, ahora);
      if (estado === "bloqueado") return { entro: false, motivo: "bloqueado" };
      if (coincide && estado === "vivo") {
        const hecho = await tx.proyectoPinIngreso.updateMany({
          where: { id: f.id, tenantId, hash: f.hash, usadoEl: null, venceEl: { gt: new Date(ahora) } },
          data: datosTrasExito(ahora),
        });
        if (hecho.count === 1) return { entro: true, motivo: "entró" };
      }
      await tx.proyectoPinIngreso.updateMany({ where: { id: f.id, tenantId }, data: datosTrasFallo(f, ahora) });
      return { entro: false, motivo: coincide ? `código ${estado}` : "código incorrecto" };
    },
    { tenantId },
  );
  bitacora(motivo, ctx);
  return entro ? { ok: true } : { ok: false, error: MENSAJE_FALLO };
}

export interface QuienGenera {
  tenantId: string;
  userId: string;
  rol: string;
  nombre: string;
}

export type CodigoParaPasar = { ok: true; codigo: string; nombre: string; enlace: string } | { ok: false; error: string };

/**
 * Alternativa sin mail (plan Rendí §4): Dirección o Administración generan el código de alguien de su equipo con PIN y se lo
 * pasan por WhatsApp. El código se devuelve UNA vez y no queda en ningún lado (sólo su hash): no se puede volver a ver.
 * Mismo freno que el pedido por mail (un minuto entre códigos, 5 cada 15 minutos, bloqueo) y queda en el registro de
 * cambios quién lo generó. La persona sale de este negocio: la ficha de otro negocio no existe para quien genera.
 */
export async function generarPinParaPasar(a: QuienGenera, personaId: string, opciones: { ahoraMs?: number } = {}): Promise<CodigoParaPasar> {
  const ahora = opciones.ahoraMs ?? Date.now();
  if (!ROLES_QUE_GENERAN_PIN.includes(a.rol)) return { ok: false, error: "Sólo Dirección o Administración pueden generar códigos de ingreso." };
  const persona = await prisma.proyectoPersona.findFirst({ where: { id: personaId, tenantId: a.tenantId, activa: true }, select: { id: true, nombre: true, rol: true, userId: true } });
  if (!persona?.userId) return { ok: false, error: "Esa persona no tiene cuenta de ingreso en este negocio." };
  if (persona.userId === a.userId) return { ok: false, error: "Tu propio código no: entrá con tu app de códigos." };
  const u = await prisma.user.findFirst({ where: { id: persona.userId, tenantId: a.tenantId, active: true, deletedAt: null }, select: { id: true, tenantId: true, email: true, role: true } });
  if (!u || !puedeGenerarPinDe(a.rol, rolDelActor(persona.rol, u.role)) || !(await exigePin(u))) {
    return { ok: false, error: "Esa persona no entra con código: usa su app o su rol no lo pide." };
  }

  const ctx: ContextoPin = { tenantId: a.tenantId, userId: u.id };
  const clave = `${ctx.tenantId}:${ctx.userId}`;
  if (pedidosPorPersona.blocked(clave)) return { ok: false, error: "Ya se generaron muchos códigos para esta persona. Esperá 15 minutos." };
  pedidosPorPersona.fail(clave);
  const codigo = generarPin();
  const hash = hashDelPin(codigo, ctx, clavePin());

  const motivo = await tenantTransaction(
    async (tx) => {
      const f = await tomarFila(tx, ctx);
      if (f && estaBloqueado(f, ahora)) return "Está bloqueada por códigos mal puestos. Esperá 15 minutos.";
      if (!puedePedir(f, ahora)) return "Ya salió un código hace instantes. Esperá un minuto para generar otro.";
      if (f) await tx.proyectoPinIngreso.updateMany({ where: { id: f.id, tenantId: a.tenantId }, data: datosDelPedido(hash, ahora) });
      else await tx.proyectoPinIngreso.create({ data: { tenantId: a.tenantId, userId: u.id, ...datosDelPedido(hash, ahora) } });
      await registrarCambio(tx, { tenantId: a.tenantId, entidad: "Persona", entidadId: persona.id, campo: `${persona.nombre}: código de ingreso`, antes: null, despues: "Generado para pasar por WhatsApp", autor: a.nombre });
      return null;
    },
    { tenantId: a.tenantId },
  );
  if (motivo) return { ok: false, error: motivo };
  bitacora(`código generado por ${a.userId} para pasar por WhatsApp`, ctx);
  return { ok: true, codigo, nombre: persona.nombre, enlace: enlaceWhatsAppDelPin(persona.nombre.split(" ")[0] ?? persona.nombre, codigo) };
}
