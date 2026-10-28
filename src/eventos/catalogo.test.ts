// Catálogo de eventos v1 (P2): forma, validación tipada, redacción, emisor con SQL falso y doc.
//   node --import tsx --test src/eventos/catalogo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CATALOGO, definiciones } from "./catalogo";
import { e, enmascararTelefono, erroresDe, nombresDeCampos, redactarTextoLibre } from "./esquema";
import { armarSobre, emitirEvento, EventoInvalido, olvidarColumnasDelOutbox, SQL_CANDADO, SQL_INSERTAR_CON_COLUMNAS, SQL_INSERTAR_SIN_COLUMNAS, SQL_YA_ESTA, SQL_YA_ESTA_CON_COLUMNAS } from "./emitir";
import { canalYReferencia, claseDelComprobante, emitirFacturaAutorizada, emitirFacturaRechazada, emitirPedidoCobrado, medioDelCatalogo, pagoExternoDelActor } from "./del-core";
import { generarDocEventos } from "./doc";

const RETAIL_73 = [
  "pedido.creado", "pedido.confirmado", "pedido.listo", "pedido.entregado", "pedido.cancelado", "pedido.cobrado",
  "pago.acreditado", "pago.devuelto", "factura.autorizada", "factura.rechazada", "stock.bajo", "stock.ajustado",
  "producto.actualizado", "cliente.creado", "deuda.vencida", "caja.cerrada", "caja.abierta", "balanza.lectura",
];
const CLUB_73 = [
  "turno.reservado", "turno.confirmado", "turno.cancelado", "turno.reprogramado", "turno.completado", "turno.ausente",
  "turno.recordatorio.enviado", "clase.pedida", "clase.confirmada", "clase.cancelada", "clase.pagada", "socio.alta",
  "socio.baja", "cuota.generada", "cuota.cobrada", "cuota.vencida", "credito.cargado", "credito.consumido",
  "buffet.pedido.creado", "mensaje.recibido", "mensaje.estado",
];
const PLAN_412 = [
  "turno.sena.pagada", "turno.garantia.ejecutada", "espera.ofrecida", "espera.asignada", "caja.turno.cerrada",
  "reparto.salio", "reparto.rendido", "pedido.transferencia.verificada", "lote.por.vencer", "lote.vencido",
  "club.luz.cambio", "producto.balanza.sincronizada",
];
const EMITIDOS_EN_P2 = [
  "pedido.creado", "pedido.confirmado", "pedido.listo", "pedido.entregado", "pedido.cancelado", "pedido.cobrado",
  "factura.autorizada", "factura.rechazada", "stock.bajo", "stock.ajustado", "producto.actualizado", "cliente.creado",
  "caja.abierta", "caja.cerrada", "caja.turno.cerrada",
];
// Retail que P2 NO emite, con la tanda y el criterio del plan que lo toma (CERT-P2, F6).
const RETAIL_TRASPASADO: Record<string, string> = {
  "pago.acreditado": "pendiente · P5 (P5-C5)",
  "pago.devuelto": "pendiente · P5 (P5-C6)",
  "deuda.vencida": "pendiente · M7 (M7-C6)",
};

test("P2-C2 · el catálogo tiene los 18 de retail, los del club (§7.3) y los del plan (§4.1.2), todos @1", () => {
  const tipos = new Set(definiciones().map((d) => d.tipo));
  for (const t of [...RETAIL_73, ...CLUB_73, ...PLAN_412]) assert.ok(tipos.has(t), `falta ${t}`);
  assert.equal(RETAIL_73.length, 18);
  assert.equal(definiciones().length, RETAIL_73.length + CLUB_73.length + PLAN_412.length);
  for (const [clave, d] of Object.entries(CATALOGO)) assert.equal(clave, `${d.tipo}@${d.version}`);
});

test("P2-C2 · emitidos en esta tanda: 14 de los 18 de retail + caja.turno.cerrada; el resto dice tanda Y criterio", () => {
  const emitidos = definiciones().filter((d) => d.emision === "P2").map((d) => d.tipo).sort();
  assert.deepEqual(emitidos, [...EMITIDOS_EN_P2].sort());
  // Los 18 de retail: emitidos acá, traspasados por ID y criterio, o balanza.lectura (opcional por §7.3).
  for (const t of RETAIL_73) {
    const d = definiciones().find((x) => x.tipo === t)!;
    if (EMITIDOS_EN_P2.includes(t)) continue;
    if (t === "balanza.lectura") assert.match(d.emision, /^no se emite · opcional/);
    else assert.equal(d.emision, RETAIL_TRASPASADO[t], t);
  }
  // Ningún «pendiente» sin tanda y criterio: «pendiente · <TANDA> (<CRITERIO o P2-C2 + hueco>)».
  for (const d of definiciones()) {
    if (d.emision === "P2" || d.emision.startsWith("no se emite · ")) continue;
    assert.match(d.emision, /^pendiente · (?:[PMB]\d+a?) \((?:[PMB]\d+a?-C\d+)[;)\s]/, d.tipo);
    if (!/^pendiente · (\w+) \(\1-C\d+\)$/.test(d.emision)) assert.match(d.emision, /hueco del plan/, `${d.tipo}: sin criterio propio y sin decirlo`);
  }
});

test("P2-C1 · cada ejemplo cumple su esquema", () => {
  for (const d of definiciones()) assert.deepEqual(erroresDe(d.esquema, d.ejemplo), [], `${d.tipo}@${d.version}`);
});

test("P2-C1 · un datos que no cumple su versión hace FALLAR la emisión (falta, sobra, tipo y valor)", () => {
  const base = { tenantId: "t1", tipo: "pedido.cobrado" as const, version: 1 as const, clave: "pedido:o1:cobrado" };
  const bueno = { pedidoId: "o1", codigo: 7, monto: 100, medio: "EFECTIVO" as const, cobradoEn: "2026-10-28T10:00:00.000Z" };
  assert.doesNotThrow(() => armarSobre({ ...base, datos: bueno }));
  const malos: unknown[] = [
    { ...bueno, monto: undefined }, // falta
    { ...bueno, telefono: "1155667788" }, // sobra (y es dato personal)
    { ...bueno, codigo: "7" }, // tipo
    { ...bueno, medio: "CHEQUE" }, // fuera del enum
    { ...bueno, monto: 10.555 }, // más de 2 decimales
    { ...bueno, monto: Number.NaN },
    { ...bueno, cobradoEn: "ayer" },
  ];
  for (const datos of malos) {
    assert.throws(() => armarSobre({ ...base, datos: datos as typeof bueno }), EventoInvalido, JSON.stringify(datos));
  }
  assert.throws(() => armarSobre({ ...base, version: 2 as never, datos: bueno as never }), /no está en el catálogo/);
  assert.throws(() => armarSobre({ ...base, clave: "  ", datos: bueno }), /clave/);
  assert.throws(() => armarSobre({ ...base, tenantId: "", datos: bueno }), /tenantId/);
});

test("P2-C1 · el tipo de datos sale del catálogo (tsc rechaza un datos incompleto)", async () => {
  const sinSql = {};
  // @ts-expect-error falta monto, medio y cobradoEn: no compila
  await assert.rejects(emitirEvento(sinSql, { tenantId: "t", tipo: "pedido.cobrado", version: 1, clave: "k", datos: { pedidoId: "o", codigo: 1 } }), EventoInvalido);
  // @ts-expect-error la versión 2 no existe
  await assert.rejects(emitirEvento(sinSql, { tenantId: "t", tipo: "pedido.cobrado", version: 2, clave: "k", datos: {} }));
});

// ── P2-C6 · redacción ─────────────────────────────────────────────────────────

const PERSONAL = /tel[eé]fono|phone|celular|whats?app|movil|documento|\bdni|cuit|cuil|e-?mail|correo|direcci[oó]n|domicilio|address/i;

test("P2-C6 · ningún campo del catálogo lleva teléfono, documento, email ni domicilio en claro", () => {
  for (const d of definiciones()) {
    for (const { ruta, esquema } of nombresDeCampos(d.esquema)) {
      if (!PERSONAL.test(ruta)) continue;
      assert.match(ruta, /Enmascarado$/, `${d.tipo}: ${ruta} es dato personal sin máscara`);
      assert.match(esquema.clase, /^enmascarado/, `${d.tipo}: ${ruta} tiene que ser e.enmascarado()`);
    }
  }
  // remitente/telefono enmascarados sólo aceptan la máscara
  const sch = e.objeto({ telefonoEnmascarado: e.enmascarado() });
  assert.deepEqual(erroresDe(sch, { telefonoEnmascarado: "******7788" }), []);
  assert.notDeepEqual(erroresDe(sch, { telefonoEnmascarado: "1155667788" }), []);
  assert.notDeepEqual(erroresDe(sch, { telefonoEnmascarado: "+54 9 11 5566-7788" }), []);
  assert.equal(enmascararTelefono("+54 9 11 5566-7788"), "******7788");
  assert.equal(enmascararTelefono(""), null);
});

test("P2-C6 · los textos libres salen redactados en el payload (teléfono, DNI, CUIT, email)", () => {
  const motivo = "Llamó Marta al +54 9 11 5566-7788 (DNI 30.123.456, CUIT 20-30123456-7, marta@mail.com) · pedido #1042 de $12500";
  const r = redactarTextoLibre(motivo);
  for (const crudo of ["5566-7788", "30.123.456", "20-30123456-7", "marta@mail.com"]) assert.ok(!r.includes(crudo), `${crudo} quedó en ${r}`);
  assert.ok(r.includes("#1042") && r.includes("$12500"), "los códigos y precios cortos quedan");

  const sobre = armarSobre({
    tenantId: "t1", tipo: "pedido.cancelado", version: 1, clave: "pedido:o1:cancelado",
    datos: { pedidoId: "o1", codigo: 1042, motivo },
  });
  const texto = JSON.stringify(sobre.payload);
  assert.ok(!/5566-?7788|30\.?123\.?456|marta@mail\.com/.test(texto), texto);
  assert.ok(texto.includes("******7788"));

  // El motivo del rechazo de ARCA puede traer el documento del receptor.
  const rech = armarSobre({
    tenantId: "t1", tipo: "factura.rechazada", version: 1, clave: "factura:i1:rechazada:e1",
    datos: { facturaId: "i1", motivo: "10015: DocNro 20301234567 no válido" },
  });
  assert.ok(!JSON.stringify(rech.payload).includes("20301234567"));
});

test("P2-C6 · separadores dobles o con espacios alrededor del guion no dejan el dato en claro", () => {
  const cancelado = armarSobre({
    tenantId: "t1", tipo: "pedido.cancelado", version: 1, clave: "pedido:o1:cancelado",
    datos: { pedidoId: "o1", codigo: 1, motivo: "Llamar al 11 - 5566 - 7788 para coordinar" },
  });
  assert.ok(!JSON.stringify(cancelado.payload).includes("5566"), JSON.stringify(cancelado.payload));
  const mitades = redactarTextoLibre("tel 11 5566 - 7788");
  assert.equal(mitades, "tel ******7788");
  assert.ok(!redactarTextoLibre("DNI 30  123  456").includes("123"));
  assert.equal(redactarTextoLibre("(011) 5566-7788"), "(******7788");
  assert.equal(redactarTextoLibre("pedido #1042 de $12500 · 3 u"), "pedido #1042 de $12500 · 3 u", "lo corto queda");
});

test("P2-C6 · la raya del autocorrector («–», «—») y el signo menos también son separadores", () => {
  const cancelado = armarSobre({
    tenantId: "t1", tipo: "pedido.cancelado", version: 1, clave: "pedido:o1:cancelado",
    datos: { pedidoId: "o1", codigo: 1, motivo: "Llamar al 11 – 5566 – 7788 para coordinar" },
  });
  assert.ok(!JSON.stringify(cancelado.payload).includes("5566"), JSON.stringify(cancelado.payload));
  assert.equal(redactarTextoLibre("tel 11 5566 – 7788"), "tel ******7788");
  assert.equal(redactarTextoLibre("tel 11—5566—7788"), "tel ******7788");
  assert.equal(redactarTextoLibre("CUIT 20\u201130123456\u20117"), "CUIT ******4567");
  assert.equal(redactarTextoLibre("tel 11 5566 \u2212 7788"), "tel ******7788");
  assert.equal(redactarTextoLibre("pedido #1042 – $12500 · 3 u"), "pedido #1042 – $12500 · 3 u", "lo corto queda");
});

// 30 observaciones concatenadas, como arca-dispatch.ts las arma para el motivo del rechazo.
const MOTIVO_ARCA_LARGO = Array.from({ length: 30 }, (_, i) => `${10000 + i}: el campo informado no corresponde con el valor esperado para el receptor (DocNro 20301234567)`).join("; ");

test("P2-C1 · un motivo de ARCA de más de 2000 caracteres valida: se recorta a 500 y se redacta", () => {
  assert.ok(MOTIVO_ARCA_LARGO.length > 3000);
  const sobre = armarSobre({
    tenantId: "t1", tipo: "factura.rechazada", version: 1, clave: "factura:i1:rechazada:e1",
    datos: { facturaId: "i1", motivo: MOTIVO_ARCA_LARGO },
  });
  const motivo = (sobre.payload.datos as { motivo: string }).motivo;
  assert.ok(motivo.length <= 500, `quedó de ${motivo.length}`);
  assert.ok(!motivo.includes("20301234567"));
});

test("P2-C1 · factura.*: un dato fuera del catálogo no tumba el registro fiscal (CAE / rechazo)", async () => {
  olvidarColumnasDelOutbox();
  const tx = Object.assign(txFalso(true), {
    invoice: { findFirst: async () => ({ total: 12500, orderId: "o1", appointmentId: null }) },
  });
  const original = console.error;
  console.error = () => {};
  try {
    // caeVencimiento con otra forma: el CAE se guarda igual, sin evento.
    const r = await emitirFacturaAutorizada(tx, {
      tenantId: "t1", invoiceId: "i1", tipoComprobante: 11, puntoVenta: 3, numero: 12, cae: "76123456789012", caeVencimiento: "2026-11-07",
    });
    assert.equal(r, null);
    assert.ok(!tx.llamadas.some((l) => l.sql === SQL_INSERTAR_CON_COLUMNAS));
    // Un id vacío en el rechazo: tampoco tira.
    assert.equal(await emitirFacturaRechazada(tx, { tenantId: "t1", invoiceId: "", motivo: "x", envioId: "e1" }), null);
  } finally {
    console.error = original;
  }
  // El motivo largo sí emite (recortado).
  const r2 = await emitirFacturaRechazada(txFalso(true), { tenantId: "t1", invoiceId: "i1", motivo: MOTIVO_ARCA_LARGO, envioId: "e1" });
  assert.equal(r2?.escrito, true);
  // Un error de la base sube (la transacción ya está abortada).
  const caida = { async $queryRawUnsafe() { throw new Error("base caída"); } };
  await assert.rejects(emitirFacturaRechazada(caida, { tenantId: "t1", invoiceId: "i1", motivo: "x", envioId: "e2" }), /base caída/);
});

// ── El emisor con un SQL falso (sin base) ─────────────────────────────────────

type Llamada = { sql: string; params: unknown[] };
function txFalso(conColumnas: boolean, yaEsta = false) {
  const llamadas: Llamada[] = [];
  return {
    llamadas,
    async $queryRawUnsafe(sql: string, ...params: unknown[]) {
      llamadas.push({ sql, params });
      if (sql.includes("pg_attribute")) return conColumnas ? [{ ok: 1 }] : [];
      if (sql === SQL_YA_ESTA || sql === SQL_YA_ESTA_CON_COLUMNAS) return yaEsta ? [{ id: "previo" }] : [];
      if (sql === SQL_CANDADO) return [{ ok: 1 }];
      if (sql === SQL_INSERTAR_CON_COLUMNAS) return yaEsta ? [] : [{ id: params[0] }];
      if (sql === SQL_INSERTAR_SIN_COLUMNAS) return [{ id: params[0] }];
      throw new Error(`SQL inesperado: ${sql}`);
    },
  };
}
const COBRO = { pedidoId: "o1", codigo: 7, monto: 100, medio: "MP" as const, cobradoEn: "2026-10-28T10:00:00.000Z" };

test("P2-C1/C4 · con las columnas de N2_hub: type tipo@N, version, clave y ON CONFLICT", async () => {
  olvidarColumnasDelOutbox();
  const tx = txFalso(true);
  const r = await emitirEvento(tx, { tenantId: "t1", tipo: "pedido.cobrado", version: 1, clave: "pedido:o1:cobrado", datos: COBRO });
  assert.equal(r.escrito, true);
  // También con columnas: candado y chequeo por la columna O por payload->>'clave' en las filas con
  // clave NULL (las escritas sin N2_hub), cada rama por su índice (v2-d).
  assert.deepEqual(tx.llamadas.map((l) => l.sql).filter((s) => !s.includes("pg_attribute")), [SQL_CANDADO, SQL_YA_ESTA_CON_COLUMNAS, SQL_INSERTAR_CON_COLUMNAS]);
  assert.ok(SQL_YA_ESTA_CON_COLUMNAS.includes(`("clave" = $3 OR ("clave" IS NULL AND "payload"->>'clave' = $3))`));
  assert.ok(SQL_YA_ESTA.includes(`"payload"->>'clave'`));
  const ins = tx.llamadas.find((l) => l.sql === SQL_INSERTAR_CON_COLUMNAS)!;
  assert.ok(ins.sql.includes(`ON CONFLICT ("tenantId", "clave") DO NOTHING`));
  assert.equal(ins.params[1], "t1");
  assert.equal(ins.params[2], "pedido.cobrado@1");
  assert.equal(ins.params[4], 1);
  assert.equal(ins.params[5], "pedido:o1:cobrado");
  const payload = JSON.parse(String(ins.params[3]));
  assert.equal(payload._clave, undefined);
  assert.equal(payload.clave, "pedido:o1:cobrado");
  assert.deepEqual(payload.datos, COBRO);
  assert.equal(payload.negocio, "t1");

  const dup = await emitirEvento(txFalso(true, true), { tenantId: "t1", tipo: "pedido.cobrado", version: 1, clave: "pedido:o1:cobrado", datos: COBRO });
  assert.deepEqual(dup, { escrito: false, motivo: "duplicado", modo: "columnas" });
});

test("P2-C1/C4 · SIN las columnas: candado por (negocio, clave), chequeo previo y clave en payload._clave", async () => {
  olvidarColumnasDelOutbox();
  const tx = txFalso(false);
  const r = await emitirEvento(tx, { tenantId: "t1", tipo: "pedido.cobrado", version: 1, clave: "pedido:o1:cobrado", datos: COBRO });
  assert.equal(r.escrito, true);
  const orden = tx.llamadas.map((l) => l.sql).filter((s) => !s.includes("pg_attribute"));
  assert.deepEqual(orden, [SQL_CANDADO, SQL_YA_ESTA, SQL_INSERTAR_SIN_COLUMNAS]);
  assert.equal(tx.llamadas.find((l) => l.sql === SQL_CANDADO)!.params[0], "outbox:t1:pedido:o1:cobrado");
  const ins = tx.llamadas.find((l) => l.sql === SQL_INSERTAR_SIN_COLUMNAS)!;
  assert.ok(!ins.sql.includes('"clave"'));
  assert.equal(ins.params[2], "pedido.cobrado@1");
  assert.equal(JSON.parse(String(ins.params[3]))._clave, "pedido:o1:cobrado");

  olvidarColumnasDelOutbox();
  const dup = txFalso(false, true);
  assert.deepEqual(
    await emitirEvento(dup, { tenantId: "t1", tipo: "pedido.cobrado", version: 1, clave: "pedido:o1:cobrado", datos: COBRO }),
    { escrito: false, motivo: "duplicado", modo: "payload" },
  );
  assert.ok(!dup.llamadas.some((l) => l.sql === SQL_INSERTAR_SIN_COLUMNAS));
});

test("un doble de test sin SQL no emite (y no consulta nada)", async () => {
  assert.deepEqual(
    await emitirEvento({}, { tenantId: "t1", tipo: "pedido.cobrado", version: 1, clave: "k", datos: COBRO }),
    { escrito: false, motivo: "sin-sql" },
  );
});

test("traducción del Core al catálogo: canal, medio, pago externo; a cuenta/sin medio no emite cobro", async () => {
  assert.deepEqual(canalYReferencia("COUNTER", null), { canal: "MOSTRADOR", externalRef: null });
  assert.deepEqual(canalYReferencia("ONLINE", "abc"), { canal: "ONLINE", externalRef: null });
  assert.deepEqual(canalYReferencia("ONLINE", "ext:WC-981"), { canal: "API", externalRef: "WC-981" });
  assert.equal(medioDelCatalogo("MERCADOPAGO"), "MP");
  assert.equal(medioDelCatalogo(null), null);
  assert.equal(pagoExternoDelActor("mercadopago:1325"), "1325");
  assert.equal(pagoExternoDelActor("user:u1"), undefined);
  assert.equal(await emitirPedidoCobrado(txFalso(true), { tenantId: "t", pedidoId: "o", codigo: 1, monto: 1, medio: null }), null);
});

test("P2-C7 · docs/integrations/eventos.md está al día con el catálogo y trae un ejemplo por evento", () => {
  const doc = generarDocEventos();
  // Sin los CR que agrega un checkout de Windows con core.autocrlf (el índice de git guarda LF).
  const enDisco = readFileSync(path.join(process.cwd(), "docs", "integrations", "eventos.md"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(enDisco, doc, "Regenerar: npx tsx src/eventos/generar-doc.ts");
  for (const d of definiciones()) {
    const desde = doc.indexOf(`### \`${d.tipo}@${d.version}\``);
    assert.ok(desde > 0, `${d.tipo} sin sección`);
    assert.ok(doc.slice(desde).includes(`"tipo": "${d.tipo}"`), `${d.tipo} sin ejemplo`);
  }
});

test("factura.autorizada · la clase sale del tipo de ARCA: una nota de crédito no se confunde con una venta", () => {
  for (const t of [1, 6, 11, 51, 81, 82, 111, 118, 201, 206, 211]) assert.equal(claseDelComprobante(t), "FACTURA", `tipo ${t}`);
  for (const t of [3, 8, 13, 53, 112, 113, 114, 119, 203, 208, 213]) assert.equal(claseDelComprobante(t), "NOTA_CREDITO", `tipo ${t}`);
  for (const t of [2, 7, 12, 52, 115, 116, 117, 120, 202, 207, 212]) assert.equal(claseDelComprobante(t), "NOTA_DEBITO", `tipo ${t}`);
  for (const t of [4, 9, 15, 63, 999]) assert.equal(claseDelComprobante(t), "OTRO", `tipo ${t}`);
});
