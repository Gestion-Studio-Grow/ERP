// ============================================================================
// SEED DEMO — MIA Producciones. Datos INVENTADOS para mostrar y probar el circuito.
// ============================================================================
//
// 🔴 SÓLO BASE LOCAL. La guarda de abajo corta si DATABASE_URL no apunta a esta máquina: jamás corre
//    contra Neon. Para verlo andando: `node scripts/proyectos/demo-local.mjs`.
//
// Los clientes son ficticios a propósito: MIA publica los suyos, pero una demo no pone marcas de
// terceros en presupuestos inventados.
//
// Ingreso de prueba (NO son credenciales reales; sólo existen en la base local de la demo):
//   dueño: admin@mia-producciones.demo · equipo: diseno@mia-producciones.demo
//   la clave sale de MIA_DEMO_PASSWORD (default abajo).

import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/auth-password";
import { defaultModulesForBlueprint } from "../src/blueprints/presets-meta";
import { baseLocalParaSeed } from "../src/lib/seed/guarda-base";
import { provisionTenant } from "../scripts/provision-tenant";
import { computar, costosVigentes, disenoInicial, type DisenoStand } from "../src/lib/proyectos/stand";
import { precioConMargen } from "../src/lib/proyectos/core";
import { marcaDeGastoProyecto } from "../src/lib/proyectos/marcas";
import { cobroDeCuota, sembrarGestion } from "./seed-mia-gestion";
import { planDeCuotas } from "../src/lib/proyectos/gestion-core";

const guarda = baseLocalParaSeed(process.env.DATABASE_URL);
if (!guarda.ok) {
  console.error(`❌ seed-mia-producciones sólo corre contra una base local. ${guarda.motivo}`);
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: Number(process.env.SEED_DB_MAX ?? 0) || undefined });
const prisma = new PrismaClient({ adapter });

const SLUG = "mia-producciones";
const CLAVE = process.env.MIA_DEMO_PASSWORD ?? "mia-demo-2026";
const DIA = 86_400_000;
const en = (dias: number) => new Date(Date.now() + dias * DIA);
const token = () => randomBytes(18).toString("base64url");
const MARGEN = 35;
const CONDICIONES = "50% de anticipo al aprobar y 50% antes del armado.\nNo incluye derechos del predio ni seguros, salvo indicación.\nValores provisionales de demostración.";

async function main() {
  const r = await provisionTenant(prisma, {
    name: "MIA Producciones",
    slug: SLUG,
    owner: { name: "Dueño de MIA", email: `admin@${SLUG}.demo`, password: CLAVE },
    blueprint: "productora",
    branding: {
      shortLabel: "Agencia creativa y productora integral",
      contactNote: "Creamos. Diseñamos. Desarrollamos. Producimos.",
      instagram: "@miaproducciones",
    },
    platform: { status: "ACTIVE", subdomain: SLUG, modules: defaultModulesForBlueprint("productora"), accentPreset: "azul", frontTheme: "light" },
  });
  const tenantId = r.tenantId;

  // «Trabaja por apps»: sin él, a Proyectos se entra sólo por URL. En producción lo prende la consola;
  // acá se escribe el mismo rastro para que la demo muestre lo que va a ver el negocio.
  if (!(await prisma.auditLog.findFirst({ where: { tenantId, entity: "Interruptor", entityId: "inicio-por-apps" } }))) {
    await prisma.auditLog.create({ data: { tenantId, actor: "operator:demo-local", action: "interruptor.encender", entity: "Interruptor", entityId: "inicio-por-apps", channel: "operador", changes: {} } });
  }

  // Re-sembrado limpio de lo propio del módulo (idempotente).
  await prisma.cashMovement.deleteMany({ where: { tenantId, proyectoPagoId: { not: null } } });
  await prisma.cashMovement.deleteMany({ where: { tenantId, proyectoGastoId: { not: null } } });
  await prisma.proyectoPago.deleteMany({ where: { tenantId } });
  await prisma.proyectoGasto.deleteMany({ where: { tenantId } });
  await prisma.proyecto.deleteMany({ where: { tenantId } });

  // Un usuario de prueba por rol. Administración es Dueño en el ERP porque Facturación lo exige.
  for (const [local, name, role] of [["diseno", "Equipo de diseño", "PROFESSIONAL"], ["comercial", "Lucía Paz", "RECEPTION"], ["administracion", "Rocío Medina", "OWNER"], ["produccion", "Paula Ibáñez", "PROFESSIONAL"], ["sinficha", "Sin ficha", "RECEPTION"]] as const) {
    const email = `${local}@${SLUG}.demo`;
    if (!(await prisma.user.findFirst({ where: { tenantId, email } }))) {
      await prisma.user.create({ data: { tenantId, name, email, passwordHash: await hashPassword(CLAVE), role } });
    }
  }

  await prisma.proyectoConfig.upsert({
    where: { tenantId },
    create: { tenantId, margenPct: MARGEN, validezDias: 15, ivaPct: 21, condiciones: CONDICIONES },
    update: {},
  });

  const cliente = async (name: string, phone: string) =>
    (await prisma.client.findFirst({ where: { tenantId, name } })) ?? prisma.client.create({ data: { tenantId, name, phone } });
  const agro = await cliente("Agro del Sur S.A. (ficticio)", "1150000001");
  const tecno = await cliente("Tecnored Argentina (ficticio)", "1150000002");
  const bebidas = await cliente("Cervecería La Pampa (ficticio)", "1150000003");

  const costos = costosVigentes(null);
  const itemsDe = (d: DisenoStand, standId: string) =>
    computar(d).map((l, posicion) => ({
      tenantId,
      rubro: l.rubro,
      descripcion: l.descripcion,
      unidad: l.unidad,
      cantidad: l.cantidad,
      costo: costos[l.clave],
      precio: precioConMargen(costos[l.clave], MARGEN),
      origen: `stand:${standId}`,
      posicion,
    }));
  const json = (d: DisenoStand) => d as unknown as Prisma.InputJsonValue;

  // 1. Stand con propuesta enviada, lista para que el cliente la responda.
  const dAgro: DisenoStand = {
    ...disenoInicial("ESQUINA", 8, 6),
    textoMarca: "Agro del Sur",
    colorAcento: "#2f6b3c",
    colorPared: "#f2efe6",
    piezas: [
      { id: "a1", tipo: "MOSTRADOR", x: 2.5, z: 2.25, giro: 0 },
      { id: "a2", tipo: "PANTALLA", x: 0, z: -2.75, giro: 0 },
      { id: "a3", tipo: "TARIMA", x: -1.5, z: 0.5, giro: 0 },
      { id: "a4", tipo: "MESA", x: 2.5, z: -1, giro: 0 },
      { id: "a5", tipo: "DEPOSITO", x: 3.25, z: -2.5, giro: 0 },
      { id: "a6", tipo: "PLANTA", x: -3.5, z: 2.5, giro: 0 },
    ],
  };
  const pAgro = await prisma.proyecto.create({
    data: {
      tenantId, numero: 1, clientId: agro.id, nombre: "Stand en Expo Campo", servicio: "ARQUITECTURA", etapa: "PROPUESTA",
      evento: "Expo Campo (ficticia)", lugar: "Predio ferial, Buenos Aires", fechaArmado: en(24), fechaEvento: en(28), fechaDesarme: en(32), responsable: "Equipo de diseño",
      brief: "Stand de esquina de 48 m² para lanzar una línea de maquinaria. Quieren una tarima para el producto, pantalla al fondo y un espacio de reuniones.",
      tareas: { create: [
        { tenantId, titulo: "Pedir el reglamento del predio", responsable: "Producción", venceEl: en(3) },
        { tenantId, titulo: "Recibir logo en vector del cliente", responsable: "Diseño", hechaEl: new Date() },
        { tenantId, titulo: "Cotizar pantalla LED con proveedor", responsable: "Producción", venceEl: en(-1) },
      ] },
    },
  });
  const sAgro = await prisma.proyectoStand.create({ data: { tenantId, proyectoId: pAgro.id, nombre: "Opción 1", diseno: json(dAgro) } });
  await prisma.proyectoPresupuesto.create({
    data: {
      tenantId, proyectoId: pAgro.id, version: 1, estado: "ENVIADO", token: token(), ivaPct: 21, enviadoEl: new Date(), validoHasta: en(15), condiciones: CONDICIONES,
      presentacion: "Un stand abierto a los dos pasillos, con el producto como protagonista sobre la tarima y un rincón tranquilo para cerrar reuniones.",
      items: { create: [
        { tenantId, rubro: "Diseño", descripcion: "Diseño y render 3D", unidad: "global", cantidad: 1, costo: 450000, precio: 700000, posicion: -1 },
        ...itemsDe(dAgro, sAgro.id),
      ] },
    },
  });

  // 2. Activación aprobada, con anticipo cobrado y saldo pendiente.
  const pBebidas = await prisma.proyecto.create({
    data: {
      tenantId, numero: 2, clientId: bebidas.id, nombre: "Activación en festival", servicio: "EXPERIENCIAS", etapa: "PRODUCCION",
      evento: "Festival de verano (ficticio)", lugar: "Costanera", fechaArmado: en(10), fechaEvento: en(12), fechaDesarme: en(13), responsable: "Producción",
      brief: "Barra de marca con experiencia de degustación y foto.",
      tareas: { create: [{ tenantId, titulo: "Confirmar permisos del predio", responsable: "Producción", venceEl: en(4) }] },
      presupuestos: { create: {
        tenantId, version: 1, estado: "APROBADO", token: token(), ivaPct: 21, enviadoEl: en(-9), validoHasta: en(6), respondidoEl: en(-5), respondidoPor: "Laura Gómez (ficticia)", condiciones: CONDICIONES,
        items: { create: [
          { tenantId, rubro: "Producción", descripcion: "Barra de marca y estructura", unidad: "global", cantidad: 1, costo: 2400000, precio: 3400000, proveedor: "Carpintería (ficticia)" },
          { tenantId, rubro: "Producción", descripcion: "Promotoras", unidad: "jornada", cantidad: 6, costo: 90000, precio: 130000, posicion: 1 },
          { tenantId, rubro: "Logística y armado", descripcion: "Flete y armado", unidad: "global", cantidad: 1, costo: 600000, precio: 850000, posicion: 2 },
        ] },
      } },
    },
    include: { presupuestos: { include: { items: true } } },
  });
  // Sus cuotas, como las arma la app (anticipo 50 % y saldo): suman el total aprobado. Se crean después de
  // `sembrarGestion`, que borra las cuotas del negocio; el anticipo queda cobrado, con su cobro registrado.
  const planBebidas = planDeCuotas(
    pBebidas.presupuestos[0].items.map((i) => ({ id: i.id, descripcion: i.descripcion, rubro: i.rubro, cantidad: i.cantidad, costo: i.costo, moneda: i.moneda, recargoPct: i.recargoPct, precio: i.precio, fechaLimite: i.fechaLimite, supplierId: i.supplierId })),
    { proyectoId: pBebidas.id, nombre: pBebidas.nombre, fechaEvento: pBebidas.fechaEvento, creado: pBebidas.createdAt, anticipoClientePct: 50, ivaPct: 21, recargoGeneral: MARGEN, tiposDeCambio: {}, anticipoProveedor: {} },
  ).filter((c) => c.tipo === "COBRO");

  // Sus gastos reales: la carpintería salió más cara de lo presupuestado y el flete todavía se debe.
  const proveedor = async (name: string) =>
    (await prisma.supplier.findFirst({ where: { tenantId, name } })) ?? prisma.supplier.create({ data: { tenantId, name } });
  const carpinteria = await proveedor("Carpintería (ficticia)");
  const fletes = await proveedor("Fletes del Sur (ficticio)");
  const barra = await prisma.proyectoGasto.create({
    data: { tenantId, proyectoId: pBebidas.id, supplierId: carpinteria.id, rubro: "Producción", descripcion: "Barra de marca y estructura", neto: 2650000, iva: 556500, comprobante: "A 0003-00001234", pagadoEl: new Date(), medio: "TRANSFERENCIA", pagadoPor: "Dueño de MIA", cargadoPor: "Dueño de MIA" },
  });
  await prisma.cashMovement.create({
    data: { tenantId, type: "EGRESO", method: "TRANSFERENCIA", amount: 3206500, reason: "Proyecto #2 · Barra de marca y estructura · Carpintería (ficticia)", proyectoGastoId: barra.id, createdBy: marcaDeGastoProyecto(barra.id) },
  });
  await prisma.proyectoGasto.create({
    data: { tenantId, proyectoId: pBebidas.id, supplierId: fletes.id, rubro: "Logística y armado", descripcion: "Flete y armado", neto: 580000, cargadoPor: "Dueño de MIA" },
  });

  await prisma.proyecto.update({ where: { id: pBebidas.id }, data: { tokenEntregables: randomBytes(18).toString("base64url") } });
  await prisma.proyectoEntregable.create({
    data: {
      tenantId, proyectoId: pBebidas.id, nombre: "Gráfica de la barra", especificacion: "3 x 1,2 m, vinilo sobre MDF", venceEl: en(6),
      versiones: {
        create: [
          { tenantId, numero: 1, estado: "CAMBIOS", url: "https://example.com/grafica-barra-v1.pdf", nota: "Primera propuesta", especificacion: "3 x 1,2 m, vinilo sobre MDF", subidoPor: "Equipo de diseño", enviadaEl: new Date(), respondidaEl: new Date(), respondidoPor: "Laura Gómez (ficticia)", comentario: "El logo más grande y a la izquierda." },
          { tenantId, numero: 2, estado: "ENVIADA", url: "https://example.com/grafica-barra-v2.pdf", nota: "Logo más grande, a la izquierda", especificacion: "3 x 1,2 m, vinilo sobre MDF", subidoPor: "Equipo de diseño", enviadaEl: new Date() },
        ],
      },
    },
  });
  await prisma.proyectoEntregable.create({
    data: { tenantId, proyectoId: pBebidas.id, nombre: "Cartelería de ingreso", especificacion: "Medida a confirmar", venceEl: en(8) },
  });

  // 3. Pedido recién entrado, de otro servicio.
  await prisma.proyecto.create({
    data: {
      tenantId, numero: 3, clientId: tecno.id, nombre: "Video institucional", servicio: "CONTENIDOS", etapa: "PEDIDO", responsable: "Dirección creativa",
      brief: "Video de 2 minutos para la convención anual, más tres piezas cortas para redes.",
      entregables: { create: [{ tenantId, nombre: "Video de 2 minutos", especificacion: "Horizontal 16:9, para la convención" }, { tenantId, nombre: "Tres piezas para redes", especificacion: "Vertical 9:16, 30 segundos" }] },
    },
  });

  await sembrarGestion(prisma, tenantId, MARGEN);

  for (const c of planBebidas) {
    const cobrada = c.clave.endsWith(":cliente:anticipo");
    const venceEl = cobrada ? en(-5) : c.venceEl;
    const cuota = await prisma.proyectoCuota.create({ data: { tenantId, proyectoId: pBebidas.id, auto: true, ...c, venceEl, ...(cobrada && { pagadoEl: en(-5), pagadoPor: "Dueño de MIA", medio: "TRANSFERENCIA" }) } });
    if (cobrada) await cobroDeCuota(prisma, tenantId, { proyectoId: pBebidas.id, numero: 2, cuotaId: cuota.id, concepto: c.concepto, monto: c.monto, cobradoEl: en(-5), autor: "Dueño de MIA" });
  }

  console.log(`✅ MIA Producciones listo. Ingreso: admin@${SLUG}.demo`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
