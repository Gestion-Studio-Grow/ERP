// Tests de la conciliación de comprobantes del turnero (public/previews/breakpoint/turnero/dominio/conciliacion.mjs).
// Los comprobantes son textos redactados por nosotros con la forma de los bancos/billeteras argentinos (datos ficticios).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as modulo from "../../../../public/previews/breakpoint/turnero/dominio/conciliacion.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any -- el módulo es JS plano (lo carga Node sin build); se usa sin tipar */
const C: any = modulo;

const CLUB = { alias: ["bp.demo.ficticio"], cbu: ["2850590940090418135201"], cvu: ["0000003100010000000001"] };
const HOY = "2026-10-15";
const usadosVacios = () => ({ operaciones: new Set<string>(), huellas: new Set<string>() });
const pendiente = (x: Record<string, unknown> = {}) => ({ reservaId: "r1", ref: "BP-7K3Q", senaPendiente: 21000, saldo: 42000, tel: "5491123456789", creadaFecha: HOY, ...x });

const MP = `Comprobante de transferencia
Mercado Pago
15/10/2026 19:42 hs
Monto $ 21.000,00
De: Ana Pérez
Alias destino: bp.demo.ficticio
N° de operación 71234567890
Concepto: BP-7K3Q`;

test("lee un comprobante tipo Mercado Pago: monto, fecha, hora, operación, alias y código", () => {
  const c = C.leerComprobante(MP);
  assert.equal(c.monto, 21000);
  assert.equal(c.fecha, "2026-10-15");
  assert.equal(c.hora, "19:42");
  assert.equal(c.operacion, "71234567890");
  assert.equal(c.destino.alias, "bp.demo.ficticio");
  assert.equal(c.ref, "BP-7K3Q");
  assert.equal(c.titular, "Ana Pérez");
  assert.equal(c.confianza, 1);
});

test("lee formatos de banco: fecha en letras, CBU de 22 dígitos, importe sin signo y nº de comprobante", () => {
  const c = C.leerComprobante(`Transferencia realizada\n15 de octubre de 2026\nImporte: 21.000\nCBU destino 2850590940090418135201\nComprobante Nro 00045-778812\nReferencia bp-7k3q`);
  assert.equal(c.monto, 21000);
  assert.equal(c.fecha, "2026-10-15");
  assert.equal(c.destino.cbu, "2850590940090418135201");
  assert.equal(c.operacion, "00045-778812");
  assert.equal(c.ref, "BP-7K3Q");
});

test("números argentinos: puntos de miles y coma decimal, y el formato inglés", () => {
  assert.equal(C.numeroArgentino("21.000,50"), 21000.5);
  assert.equal(C.numeroArgentino("21000"), 21000);
  assert.equal(C.numeroArgentino("21,000.50"), 21000.5);
  assert.equal(C.numeroArgentino("1.234.567"), 1234567);
  assert.equal(C.numeroArgentino(""), null);
});

test("un CVU (empieza con 000) se distingue de un CBU", () => {
  const c = C.leerComprobante("Monto $ 5.000\nCVU 0000003100010000000001\nOperación 99887766");
  assert.equal(c.destino.cvu, "0000003100010000000001");
  assert.equal(c.destino.cbu, null);
});

test("la palabra «transferencia» no se confunde con un nº de operación", () => {
  const c = C.leerComprobante("Operación: Transferencia\nMonto $ 1.000");
  assert.equal(c.operacion, null);
});

test("el OCR con poca confianza baja la confianza del comprobante", () => {
  assert.ok(C.leerComprobante(MP, { confianzaOcr: 0.4 }).confianza < 0.6);
});

test("monto exacto con código BP → confirma esa reserva", () => {
  const d = C.conciliar({ comprobante: C.leerComprobante(MP), remitenteTel: "5491100000000", pendientes: [pendiente(), pendiente({ reservaId: "r2", ref: "BP-ZZZZ" })], club: CLUB, usados: usadosVacios(), hoy: HOY });
  assert.equal(d.decision, "confirmar");
  assert.equal(d.reservaId, "r1");
  assert.equal(d.aplicar, 21000);
  assert.equal(d.excedente, 0);
});

test("sin código, por el celular de quien lo manda (con o sin 54 9)", () => {
  const sinRef = MP.replace("Concepto: BP-7K3Q", "");
  const d = C.conciliar({ comprobante: C.leerComprobante(sinRef), remitenteTel: "1123456789", pendientes: [pendiente({ ref: null })], club: CLUB, usados: usadosVacios(), hoy: HOY });
  assert.equal(d.decision, "confirmar");
  assert.equal(d.reservaId, "r1");
});

test("pago parcial: se registra lo que llegó y se avisa cuánto falta", () => {
  const d = C.conciliar({ comprobante: C.leerComprobante(MP.replace("21.000,00", "10.000,00")), remitenteTel: "x", pendientes: [pendiente()], club: CLUB, usados: usadosVacios(), hoy: HOY });
  assert.equal(d.decision, "parcial");
  assert.equal(d.aplicar, 10000);
  assert.equal(d.falta, 11000);
});

test("pagó de más que el turno entero: confirma y el excedente va a revisar", () => {
  const d = C.conciliar({ comprobante: C.leerComprobante(MP.replace("21.000,00", "50.000,00")), remitenteTel: "x", pendientes: [pendiente()], club: CLUB, usados: usadosVacios(), hoy: HOY });
  assert.equal(d.decision, "confirmar");
  assert.equal(d.aplicar, 42000);
  assert.equal(d.excedente, 8000);
});

test("el mismo comprobante dos veces (por nº de operación o por huella) se rechaza", () => {
  const usados = usadosVacios();
  const c = C.leerComprobante(MP);
  usados.operaciones.add(c.operacion);
  assert.equal(C.conciliar({ comprobante: c, remitenteTel: "x", pendientes: [pendiente()], club: CLUB, usados, hoy: HOY }).decision, "rechazar");
  const sinOp = C.leerComprobante(MP.replace("N° de operación 71234567890", ""));
  const usados2 = usadosVacios();
  usados2.huellas.add(C.huella(sinOp));
  assert.equal(C.conciliar({ comprobante: sinOp, remitenteTel: "x", pendientes: [pendiente()], club: CLUB, usados: usados2, hoy: HOY }).decision, "rechazar");
});

test("transferencia a una cuenta que no es del club → rechazo", () => {
  const d = C.conciliar({ comprobante: C.leerComprobante(MP.replace("bp.demo.ficticio", "otro.club.demo")), remitenteTel: "x", pendientes: [pendiente()], club: CLUB, usados: usadosVacios(), hoy: HOY });
  assert.equal(d.decision, "rechazar");
  assert.match(d.motivo, /cuenta del club/);
});

test("sin destino visible, o ilegible, o viejo, o futuro → nunca se confirma solo: a revisar", () => {
  const base = { remitenteTel: "x", pendientes: [pendiente()], club: CLUB, usados: usadosVacios(), hoy: HOY };
  assert.equal(C.conciliar({ ...base, comprobante: C.leerComprobante(MP.replace("Alias destino: bp.demo.ficticio", "")) }).decision, "revisar");
  assert.equal(C.conciliar({ ...base, comprobante: C.leerComprobante("hola te mandé la plata") }).decision, "revisar");
  assert.equal(C.conciliar({ ...base, comprobante: C.leerComprobante(MP.replace("15/10/2026", "01/10/2026")) }).decision, "revisar");
  assert.equal(C.conciliar({ ...base, comprobante: C.leerComprobante(MP.replace("15/10/2026", "20/10/2026")) }).decision, "revisar");
});

test("código BP que no existe, o dos turnos del mismo celular sin código → a revisar", () => {
  const base = { club: CLUB, usados: usadosVacios(), hoy: HOY };
  assert.equal(C.conciliar({ ...base, comprobante: C.leerComprobante(MP.replace("BP-7K3Q", "BP-AAAA")), remitenteTel: "x", pendientes: [pendiente()] }).decision, "revisar");
  const sinRef = C.leerComprobante(MP.replace("Concepto: BP-7K3Q", "").replace("21.000,00", "9.000,00"));
  const d = C.conciliar({ ...base, comprobante: sinRef, remitenteTel: "5491123456789", pendientes: [pendiente({ ref: null }), pendiente({ reservaId: "r2", ref: null })] });
  assert.equal(d.decision, "revisar");
});

test("sólo por el monto (número desconocido, sin código) no se confirma: va a revisar con sugerencia", () => {
  const sinRef = C.leerComprobante(MP.replace("Concepto: BP-7K3Q", ""));
  const d = C.conciliar({ comprobante: sinRef, remitenteTel: "5491199999999", pendientes: [pendiente({ ref: null })], club: CLUB, usados: usadosVacios(), hoy: HOY });
  assert.equal(d.decision, "revisar");
  assert.equal(d.sugerida, "r1");
});

test("comprobante anterior a la reserva → a revisar", () => {
  const d = C.conciliar({ comprobante: C.leerComprobante(MP.replace("15/10/2026", "13/10/2026")), remitenteTel: "x", pendientes: [pendiente({ creadaFecha: "2026-10-15" })], club: CLUB, usados: usadosVacios(), hoy: HOY });
  assert.equal(d.decision, "revisar");
});

test("enmascarar y mismoTel: los datos sensibles no salen enteros", () => {
  assert.equal(C.enmascarar("71234567890"), "••••7890");
  assert.equal(C.enmascarar(null), "••••");
  assert.ok(C.mismoTel("+54 9 11 2345-6789", "1123456789"));
  assert.ok(!C.mismoTel("1123456789", "1123456788"));
});
