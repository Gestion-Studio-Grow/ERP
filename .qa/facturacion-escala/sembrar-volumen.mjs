// Siembra de VOLUMEN para la QA de Facturación a escala (vuelta 1; en la vuelta 2, 2 de cada 3 envíos pendientes llevan el IVA por producto, ENG-024, para que ARCA en prueba pueda autorizarlos).
// SÓLO base erp_lab (Postgres local) y SÓLO el negocio de laboratorio `ferreteria-el-tornillo-srl`
// (plan «comerciante», host tornillo-lab.localhost). Nunca CH (beauty-spa).
//   Sembrar:  source <lab>/env-lab.sh && node .qa/facturacion-escala/sembrar-volumen.mjs
//   Deshacer: source <lab>/env-lab.sh && node .qa/facturacion-escala/sembrar-volumen.mjs --deshacer
// Todo lo sembrado lleva id con prefijo `qavol-` (fichas, pedidos, comprobantes, envíos a ARCA,
// importación y movimientos del banco): deshacer borra exactamente eso (y los envíos de esos
// comprobantes). Datos inventados: nombres, CUIT con dígito verificador válido, teléfonos 11 5555-xxxx.
// Usa LAB_OWNER_URL (rol dueño de la base) sin imprimirla.
import pg from "pg";

const SLUG = "ferreteria-el-tornillo-srl";
const P = "qavol-";
const N_CLIENTES = 2000;
const N_COMPROBANTES = 5000;
const deshacer = process.argv.includes("--deshacer");

const url = process.env.LAB_OWNER_URL;
if (!url) throw new Error("Falta LAB_OWNER_URL (source env-lab.sh)");
const db = new pg.Client({ connectionString: url });
await db.connect();
const { rows: [ctx] } = await db.query("select current_database() db, inet_server_addr() addr");
if (ctx.db !== "erp_lab") throw new Error(`Base ${ctx.db}: sólo erp_lab`);
if (ctx.addr && !["127.0.0.1", "::1"].includes(ctx.addr)) throw new Error(`Servidor ${ctx.addr}: sólo local`);
const { rows: [t] } = await db.query('select id, "arcaCuit", "arcaPuntoVenta" from "Tenant" where slug=$1', [SLUG]);
if (!t || SLUG === "beauty-spa") throw new Error("negocio no permitido");
const T = t.id;

if (deshacer) {
  await db.query("begin");
  // Desde la migración 20260925150000 un trigger impide borrar comprobantes con CAE (se anulan con nota de crédito).
  // Estos son inventados por esta siembra (id qavol-, sólo erp_lab local): el trigger se apaga SÓLO dentro de esta
  // transacción (las FK siguen activas) y se vuelve a prender antes del commit; si algo falla, el rollback lo deja prendido.
  await db.query('alter table "Invoice" disable trigger "Invoice_comprobante_autorizado_inmutable"');
  const inv = `select id from "Invoice" where "tenantId"=$1 and id like '${P}%'`;
  const r = {};
  r.envios = (await db.query(`delete from "EnvioComprobante" where "tenantId"=$1 and "invoiceId" in (${inv})`, [T])).rowCount;
  r.outbox = (await db.query(`delete from "OutboxEvent" where "tenantId"=$1 and id like '${P}%'`, [T])).rowCount;
  r.movimientos = (await db.query(`delete from "MovimientoImportado" where "tenantId"=$1 and id like '${P}%'`, [T])).rowCount;
  r.importacion = (await db.query(`delete from "ImportacionBancaria" where "tenantId"=$1 and id like '${P}%'`, [T])).rowCount;
  r.notas = (await db.query(`delete from "Invoice" where "tenantId"=$1 and id like '${P}%' and "comprobanteAsociadoId" is not null`, [T])).rowCount;
  r.comprobantes = (await db.query(`delete from "Invoice" where "tenantId"=$1 and id like '${P}%'`, [T])).rowCount;
  r.pedidos = (await db.query(`delete from "Order" where "tenantId"=$1 and id like '${P}%'`, [T])).rowCount;
  r.fichas = (await db.query(`delete from "Client" where "tenantId"=$1 and id like '${P}%'`, [T])).rowCount;
  await db.query('alter table "Invoice" enable trigger "Invoice_comprobante_autorizado_inmutable"');
  await db.query("commit");
  console.log(JSON.stringify({ deshecho: r }));
  await db.end();
  process.exit(0);
}
const { rows: [ya] } = await db.query(`select count(*)::int n from "Invoice" where "tenantId"=$1 and id like '${P}%'`, [T]);
if (ya.n > 0) throw new Error(`Ya hay ${ya.n} comprobantes sembrados: primero --deshacer`);

// ---- azar reproducible
let s = 20260926;
const azar = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const entre = (a, b) => a + Math.floor(azar() * (b - a + 1));
const uno = (arr) => arr[Math.floor(azar() * arr.length)];
function cuit(prefijo, cuerpo) {
  const base = `${prefijo}${String(cuerpo).padStart(8, "0")}`;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const r = 11 - ([...base].reduce((a, d, i) => a + Number(d) * w[i], 0) % 11);
  if (r === 10) return cuit(prefijo, cuerpo + 1);
  return base + String(r === 11 ? 0 : r);
}
const NOMBRES = ["Mónica", "José", "María", "Juan", "Lucía", "Martín", "Sofía", "Tomás", "Valentina", "Ignacio", "Camila", "Nicolás", "Florencia", "Agustín", "Julieta", "Matías", "Carolina", "Diego", "Paula", "Sebastián", "Ana", "Federico", "Romina", "Gonzalo", "Verónica", "Ezequiel", "Natalia", "Hernán", "Silvina", "Ramón"];
const APELLIDOS = ["Pérez", "González", "Rodríguez", "Fernández", "López", "Martínez", "Gómez", "Díaz", "Sánchez", "Romero", "Sosa", "Álvarez", "Torres", "Ruiz", "Ramírez", "Flores", "Acosta", "Benítez", "Medina", "Herrera", "Suárez", "Aguirre", "Giménez", "Gutiérrez", "Pereyra", "Rojas", "Molina", "Castro", "Ortiz", "Silva", "Núñez", "Luna", "Juárez", "Cabrera", "Ríos", "Morales", "Godoy", "Ledesma", "Vega", "Peralta"];
const RUBROS = ["Constructora", "Corralón", "Instalaciones", "Herrería", "Sanitarios", "Electricidad", "Pinturerías", "Carpintería"];
const sinTildes = (x) => x.normalize("NFD").replace(/[̀-ͯ]/g, "");

// ---- hoy en la hora del negocio
const hoyAR = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const ahora = Date.now();
const [HA, HM, HD] = hoyAR.split("-").map(Number);

// ---- fichas
const fichas = [];
const especiales = [
  { name: "Mónica Pérez", docTipo: 96, docNro: "27888999", condicionIva: "CONSUMIDOR_FINAL" },
  { name: "José María Núñez", docTipo: 96, docNro: "20333444", condicionIva: "CONSUMIDOR_FINAL" },
  { name: "Ñandú Construcciones", razonSocial: "Ñandú Construcciones SRL", docTipo: 80, docNro: cuit("30", 71555888), condicionIva: "RESPONSABLE_INSCRIPTO" },
];
for (let i = 0; i < N_CLIENTES; i++) {
  const n = uno(NOMBRES), a = uno(APELLIDOS);
  let f;
  if (i < especiales.length) f = { ...especiales[i] };
  else {
    const r = azar();
    if (r < 0.15) f = { name: `${uno(RUBROS)} ${a}`, razonSocial: `${uno(RUBROS)} ${a} ${uno(["SRL", "SA", "Hnos."])}`, docTipo: 80, docNro: cuit(uno(["30", "33"]), 70000000 + i * 37), condicionIva: "RESPONSABLE_INSCRIPTO" };
    else if (r < 0.35) f = { name: `${n} ${a}`, docTipo: 80, docNro: cuit(uno(["20", "27"]), 20000000 + i * 4127), condicionIva: "MONOTRIBUTO" };
    else if (r < 0.75) f = { name: `${n} ${a}`, docTipo: 96, docNro: String(18000000 + i * 9173), condicionIva: "CONSUMIDOR_FINAL" };
    else f = { name: `${n} ${a}`, docTipo: null, docNro: null, condicionIva: null };
  }
  f.id = `${P}cli-${String(i).padStart(5, "0")}`;
  f.phone = `11 5555-${String(1000 + (i % 9000)).padStart(4, "0")}`;
  f.email = azar() < 0.6 ? `${sinTildes(f.name).toLowerCase().replace(/[^a-z]+/g, ".")}.${i}@ejemplo.test` : null;
  f.createdAt = new Date(Date.UTC(2026, 0, 1) + Math.floor(azar() * (ahora - Date.UTC(2026, 0, 1))));
  fichas.push(f);
}
// clientes frecuentes: los primeros 300 concentran compras
const clienteAzar = () => (azar() < 0.5 ? fichas[Math.floor(azar() * azar() * 300)] : fichas[Math.floor(azar() * N_CLIENTES)]);

// ---- comprobantes
const meses = [[2026, 2], [2026, 3], [2026, 4], [2026, 5], [2026, 6], [2026, 7], [2026, 8], [HA, HM]];
const cupo = (y, m) => (y === HA && m === HM ? 900 : Math.round((N_COMPROBANTES - 900 - 200) / 7));
const MOTIVOS = [
  "10015: El número de documento del receptor no es válido para el tipo de documento informado.",
  "10013: Para Factura A el receptor tiene que ser Responsable Inscripto.",
  "10016: El número del comprobante no es correlativo con el último autorizado.",
  "10048: El total no coincide con la suma del neto y el IVA.",
  "10242: El CUIT del receptor no figura activo en el padrón de ARCA.",
];
const ventas = [];
for (const [y, m] of meses) {
  const ultimoDia = y === HA && m === HM ? HD : new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let k = 0; k < cupo(y, m); k++) {
    const d = entre(1, ultimoDia);
    const esHoy = y === HA && m === HM && d === HD;
    let minutos = entre(9 * 60, 20 * 60);
    const utc = Date.UTC(y, m - 1, d, 0, 0, 0) + (minutos + 180) * 60000 + entre(0, 59) * 1000;
    const creado = esHoy ? Math.min(utc, ahora - entre(60, 4 * 3600) * 1000) : utc;
    ventas.push({ fecha: `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`, creado, d, y, m });
  }
}
ventas.sort((a, b) => a.creado - b.creado);
const comprobantes = [], pedidos = [], movimientos = [], outbox = [];
let codigo = 900001;
const contador = new Map();
const dias = (fecha) => Math.round((Date.UTC(HA, HM - 1, HD) - Date.UTC(+fecha.slice(0, 4), +fecha.slice(4, 6) - 1, +fecha.slice(6, 8))) / 86400000);
for (let i = 0; i < ventas.length; i++) {
  const v = ventas[i];
  const id = `${P}inv-${String(i).padStart(5, "0")}`;
  const pv = azar() < 0.8 ? 4 : 5;
  const r = azar();
  let docTipo = 99, docNro = "0", condicion = "CONSUMIDOR_FINAL", orderId = null;
  let cliente = null;
  if (r < 0.55) {
    cliente = clienteAzar();
    if (cliente.docTipo) { docTipo = cliente.docTipo; docNro = cliente.docNro; condicion = cliente.condicionIva; }
    orderId = `${P}ord-${String(i).padStart(5, "0")}`;
    pedidos.push({ id: orderId, code: codigo++, clientId: cliente.id, customerName: cliente.name, customerPhone: cliente.phone, creado: v.creado });
  } else if (r < 0.65) {
    orderId = `${P}ord-${String(i).padStart(5, "0")}`;
    pedidos.push({ id: orderId, code: codigo++, clientId: null, customerName: `${uno(NOMBRES)} ${uno(APELLIDOS)}`, customerPhone: `11 5555-${entre(1000, 9999)}`, creado: v.creado });
  } else if (r < 0.75) {
    const n = uno(NOMBRES), a = uno(APELLIDOS);
    if (azar() < 0.6) { docTipo = 80; docNro = cuit(uno(["20", "27"]), entre(10000000, 45000000)); condicion = "CONSUMIDOR_FINAL"; }
    movimientos.push({ id: `${P}mov-${String(i).padStart(5, "0")}`, invoiceId: id, nombreReceptor: sinTildes(`${a} ${n}`).toUpperCase(), fecha: v.fecha, docTipo, docNro });
  }
  const esA = condicion === "RESPONSABLE_INSCRIPTO";
  const cent = esA ? entre(4000000, 350000000) : Math.round(Math.exp(Math.log(350000) + azar() * (Math.log(180000000) - Math.log(350000))));
  const neto = Math.round(cent / 1.21), iva = cent - neto;
  const antig = dias(v.fecha);
  let status = "AUTHORIZED";
  const x = azar();
  if (antig === 0 && x < 0.9) status = "PENDING";
  else if (antig === 1 && x < 0.6) status = "PENDING";
  else if (antig > 1 && x < 0.002) status = "PENDING";
  else if (x < 0.027) status = "REJECTED";
  const tipo = esA ? 1 : 6;
  comprobantes.push({ id, pv, tipo, docTipo, docNro, condicion, fecha: v.fecha, neto, iva, total: cent, status, orderId, creado: v.creado, asociado: null });
}
// notas de crédito: ~200 sobre autorizados, totales o parciales, unos días después
const autorizados = comprobantes.filter((c) => c.status === "AUTHORIZED" && dias(c.fecha) > 3);
for (let j = 0; j < 200; j++) {
  const o = uno(autorizados);
  if (o.nc) continue;
  o.nc = true;
  const total = azar() < 0.6 ? o.total : Math.round(o.total * (0.1 + azar() * 0.5));
  const neto = Math.round(total / 1.21);
  const creado = Math.min(o.creado + entre(1, 6) * 86400000, ahora - 3600000);
  const fd = new Date(creado - 3 * 3600000);
  const fecha = `${fd.getUTCFullYear()}${String(fd.getUTCMonth() + 1).padStart(2, "0")}${String(fd.getUTCDate()).padStart(2, "0")}`;
  comprobantes.push({ id: `${P}nc-${String(j).padStart(4, "0")}`, pv: o.pv, tipo: o.tipo === 1 ? 3 : 8, docTipo: o.docTipo, docNro: o.docNro, condicion: o.condicion, fecha, neto, iva: total - neto, total, status: "AUTHORIZED", orderId: null, creado, asociado: o.id });
}
comprobantes.sort((a, b) => a.creado - b.creado);
for (const c of comprobantes) {
  if (c.status === "AUTHORIZED") {
    const k = `${c.pv}-${c.tipo}`;
    const n = (contador.get(k) ?? 1000) + 1;
    contador.set(k, n);
    c.numero = n;
    c.cae = `7${String(entre(0, 9999999)).padStart(7, "0")}${String(entre(0, 999999)).padStart(6, "0")}`;
    const vto = new Date(Date.UTC(+c.fecha.slice(0, 4), +c.fecha.slice(4, 6) - 1, +c.fecha.slice(6, 8) + 10));
    c.caeVto = `${vto.getUTCFullYear()}${String(vto.getUTCMonth() + 1).padStart(2, "0")}${String(vto.getUTCDate()).padStart(2, "0")}`;
    c.tipoGuardado = c.tipo;
  } else {
    c.numero = null; c.cae = null; c.caeVto = null; c.tipoGuardado = null; // pendiente/rechazado: el tipo lo fija ARCA
    if (c.status === "REJECTED") c.motivo = uno(MOTIVOS);
    else outbox.push(c);
  }
}

const pesos = (cent) => (cent / 100).toFixed(2);
async function insertar(tabla, cols, filas) {
  for (let i = 0; i < filas.length; i += 400) {
    const lote = filas.slice(i, i + 400);
    const vals = [], params = [];
    lote.forEach((f, j) => { vals.push(`(${cols.map((_, k) => `$${j * cols.length + k + 1}`).join(",")})`); params.push(...f); });
    await db.query(`insert into "${tabla}" (${cols.map((c) => `"${c}"`).join(",")}) values ${vals.join(",")}`, params);
  }
}
await db.query("begin");
await insertar("Client", ["id", "tenantId", "name", "phone", "email", "createdAt", "updatedAt", "docTipo", "docNro", "razonSocial", "condicionIva"],
  fichas.map((f) => [f.id, T, f.name, f.phone, f.email, f.createdAt, f.createdAt, f.docTipo, f.docNro, f.razonSocial ?? null, f.condicionIva]));
await insertar("Order", ["id", "tenantId", "code", "status", "clientId", "customerName", "customerPhone", "total", "createdAt", "updatedAt"],
  pedidos.map((o) => { const c = comprobantes.find((x) => x.orderId === o.id); return [o.id, T, o.code, "DELIVERED", o.clientId, o.customerName, o.customerPhone, c.total / 100, new Date(o.creado), new Date(o.creado)]; }));
await insertar("Invoice", ["id", "tenantId", "puntoVenta", "tipoComprobante", "concepto", "docTipo", "docNro", "fecha", "neto", "iva", "total", "ivaDesglose", "status", "cae", "caeVencimiento", "numero", "rechazoMotivo", "createdAt", "updatedAt", "authorizedAt", "orderId", "comprobanteAsociadoId"],
  comprobantes.filter((c) => !c.asociado).concat(comprobantes.filter((c) => c.asociado)).map((c) => [c.id, T, c.pv, c.tipoGuardado, 1, c.docTipo, c.docNro, c.fecha, pesos(c.neto), pesos(c.iva), pesos(c.total), JSON.stringify([{ alicuotaId: 5, base: c.neto / 100, importe: c.iva / 100 }]), c.status, c.cae, c.caeVto, c.numero, c.motivo ?? null, new Date(c.creado), new Date(c.creado), c.status === "AUTHORIZED" ? new Date(c.creado + 4000) : null, c.orderId, c.asociado]));
await insertar("ImportacionBancaria", ["id", "tenantId", "nombreArchivo", "origen", "archivo", "mapeoJson", "updatedAt"], [[`${P}imp-1`, T, "extracto-qa-volumen.csv", "banco", Buffer.from(""), "{}", new Date()]]);
await insertar("MovimientoImportado", ["id", "tenantId", "importacionId", "hash", "fecha", "monto", "descripcion", "clasificacion", "estadoPropuesta", "docTipo", "docNro", "nombreReceptor", "invoiceId", "updatedAt"],
  movimientos.map((m) => { const c = comprobantes.find((x) => x.id === m.invoiceId); return [m.id, T, `${P}imp-1`, `${P}h-${m.id}`, m.fecha, pesos(c.total), "TRANSFERENCIA RECIBIDA", "venta", "emitida", m.docTipo, m.docNro, m.nombreReceptor, m.invoiceId, new Date()]; }));
await insertar("OutboxEvent", ["id", "tenantId", "type", "payload", "createdAt"],
  outbox.map((c, i) => [`${P}ob-${String(i).padStart(4, "0")}`, T, "InvoiceCreated", JSON.stringify({ invoiceId: c.id, tenantId: T, concepto: 1, fecha: c.fecha, emisor: { cuit: Number(t.arcaCuit), condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: c.pv }, receptor: { docTipo: c.docTipo, docNro: Number(c.docNro), condicionIva: c.condicion }, neto: c.neto / 100, iva: [{ alicuotaId: 5, base: c.neto / 100, importe: c.iva / 100 }], total: c.total / 100, ivaPorProducto: i % 3 !== 2 }), new Date(c.creado)]));
await db.query("commit");

// ---- resumen para cotejar con la pantalla (sumas en centavos enteros: nunca float)
const mes = `${HA}${String(HM).padStart(2, "0")}`;
const delMes = comprobantes.filter((c) => c.fecha.startsWith(mes));
const firmado = (c) => ([3, 8, 13].includes(c.tipo) && c.status === "AUTHORIZED" ? -c.total : c.total);
const resumen = (lista) => ({ cantidad: lista.length, total: pesos(lista.reduce((a, c) => a + firmado(c), 0)) });
const ej = comprobantes.find((c) => c.status === "AUTHORIZED" && c.fecha.startsWith(mes) && c.pv === 5);
console.log(JSON.stringify({
  negocio: SLUG, hoy: hoyAR, fichas: fichas.length, pedidos: pedidos.length, comprobantes: comprobantes.length, movimientos: movimientos.length, envios_pendientes: outbox.length,
  mes: { todos: resumen(delMes), autorizados: resumen(delMes.filter((c) => c.status === "AUTHORIZED")), pendientes: resumen(delMes.filter((c) => c.status === "PENDING")), rechazados: resumen(delMes.filter((c) => c.status === "REJECTED")) },
  global: { pendientes: comprobantes.filter((c) => c.status === "PENDING").length, rechazados: comprobantes.filter((c) => c.status === "REJECTED").length, notas: comprobantes.filter((c) => c.asociado).length },
  ejemplo_numero: ej && `${String(ej.pv).padStart(4, "0")}-${String(ej.numero).padStart(8, "0")}`,
  ejemplo_cuit: especiales[2].docNro,
  ejemplo_banco: movimientos[movimientos.length - 1].nombreReceptor,
}, null, 1));
await db.end();
