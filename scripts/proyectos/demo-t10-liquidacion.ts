// ============================================================================
// DEMO T10 (GSG-MIA-171) — liquidación del proyecto en sus cuatro estados, SOBRE LA BASE LOCAL de la demo.
// ============================================================================
//
// Corre después de `node scripts/proyectos/demo-local.mjs` (que siembra MIA Producciones en PGlite) y suma cuatro
// proyectos con el escenario Z del plan MIA-50 (venta 1.490.000, costo original 1.000.000, real 900.000):
//   1. borrador sin diferencia  · 2. borrador con diferencia (gasto sin comprobante y saldo por cobrar)
//   3. revisada (Dirección ve el pedido del código) · 4. aprobada, con un comprobante que entró después (para ajuste)
//
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54338/postgres npx tsx scripts/proyectos/demo-t10-liquidacion.ts
//
// Datos inventados; la guarda de seeds frena cualquier base que no sea local.

import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { baseLocalParaSeed } from "../../src/lib/seed/guarda-base";
import { calcularLiquidacion } from "../../src/lib/proyectos/liquidacion-proyecto-core";

const guarda = baseLocalParaSeed(process.env.DATABASE_URL);
if (!guarda.ok) throw new Error(guarda.motivo);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });
const $ = (pesos: number) => pesos * 100;
const EVENTO = new Date("2026-11-01T12:00:00-03:00");

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ where: { slug: "mia-producciones" }, select: { id: true } });
  const tenantId = tenant.id;
  const persona = (nombre: string) => prisma.proyectoPersona.findFirstOrThrow({ where: { tenantId, nombre }, select: { id: true, nombre: true } });
  const [paula, lucia, rocio] = await Promise.all([persona("Paula Ibáñez"), persona("Lucía Paz"), persona("Rocío Medina")]);
  const cliente = await prisma.client.findFirstOrThrow({ where: { tenantId }, select: { id: true } });
  const prov = await prisma.supplier.findFirstOrThrow({ where: { tenantId }, select: { id: true } });
  let numero = ((await prisma.proyecto.aggregate({ where: { tenantId }, _max: { numero: true } }))._max.numero ?? 0) + 100;
  let comp = 0;

  const comprobante = async (proyectoId: string, pesos: number) => {
    const c = await prisma.proyectoComprobante.create({ data: { tenantId, supplierId: prov.id, tipo: "C", numero: `${String(numero).padStart(4, "0")}-${String(++comp).padStart(8, "0")}`, fecha: EVENTO, netoCentavos: BigInt($(pesos)), totalCentavos: BigInt($(pesos)), cargadoPorId: "demo", cargadoNombre: "Rocío Medina" }, select: { id: true } });
    const l = await prisma.proyectoComprobanteLinea.create({ data: { tenantId, comprobanteId: c.id, destino: "PROYECTO", proyectoId, categoria: "Producción", netoCentavos: BigInt($(pesos)), ivaTratamiento: "COSTO", costoCentavos: BigInt($(pesos)) }, select: { id: true } });
    return l.id;
  };

  const proyecto = async (nombre: string, o: { gasto?: number; cobrado: number; estado: "BORRADOR" | "REVISADA" | "APROBADA"; nota?: string }) => {
    numero++;
    const p = await prisma.proyecto.create({ data: { tenantId, numero, clientId: cliente.id, nombre, servicio: "EVENTOS", etapa: "APROBADO", brief: "Stand", responsable: "Lucía Paz", fechaEvento: EVENTO }, select: { id: true } });
    const pres = await prisma.proyectoPresupuesto.create({ data: { tenantId, proyectoId: p.id, version: 1, estado: "APROBADO", token: `demo-t10-${p.id}`, ivaPct: 21 }, select: { id: true } });
    await prisma.proyectoItem.create({ data: { tenantId, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1_490_000, costo: 1_000_000 } });
    const eqP = await prisma.proyectoEquipo.create({ data: { tenantId, proyectoId: p.id, personaId: paula.id, funcion: "PRODUCTOR" }, select: { id: true } });
    const eqL = await prisma.proyectoEquipo.create({ data: { tenantId, proyectoId: p.id, personaId: lucia.id, funcion: "COMERCIAL" }, select: { id: true } });
    const participantes: { equipoId: string | null; personaId: string | null; nombre: string; funcion: string; comisionPct: number; reparto: Record<string, number> }[] = [
      { equipoId: eqP.id, personaId: paula.id, nombre: paula.nombre, funcion: "PRODUCTOR", comisionPct: 10, reparto: { DEFENSA: 25 } },
      { equipoId: eqL.id, personaId: lucia.id, nombre: lucia.nombre, funcion: "COMERCIAL", comisionPct: 10, reparto: { DEFENSA: 0 } },
      { equipoId: null, personaId: null, nombre: "MIA Producciones", funcion: "EMPRESA", comisionPct: 0, reparto: { DEFENSA: 75, REDONDEO: 100 } },
    ];
    const parametros = { comisiones: { PRODUCTOR: $(30_000), COMERCIAL: $(30_000) }, rentabilidad: $(300_000), margenError: $(65_000), provisionales: [] };
    await prisma.proyectoPrecioFoto.create({
      data: {
        tenantId, proyectoId: p.id, presupuestoId: pres.id, version: 1, modo: "POR_TOTAL", moneda: "ARS", ivaPct: 21,
        costoOriginalCentavos: BigInt($(1_000_000)), adicionalesCentavos: BigInt(0), subtotalCentavos: BigInt($(1_425_000)), iibGaCentavos: BigInt(0),
        totalVentaCentavos: BigInt($(1_490_000)), redondeoBrutoCentavos: BigInt($(65_000)), redondeoNetoCentavos: BigInt($(65_000)),
        parametros, participantes, aprobadoPor: "Dueño de MIA",
      },
    });
    const linea = await comprobante(p.id, 900_000);
    if (o.gasto) await prisma.proyectoGasto.create({ data: { tenantId, proyectoId: p.id, descripcion: "Taxi al predio", neto: o.gasto, iva: 0 } });
    const facturado = 1_802_900; // 1.490.000 × 1,21
    const cuota = await prisma.proyectoCuota.create({ data: { tenantId, proyectoId: p.id, tipo: "COBRO", concepto: "Total", monto: facturado, moneda: "ARS", venceEl: EVENTO, auto: false }, select: { id: true } });
    const inv = await prisma.invoice.create({ data: { tenantId, puntoVenta: 3, tipoComprobante: 6, concepto: 2, docTipo: 99, docNro: "0", fecha: "20261101", neto: facturado / 1.21, iva: facturado - facturado / 1.21, total: facturado, numero: 9000 + numero }, select: { id: true } });
    await prisma.proyectoCuotaFactura.create({ data: { tenantId, cuotaId: cuota.id, facturaId: inv.id, tramo: "ANTICIPO", creadoPor: "Demo" } });
    await prisma.proyectoPago.create({ data: { tenantId, proyectoId: p.id, medio: "TRANSFERENCIA", monto: o.cobrado } });

    const costoReal = $(900_000 + (o.gasto ?? 0));
    const r = calcularLiquidacion({ totalVenta: $(1_490_000), costoOriginal: $(1_000_000), adicionales: 0, redondeoBruto: $(65_000), rentabilidad: $(300_000), margenError: $(65_000), comisiones: parametros.comisiones, participantes, costoReal, defensaNegativa: "DESCUENTA" });
    if (!r.cierra) throw new Error(`${nombre}: no cierra al centavo`);
    const declarada = new Date("2026-11-10T10:00:00-03:00");
    const cab = await prisma.proyectoLiquidacionProyecto.create({
      data: {
        tenantId, proyectoId: p.id, estado: o.estado, presupuestoId: pres.id, fotoVersion: 1,
        totalVenta: BigInt($(1_490_000)), costoReal: BigInt(costoReal), comprobantes: BigInt($(900_000)), facturado: BigInt($(facturado)), cobrado: BigInt($(o.cobrado)), esperado: BigInt(r.esperado),
        costoDetalle: { lineasDeComprobante: [linea], gastos: [], cuotasPrevistas: [] },
        parametros: { valores: { "reparto.defensaNegativa": "DESCUENTA", "reparto.cuandoSePaga": "AL_COBRAR_TODO", "reparto.queEsCobrado": "AL_REGISTRAR" }, provisionales: ["reparto.cuandoSePaga", "reparto.queEsCobrado"] },
        avisos: r.avisos,
        declaradaPor: "demo", declaradaNombre: rocio.nombre, declaradaEl: declarada,
        ...(o.estado !== "BORRADOR" ? { revisadaPor: "demo", revisadaNombre: rocio.nombre, revisadaEl: new Date("2026-11-11T10:00:00-03:00"), notaRevision: o.nota ?? null } : {}),
        ...(o.estado === "APROBADA" ? { aprobadaPor: "demo", aprobadaNombre: "Dueño de MIA", aprobadaEl: new Date("2026-11-12T10:00:00-03:00") } : {}),
      },
      select: { id: true },
    });
    await prisma.proyectoLiquidacionProyectoLinea.createMany({
      data: r.lineas.map((l) => ({ tenantId, liquidacionId: cab.id, clave: l.clave, personaId: l.personaId, nombre: l.nombre, funcion: l.funcion, comision: BigInt(l.comision), reparto: BigInt(l.reparto), redondeo: BigInt(l.redondeo), rentabilidad: BigInt(l.rentabilidad), total: BigInt(l.total), detalle: l.detalle })),
    });
    return p.id;
  };

  const a = await proyecto("Lanzamiento de cervecería (demo)", { cobrado: 1_802_900, estado: "BORRADOR" });
  const b = await proyecto("Congreso de salud (demo)", { gasto: 10_000, cobrado: 1_000_000, estado: "BORRADOR" });
  const c = await proyecto("Feria de diseño (demo)", { cobrado: 1_802_900, estado: "REVISADA" });
  const d = await proyecto("Muestra automotriz (demo)", { cobrado: 1_802_900, estado: "APROBADA" });
  await comprobante(d, 50_000); // entró después de aprobar: queda para ajuste
  console.log(JSON.stringify({ borrador: a, conDiferencia: b, revisada: c, aprobada: d }));
}

main().finally(() => prisma.$disconnect());
