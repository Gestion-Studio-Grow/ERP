// MIA-186 · escenario de capturas en la DEMO LOCAL (PGlite de demo-local.mjs). Datos inventados; jamás corre contra Neon.
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54338/postgres npx tsx scripts/qa/mia186-escenario.local.mts
// Arma un proyecto «Stand de prueba» con la liquidación aprobada (prod 55.000 · com 30.000 · empresa 505.000), un
// comprobante tardío de 10.000 ya ajustado (−2.500 / −7.500, saldo de la productora 2.500) y después anulado: el panel
// propone +2.500 / +7.500 y muestra el saldo abierto. Y la mensual de mayo de la productora con «Proyecto» 55.000 y
// «Ajuste · Proyecto» 2.500. Imprime la ruta de la ficha.
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { baseLocalParaSeed } from "../../src/lib/seed/guarda-base";
import { calcularLiquidacion } from "../../src/lib/proyectos/liquidacion-proyecto-core";

const guarda = baseLocalParaSeed(process.env.DATABASE_URL);
if (!guarda.ok) throw new Error(`Sólo base local: ${guarda.motivo}`);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });
const $ = (pesos: number) => pesos * 100;
const B = (c: number) => BigInt(c);
const PASADO = new Date("2026-11-01T12:00:00-03:00");

const t = await prisma.tenant.findFirstOrThrow({ where: { slug: "mia-producciones" }, select: { id: true } });
const tenantId = t.id;
const duenio = await prisma.user.findFirstOrThrow({ where: { tenantId, email: "admin@mia-producciones.demo" }, select: { id: true, name: true } });
if (!(await prisma.proyectoPersona.findFirst({ where: { tenantId, userId: duenio.id } })))
  await prisma.proyectoPersona.create({ data: { tenantId, userId: duenio.id, nombre: duenio.name ?? "Dirección", email: "admin@mia-producciones.demo", rol: "DIRECCION" } });
const prod = await prisma.proyectoPersona.create({ data: { tenantId, nombre: "Productora Demo", email: "productora@mia-producciones.demo", rol: "PRODUCCION" }, select: { id: true } });
const com = await prisma.proyectoPersona.create({ data: { tenantId, nombre: "Comercial Demo", email: "comercial@mia-producciones.demo", rol: "COMERCIAL" }, select: { id: true } });
const cliente = await prisma.client.findFirstOrThrow({ where: { tenantId }, select: { id: true } });
const numero = (await prisma.proyecto.count({ where: { tenantId } })) + 900;
const p = await prisma.proyecto.create({ data: { tenantId, numero, clientId: cliente.id, nombre: "Stand de prueba", servicio: "EVENTOS", etapa: "APROBADO", brief: "Stand", responsable: "Comercial", fechaEvento: PASADO }, select: { id: true } });
const pres = await prisma.proyectoPresupuesto.create({ data: { tenantId, proyectoId: p.id, version: 1, estado: "APROBADO", token: `mia186-${p.id}`, ivaPct: 21 }, select: { id: true } });
await prisma.proyectoItem.create({ data: { tenantId, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1_490_000 } });
const e1 = await prisma.proyectoEquipo.create({ data: { tenantId, proyectoId: p.id, personaId: prod.id, funcion: "PRODUCTOR", plus: 0 }, select: { id: true } });
const e2 = await prisma.proyectoEquipo.create({ data: { tenantId, proyectoId: p.id, personaId: com.id, funcion: "COMERCIAL", plus: 0 }, select: { id: true } });
const participantes = [
  { equipoId: e1.id, personaId: prod.id, nombre: "Productora Demo", funcion: "PRODUCTOR", comisionPct: 10, reparto: { DEFENSA: 25 } },
  { equipoId: e2.id, personaId: com.id, nombre: "Comercial Demo", funcion: "COMERCIAL", comisionPct: 10, reparto: { DEFENSA: 0 } },
  { equipoId: null, personaId: null, nombre: "Empresa", funcion: "EMPRESA", comisionPct: 0, reparto: { DEFENSA: 75, REDONDEO: 100 } },
];
const parametros = { comisiones: { PRODUCTOR: $(30_000), COMERCIAL: $(30_000) }, rentabilidad: $(300_000), margenError: $(65_000), provisionales: [] };
await prisma.proyectoPrecioFoto.create({
  data: {
    tenantId, proyectoId: p.id, presupuestoId: pres.id, version: 1, modo: "POR_TOTAL", moneda: "ARS", ivaPct: 21,
    costoOriginalCentavos: B($(1_000_000)), adicionalesCentavos: B(0), subtotalCentavos: B($(1_425_000)), iibGaCentavos: B(0),
    totalVentaCentavos: B($(1_490_000)), redondeoBrutoCentavos: B($(65_000)), redondeoNetoCentavos: B($(65_000)),
    parametros, participantes, aprobadoPor: "Dirección",
  },
});
const prov = await prisma.supplier.create({ data: { tenantId, name: "Proveedor Demo" }, select: { id: true } });
let sig = 0;
const comprobante = async (pesos: number, anulado = false) => {
  const c = await prisma.proyectoComprobante.create({ data: { tenantId, supplierId: prov.id, tipo: "C", numero: `0099-${String(++sig).padStart(8, "0")}`, fecha: PASADO, netoCentavos: B($(pesos)), totalCentavos: B($(pesos)), cargadoPorId: duenio.id, cargadoNombre: "Demo", ...(anulado ? { anuladoEl: new Date() } : {}) }, select: { id: true } });
  return (await prisma.proyectoComprobanteLinea.create({ data: { tenantId, comprobanteId: c.id, destino: "PROYECTO", proyectoId: p.id, categoria: "Producción", netoCentavos: B($(pesos)), ivaTratamiento: "COSTO", costoCentavos: B($(pesos)) }, select: { id: true } })).id;
};
const congelada = await comprobante(900_000);
const tardia = await comprobante(10_000, true);
const calc = calcularLiquidacion({ totalVenta: $(1_490_000), costoOriginal: $(1_000_000), adicionales: 0, redondeoBruto: $(65_000), rentabilidad: $(300_000), margenError: $(65_000), comisiones: parametros.comisiones, participantes, costoReal: $(900_000), defensaNegativa: "DESCUENTA" });
const ahora = new Date();
const liq = await prisma.proyectoLiquidacionProyecto.create({
  data: {
    tenantId, proyectoId: p.id, presupuestoId: pres.id, fotoVersion: 1, estado: "APROBADA", totalVenta: B($(1_490_000)), costoReal: B($(900_000)), comprobantes: B($(900_000)),
    facturado: B($(1_802_900)), cobrado: B($(1_802_900)), esperado: B(calc.esperado),
    costoDetalle: { lineasDeComprobante: [congelada], gastos: [], cuotasPrevistas: [] },
    parametros: { valores: { "reparto.defensaNegativa": "DESCUENTA", "reparto.cuandoSePaga": "AL_COBRAR_TODO", "reparto.queEsCobrado": "COBRADO" }, provisionales: [] },
    avisos: [], declaradaPor: duenio.id, declaradaNombre: "Administración", declaradaEl: ahora, revisadaPor: duenio.id, revisadaNombre: "Administración", revisadaEl: ahora, aprobadaPor: duenio.id, aprobadaNombre: "Dirección", aprobadaEl: ahora,
  },
  select: { id: true },
});
const lineas = new Map<string | null, string>();
for (const l of calc.lineas) {
  const r = await prisma.proyectoLiquidacionProyectoLinea.create({ data: { tenantId, liquidacionId: liq.id, clave: l.clave, personaId: l.personaId, nombre: l.nombre, funcion: l.funcion, comision: B(l.comision), reparto: B(l.reparto), redondeo: B(l.redondeo), rentabilidad: B(l.rentabilidad), total: B(l.total), detalle: l.detalle } , select: { id: true } });
  lineas.set(l.personaId, r.id);
}
const detalle = { lote: "demo-lote-1", comprobantes: [{ id: tardia, costo: $(10_000), origen: "Proveedor Demo · C 0099-00000002" }], costoRealAntes: $(900_000), costoRealNuevo: $(910_000), periodo: "2026-11" };
for (const [personaId, monto] of [[prod.id, -$(2_500)], [null, -$(7_500)]] as const)
  await prisma.proyectoLiquidacionProyectoAjuste.create({ data: { tenantId, liquidacionId: liq.id, lineaId: lineas.get(personaId)!, motivo: "Entró después de aprobar: Proveedor Demo · C 0099-00000002", monto: B(monto), detalle, autorId: duenio.id, autorNombre: "Dirección" } });
await prisma.proyectoSaldoAFavor.create({ data: { tenantId, personaId: prod.id, liquidacionId: liq.id, monto: B($(2_500)) } });

// La mensual de mayo de la productora con la línea del proyecto y el ajuste (vuelta 1: la captura a 390 px).
await prisma.proyectoLiquidacion.create({ data: { tenantId, personaId: prod.id, periodo: "2027-05", base: 0, total: 57_500, extras: [{ nombre: "Proyecto · Stand de prueba", monto: 55_000 }, { nombre: "Ajuste · Proyecto · Stand de prueba", monto: 2_500 }] } });
console.log(`/admin/proyectos/${p.id}`);
await prisma.$disconnect();
