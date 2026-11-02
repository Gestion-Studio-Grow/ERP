// La verificación en dos pasos contra la base y las cookies. Sólo rige en una productora: el resto de los negocios entra
// como siempre. Reglas puras: segundo-factor-core.ts.

import "server-only";
import { hkdfSync, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { toDataURL } from "qrcode";
import { authSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rolDelActor } from "./gestion-core";
import { BLOQUEO_MS, cifrarSecreto, crearPase, descifrarSecreto, direccionParaLaApp, hashDeRespaldo, leerPase, MAX_INTENTOS, nuevosCodigosDeRespaldo, ROLES_CON_SEGUNDO_PASO, verificarCodigo, VIGENCIA_PASE_MS } from "./segundo-factor-core";

const COOKIE_PASE = "admin_segundo_paso";
const EN_PRODUCCION = process.env.NODE_ENV === "production";

// Derivadas de AUTH_SECRET, que ya es obligatorio en producción. Si se rota, cada persona vuelve a activar el segundo paso.
const clave = (uso: string): Buffer => Buffer.from(hkdfSync("sha256", authSecret(), "proyectos-segundo-factor", uso, 32));

export interface UsuarioDelIngreso {
  id: string;
  tenantId: string;
  email: string;
  role: string;
}

export async function esProductora(tenantId: string): Promise<boolean> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { blueprintId: true } });
  return t?.blueprintId === "productora";
}

/** Quien lo activó siempre lo usa; quien ve plata, además, está obligado a activarlo. */
export async function exigeSegundoPaso(u: UsuarioDelIngreso): Promise<boolean> {
  if (!(await esProductora(u.tenantId))) return false;
  const [persona, factor] = await Promise.all([
    prisma.proyectoPersona.findFirst({ where: { tenantId: u.tenantId, userId: u.id, activa: true }, select: { rol: true } }),
    prisma.proyectoSegundoFactor.findUnique({ where: { tenantId_userId: { tenantId: u.tenantId, userId: u.id } }, select: { activadoEl: true } }),
  ]);
  return !!factor?.activadoEl || ROLES_CON_SEGUNDO_PASO.includes(rolDelActor(persona?.rol, u.role));
}

export async function darPase(userId: string): Promise<void> {
  (await cookies()).set(COOKIE_PASE, crearPase(userId, Date.now(), clave("pase")), {
    httpOnly: true,
    sameSite: "lax",
    secure: EN_PRODUCCION,
    path: "/admin/login",
    maxAge: VIGENCIA_PASE_MS / 1000,
  });
}

export async function leerPaseActual(): Promise<string | null> {
  return leerPase((await cookies()).get(COOKIE_PASE)?.value, Date.now(), clave("pase"));
}

export async function quitarPase(): Promise<void> {
  (await cookies()).set(COOKIE_PASE, "", { path: "/admin/login", maxAge: 0 });
}

/** Lo necesario para activar: el secreto queda guardado sin activar, así recargar la pantalla no invalida lo escaneado. */
export async function datosDeActivacion(u: UsuarioDelIngreso, emisor: string) {
  const where = { tenantId_userId: { tenantId: u.tenantId, userId: u.id } };
  const existente = await prisma.proyectoSegundoFactor.findUnique({ where, select: { secreto: true } });
  const guardado =
    existente?.secreto ??
    (await prisma.proyectoSegundoFactor.upsert({ where, update: {}, create: { tenantId: u.tenantId, userId: u.id, secreto: cifrarSecreto(randomBytes(20), clave("secreto")) }, select: { secreto: true } })).secreto;
  const secreto = descifrarSecreto(guardado, clave("secreto"));
  const direccion = direccionParaLaApp({ emisor, cuenta: u.email, secreto });
  return { secreto, qr: await toDataURL(direccion, { margin: 1, width: 220 }) };
}

export type ResultadoDelCodigo = { ok: true; codigos?: string[] } | { ok: false; error: string };

const ERROR_CODIGO = "El código no es correcto. Mirá el que muestra la app ahora y probá de nuevo.";

/**
 * El freno se guarda en la base y no en memoria: en producción hay varias instancias, y quien ya tiene la clave no puede
 * repartir intentos entre ellas. Los dos `updateMany` condicionados evitan que dos pedidos simultáneos usen el mismo código.
 */
export async function comprobarCodigo(u: UsuarioDelIngreso, codigo: string): Promise<ResultadoDelCodigo> {
  const where = { tenantId_userId: { tenantId: u.tenantId, userId: u.id } };
  const f = await prisma.proyectoSegundoFactor.findUnique({ where });
  if (!f) return { ok: false, error: "Volvé a ingresar para empezar de nuevo." };
  const ahora = Date.now();
  if (f.bloqueadoHasta && f.bloqueadoHasta.getTime() > ahora) return { ok: false, error: "Demasiados intentos. Esperá 15 minutos y volvé a probar." };

  const activando = !f.activadoEl;
  const paso = verificarCodigo(descifrarSecreto(f.secreto, clave("secreto")), codigo, ahora, f.ultimoPaso);
  if (paso !== null) {
    const nuevos = activando ? nuevosCodigosDeRespaldo() : null;
    const hecho = await prisma.proyectoSegundoFactor.updateMany({
      where: { id: f.id, tenantId: u.tenantId, OR: [{ ultimoPaso: null }, { ultimoPaso: { lt: paso } }] },
      data: { ultimoPaso: paso, intentos: 0, bloqueadoHasta: null, ...(nuevos ? { activadoEl: new Date(ahora), codigosRespaldo: nuevos.hashes } : {}) },
    });
    if (hecho.count === 0) return { ok: false, error: ERROR_CODIGO };
    return { ok: true, codigos: nuevos?.visibles };
  }
  if (!activando) {
    const hash = hashDeRespaldo(codigo);
    if (f.codigosRespaldo.includes(hash)) {
      const hecho = await prisma.proyectoSegundoFactor.updateMany({
        where: { id: f.id, tenantId: u.tenantId, codigosRespaldo: { has: hash } },
        data: { codigosRespaldo: f.codigosRespaldo.filter((c) => c !== hash), intentos: 0, bloqueadoHasta: null },
      });
      if (hecho.count === 1) return { ok: true };
    }
  }
  const intentos = f.intentos + 1;
  await prisma.proyectoSegundoFactor.updateMany({
    where: { id: f.id, tenantId: u.tenantId },
    data: intentos >= MAX_INTENTOS ? { intentos: 0, bloqueadoHasta: new Date(ahora + BLOQUEO_MS) } : { intentos },
  });
  return { ok: false, error: ERROR_CODIGO };
}
