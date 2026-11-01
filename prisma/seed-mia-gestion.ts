// SEED DEMO — las apps de gestión de eventos de MIA. Datos INVENTADOS, sólo para la base local: lo llama
// seed-mia-producciones.ts, que tiene la guarda. Ninguna persona, empresa ni monto es real.

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";
import { CHECKLIST_BASE, planDeCuotas, type ItemFicha } from "../src/lib/proyectos/gestion-core";

const DIA = 86_400_000;
const en = (dias: number) => new Date(Date.now() + dias * DIA);
const token = () => randomBytes(18).toString("base64url");
const TC_USD = 1350;

type Linea = { rubro: string; descripcion: string; prov?: string; cant: number; costo: number; moneda?: string; recargo: number; limite: number; estado: string };

export async function sembrarGestion(prisma: PrismaClient, tenantId: string, recargoGeneral: number) {
  await prisma.proyectoCuota.deleteMany({ where: { tenantId } });
  await prisma.proyectoMensaje.deleteMany({ where: { tenantId } });
  await prisma.proyectoReunion.deleteMany({ where: { tenantId } });
  await prisma.proyectoPersona.deleteMany({ where: { tenantId } });
  await prisma.proyectoGastoFijo.deleteMany({ where: { tenantId } });
  await prisma.proyectoCuentaBanco.deleteMany({ where: { tenantId } });
  await prisma.proyectoCambio.deleteMany({ where: { tenantId } });
  await prisma.proyectoAviso.deleteMany({ where: { tenantId } });

  await prisma.proyectoTipoCambio.upsert({ where: { tenantId_moneda: { tenantId, moneda: "USD" } }, create: { tenantId, moneda: "USD", porUnidad: TC_USD }, update: { porUnidad: TC_USD } });

  // Personas: el dueño y el equipo de la demo entran con su cuenta; el resto todavía no tiene una.
  const dueno = await prisma.user.findFirst({ where: { tenantId, role: "OWNER" }, select: { id: true } });
  const diseno = await prisma.user.findFirst({ where: { tenantId, email: { startsWith: "diseno@" } }, select: { id: true } });
  const persona = (nombre: string, puesto: string, rol: string, sueldoBase: number, facturaA: string, userId?: string | null) =>
    prisma.proyectoPersona.create({ data: { tenantId, nombre, puesto, rol, sueldoBase, facturaA, userId: userId ?? null, email: `${nombre.split(" ")[0].toLowerCase()}@mia-producciones.demo` } });
  const dir = await persona("Dueño de MIA", "Dirección general", "DIRECCION", 6_500_000, "MIA Producciones", dueno?.id);
  const dis = await persona("Equipo de diseño", "Diseño 3D", "DISENO", 2_800_000, "Monotributo", diseno?.id);
  const pro = await persona("Paula Ibáñez", "Productora ejecutiva", "PRODUCCION", 3_400_000, "Monotributo");
  const log = await persona("Tomás Vera", "Logística", "PRODUCCION", 2_600_000, "Monotributo");
  const adm = await persona("Rocío Medina", "Administración", "ADMINISTRACION", 2_900_000, "MIA Producciones");
  const gra = await persona("Nadia Quiroga", "Diseño gráfico", "DISENO", 2_300_000, "Monotributo");

  // Proveedores con su ficha.
  const provs: Record<string, string> = {};
  for (const [name, rubro, ciudad, anticipoPct, evaluacion, condiciones] of [
    ["Sonido Austral (ficticio)", "Audio, video e iluminación", "Buenos Aires", 40, 4.7, "40% anticipo / 60% contra entrega"],
    ["Pantallas del Plata (ficticio)", "Pantallas LED", "Buenos Aires", 50, 4.5, "50% anticipo / 50% contra entrega"],
    ["Escenarios Norte (ficticio)", "Escenografía y stands", "Buenos Aires", 50, 4.4, "50% anticipo / 50% contra entrega"],
    ["Sabores Catering (ficticio)", "Catering", "Rosario", 30, 4.9, "30% anticipo / 70% contra entrega"],
    ["Impresos Rápidos (ficticio)", "Impresión y señalética", "Buenos Aires", 50, 4.2, "50% anticipo / 50% contra entrega"],
    ["Fletes Andinos (ficticio)", "Logística y transporte", "Mendoza", 0, 4.1, "100% contra entrega"],
    ["Mobiliario Sur (ficticio)", "Mobiliario", "Córdoba", 100, 4.0, "100% al reservar"],
    ["Staff Eventos (ficticio)", "Personal y staff", "Buenos Aires", 0, 4.3, "100% a 10 días"],
  ] as const) {
    const s = (await prisma.supplier.findFirst({ where: { tenantId, name } })) ?? (await prisma.supplier.create({ data: { tenantId, name, email: "contacto@proveedor.demo", phone: "1150000100" } }));
    provs[name.split(" ")[0]] = s.id;
    await prisma.proyectoProveedorFicha.upsert({ where: { supplierId: s.id }, create: { tenantId, supplierId: s.id, rubro, ciudad, anticipoPct, evaluacion, condiciones, notas: "Proveedor de prueba." }, update: { rubro, ciudad, anticipoPct, evaluacion, condiciones } });
  }
  const fichas = await prisma.proyectoProveedorFicha.findMany({ where: { tenantId }, select: { supplierId: true, anticipoPct: true } });
  const anticipoProveedor = Object.fromEntries(fichas.map((f) => [f.supplierId, f.anticipoPct]));

  const cliente = async (name: string) => (await prisma.client.findFirst({ where: { tenantId, name } })) ?? prisma.client.create({ data: { tenantId, name, phone: "1150000200" } });

  const proyecto = async (d: {
    numero: number; nombre: string; cliente: string; servicio: string; etapa: string; tipoEvento: string; ciudad: string; lugar: string; dias: number; invitados: number; brief: string; equipo: [string, string, number][]; lineas: Linea[]; perdido?: string; cobrado?: boolean;
  }) => {
    const c = await cliente(d.cliente);
    const creado = en(d.dias - 60);
    const p = await prisma.proyecto.create({
      data: {
        tenantId, numero: d.numero, clientId: c.id, nombre: d.nombre, servicio: d.servicio, etapa: d.etapa, tipoEvento: d.tipoEvento, ciudad: d.ciudad, lugar: d.lugar, evento: d.nombre,
        fechaArmado: en(d.dias - 2), fechaEvento: en(d.dias), fechaFin: en(d.dias + 1), fechaDesarme: en(d.dias + 2), invitados: d.invitados, brief: d.brief, responsable: "Paula Ibáñez",
        contactoNombre: "Contacto de prueba", contactoEmail: "contacto@cliente.demo", createdAt: creado, tokenEntregables: token(), tokenPortal: token(),
        ...(d.perdido && { perdidoEl: en(-5), motivoPerdida: d.perdido }),
        checklist: { create: CHECKLIST_BASE.map((x) => ({ tenantId, texto: x.texto, categoria: x.categoria, fecha: en(d.dias - x.dias) })) },
        equipo: { create: d.equipo.map(([personaId, funcion, plus]) => ({ tenantId, personaId, funcion, plus })) },
        idea: { create: { tenantId, concepto: "Concepto de prueba", narrativa: "Una narrativa de ejemplo para la demo.", referencias: "Sin referencias reales.", materialidades: "Madera y lona tensada.", informacion: "Datos inventados." } },
      },
    });
    const pres = await prisma.proyectoPresupuesto.create({
      data: {
        tenantId, proyectoId: p.id, version: 1, estado: ["APROBADO", "PRODUCCION", "ARMADO", "DESARME", "CIERRE"].includes(d.etapa) ? "APROBADO" : d.etapa === "PROPUESTA" ? "ENVIADO" : "BORRADOR",
        token: token(), ivaPct: 21, creadoPor: "Paula Ibáñez", nota: "Versión inicial", aprobadoInternoPor: d.etapa === "PEDIDO" ? null : "Dueño de MIA", aprobadoInternoEl: d.etapa === "PEDIDO" ? null : creado,
      },
    });
    const items: ItemFicha[] = [];
    let posicion = 0;
    for (const l of d.lineas) {
      const it = await prisma.proyectoItem.create({
        data: { tenantId, presupuestoId: pres.id, rubro: l.rubro, descripcion: l.descripcion, unidad: "u", cantidad: l.cant, costo: l.costo, precio: 0, moneda: l.moneda ?? "ARS", recargoPct: l.recargo, supplierId: l.prov ? provs[l.prov] : null, fechaLimite: en(l.limite), estadoItem: l.estado, posicion: posicion++ },
      });
      items.push({ id: it.id, descripcion: l.descripcion, rubro: l.rubro, cantidad: l.cant, costo: l.costo, moneda: l.moneda ?? "ARS", recargoPct: l.recargo, precio: 0, fechaLimite: en(l.limite), supplierId: it.supplierId });
    }
    if (["APROBADO", "PRODUCCION", "ARMADO", "DESARME", "CIERRE"].includes(d.etapa)) {
      const plan = planDeCuotas(items, { proyectoId: p.id, nombre: d.nombre, fechaEvento: en(d.dias), creado, anticipoClientePct: 50, recargoGeneral, tiposDeCambio: { USD: TC_USD }, anticipoProveedor });
      for (const c2 of plan) {
        const cobrada = d.cobrado && c2.clave.endsWith("cliente:anticipo");
        await prisma.proyectoCuota.create({ data: { tenantId, proyectoId: p.id, auto: true, ...c2, ...(cobrada && { pagadoEl: en(-20), pagadoPor: "Rocío Medina", medio: "TRANSFERENCIA" }) } });
      }
    }
    await prisma.proyectoTarea.createMany({
      data: [
        { tenantId, proyectoId: p.id, titulo: "Planos técnicos finales", area: "DISENO", estado: "EN_CURSO", personaId: dis.id, responsable: "Equipo de diseño", venceEl: en(Math.min(d.dias - 10, -2)) },
        { tenantId, proyectoId: p.id, titulo: "Señalética y piezas gráficas", area: "DISENO", estado: "POR_HACER", personaId: gra.id, responsable: "Nadia Quiroga", venceEl: en(d.dias - 6) },
        { tenantId, proyectoId: p.id, titulo: "Render para el cliente", area: "DISENO", estado: "REVISION", personaId: dis.id, responsable: "Equipo de diseño", venceEl: en(d.dias - 15) },
        { tenantId, proyectoId: p.id, titulo: "Confirmar horarios de descarga", area: "PRODUCCION", estado: "POR_HACER", personaId: log.id, responsable: "Tomás Vera", venceEl: en(d.dias - 4) },
      ],
    });
    await prisma.proyectoMensaje.createMany({
      data: [
        { tenantId, proyectoId: p.id, canal: "general", autor: "Paula Ibáñez", texto: "Equipo: arrancamos con este evento. @Tomás mirá los horarios del predio." },
        { tenantId, proyectoId: p.id, canal: "pagos", autor: "Rocío Medina", texto: "Necesito las facturas de los anticipos antes del viernes." },
      ],
    });
    await prisma.proyectoCambio.create({ data: { tenantId, proyectoId: p.id, entidad: "ítem", campo: "Recargo %", antes: "30", despues: "35", autor: "Dueño de MIA" } });
    return p;
  };

  const eq = (a: string, b: string): [string, string, number][] => [[pro.id, "Producción responsable", 450000], [log.id, "Logística", 250000], [a, "Diseño", 200000], [b, "Gráfica", 120000]];
  await proyecto({
    numero: 4, nombre: "Convención anual de ventas", cliente: "Laboratorio Andes (ficticio)", servicio: "EVENTOS", etapa: "ARMADO", tipoEvento: "Convención", ciudad: "Buenos Aires", lugar: "Centro de convenciones (ficticio)", dias: 6, invitados: 800, cobrado: true,
    brief: "Convención de dos días con plenaria, cena y premiación.", equipo: eq(dis.id, gra.id),
    lineas: [
      { rubro: "Audio, video e iluminación", descripcion: "Sonido e iluminación de plenaria", prov: "Sonido", cant: 1, costo: 9_500_000, recargo: 35, limite: -4, estado: "CONTRATADO" },
      { rubro: "Pantallas LED", descripcion: "Pantalla LED 12 x 4 m", prov: "Pantallas", cant: 1, costo: 6_200_000, recargo: 35, limite: 1, estado: "APROBADO" },
      { rubro: "Escenografía y stands", descripcion: "Escenario con pasarela", prov: "Escenarios", cant: 1, costo: 12_000_000, recargo: 38, limite: 2, estado: "CONTRATADO" },
      { rubro: "Catering", descripcion: "Cena show 800 personas", prov: "Sabores", cant: 800, costo: 32_000, recargo: 40, limite: 3, estado: "COTIZANDO" },
      { rubro: "Personal y staff", descripcion: "Recepcionistas (6 x 2 días)", prov: "Staff", cant: 12, costo: 95_000, recargo: 35, limite: 4, estado: "PENDIENTE" },
    ],
  });
  await proyecto({
    numero: 5, nombre: "Stand en feria de salud", cliente: "Laboratorio Andes (ficticio)", servicio: "ARQUITECTURA", etapa: "PRODUCCION", tipoEvento: "Stand / Feria", ciudad: "Buenos Aires", lugar: "Predio ferial (ficticio)", dias: 22, invitados: 1500, cobrado: true,
    brief: "Stand de 12 x 10 m con auditorio y zona de demostraciones.", equipo: eq(dis.id, gra.id),
    lineas: [
      { rubro: "Escenografía y stands", descripcion: "Construcción del stand", prov: "Escenarios", cant: 1, costo: 18_000_000, recargo: 38, limite: 7, estado: "CONTRATADO" },
      { rubro: "Impresión y señalética", descripcion: "Lonas y vinilos", prov: "Impresos", cant: 1, costo: 2_400_000, recargo: 40, limite: 12, estado: "APROBADO" },
      { rubro: "Mobiliario", descripcion: "Lounge para invitados", prov: "Mobiliario", cant: 1, costo: 1_900_000, recargo: 45, limite: 15, estado: "APROBADO" },
      { rubro: "Tecnología", descripcion: "Licencia de realidad aumentada", cant: 1, costo: 4000, moneda: "USD", recargo: 30, limite: 10, estado: "COTIZANDO" },
    ],
  });
  await proyecto({
    numero: 6, nombre: "Lanzamiento de bebida premium", cliente: "Bodega del Sur (ficticia)", servicio: "EXPERIENCIAS", etapa: "APROBADO", tipoEvento: "Lanzamiento", ciudad: "Mendoza", lugar: "Bodega (ficticia)", dias: 38, invitados: 350,
    brief: "Lanzamiento con prensa, mapping y coctelería de autor.", equipo: eq(gra.id, dis.id),
    lineas: [
      { rubro: "Audio, video e iluminación", descripcion: "Mapping sobre fachada", prov: "Sonido", cant: 1, costo: 7_800_000, recargo: 35, limite: 12, estado: "APROBADO" },
      { rubro: "Catering", descripcion: "Coctelería y finger food", prov: "Sabores", cant: 350, costo: 26_000, recargo: 40, limite: 15, estado: "COTIZANDO" },
      { rubro: "Logística y transporte", descripcion: "Traslados y flete", prov: "Fletes", cant: 1, costo: 2_100_000, recargo: 30, limite: 20, estado: "PENDIENTE" },
    ],
  });
  await proyecto({
    numero: 7, nombre: "Gala de fin de año", cliente: "Banco Pampa (ficticio)", servicio: "EVENTOS", etapa: "PROPUESTA", tipoEvento: "Gala / Fiesta", ciudad: "Buenos Aires", lugar: "Salón (ficticio)", dias: 45, invitados: 600,
    brief: "Fiesta anual con banda en vivo.", equipo: eq(dis.id, gra.id),
    lineas: [
      { rubro: "Artísticos", descripcion: "Banda en vivo y DJ", cant: 1, costo: 5_500_000, recargo: 40, limite: 25, estado: "COTIZANDO" },
      { rubro: "Catering", descripcion: "Cena de gala 600 personas", prov: "Sabores", cant: 600, costo: 38_000, recargo: 38, limite: 28, estado: "COTIZANDO" },
    ],
  });
  await proyecto({
    numero: 8, nombre: "Viaje de incentivo Patagonia", cliente: "Motores del Oeste (ficticio)", servicio: "EXPERIENCIAS", etapa: "RENDER", tipoEvento: "Incentivo", ciudad: "Bariloche", lugar: "Hotel (ficticio)", dias: 80, invitados: 120,
    brief: "Tres días para los mejores vendedores.", equipo: eq(gra.id, dis.id),
    lineas: [{ rubro: "Alojamiento", descripcion: "Hotel 120 personas x 2 noches", cant: 240, costo: 145_000, recargo: 25, limite: 50, estado: "PENDIENTE" }],
  });
  await proyecto({
    numero: 9, nombre: "Activación en aeropuerto", cliente: "Cielo Sur (ficticio)", servicio: "EXPERIENCIAS", etapa: "CIERRE", tipoEvento: "Activación de marca", ciudad: "Buenos Aires", lugar: "Aeropuerto (ficticio)", dias: -40, invitados: 0, cobrado: true,
    brief: "Pop-up de 60 m² durante dos semanas.", equipo: eq(dis.id, gra.id),
    lineas: [
      { rubro: "Escenografía y stands", descripcion: "Pop-up de 60 m²", prov: "Escenarios", cant: 1, costo: 8_000_000, recargo: 40, limite: -60, estado: "ENTREGADO" },
      { rubro: "Personal y staff", descripcion: "Promotoras 5 días", prov: "Staff", cant: 5, costo: 180_000, recargo: 35, limite: -50, estado: "ENTREGADO" },
    ],
  });
  await proyecto({
    numero: 10, nombre: "Hackatón de tecnología", cliente: "Tecnored Argentina (ficticio)", servicio: "EVENTOS", etapa: "PRESUPUESTO", tipoEvento: "Activación de marca", ciudad: "Córdoba", lugar: "Campus (ficticio)", dias: 20, invitados: 200, perdido: "El cliente recortó presupuesto y eligió un proveedor local.",
    brief: "Dos días de programación con premios.", equipo: [[pro.id, "Producción responsable", 0]], lineas: [],
  });
  void adm;
  void dir;

  // Ítems del proyecto 9: lo real salió distinto de lo presupuestado.
  const cerrado = await prisma.proyecto.findFirst({ where: { tenantId, numero: 9 }, select: { id: true } });
  if (cerrado) {
    const it = await prisma.proyectoItem.findFirst({ where: { tenantId, presupuesto: { proyectoId: cerrado.id } }, orderBy: { posicion: "asc" } });
    if (it) await prisma.proyectoItem.update({ where: { id: it.id }, data: { costoReal: 9_400_000 } });
  }

  // Empresa: gastos fijos, un pago sin proyecto, bancos y un extracto.
  await prisma.proyectoGastoFijo.createMany({
    data: [
      { tenantId, tipo: "FIJO", nombre: "Alquiler de oficina", monto: 4_200_000 },
      { tenantId, tipo: "FIJO", nombre: "Software y licencias", monto: 3100, moneda: "USD" },
      { tenantId, tipo: "FIJO", nombre: "Contador y asesoría", monto: 1_800_000 },
      { tenantId, tipo: "IMPUESTO", nombre: "Impuestos y cargas sociales", monto: 8_500_000 },
      { tenantId, tipo: "IMPUESTO", frecuencia: "ANUAL", nombre: "Ganancias", monto: 42_000_000, fecha: en(30) },
    ],
  });
  await prisma.proyectoCuota.create({ data: { tenantId, tipo: "PAGO", concepto: "Licencias de diseño (anual)", monto: 6800, moneda: "USD", venceEl: en(-3) } });
  const banco = await prisma.proyectoCuentaBanco.create({ data: { tenantId, nombre: "Banco de prueba · Pesos", saldo: 58_000_000 } });
  await prisma.proyectoCuentaBanco.create({ data: { tenantId, nombre: "Banco de prueba · Dólares", moneda: "USD", saldo: 42_000 } });
  await prisma.proyectoMovBanco.createMany({
    data: [
      { tenantId, cuentaId: banco.id, fecha: en(-10), descripcion: "TRANSF RECIBIDA", importe: 25_000_000, lote: "Extracto de prueba" },
      { tenantId, cuentaId: banco.id, fecha: en(-8), descripcion: "TRANSF ENVIADA PROVEEDOR", importe: -3_100_000, lote: "Extracto de prueba" },
    ],
  });

  await prisma.proyectoReunion.createMany({
    data: [
      { tenantId, titulo: "Comité de dirección", fecha: en(2), lugar: "Oficina", creadaPor: "Dueño de MIA" },
      { tenantId, titulo: "Reunión de armado", tipo: "MONTAJE", fecha: en(4), lugar: "Videollamada", creadaPor: "Paula Ibáñez" },
    ],
  });
  await prisma.proyectoMensaje.create({ data: { tenantId, canal: "diseno", autor: "Nadia Quiroga", texto: "Subí las piezas de la gala a la carpeta del proyecto." } });
  if (dueno) await prisma.proyectoAviso.create({ data: { tenantId, destinatario: dueno.id, tipo: "aprobacion", texto: "Hay una cotización para aprobar.", enlace: "/admin/proyectos" } });
}
