// ============================================================================
// SEED DEMO — Taller Mecánico AGR (Monte Grande). Datos de ejemplo realistas.
// ============================================================================
//
// Deja un taller funcionando para mostrar y probar: el negocio (rubro `taller`), el dueño y un
// mecánico, repuestos con stock, y autos en todos los estados (Gol Trend, Corsa, 208, Hilux,
// Cronos, Etios…) con presupuestos, cobros, garantías y avisos de VTV y service.
//
// 🔴 SÓLO BASE LOCAL. La guarda de abajo corta si DATABASE_URL no apunta a esta máquina: jamás
//    corre contra Neon. Para verlo andando sin instalar nada: `node scripts/taller/demo-local.mjs`.
//
// Ingreso de prueba (NO son credenciales reales; sólo existen en la base local de la demo):
//   dueño:    admin@taller-agr.demo  ·  mecánico: mecanico@taller-agr.demo
//   la clave sale de TALLER_DEMO_PASSWORD (default abajo).

import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/auth-password";
import { defaultModulesForBlueprint } from "../src/blueprints/presets-meta";
import { baseLocalParaSeed } from "../src/lib/seed/guarda-base";
import { provisionTenant } from "../scripts/provision-tenant";

const guarda = baseLocalParaSeed(process.env.DATABASE_URL);
if (!guarda.ok) {
  console.error(`❌ seed-taller-agr sólo corre contra una base local. ${guarda.motivo}`);
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: Number(process.env.SEED_DB_MAX ?? 0) || undefined });
const prisma = new PrismaClient({ adapter });

const SLUG = "taller-agr";
const CLAVE = process.env.TALLER_DEMO_PASSWORD ?? "taller-demo-2026";
const DIA = 86_400_000;
const hace = (dias: number) => new Date(Date.now() - dias * DIA);
const en = (dias: number) => new Date(Date.now() + dias * DIA);
const token = () => randomBytes(18).toString("base64url");

type Item = { tipo: "MANO_OBRA" | "REPUESTO"; descripcion: string; cantidad?: number; costo?: number; precio: number; decision?: string; traidoPorCliente?: boolean };

async function main() {
  const r = await provisionTenant(prisma, {
    name: "Taller Mecánico AGR",
    slug: SLUG,
    owner: { name: "Ariel (dueño)", email: `admin@${SLUG}.demo`, password: CLAVE },
    blueprint: "taller",
    branding: {
      shortLabel: "Expertos en cuidado automotor",
      addressLine: "Av. Pedro Dreyer 870",
      city: "Monte Grande",
      // Jueves confirmado en Google Maps (8:30–12 y 14:30–19). El resto, provisional a confirmar.
      hoursLabel: "Lun a vie · 8:30 a 12 y 14:30 a 19 h",
      // Provisional a confirmar: es el teléfono publicado en Google; falta el celular de WhatsApp.
      whatsapp: "541151839732",
      instagram: "@tallermecanicoagr",
      mapsUrl: "https://maps.app.goo.gl/7JRjRZ53rN3Chx5x8",
      contactNote: "Motores, frenos, suspensión e inyección. Diagnóstico preciso. Turnos por mensaje.",
    },
    platform: { status: "ACTIVE", subdomain: SLUG, modules: defaultModulesForBlueprint("taller"), accentPreset: "oxblood", frontTheme: "dark" },
  });
  const tenantId = r.tenantId;

  // Re-sembrado limpio de lo propio del taller (idempotente).
  await prisma.tallerOrden.deleteMany({ where: { tenantId } });
  await prisma.tallerVehiculo.deleteMany({ where: { tenantId } });
  await prisma.tallerAvisoEnviado.deleteMany({ where: { tenantId } });

  const mecanicoEmail = `mecanico@${SLUG}.demo`;
  const mecanico =
    (await prisma.user.findFirst({ where: { tenantId, email: mecanicoEmail } })) ??
    (await prisma.user.create({ data: { tenantId, name: "Gastón Rivero", email: mecanicoEmail, passwordHash: await hashPassword(CLAVE), role: "PROFESSIONAL" } }));
  const duenio = await prisma.user.findFirstOrThrow({ where: { tenantId, role: "OWNER" } });

  await prisma.tallerConfig.upsert({
    where: { tenantId },
    create: { tenantId, margenPct: 35, validezDias: 7, garantiaDias: 90, valorHora: 28000, aliasCbu: "taller.agr.mp", linkResena: "https://maps.app.goo.gl/7JRjRZ53rN3Chx5x8" },
    update: {},
  });

  // Repuestos de rotación (precios de referencia, octubre 2026 — provisionales).
  if ((await prisma.product.count({ where: { tenantId } })) === 0) {
    const repuestos: [string, number, number, number][] = [
      ["Aceite sintético 5W30 x 4 L", 62000, 9, 4],
      ["Aceite semisintético 10W40 x 4 L", 41000, 12, 4],
      ["Filtro de aceite (línea VW/Fiat)", 9500, 14, 6],
      ["Filtro de aire", 12500, 8, 4],
      ["Filtro de combustible", 11000, 3, 4],
      ["Juego de pastillas de freno delanteras", 38000, 6, 3],
      ["Disco de freno delantero (par)", 96000, 2, 2],
      ["Bujías x 4", 34000, 5, 3],
      ["Kit de distribución (correa + tensor)", 148000, 2, 2],
      ["Líquido de frenos DOT 4 x 500 ml", 9800, 10, 4],
      ["Amortiguador delantero", 89000, 4, 2],
      ["Batería 12V 65 Ah", 165000, 1, 2],
    ];
    for (const [name, price, stock, lowStockAt] of repuestos) {
      await prisma.product.create({ data: { tenantId, name, price, stock, lowStockAt, trackStock: true } });
    }
  }

  const gente: { nombre: string; tel: string; etiquetas: string[]; ctaCte?: boolean; autos: { patente: string; marca: string; modelo: string; anio: number; km: number; vtv?: Date; serviceKm?: number; serviceFecha?: Date }[] }[] = [
    { nombre: "Marcelo Benítez", tel: "1151234501", etiquetas: ["particular"], autos: [{ patente: "AB123CD", marca: "Volkswagen", modelo: "Gol Trend", anio: 2017, km: 118400, vtv: en(18), serviceKm: 120000 }] },
    { nombre: "Luciana Ferreyra", tel: "1151234502", etiquetas: ["particular", "VIP"], autos: [{ patente: "AE456FG", marca: "Peugeot", modelo: "208", anio: 2021, km: 54200, serviceFecha: en(10) }] },
    { nombre: "Rubén Acosta", tel: "1151234503", etiquetas: ["particular"], autos: [{ patente: "HXK482", marca: "Chevrolet", modelo: "Corsa Classic", anio: 2009, km: 231000, vtv: hace(6) }] },
    { nombre: "Distribuidora El Jagüel SRL", tel: "1151234504", etiquetas: ["empresa", "flota"], ctaCte: true, autos: [
      { patente: "AC789HI", marca: "Toyota", modelo: "Hilux", anio: 2019, km: 187600, serviceKm: 190000 },
      { patente: "AD321JK", marca: "Fiat", modelo: "Fiorino", anio: 2020, km: 142300 },
    ] },
    { nombre: "Carolina Sosa", tel: "1151234505", etiquetas: ["particular"], autos: [{ patente: "AF654LM", marca: "Fiat", modelo: "Cronos", anio: 2022, km: 39800 }] },
    { nombre: "Jorge Ledesma", tel: "1151234506", etiquetas: ["particular"], autos: [{ patente: "PGT915", marca: "Toyota", modelo: "Etios", anio: 2016, km: 126500, vtv: en(95) }] },
    { nombre: "Micaela Duarte", tel: "1151234507", etiquetas: ["particular"], autos: [{ patente: "AA987NO", marca: "Renault", modelo: "Sandero", anio: 2016, km: 98700 }] },
    { nombre: "Héctor Villalba", tel: "1151234508", etiquetas: ["particular"], autos: [{ patente: "KLM204", marca: "Ford", modelo: "Fiesta Kinetic", anio: 2012, km: 164200 }] },
  ];

  const veh = new Map<string, { id: string; clientId: string }>();
  for (const g of gente) {
    const c =
      (await prisma.client.findFirst({ where: { tenantId, phone: g.tel } })) ??
      (await prisma.client.create({ data: { tenantId, name: g.nombre, phone: g.tel, tallerEtiquetas: g.etiquetas, tallerCtaCte: !!g.ctaCte } }));
    for (const a of g.autos) {
      const v = await prisma.tallerVehiculo.create({
        data: { tenantId, clientId: c.id, patente: a.patente, marca: a.marca, modelo: a.modelo, anio: a.anio, km: a.km, vtvVence: a.vtv, proximoServiceKm: a.serviceKm, proximoServiceFecha: a.serviceFecha },
      });
      veh.set(a.patente, { id: v.id, clientId: c.id });
    }
  }

  let numero = 0;
  async function orden(o: {
    patente: string; estado: string; hace: number; km: number; combustible: number; problema: string; diagnostico?: string; mecanico?: boolean; horas?: number;
    items?: Item[]; enviado?: number; pagos?: [string, number, number?][]; entregado?: number; garantiaDias?: number;
  }) {
    const v = veh.get(o.patente)!;
    const creada = hace(o.hace);
    const entregadoEl = o.entregado != null ? hace(o.entregado) : null;
    return prisma.tallerOrden.create({
      data: {
        tenantId, numero: ++numero, vehiculoId: v.id, clientId: v.clientId, estado: o.estado, km: o.km, combustible: o.combustible,
        problema: o.problema, diagnostico: o.diagnostico, horas: o.horas ?? 0, token: token(), createdAt: creada,
        mecanicoUserId: o.mecanico ? mecanico.id : null, mecanicoNombre: o.mecanico ? mecanico.name : null,
        presupuestoEnviadoEl: o.enviado != null ? hace(o.enviado) : null,
        presupuestoValidoHasta: o.enviado != null ? new Date(hace(o.enviado).getTime() + 7 * DIA) : null,
        entregadoEl, garantiaHasta: entregadoEl && o.garantiaDias ? new Date(entregadoEl.getTime() + o.garantiaDias * DIA) : null,
        garantiaDetalle: entregadoEl ? "Mano de obra y repuestos colocados" : null, comprobanteTipo: entregadoEl ? "C" : null,
        items: { create: (o.items ?? []).map((i, n) => ({ tenantId, tipo: i.tipo, descripcion: i.descripcion, cantidad: i.cantidad ?? 1, costo: i.costo ?? 0, precio: i.precio, decision: i.decision ?? "PENDIENTE", traidoPorCliente: !!i.traidoPorCliente, posicion: n })) },
        pagos: { create: (o.pagos ?? []).map(([medio, monto, diasAtras]) => ({ tenantId, medio, monto, cobradoPor: duenio.name, createdAt: hace(diasAtras ?? 0) })) },
      },
    });
  }
  const A = "APROBADO";

  // Historia (para reportes, garantías y "no vuelve hace 6 meses").
  await orden({ patente: "KLM204", estado: "ENTREGADO", hace: 232, entregado: 230, km: 158900, combustible: 4, problema: "Service y ruido en tren delantero", diagnostico: "Bieletas con juego. Service al día.", mecanico: true, horas: 3, garantiaDias: 90,
    items: [{ tipo: "MANO_OBRA", descripcion: "Service completo (aceite y filtros)", precio: 78000, decision: A }, { tipo: "REPUESTO", descripcion: "Aceite semisintético 10W40 x 4 L", costo: 26000, precio: 35000, decision: A }, { tipo: "MANO_OBRA", descripcion: "Cambio de bieletas", precio: 32000, decision: A }, { tipo: "REPUESTO", descripcion: "Bieletas (par)", costo: 21000, precio: 28500, decision: A }],
    pagos: [["EFECTIVO", 173500, 230]] });
  await orden({ patente: "AA987NO", estado: "ENTREGADO", hace: 121, entregado: 119, km: 94100, combustible: 2, problema: "Se enciende la luz de motor", diagnostico: "Bobina del cilindro 2 con falla. Se reemplaza y se borran códigos.", mecanico: true, horas: 2, garantiaDias: 90,
    items: [{ tipo: "MANO_OBRA", descripcion: "Diagnóstico computarizado (escáner)", precio: 22000, decision: A }, { tipo: "REPUESTO", descripcion: "Bobina de encendido", costo: 48000, precio: 64800, decision: A }, { tipo: "MANO_OBRA", descripcion: "Limpieza de inyectores", precio: 58000, decision: "RECHAZADO" }],
    enviado: 121, pagos: [["TRANSFERENCIA", 86800, 119]] });
  await orden({ patente: "AC789HI", estado: "ENTREGADO", hace: 64, entregado: 62, km: 180200, combustible: 6, problema: "Service de los 180.000 km", mecanico: true, horas: 2.5, garantiaDias: 90,
    items: [{ tipo: "MANO_OBRA", descripcion: "Service completo (aceite y filtros)", precio: 95000, decision: A }, { tipo: "REPUESTO", descripcion: "Aceite sintético 5W30 x 4 L", cantidad: 2, costo: 46000, precio: 62000, decision: A }, { tipo: "REPUESTO", descripcion: "Filtro de aceite", costo: 7000, precio: 9500, decision: A }],
    enviado: 64, pagos: [["TRANSFERENCIA", 228500, 60]] });
  await orden({ patente: "AD321JK", estado: "ENTREGADO", hace: 26, entregado: 24, km: 141000, combustible: 3, problema: "Frena largo", diagnostico: "Pastillas delanteras al límite y disco rayado.", mecanico: true, horas: 2, garantiaDias: 90,
    items: [{ tipo: "MANO_OBRA", descripcion: "Cambio de pastillas de freno (eje)", precio: 45000, decision: A }, { tipo: "REPUESTO", descripcion: "Juego de pastillas de freno delanteras", costo: 28000, precio: 38000, decision: A }, { tipo: "REPUESTO", descripcion: "Disco de freno delantero (par)", costo: 71000, precio: 96000, decision: A }],
    enviado: 26, pagos: [["TRANSFERENCIA", 100000, 24]] }); // empresa con cuenta corriente: queda saldo
  await orden({ patente: "PGT915", estado: "ENTREGADO", hace: 9, entregado: 8, km: 126500, combustible: 5, problema: "Cambio de aceite", mecanico: true, horas: 1, garantiaDias: 90,
    items: [{ tipo: "MANO_OBRA", descripcion: "Cambio de aceite y filtro", precio: 60000, decision: A }, { tipo: "REPUESTO", descripcion: "Aceite (lo trae el cliente)", precio: 0, decision: A, traidoPorCliente: true }, { tipo: "REPUESTO", descripcion: "Filtro de aceite", costo: 7000, precio: 9500, decision: A }],
    pagos: [["MERCADO_PAGO", 69500, 8]] });

  // En el taller hoy: uno por estado.
  await orden({ patente: "AF654LM", estado: "RECIBIDO", hace: 0, km: 39800, combustible: 6, problema: "Service de los 40.000 y revisar ruido al pasar lomos de burro" });
  await orden({ patente: "HXK482", estado: "DIAGNOSTICO", hace: 1, km: 231000, combustible: 2, problema: "Pierde agua y calienta en el tránsito", mecanico: true });
  await orden({ patente: "AB123CD", estado: "ESPERANDO_APROBACION", hace: 3, enviado: 3, km: 118400, combustible: 4, problema: "Hace ruido al frenar y tira para la derecha", diagnostico: "Pastillas delanteras gastadas y extremo de dirección derecho con juego. Conviene alinear.", mecanico: true,
    items: [{ tipo: "MANO_OBRA", descripcion: "Cambio de pastillas de freno (eje)", precio: 45000 }, { tipo: "REPUESTO", descripcion: "Juego de pastillas de freno delanteras", costo: 28000, precio: 38000 }, { tipo: "MANO_OBRA", descripcion: "Cambio de extremo de dirección", precio: 35000 }, { tipo: "REPUESTO", descripcion: "Extremo de dirección derecho", costo: 24000, precio: 32400 }, { tipo: "MANO_OBRA", descripcion: "Alineación y balanceo", precio: 38000 }] });
  await orden({ patente: "AE456FG", estado: "ESPERANDO_REPUESTOS", hace: 2, enviado: 2, km: 54200, combustible: 7, problema: "Golpe seco en la suspensión delantera", diagnostico: "Amortiguador delantero izquierdo perdiendo. Se cambian los dos.", mecanico: true,
    items: [{ tipo: "MANO_OBRA", descripcion: "Cambio de amortiguadores (par)", precio: 80000, decision: A }, { tipo: "REPUESTO", descripcion: "Amortiguador delantero", cantidad: 2, costo: 66000, precio: 89000, decision: A }],
    pagos: [["TRANSFERENCIA", 100000, 1]] }); // seña
  await orden({ patente: "AC789HI", estado: "EN_REPARACION", hace: 1, enviado: 1, km: 187600, combustible: 5, problema: "Cambio de correa de distribución (ya le toca)", mecanico: true, horas: 3,
    items: [{ tipo: "MANO_OBRA", descripcion: "Cambio de correa de distribución", precio: 180000, decision: A }, { tipo: "REPUESTO", descripcion: "Kit de distribución (correa + tensor)", costo: 109000, precio: 148000, decision: A }, { tipo: "REPUESTO", descripcion: "Bomba de agua", costo: 52000, precio: 70200, decision: A }] });
  await orden({ patente: "AA987NO", estado: "LISTO", hace: 4, enviado: 3, km: 98700, combustible: 3, problema: "No arranca en frío", diagnostico: "Batería agotada. Alternador carga bien.", mecanico: true, horas: 1,
    items: [{ tipo: "MANO_OBRA", descripcion: "Diagnóstico eléctrico", precio: 20000, decision: A }, { tipo: "REPUESTO", descripcion: "Batería 12V 65 Ah", costo: 122000, precio: 165000, decision: A }] });

  console.log(`✅ ${r.tenantCreated ? "Creado" : "Actualizado"} ${SLUG}: ${gente.length} clientes, ${veh.size} vehículos, ${numero} órdenes.`);
  console.log(`   Entrar en http://${SLUG}.localhost:<puerto>/admin con admin@${SLUG}.demo (dueño) o mecanico@${SLUG}.demo.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
