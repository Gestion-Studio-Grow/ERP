// ALTA DEL AMBIENTE DE PRUEBAS DE WPE (GSG-PLAT-016) — un negocio que simula un cliente real, con el torneo y la
// administración del club guardados en la base y usuarios de verdad (login del ERP).
//
// Orden del dueño (16/11/2026): «Subamoslo a la base y simulemos que es un cliente real» y «Sumemosle la
// administracion del club». El circuito del cliente (`circuito-wpe`, wpe.gsgapp.com.ar) NO se toca (freeze): este es
// OTRO negocio, `wpe-pruebas` (nombre y subdominio provisionales a confirmar por el dueño).
//
// Qué hace (idempotente por slug, aditivo, NUNCA borra):
//   1. El negocio con `provisionTenant` (blueprint genérico, sin catálogo de ejemplo) y su dueño (OWNER).
//   2. Los módulos `torneo` y `club` (con sus dependencias `clients` y `pos`) y el subdominio.
//   3. Los usuarios: organizador (RECEPTION, gestiona el torneo), jugador (PROFESSIONAL, sólo mira) y el agente
//      (PROFESSIONAL con la excepción `torneo:resultados`: carga resultados y W.O., no borra ni reprograma;
//      .claude/agents/agente-wpe.md).
//   4. Contraseña provisoria fuerte para cada usuario NUEVO, con el cambio obligatorio al entrar. Las claves se
//      escriben SÓLO en el archivo de `--claves` (permisos 600) y no se imprimen: se entregan por mail aparte a cada
//      titular (norma del dueño). A un usuario que ya existía no se le toca la contraseña.
//
// En PRODUCCIÓN es Gate del dueño (alta de negocio en Neon): este script lo deja armado, no se corre sin su orden.
// `--laboratorio` (sólo contra una base local) omite el cambio obligatorio, para el QA con capturas.
//
// Uso: DATABASE_URL=… node --import tsx scripts/wpe-pruebas-alta.ts --claves <archivo> [--laboratorio]
//        [--duenio-email …] [--organizador-email …] [--jugador-email …] [--agente-email …]
//
// — Elaborado por GSG

import { chmodSync, writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { generateStrongPassword, hashPassword } from "../src/lib/auth-password";
import { operatorSetMustChange } from "../src/lib/must-change-password";
import { EXCEPCION_RESULTADOS } from "../src/lib/torneo-wpe/permisos";
import { provisionTenant } from "./provision-tenant";

export const SLUG_PRUEBAS = "wpe-pruebas";
export const NOMBRE_PRUEBAS = "Gran Willy · pruebas WPE";
export const MODULOS_PRUEBAS = ["torneo", "club", "clients", "pos"] as const;

type Rol = "OWNER" | "RECEPTION" | "PROFESSIONAL";
export interface UsuarioDelAlta {
  clave: "duenio" | "organizador" | "jugador" | "agente";
  nombre: string;
  email: string;
  rol: Rol;
  agente?: true;
}

/** Los cuatro usuarios del ambiente (emails provisionales a confirmar: dominio `.invalid`, no recibe mails). */
export function usuariosPorDefecto(emails: Partial<Record<UsuarioDelAlta["clave"], string>> = {}): UsuarioDelAlta[] {
  const e = (k: UsuarioDelAlta["clave"]) => (emails[k] ?? `${k}@wpe-pruebas.invalid`).trim().toLowerCase();
  return [
    { clave: "duenio", nombre: "Dueño WPE (pruebas)", email: e("duenio"), rol: "OWNER" },
    { clave: "organizador", nombre: "Organizador WPE (pruebas)", email: e("organizador"), rol: "RECEPTION" },
    { clave: "jugador", nombre: "Jugador WPE (pruebas)", email: e("jugador"), rol: "PROFESSIONAL" },
    { clave: "agente", nombre: "Tomi · agente de IA (pruebas)", email: e("agente"), rol: "PROFESSIONAL", agente: true },
  ];
}

export interface ResultadoDelAlta {
  tenantId: string;
  creados: string[];
  existian: string[];
  /** Contraseñas de los usuarios NUEVOS (email → clave). Nunca se imprimen. */
  claves: Record<string, string>;
}

export async function altaWpePruebas(
  prisma: PrismaClient,
  opts: { usuarios?: UsuarioDelAlta[]; cambioObligatorio: boolean },
): Promise<ResultadoDelAlta> {
  const usuarios = opts.usuarios ?? usuariosPorDefecto();
  const duenio = usuarios.find((u) => u.rol === "OWNER")!;
  const claves: Record<string, string> = {};
  const claveDuenio = generateStrongPassword();
  const r = await provisionTenant(prisma, {
    // El club del ambiente de pruebas se llama «Gran Willy» (dato del dueño, 16/11/2026); el negocio es `wpe-pruebas`.
    name: NOMBRE_PRUEBAS,
    slug: SLUG_PRUEBAS,
    owner: { name: duenio.nombre, email: duenio.email, password: claveDuenio },
    blueprint: "generico",
    skipCatalog: true,
  });
  const creados: string[] = [];
  const existian: string[] = [];
  if (r.ownerCreated) {
    claves[duenio.email] = claveDuenio;
    creados.push(duenio.email);
  } else existian.push(duenio.email);

  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: r.tenantId }, select: { modules: true, subdomain: true } });
  await prisma.tenant.update({
    where: { id: r.tenantId },
    data: { modules: [...new Set([...t.modules, ...MODULOS_PRUEBAS])], ...(t.subdomain ? {} : { subdomain: SLUG_PRUEBAS }) },
  });

  for (const u of usuarios.filter((x) => x.rol !== "OWNER")) {
    let fila = await prisma.user.findUnique({ where: { tenantId_email: { tenantId: r.tenantId, email: u.email } }, select: { id: true } });
    if (!fila) {
      const clave = generateStrongPassword();
      fila = await prisma.user.create({
        data: { tenantId: r.tenantId, name: u.nombre, email: u.email, role: u.rol, passwordHash: await hashPassword(clave) },
        select: { id: true },
      });
      claves[u.email] = clave;
      creados.push(u.email);
    } else existian.push(u.email);
    if (u.agente) {
      const ya = await prisma.userPermissionOverride.findFirst({ where: { tenantId: r.tenantId, userId: fila.id, capability: EXCEPCION_RESULTADOS } });
      if (!ya) await prisma.userPermissionOverride.create({ data: { tenantId: r.tenantId, userId: fila.id, capability: EXCEPCION_RESULTADOS, allowed: true } });
    }
  }

  // Cambio obligatorio para los NUEVOS (el dueño incluido); a los que ya existían no se les toca nada.
  for (const email of creados) {
    const u = await prisma.user.findUniqueOrThrow({ where: { tenantId_email: { tenantId: r.tenantId, email } }, select: { id: true } });
    await operatorSetMustChange(prisma, { userId: u.id, tenantId: r.tenantId }, opts.cambioObligatorio);
  }
  return { tenantId: r.tenantId, creados, existian, claves };
}

function esBaseLocal(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return ["localhost", "127.0.0.1", ""].includes(u.hostname);
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const valor = (n: string) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const archivo = valor("--claves");
  if (!archivo) throw new Error("Falta --claves <archivo>: las contraseñas nuevas se escriben sólo ahí (nunca en pantalla).");
  const laboratorio = args.includes("--laboratorio");
  if (laboratorio && !esBaseLocal(process.env.DATABASE_URL)) throw new Error("--laboratorio sólo corre contra una base local.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const r = await altaWpePruebas(prisma, {
      usuarios: usuariosPorDefecto({
        duenio: valor("--duenio-email"),
        organizador: valor("--organizador-email"),
        jugador: valor("--jugador-email"),
        agente: valor("--agente-email"),
      }),
      cambioObligatorio: !laboratorio,
    });
    writeFileSync(archivo, JSON.stringify(r.claves, null, 2), { mode: 0o600 });
    chmodSync(archivo, 0o600);
    console.log(`✔ ${SLUG_PRUEBAS}: negocio ${r.tenantId}. Usuarios nuevos: ${r.creados.length} (${r.creados.join(", ") || "ninguno"}); ya existían: ${r.existian.length}.`);
    console.log(`  Contraseñas de los nuevos: en ${archivo} (permisos 600). No se imprimen; se entregan por mail aparte.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && /wpe-pruebas-alta\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
