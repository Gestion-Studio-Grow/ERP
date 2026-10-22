// ============================================================================
// SEED DEMO — Profe Matías Consoli, clases de pádel. Datos de ejemplo.
// ============================================================================
//
// Deja al profe funcionando para mostrar y probar: el negocio (rubro `profe-padel`), su
// usuario, horarios y precios PROVISIONALES A CONFIRMAR, y tres alumnos de ejemplo en los
// estados que importan: uno con historial que debe la clase de hoy, uno con el comprobante por
// revisar y una alumna nueva con un pedido sin confirmar.
//
// 🔴 SÓLO BASE LOCAL. La guarda de abajo corta si DATABASE_URL no apunta a esta máquina: jamás
//    corre contra Neon. Para verlo andando sin instalar nada: `node scripts/padel/demo-local.mjs`.
//
// Ingreso de prueba (NO son credenciales reales; sólo existen en la base local de la demo):
//   profe: matias@matiasconsoli.demo · la clave sale de PADEL_DEMO_PASSWORD (default abajo).
//
// Lo inventado, dicho de frente: precios, horarios, alias, alumnos y teléfonos son de ejemplo.
// El celular del profe queda VACÍO a propósito: no se abre WhatsApp a un número que no es el suyo.

import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { defaultModulesForBlueprint } from "../src/blueprints/presets-meta";
import { baseLocalParaSeed } from "../src/lib/seed/guarda-base";
import { provisionTenant } from "../scripts/provision-tenant";

const guarda = baseLocalParaSeed(process.env.DATABASE_URL);
if (!guarda.ok) {
  console.error(`❌ seed-padel-matias sólo corre contra una base local. ${guarda.motivo}`);
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: Number(process.env.SEED_DB_MAX ?? 0) || undefined });
const prisma = new PrismaClient({ adapter });

const SLUG = "matiasconsoli";
const CLAVE = process.env.PADEL_DEMO_PASSWORD ?? "padel-demo-2026";
const DIA = 86_400_000;
const token = () => randomBytes(18).toString("base64url");

// Hora de pared argentina (UTC-3, sin horario de verano) → instante.
const hoyAr = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const enDias = (dias: number, hora: string) => new Date(new Date(`${hoyAr}T${hora}:00-03:00`).getTime() + dias * DIA);

const comprobante = `data:image/jpeg;base64,${readFileSync(path.join(__dirname, "..", "scripts", "padel", "comprobante-ejemplo.jpg")).toString("base64")}`;

async function main() {
  const r = await provisionTenant(prisma, {
    name: "Profe Matías Consoli",
    slug: SLUG,
    owner: { name: "Matías Consoli", email: `matias@${SLUG}.demo`, password: CLAVE },
    blueprint: "profe-padel",
    branding: {
      shortLabel: "Clases de pádel",
      hoursLabel: "Lun a vie 8 a 12 y 16 a 21 · sáb 9 a 13 (provisional a confirmar)",
      instagram: "@matiasconsoli",
      contactNote: "Clases individuales y grupales, todos los niveles. Provisional a confirmar.",
    },
    platform: { status: "ACTIVE", subdomain: SLUG, modules: defaultModulesForBlueprint("profe-padel"), accentPreset: "verde", frontTheme: "dark" },
  });
  const tenantId = r.tenantId;

  // Re-sembrado limpio de lo propio del profe (idempotente).
  await prisma.padelAviso.deleteMany({ where: { tenantId } });
  await prisma.padelClase.deleteMany({ where: { tenantId } });
  await prisma.padelAlumno.deleteMany({ where: { tenantId } });
  await prisma.padelDisponibilidad.deleteMany({ where: { tenantId } });

  // PROVISIONAL A CONFIRMAR con Matías: precios, duración, anticipación y alias.
  await prisma.padelConfig.upsert({
    where: { tenantId },
    create: { tenantId, duracionMin: 60, precioIndividual: 25000, precioGrupal: 12000, aliasCbu: "ALIAS-DE-EJEMPLO", titularCuenta: "A confirmar", anticipacionMin: 120, diasAdelante: 14, maxPendientesPorTel: 2 },
    update: { duracionMin: 60, precioIndividual: 25000, precioGrupal: 12000, aliasCbu: "ALIAS-DE-EJEMPLO", titularCuenta: "A confirmar", whatsappProfe: null },
    // `select` explícito: anda en una base con o sin la migración T4 (src/lib/padel/modelo.ts).
    select: { id: true },
  });

  // Horarios PROVISIONALES: lun a vie 08–12 y 16–21, sábado 09–13.
  const franjas: { diaSemana: number; desde: string; hasta: string }[] = [];
  for (const dia of [1, 2, 3, 4, 5]) franjas.push({ diaSemana: dia, desde: "08:00", hasta: "12:00" }, { diaSemana: dia, desde: "16:00", hasta: "21:00" });
  franjas.push({ diaSemana: 6, desde: "09:00", hasta: "13:00" });
  await prisma.padelDisponibilidad.createMany({ data: franjas.map((f) => ({ tenantId, ...f, tipo: "DA" })) });

  async function alumno(nombre: string, tel: string, nivel: string) {
    const c =
      (await prisma.client.findFirst({ where: { tenantId, phone: tel } })) ??
      (await prisma.client.create({ data: { tenantId, name: nombre, phone: tel } }));
    return prisma.padelAlumno.create({ data: { tenantId, clientId: c.id, token: token(), nivel }, select: { id: true, clientId: true, token: true } });
  }
  async function clase(a: { id: string; clientId: string }, empiezaEn: Date, data: Record<string, unknown>) {
    return prisma.padelClase.create({
      data: { tenantId, alumnoId: a.id, clientId: a.clientId, empiezaEn, terminaEn: new Date(empiezaEn.getTime() + 60 * 60_000), precio: 25000, ...data },
      select: { id: true },
    });
  }

  // Juan: alumno de siempre. Tres semanas pagadas y la de hoy a la mañana, dada y sin cobrar.
  const juan = await alumno("Juan Pérez", "1155550101", "intermedio");
  for (const semanas of [3, 2, 1]) {
    const cuando = enDias(-7 * semanas, "08:00");
    await clase(juan, cuando, { estado: "DADA", origen: "PROFE", confirmadaEl: cuando, dadaEl: cuando, pagoEstado: "PAGADO", pagoMedio: semanas === 2 ? "EFECTIVO" : "TRANSFERENCIA", pagoValidadoEl: cuando });
  }
  await clase(juan, enDias(0, "08:00"), { estado: "DADA", origen: "PROFE", confirmadaEl: enDias(-7, "09:00"), dadaEl: enDias(0, "09:00") });

  // Lucas: clase confirmada hoy a la tarde y ya mandó el comprobante.
  const lucas = await alumno("Lucas Martínez", "1155550102", "principiante");
  await clase(lucas, enDias(-7, "18:00"), { estado: "DADA", origen: "TURNERO", confirmadaEl: enDias(-8, "10:00"), dadaEl: enDias(-7, "19:00"), pagoEstado: "PAGADO", pagoMedio: "EFECTIVO", pagoValidadoEl: enDias(-7, "19:00") });
  const deLucas = await clase(lucas, enDias(0, "18:00"), { estado: "CONFIRMADA", origen: "ALUMNO_LINK", confirmadaEl: enDias(-1, "10:00"), pagoEstado: "EN_REVISION", pagoMedio: "TRANSFERENCIA", comprobante, comprobanteEnviadoEl: enDias(0, "07:30") });
  await prisma.padelAviso.create({ data: { tenantId, destino: "PROFE", tipo: "comprobante", texto: "Lucas Martínez mandó el comprobante de la clase de hoy.", claseId: deLucas.id, alumnoId: lucas.id } });

  // Sofía: alumna nueva, pidió desde el turnero para pasado mañana y espera que Matías confirme.
  const sofia = await alumno("Sofía Gómez", "1155550103", "");
  const deSofia = await clase(sofia, enDias(2, "10:00"), { estado: "PEDIDA", origen: "TURNERO" });
  await prisma.padelAviso.create({ data: { tenantId, destino: "PROFE", tipo: "pedido", texto: "Sofía Gómez pidió clase individual desde el turnero.", claseId: deSofia.id, alumnoId: sofia.id } });

  console.log(`✅ ${r.tenantCreated ? "Creado" : "Actualizado"} ${SLUG}: 3 alumnos, horarios y precios de ejemplo.`);
  console.log(`   Turnero:  http://${SLUG}.localhost:<puerto>/clases`);
  console.log(`   Panel:    http://${SLUG}.localhost:<puerto>/admin  (matias@${SLUG}.demo)`);
  console.log(`   Link de Juan: /alumno/${juan.token}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
