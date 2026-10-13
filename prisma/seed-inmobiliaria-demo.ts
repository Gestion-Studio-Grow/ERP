// ============================================================================
// SEED DEMO — Inmobiliaria Demo (zona sur del GBA). Todo inventado.
// ============================================================================
//
// Deja una inmobiliaria funcionando para mostrar y probar: el negocio (rubro `inmobiliaria`),
// el dueño y un agente, una cartera de fichas en todos los estados, consultas con el reloj
// corriendo, tres contratos administrados (ICL, IPC y porcentaje fijo) con cuotas cobradas,
// una vencida y un ajuste por aplicar, cobros para liquidar y una liquidación emitida.
//
// Nombres, direcciones, teléfonos y precios son DE EJEMPLO: no son de ninguna inmobiliaria ni
// de ninguna persona. Las imágenes son ilustraciones propias (public/demo-inmo). Los valores de
// los índices son de ejemplo; los reales se bajan con el botón del panel.
//
// 🔴 SÓLO BASE LOCAL, salvo orden expresa. La guarda de abajo corta si DATABASE_URL no apunta a
//    esta máquina. La única excepción es `scripts/inmobiliaria/alta-produccion.mjs`, que lo corre
//    contra producción por orden del dueño para dar de alta un negocio con cartera de muestra:
//    manda INMO_SEED_PRODUCCION=1 junto con el slug, el nombre y el mail del dueño.
//    Para verlo andando acá: `node scripts/inmobiliaria/demo-local.mjs`.
//
// Ingreso de prueba de la demo local (NO son credenciales reales; sólo existen en esa base):
//   dueño:  admin@inmo-demo.demo  ·  agente: agente@inmo-demo.demo
//   la clave sale de INMO_DEMO_PASSWORD (default abajo). En producción no hay default: la
//   clave del dueño la genera el alta y se muestra una sola vez.

import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/auth-password";
import { defaultModulesForBlueprint } from "../src/blueprints/presets-meta";
import { baseLocalParaSeed } from "../src/lib/seed/guarda-base";
import { provisionTenant } from "../scripts/provision-tenant";
import { diaDe, instanteDe, planDeCuotas, slugDePropiedad, sumarDias, sumarMeses, sumarMesesADia, type ContratoCalc, type Dia } from "../src/lib/inmobiliaria/core";

const EN_PRODUCCION = process.env.INMO_SEED_PRODUCCION === "1";
const guarda = baseLocalParaSeed(process.env.DATABASE_URL);
if (!guarda.ok && !EN_PRODUCCION) {
  console.error(`❌ seed-inmobiliaria-demo sólo corre contra una base local. ${guarda.motivo}`);
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: Number(process.env.SEED_DB_MAX ?? 0) || undefined });
const prisma = new PrismaClient({ adapter });

const SLUG = process.env.INMO_SEED_SLUG ?? "inmo-demo";
const NOMBRE = process.env.INMO_SEED_NOMBRE ?? "Inmobiliaria Demo";
const DUENIO_EMAIL = process.env.INMO_SEED_DUENIO_EMAIL ?? `admin@${SLUG}.demo`;
// En producción no hay clave por defecto: la genera el alta (y el agente recibe otra al azar).
const CLAVE = EN_PRODUCCION ? process.env.INMO_DEMO_PASSWORD : (process.env.INMO_DEMO_PASSWORD ?? "inmo-demo-2026");
const CLAVE_AGENTE = EN_PRODUCCION ? randomBytes(9).toString("base64url") : (CLAVE as string);
const MIN = 60_000;
const hoy: Dia = diaDe(new Date());
const haceMin = (m: number) => new Date(Date.now() - m * MIN);
const haceDias = (d: number) => instanteDe(sumarDias(hoy, -d));
const llave = () => randomBytes(18).toString("base64url");
const foto = (escena: string, luz: number) => `/demo-inmo/${escena}-${luz}.svg`;

interface Ficha {
  codigo: string;
  titulo: string;
  descripcion: string;
  tipo: string;
  estado: string;
  destacada?: boolean;
  venta?: number;
  alquiler?: number;
  expensas?: number;
  credito?: boolean;
  mascotas?: boolean;
  direccion: string;
  barrio?: string;
  localidad: string;
  lat: number;
  lng: number;
  amb?: number;
  dorm?: number;
  banos?: number;
  cocheras?: number;
  cubierta?: number;
  total?: number;
  antiguedad?: number;
  comodidades?: string[];
  publicadaHace?: number;
  bajo?: { antes: number; hace: number };
  fotos: string[];
  duenio?: string;
}

const DESC_DEPTO =
  "Departamento luminoso, al frente, con balcón corrido. Living comedor amplio, cocina separada con lavadero, dos dormitorios con placard y baño completo. Edificio con ascensor y bajas expensas. A tres cuadras de la estación y a una de la avenida comercial. Se aceptan garantes con recibo de sueldo o seguro de caución.";
const DESC_CASA =
  "Casa sobre lote propio, muy bien mantenida. Living comedor con hogar, cocina comedor diario, tres dormitorios, dos baños, galería con parrilla, jardín al fondo y entrada para dos autos. Todos los servicios. Barrio residencial tranquilo, cerca de colegios y a diez minutos del centro.";
const DESC_LOTE = "Lote sobre calle asfaltada, con todos los servicios en la puerta. Medidas regulares, ideal para vivienda unifamiliar o dos dúplex. Escritura inmediata. Zona residencial en crecimiento, a metros de la avenida.";

const FICHAS: Ficha[] = [
  { codigo: "DEM-0001", titulo: "Departamento de 3 ambientes al frente con balcón", descripcion: DESC_DEPTO, tipo: "DEPARTAMENTO", estado: "PUBLICADA", destacada: true, alquiler: 480000, expensas: 38000, mascotas: true, direccion: "Los Aromos 1240, 3º B", barrio: "Centro", localidad: "Monte Grande", lat: -34.8145, lng: -58.4682, amb: 3, dorm: 2, banos: 1, cubierta: 62, total: 68, antiguedad: 12, comodidades: ["Balcón", "Ascensor", "Lavadero", "Gas natural"], publicadaHace: 4, fotos: [foto("edificio", 1), foto("living", 1), foto("cocina", 1), foto("dormitorio", 1), foto("living", 2), foto("cocina", 2), foto("dormitorio", 2), foto("edificio", 2)] },
  { codigo: "DEM-0002", titulo: "Casa de 4 ambientes con jardín, parrilla y cochera doble", descripcion: DESC_CASA, tipo: "CASA", estado: "PUBLICADA", destacada: true, venta: 135000, credito: true, direccion: "Las Magnolias 856", barrio: "Barrio Parque", localidad: "Monte Grande", lat: -34.8221, lng: -58.4575, amb: 4, dorm: 3, banos: 2, cocheras: 2, cubierta: 148, total: 420, antiguedad: 25, comodidades: ["Jardín", "Parrilla", "Galería", "Hogar a leña"], publicadaHace: 35, bajo: { antes: 142000, hace: 6 }, fotos: [foto("casa", 1), foto("living", 3), foto("cocina", 3), foto("dormitorio", 3), foto("casa", 2), foto("living", 1), foto("dormitorio", 1), foto("cocina", 1), foto("casa", 3)] },
  { codigo: "DEM-0003", titulo: "Dúplex de 3 ambientes a estrenar, sin expensas", descripcion: "Dúplex a estrenar en complejo de cuatro unidades. Planta baja con living comedor, cocina integrada y toilette; planta alta con dos dormitorios y baño completo. Patio con parrilla y cochera descubierta. Sin expensas. Apto crédito hipotecario.", tipo: "DUPLEX", estado: "RESERVADA", venta: 79000, credito: true, direccion: "Los Ceibos 1020", localidad: "Luis Guillón", lat: -34.8032, lng: -58.4498, amb: 3, dorm: 2, banos: 2, cocheras: 1, cubierta: 70, total: 95, antiguedad: 0, comodidades: ["Patio", "Parrilla", "A estrenar"], publicadaHace: 18, fotos: [foto("casa", 3), foto("living", 2), foto("cocina", 2), foto("dormitorio", 2)] },
  { codigo: "DEM-0004", titulo: "Chalet de 5 ambientes con pileta y quincho", descripcion: "Chalet clásico sobre lote de 600 m². Cinco ambientes, living con hogar, comedor, cocina con comedor diario, tres dormitorios y escritorio. Quincho cerrado con parrilla, pileta y parque. Cochera pasante para tres autos. Se vende o se alquila.", tipo: "CASA", estado: "PUBLICADA", destacada: true, venta: 198000, alquiler: 950000, direccion: "Av. de los Jacarandás 2257", barrio: "Barrio Parque", localidad: "Monte Grande", lat: -34.8263, lng: -58.4611, amb: 5, dorm: 3, banos: 3, cocheras: 3, cubierta: 210, total: 600, antiguedad: 30, comodidades: ["Pileta", "Quincho", "Parque", "Hogar a leña", "Alarma"], publicadaHace: 60, fotos: [foto("casa", 2), foto("living", 3), foto("cocina", 1), foto("dormitorio", 3), foto("terreno", 1), foto("living", 1)] },
  { codigo: "DEM-0005", titulo: "Lote de 396 m² sobre asfalto, apto dúplex", descripcion: DESC_LOTE, tipo: "TERRENO", estado: "PUBLICADA", venta: 42000, direccion: "Los Tilos 1225", localidad: "Monte Grande", lat: -34.8312, lng: -58.4733, total: 396, publicadaHace: 75, fotos: [foto("terreno", 1), foto("terreno", 2)] },
  { codigo: "DEM-0006", titulo: "Lote de 300 m² en barrio abierto de Canning", descripcion: DESC_LOTE, tipo: "TERRENO", estado: "PUBLICADA", venta: 55000, direccion: "Los Fresnos 310", localidad: "Canning", lat: -34.8721, lng: -58.5068, total: 300, publicadaHace: 9, fotos: [foto("terreno", 3), foto("terreno", 2)] },
  { codigo: "DEM-0007", titulo: "PH de 3 ambientes con patio y terraza propia", descripcion: "PH al fondo, por pasillo, muy luminoso. Living comedor, cocina con salida al patio, dos dormitorios y baño. Terraza propia con lavadero. Sin expensas. Se permiten mascotas.", tipo: "PH", estado: "PUBLICADA", alquiler: 410000, mascotas: true, direccion: "Las Acacias 742", localidad: "Luis Guillón", lat: -34.8005, lng: -58.4441, amb: 3, dorm: 2, banos: 1, cubierta: 58, total: 96, antiguedad: 40, comodidades: ["Patio", "Terraza", "Sin expensas"], publicadaHace: 12, fotos: [foto("casa", 1), foto("living", 2), foto("dormitorio", 1), foto("cocina", 3)] },
  { codigo: "DEM-0008", titulo: "Local comercial de 80 m² sobre avenida, con baño y depósito", descripcion: "Local a la calle sobre avenida de alto tránsito, a metros de la peatonal. Salón de 60 m², depósito, baño y vidriera de 6 metros. Persiana metálica y aire acondicionado. Apto todo rubro.", tipo: "LOCAL", estado: "PUBLICADA", alquiler: 620000, direccion: "Av. del Trabajo 498", barrio: "Centro", localidad: "Monte Grande", lat: -34.8172, lng: -58.4659, banos: 1, cubierta: 80, total: 80, antiguedad: 15, comodidades: ["Vidriera", "Depósito", "Aire acondicionado"], publicadaHace: 28, fotos: [foto("edificio", 3), foto("living", 3)] },
  { codigo: "DEM-0009", titulo: "Departamento de 2 ambientes con cochera, apto crédito", descripcion: DESC_DEPTO, tipo: "DEPARTAMENTO", estado: "PUBLICADA", venta: 59000, credito: true, expensas: 30000, direccion: "Los Paraísos 37, 2º A", barrio: "Centro", localidad: "Monte Grande", lat: -34.8131, lng: -58.4706, amb: 2, dorm: 1, banos: 1, cocheras: 1, cubierta: 45, total: 48, antiguedad: 8, comodidades: ["Balcón", "Ascensor", "Cochera"], publicadaHace: 2, fotos: [foto("edificio", 2), foto("living", 1), foto("cocina", 2), foto("dormitorio", 2), foto("living", 3)] },
  { codigo: "DEM-0010", titulo: "Departamento de 2 ambientes en planta baja con patio", descripcion: "Dos ambientes en planta baja, con patio propio. Living comedor, cocina integrada, dormitorio con placard y baño completo. Ideal persona sola o pareja. Bajas expensas.", tipo: "DEPARTAMENTO", estado: "PUBLICADA", alquiler: 320000, expensas: 18000, direccion: "Los Sauces 155", localidad: "El Jagüel", lat: -34.8339, lng: -58.4939, amb: 2, dorm: 1, banos: 1, cubierta: 40, total: 52, antiguedad: 20, comodidades: ["Patio"], publicadaHace: 40, fotos: [foto("edificio", 1), foto("living", 2), foto("cocina", 1)] },
  // Borrador cargado "como venía": sin fotos y a los gritos. Es lo que muestra el control de calidad.
  { codigo: "DEM-0011", titulo: "VENTA DE CASA 3 AMBIENTES - EXCELENTE UBICACION - APTO CREDITO", descripcion: "CASA DE 3 AMBIENTES.", tipo: "CASA", estado: "BORRADOR", venta: 0, credito: true, direccion: "", localidad: "Monte Grande", lat: 0, lng: 0, amb: 3, fotos: [] },
  // Administradas (tienen contrato): no están a la vista.
  { codigo: "DEM-0012", titulo: "Departamento de 3 ambientes con balcón al contrafrente", descripcion: DESC_DEPTO, tipo: "DEPARTAMENTO", estado: "ALQUILADA", alquiler: 380000, direccion: "Los Robles 949, 1º C", localidad: "Monte Grande", lat: -34.8159, lng: -58.4693, amb: 3, dorm: 2, banos: 1, cubierta: 55, fotos: [foto("edificio", 1), foto("living", 1)], duenio: "norma" },
  { codigo: "DEM-0013", titulo: "Departamento de 2 ambientes a metros de la estación", descripcion: DESC_DEPTO, tipo: "DEPARTAMENTO", estado: "ALQUILADA", alquiler: 520000, direccion: "Los Álamos 111, 4º D", localidad: "Monte Grande", lat: -34.8127, lng: -58.4671, amb: 2, dorm: 1, banos: 1, cubierta: 44, fotos: [foto("edificio", 2), foto("living", 2)], duenio: "norma" },
  { codigo: "DEM-0014", titulo: "Casa de 3 ambientes con fondo libre", descripcion: DESC_CASA, tipo: "CASA", estado: "ALQUILADA", alquiler: 600000, direccion: "Las Camelias 1054", localidad: "Luis Guillón", lat: -34.8049, lng: -58.4467, amb: 3, dorm: 2, banos: 1, cocheras: 1, cubierta: 90, total: 260, fotos: [foto("casa", 3), foto("living", 3)], duenio: "osvaldo" },
];

async function main() {
  const r = await provisionTenant(prisma, {
    name: NOMBRE,
    slug: SLUG,
    owner: { name: process.env.INMO_SEED_DUENIO_NOMBRE ?? "Laura (dueña)", email: DUENIO_EMAIL, password: CLAVE },
    blueprint: "inmobiliaria",
    branding: {
      shortLabel: process.env.INMO_SEED_LEMA ?? "Venta, alquiler y tasaciones en zona sur",
      addressLine: process.env.INMO_SEED_DIRECCION ?? "Av. de Ejemplo 1128",
      city: process.env.INMO_SEED_CIUDAD ?? "Monte Grande",
      hoursLabel: process.env.INMO_SEED_HORARIO ?? "Lun a vie · 10 a 13 y 16 a 19:30 h",
      whatsapp: process.env.INMO_SEED_WHATSAPP ?? "5491100000000",
      contactNote: "Venta, alquiler, tasaciones y administración de alquileres.",
    },
    platform: { status: "ACTIVE", subdomain: SLUG, modules: defaultModulesForBlueprint("inmobiliaria"), accentPreset: "petroleo", frontTheme: "light" },
  });
  const tenantId = r.tenantId;

  // Re-sembrado limpio de lo propio del módulo (idempotente). El orden respeta las claves foráneas.
  await prisma.inmoLiquidacion.deleteMany({ where: { tenantId } });
  // La historia de plata no se borra en cascada: acá, que es una base de ejemplo, se limpia a mano.
  await prisma.inmoPago.deleteMany({ where: { tenantId } });
  await prisma.inmoCuota.deleteMany({ where: { tenantId } });
  await prisma.inmoAjuste.deleteMany({ where: { tenantId } });
  await prisma.inmoContrato.deleteMany({ where: { tenantId } });
  await prisma.inmoConsulta.deleteMany({ where: { tenantId } });
  await prisma.inmoPropiedad.deleteMany({ where: { tenantId } });
  await prisma.inmoIndice.deleteMany({ where: { tenantId } });

  const agenteEmail = `agente@${SLUG}.demo`;
  const agente =
    (await prisma.user.findFirst({ where: { tenantId, email: agenteEmail } })) ??
    (await prisma.user.create({ data: { tenantId, name: "Martín Quiroga", email: agenteEmail, passwordHash: await hashPassword(CLAVE_AGENTE), role: "PROFESSIONAL" } }));
  const duenia = await prisma.user.findFirstOrThrow({ where: { tenantId, role: "OWNER" } });

  await prisma.inmoConfig.upsert({
    where: { tenantId },
    // Comisión del 8 % y mora del 0,1 % diario: valores de ejemplo, dentro de lo habitual.
    create: { tenantId, prefijoCodigo: "DEM", comisionAdminPct: 8, ivaComisionPct: 0, punitorioDiarioPct: 0.1, punitoriosAlPropietario: true, aliasCbu: "inmo.demo.alquileres", matricula: "Corredor matriculado · Mat. 0000 (ejemplo)" },
    update: {},
  });

  const persona = async (nombre: string, tel: string) =>
    (await prisma.client.findFirst({ where: { tenantId, phone: tel } })) ?? (await prisma.client.create({ data: { tenantId, name: nombre, phone: tel } }));
  const gente = {
    norma: await persona("Norma Giménez", "1150000101"),
    osvaldo: await persona("Osvaldo Paz", "1150000102"),
    ines: await persona("Inés Albornoz", "1150000103"),
    damian: await persona("Damián Roldán", "1150000201"),
    brenda: await persona("Brenda Sequeira", "1150000202"),
    familia: await persona("Familia Luna Ortiz", "1150000203"),
  };

  const prop = new Map<string, string>();
  for (const f of FICHAS) {
    const creada = await prisma.inmoPropiedad.create({
      data: {
        tenantId, codigo: f.codigo, slug: slugDePropiedad(f.titulo, f.codigo), titulo: f.titulo, descripcion: f.descripcion, tipo: f.tipo, estado: f.estado, destacada: !!f.destacada,
        enVenta: f.venta != null, precioVenta: f.venta || null, monedaVenta: "USD",
        enAlquiler: f.alquiler != null, precioAlquiler: f.alquiler || null, monedaAlquiler: "ARS",
        expensas: f.expensas ?? null, aptoCredito: !!f.credito, aptoMascotas: !!f.mascotas,
        direccion: f.direccion, barrio: f.barrio ?? "", localidad: f.localidad, partido: "Esteban Echeverría", lat: f.lat || null, lng: f.lng || null,
        ambientes: f.amb ?? null, dormitorios: f.dorm ?? null, banos: f.banos ?? null, cocheras: f.cocheras ?? null,
        supCubierta: f.cubierta ?? null, supTotal: f.total ?? null, antiguedad: f.antiguedad ?? null, comodidades: f.comodidades ?? [],
        propietarioId: f.duenio ? gente[f.duenio as keyof typeof gente].id : f.codigo === "DEM-0002" ? gente.ines.id : null,
        captadaPorUserId: agente.id,
        publicadaEl: f.publicadaHace != null ? haceDias(f.publicadaHace) : f.estado === "BORRADOR" ? null : haceDias(200),
        precioAnterior: f.bajo?.antes ?? null, bajoDePrecioEl: f.bajo ? haceDias(f.bajo.hace) : null,
        fotos: { create: f.fotos.map((url, posicion) => ({ tenantId, url, posicion, alt: `${f.titulo} — imagen ${posicion + 1}` })) },
      },
    });
    prop.set(f.codigo, creada.id);
  }

  // Consultas: el reloj de la primera respuesta es lo que se quiere ver.
  const consulta = (d: { codigo?: string; tipo?: string; origen?: string; estado: string; nombre: string; tel: string; mensaje: string; hace: number; respondidaHace?: number; agente?: boolean; visitaEnHoras?: number; notas?: string }) =>
    prisma.inmoConsulta.create({
      data: {
        tenantId, propiedadId: d.codigo ? prop.get(d.codigo) : null, tipo: d.tipo ?? "CONSULTA", origen: d.origen ?? "WEB", estado: d.estado, nombre: d.nombre, telefono: d.tel, mensaje: d.mensaje,
        createdAt: haceMin(d.hace), respondidaEl: d.respondidaHace != null ? haceMin(d.respondidaHace) : null,
        asignadaUserId: d.agente ? agente.id : null, asignadaNombre: d.agente ? agente.name : null,
        visitaEl: d.visitaEnHoras != null ? new Date(Date.now() + d.visitaEnHoras * 60 * MIN) : null, notas: d.notas ?? null,
        cerradaEl: d.estado === "GANADA" || d.estado === "PERDIDA" ? haceMin(d.respondidaHace ?? 0) : null,
      },
    });
  await consulta({ codigo: "DEM-0001", estado: "NUEVA", nombre: "Carla Medina", tel: "1150000301", mensaje: "Hola, ¿sigue disponible? ¿Aceptan seguro de caución?", hace: 8 });
  await consulta({ codigo: "DEM-0002", tipo: "VISITA", estado: "NUEVA", nombre: "Pablo Ferrari", tel: "1150000302", mensaje: "Quisiera verla el sábado a la mañana si se puede.", hace: 190 });
  await consulta({ tipo: "TASACION", estado: "NUEVA", nombre: "Elsa Brizuela", tel: "1150000303", mensaje: "Tengo una casa en Luis Guillón y quiero saber cuánto vale para venderla.", hace: 27 });
  await consulta({ codigo: "DEM-0009", estado: "CONTACTADA", nombre: "Joaquín Sosa", tel: "1150000304", mensaje: "¿Es apta crédito del Banco Nación?", hace: 1500, respondidaHace: 1492, agente: true, notas: "Le pasé los requisitos. Tiene preaprobado." });
  await consulta({ codigo: "DEM-0007", tipo: "VISITA", estado: "VISITA", nombre: "Rocío Aguirre", tel: "1150000305", mensaje: "Me interesa, tengo dos gatos.", hace: 2900, respondidaHace: 2880, agente: true, visitaEnHoras: 26, notas: "Visita coordinada. Trae a la hermana." });
  await consulta({ codigo: "DEM-0004", origen: "MOSTRADOR", estado: "NEGOCIACION", nombre: "Hernán Castillo", tel: "1150000306", mensaje: "Pasó por la oficina. Ofrece 185.000.", hace: 7200, respondidaHace: 7200, agente: true, notas: "Oferta de USD 185.000. El dueño contesta el lunes." });
  await consulta({ codigo: "DEM-0003", estado: "GANADA", nombre: "Lucía Benavídez", tel: "1150000307", mensaje: "Quiero reservarlo.", hace: 12000, respondidaHace: 11990, agente: true, notas: "Reservó con seña." });

  // Índices DE EJEMPLO (no son los publicados): alcanzan para que la demo calcule un ajuste.
  const mesActual = hoy.slice(0, 7);
  for (let m = 10; m >= 0; m--) {
    const p = sumarMeses(mesActual, -m);
    await prisma.inmoIndice.create({ data: { tenantId, indice: "IPC", fecha: instanteDe(`${p}-01`), valor: Number((12300 * Math.pow(1.021, -m)).toFixed(4)) } });
    await prisma.inmoIndice.create({ data: { tenantId, indice: "ICL", fecha: instanteDe(`${p}-01`), valor: Number((36.8 * Math.pow(1.022, -m)).toFixed(2)) } });
  }

  // Contratos administrados. Las cuotas salen de la misma regla que usa el panel.
  let numero = 0;
  // Cada cobro de muestra lleva su número de recibo, como los reales.
  let recibo = 0;
  async function contrato(c: { codigo: string; inquilino: keyof typeof gente; propietario: keyof typeof gente; haceMeses: number; monto: number; dia: number; indice: string; cada: number; fijo?: number; cobradas: number; parcial?: number }) {
    const inicio: Dia = `${sumarMeses(mesActual, -c.haceMeses)}-01`;
    const calc: ContratoCalc = { inicio, fin: sumarDias(sumarMesesADia(inicio, 24), -1), montoInicial: c.monto, diaVencimiento: c.dia, ajusteIndice: c.indice as ContratoCalc["ajusteIndice"], ajusteCadaMeses: c.cada, ajusteFijoPct: c.fijo ?? null };
    const plan = planDeCuotas(calc);
    const creado = await prisma.inmoContrato.create({
      data: {
        tenantId, numero: ++numero, propiedadId: prop.get(c.codigo)!, inquilinoId: gente[c.inquilino].id, propietarioId: gente[c.propietario].id,
        inicio: instanteDe(calc.inicio), fin: instanteDe(calc.fin), montoInicial: c.monto, diaVencimiento: c.dia, ajusteIndice: c.indice, ajusteCadaMeses: c.cada, ajusteFijoPct: c.fijo ?? null,
        comisionPct: 8, punitorioDiarioPct: 0.1, deposito: c.monto, garantia: "Seguro de caución (ejemplo)", tokenInquilino: llave(),
      },
    });
    for (const q of plan) {
      const paga = q.numero <= c.cobradas;
      const parcial = q.numero === c.cobradas + 1 && c.parcial ? c.parcial : 0;
      const pagado = paga ? q.alquiler : parcial;
      const extras = c.codigo === "DEM-0012" && q.numero > c.cobradas - 1 ? [{ concepto: "Expensas", monto: 32000 }] : [];
      const total = pagado > 0 && paga ? q.alquiler + extras.reduce((s, e) => s + e.monto, 0) : pagado;
      await prisma.inmoCuota.create({
        data: {
          tenantId, contratoId: creado.id, numero: q.numero, periodo: q.periodo, vence: instanteDe(q.vence), tramo: q.tramo, alquiler: q.alquiler, ajustePendiente: q.ajustePendiente,
          extras, pagado: total,
          pagos: total > 0 ? { create: [{ tenantId, medio: q.numero % 2 ? "TRANSFERENCIA" : "EFECTIVO", monto: total, cobradoPor: duenia.name, createdAt: instanteDe(sumarDias(q.vence, -2)), reciboNumero: ++recibo }] } : undefined,
        },
      });
    }
    return creado;
  }
  // 1 · ICL cada 6 meses, empezó hace 7: la cuota 7 ya es del tramo nuevo y NADIE aplicó el
  //     ajuste todavía (el panel lo avisa y lo calcula). La cuota de este mes está sin pagar.
  const c1 = await contrato({ codigo: "DEM-0012", inquilino: "damian", propietario: "norma", haceMeses: 7, monto: 380000, dia: 10, indice: "ICL", cada: 6, cobradas: 7 });
  // 2 · IPC cada 4 meses, empezó hace 2: al día, con un pago a cuenta de la cuota de este mes.
  await contrato({ codigo: "DEM-0013", inquilino: "brenda", propietario: "norma", haceMeses: 2, monto: 520000, dia: 10, indice: "IPC", cada: 4, cobradas: 2, parcial: 300000 });
  // 3 · 12 % fijo cada 3 meses, empezó hace 5: todo calculado de entrada. Debe el mes pasado.
  await contrato({ codigo: "DEM-0014", inquilino: "familia", propietario: "osvaldo", haceMeses: 5, monto: 600000, dia: 5, indice: "FIJO", cada: 3, fijo: 12, cobradas: 4 });

  // Una liquidación ya emitida y pagada (las primeras 5 cuotas del contrato 1), para que el
  // historial no nazca vacío. El resto de lo cobrado queda "para liquidar".
  const viejas = await prisma.inmoCuota.findMany({ where: { tenantId, contratoId: c1.id, numero: { lte: 5 } }, orderBy: { numero: "asc" } });
  const alquileres = viejas.reduce((s, q) => s + Number(q.alquiler), 0);
  const comision = Math.round(alquileres * 0.08 * 100) / 100;
  await prisma.inmoLiquidacion.create({
    data: {
      tenantId, numero: 1, propietarioId: gente.norma.id, periodo: sumarMeses(mesActual, -2), estado: "PAGADA", alquileres, comision, neto: alquileres - comision,
      detalle: { cobros: viejas.map((q) => ({ cuotaId: q.id, concepto: `Los Robles 949, 1º C · ${q.periodo}`, alquiler: Number(q.alquiler), extras: 0, punitorios: 0, comisionPct: 8 })), gastos: [] },
      token: llave(), pagadaEl: haceDias(40), medio: "TRANSFERENCIA", createdAt: haceDias(42),
    },
  });
  for (const q of viejas) await prisma.inmoCuota.update({ where: { id: q.id }, data: { liquidado: q.alquiler } });

  console.log(`✅ ${r.tenantCreated ? "Creado" : "Actualizado"} ${SLUG}: ${FICHAS.length} fichas, 7 consultas, ${numero} contratos, 1 liquidación.`);
  if (EN_PRODUCCION) {
    console.log(`   Dueño: ${DUENIO_EMAIL}${r.generatedPassword ? ` · clave generada (se muestra UNA vez): ${r.generatedPassword}` : " · ya existía (clave sin cambios)"}`);
    console.log(`   Agente: ${agenteEmail} · clave: ${CLAVE_AGENTE}`);
  } else {
    console.log(`   Sitio: http://${SLUG}.localhost:<puerto>  ·  panel: /admin con admin@${SLUG}.demo (dueña) o agente@${SLUG}.demo.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
