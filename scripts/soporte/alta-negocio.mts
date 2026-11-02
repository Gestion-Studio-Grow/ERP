// ============================================================================
// ALTA DE NEGOCIO POR COMANDO — lo que Soporte hace sin pasar por la consola.
// ============================================================================
//
//   npm run soporte:alta -- --nombre "MIA Producciones" --slug mia-producciones --blueprint productora --por-apps
//   Con --produccion usa la conexión del .env principal; sin eso, DATABASE_URL. --probar no escribe nada.
//
// Usa provisionTenant: no borra, no toca otros negocios, y correrlo de nuevo no duplica ni pisa.
// El dueño provisional es «Soporte GSG». Su clave no se imprime: queda en ~/.gsg-soporte/<slug>.txt.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { defaultModulesForBlueprint } from "../../src/blueprints/presets-meta";
import { filaDeInterruptor } from "../../src/cambios/interruptores-core";
import { assertValidSlug, provisionTenant } from "../provision-tenant";

const ENV_PRINCIPAL = process.env.ENV_PRODUCCION ?? "C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env";

const { values: a } = parseArgs({
  options: {
    nombre: { type: "string" },
    slug: { type: "string" },
    blueprint: { type: "string" },
    subdominio: { type: "string" },
    email: { type: "string", default: "soporte@gsgapp.com.ar" },
    "por-apps": { type: "boolean", default: false },
    produccion: { type: "boolean", default: false },
    probar: { type: "boolean", default: false },
  },
});

function conexion(): string {
  if (!a.produccion) return process.env.DATABASE_URL ?? "";
  const linea = readFileSync(ENV_PRINCIPAL, "utf8").split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l)) ?? "";
  const url = new URL(linea.replace(/^\s*DATABASE_URL\s*=\s*/, "").trim().replace(/^["']|["']$/g, ""));
  url.hostname = url.hostname.replace("-pooler", "");
  return url.toString();
}

if (!a.nombre || !a.slug || !a.blueprint) throw new Error("Faltan --nombre, --slug o --blueprint.");
assertValidSlug(a.slug);
const subdominio = a.subdominio ?? a.slug;
const modulos = defaultModulesForBlueprint(a.blueprint);
console.log(`${a.nombre} · ${a.slug} · rubro ${a.blueprint} · subdominio ${subdominio} · módulos ${modulos.join(", ")} · ${a.produccion ? "PRODUCCIÓN" : "base local"}`);

if (a.probar) {
  console.log("Prueba: no se escribió nada.");
  process.exit(0);
}

const url = conexion();
if (!url) throw new Error("Sin conexión: usá --produccion o DATABASE_URL.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
try {
  const r = await provisionTenant(prisma, {
    name: a.nombre,
    slug: a.slug,
    blueprint: a.blueprint,
    owner: { name: "Soporte GSG", email: a.email },
    platform: { status: "TRIAL", subdomain: subdominio, modules: modulos },
  });
  if (r.generatedPassword) {
    const carpeta = path.join(homedir(), ".gsg-soporte");
    mkdirSync(carpeta, { recursive: true });
    const archivo = path.join(carpeta, `${a.slug}.txt`);
    writeFileSync(archivo, `${a.nombre}\nIngreso: ${a.email}\nClave: ${r.generatedPassword}\n`, { mode: 0o600 });
    console.log(`Clave de «Soporte GSG» guardada en ${archivo}`);
  }

  if (a["por-apps"]) {
    const fila = filaDeInterruptor({ tenantId: r.tenantId, interruptor: "inicio-por-apps", accion: "encender", operador: "soporte-comando" });
    const ultimo = await prisma.auditLog.findFirst({ where: { tenantId: r.tenantId, entity: fila.entity, entityId: fila.entityId }, orderBy: { createdAt: "desc" }, select: { action: true } });
    if (ultimo?.action !== fila.action) await prisma.auditLog.create({ data: fila });
  }

  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: r.tenantId }, select: { status: true, blueprintId: true, subdomain: true, modules: true } });
  const apps = await prisma.auditLog.findFirst({ where: { tenantId: r.tenantId, entity: "Interruptor", entityId: "inicio-por-apps" }, orderBy: { createdAt: "desc" }, select: { action: true } });
  console.log(`${r.tenantCreated ? "Creado" : "Ya existía, sin cambios en sus datos"}: estado ${t.status}, rubro ${t.blueprintId}, subdominio ${t.subdomain}, módulos ${t.modules.join(", ")}, dueño ${r.ownerCreated ? "creado" : "ya existía"}, por apps ${apps?.action ?? "apagado"}`);
} finally {
  await prisma.$disconnect();
}
