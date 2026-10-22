// ============================================================================
// FACTURITA · emisión real (Server Action) contra una base efímera con RLS y ARCA simulado
// ============================================================================
//
// Lo que encontró el contador (vuelta 2) probado con el camino de verdad: `emitirFacturitaAction`
// → `createInvoice` → despacho (`procesarEnviosDelNegocio`, ARCA en stub). Cada caso mira la fila
// que quedó en la base, no sólo la respuesta.
//
//  · Monotributista que le factura un SERVICIO a una empresa inscripta: sale C, concepto 2, con las
//    fechas del servicio, la condición real del comprador y la descripción guardada.
//  · Responsable Inscripto a consumidor final con 10,5 %: sale B con el IVA declarado por renglón
//    (antes el plugin frenaba toda factura del inscripto, ENG-024).
//  · Lo que frena el sistema se dice como del sistema, no «ARCA no autorizó».
//  · Con la facturación apagada queda PENDIENTE y se dice así (no «Factura emitida»).
//  · En modo stub, la autorizada es «de prueba».

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();

const CUIT_EMISOR = "20111111112";
const CUIT_EMPRESA = "30111111118"; // verificador válido, inventado

async function preparar(t: import("node:test").TestContext, condicion: "MONOTRIBUTO" | "RESPONSABLE_INSCRIPTO") {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000", ARCA_INVOICING_ENABLED: "true" });
  delete env.ARCA_MODO; // stub: nada sale a la red
  const duenio = await prismaComoDuenio(base);
  // Cada test usa su negocio para que el tope de 5 por mes no cargue con los otros.
  const negocio = condicion === "MONOTRIBUTO" ? base.a : base.b;
  await duenio.tenant.update({
    where: { id: negocio.id },
    data: {
      arcaCuit: CUIT_EMISOR,
      arcaPuntoVenta: 2,
      arcaHomologacion: true,
      arcaCondicionIva: condicion,
      blueprintId: "facturita",
    },
  });
  const { emitirFacturitaAction } = await import("@/lib/facturita-actions");
  type Datos = Parameters<typeof emitirFacturitaAction>[0];
  const emitir = async (datos: Datos) => {
    const s = await ejecutarAccion({ negocio, usuario: negocio.duenia }, () => emitirFacturitaAction(datos));
    assert.equal(s.tipo, "respuesta", JSON.stringify(s));
    return (s as { valor: Awaited<ReturnType<typeof emitirFacturitaAction>> }).valor;
  };
  const fila = (id: string) =>
    duenio.invoice.findUniqueOrThrow({
      where: { id },
      select: {
        tenantId: true, status: true, tipoComprobante: true, concepto: true, docTipo: true, docNro: true,
        descripcion: true, neto: true, iva: true, total: true, ivaDesglose: true, rechazoMotivo: true, cae: true,
      },
    });
  const payloadDe = async (invoiceId: string) => {
    const ev = await duenio.outboxEvent.findFirst({
      where: { tenantId: negocio.id, payload: { path: ["invoiceId"], equals: invoiceId } },
      select: { payload: true },
    });
    return ev?.payload as Record<string, unknown> | undefined;
  };
  const { fechaFiscalDelDia } = await import("@/lib/libros/fecha-fiscal");
  const hoy = fechaFiscalDelDia();
  const hoyInput = `${hoy.slice(0, 4)}-${hoy.slice(4, 6)}-${hoy.slice(6, 8)}`;
  return { base, negocio, duenio, emitir, fila, payloadDe, hoy, hoyInput };
}

test("monotributista → servicio a una empresa inscripta: C, concepto 2, fechas, condición real y descripción", async (t) => {
  const p = await preparar(t, "MONOTRIBUTO");
  if (!p) return;
  const r = await p.emitir({
    descripcion: "Diseño de logo",
    total: 50_000,
    concepto: "servicios",
    servicioDesde: "2026-10-01",
    servicioHasta: "2026-10-15",
    vencimientoPago: p.hoyInput,
    nombreReceptor: "Distribuidora Norte SA",
    docTipo: 80,
    docNro: CUIT_EMPRESA,
    condicionReceptor: "RESPONSABLE_INSCRIPTO",
  });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.estado.estado, "autorizada");
  assert.equal(r.estado.estado === "autorizada" && r.estado.dePrueba, true, "en stub la autorizada es de prueba");
  assert.match(r.mensaje, /prueba/);
  const f = await p.fila(r.invoiceId);
  assert.equal(f.tenantId, p.negocio.id);
  assert.equal(f.status, "AUTHORIZED", f.rechazoMotivo ?? "");
  assert.equal(f.tipoComprobante, 11, "monotributo emite C");
  assert.equal(f.concepto, 2);
  assert.equal(f.docTipo, 80);
  assert.equal(f.docNro, CUIT_EMPRESA);
  assert.equal(f.descripcion, "Diseño de logo", "la descripción se guarda para el PDF");
  const payload = await p.payloadDe(r.invoiceId);
  assert.ok(payload, "el envío quedó en el outbox");
  assert.equal((payload.receptor as { condicionIva: string }).condicionIva, "RESPONSABLE_INSCRIPTO", "RG 5616: la condición real");
  assert.equal(payload.servicioDesde, "20261001");
  assert.equal(payload.servicioHasta, "20261015");
  assert.ok(typeof payload.vencimientoPago === "string" && /^\d{8}$/.test(payload.vencimientoPago));
});

test("monotributista → empresa con CUIT sin condición: no se emite (antes iba como consumidor final)", async (t) => {
  const p = await preparar(t, "MONOTRIBUTO");
  if (!p) return;
  const r = await p.emitir({ descripcion: "Macetas", total: 1_000, nombreReceptor: "Distribuidora Norte SA", docTipo: 80, docNro: CUIT_EMPRESA });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && /inscripto el comprador/.test(r.error));
  assert.equal(r.ok === false && r.invoiceId, undefined, "no se creó ninguna factura");
});

test("inscripto → consumidor final al 10,5 %: B con el IVA declarado por renglón (ENG-024)", async (t) => {
  const p = await preparar(t, "RESPONSABLE_INSCRIPTO");
  if (!p) return;
  const r = await p.emitir({ descripcion: "Libros", total: 11_050, alicuota: "10.5" });
  assert.ok(r.ok, JSON.stringify(r));
  const f = await p.fila(r.invoiceId);
  assert.equal(f.status, "AUTHORIZED", f.rechazoMotivo ?? "");
  assert.equal(f.tipoComprobante, 6, "inscripto a consumidor final emite B");
  assert.equal(Number(f.neto), 10_000);
  assert.equal(Number(f.iva), 1_050);
  assert.deepEqual(
    (f.ivaDesglose as { alicuotaId: number }[]).map((x) => x.alicuotaId),
    [4],
    "la alícuota elegida (10,5 % = código 4)",
  );
  const payload = await p.payloadDe(r.invoiceId);
  assert.equal(payload?.ivaPorProducto, true);
});

test("lo que frena el sistema se dice como del sistema; con la facturación apagada, pendiente", async (t) => {
  const p = await preparar(t, "RESPONSABLE_INSCRIPTO");
  if (!p) return;
  // Inscripto → otro inscripto: corresponde A, y la A pide la clase que asignó ARCA (RG 1575), que
  // este negocio no tiene cargada. La decisión del plugin la frena antes de mandarla.
  const a = await p.emitir({
    descripcion: "Consultoría",
    total: 121_000,
    concepto: "servicios",
    servicioDesde: p.hoyInput,
    servicioHasta: p.hoyInput,
    vencimientoPago: p.hoyInput,
    nombreReceptor: "Distribuidora Norte SA",
    docTipo: 80,
    docNro: CUIT_EMPRESA,
    condicionReceptor: "RESPONSABLE_INSCRIPTO",
  });
  assert.equal(a.ok, false, JSON.stringify(a));
  if (!a.ok) {
    assert.match(a.error, /^No la mandamos a ARCA/, "no se la achaca a ARCA");
    assert.match(a.error, /Factura A/);
    assert.doesNotMatch(a.error, /ARCA no autorizó/);
    assert.equal(a.estado?.estado === "rechazada" && a.estado.origen, "sistema");
  }

  const env = process.env as Record<string, string | undefined>;
  env.ARCA_INVOICING_ENABLED = "false";
  t.after(() => {
    env.ARCA_INVOICING_ENABLED = "true";
  });
  const r = await p.emitir({ descripcion: "Libros", total: 1_210 });
  assert.ok(r.ok, JSON.stringify(r));
  assert.deepEqual(r.estado, { estado: "pendiente", motivo: "apagada", ventanaDias: 5 });
  assert.match(r.mensaje, /hasta 5 días/);
  assert.doesNotMatch(r.mensaje, /emitida/i);
  assert.equal((await p.fila(r.invoiceId)).status, "PENDING");
});

test("PDF de Facturita: sin datos del emisor, aviso que lleva a Mi cuenta; con datos, sale con comprador y descripción; y se anula", async (t) => {
  const p = await preparar(t, "MONOTRIBUTO");
  if (!p) return;
  const { respuestaPdfDeComprobante } = await import("@/lib/comprobante-pdf-respuesta");
  const { faltantePdfEnFacturita } = await import("@/lib/facturita-emisor");
  const { guardarDatosParaFacturasAction, facturasFacturitaAction, anularFacturitaAction } = await import("@/lib/facturita-actions");
  const enNegocio = async <T,>(fn: () => Promise<T>): Promise<T> => {
    const s = await ejecutarAccion({ negocio: p.negocio, usuario: p.negocio.duenia }, fn);
    assert.equal(s.tipo, "respuesta", JSON.stringify(s));
    return (s as { valor: T }).valor;
  };
  const volverA = {
    texto: "Mis facturas",
    href: "/facturita/app/facturas",
    completarEmisor: { texto: "Completar en Mi cuenta", href: "/facturita/app/cuenta#datos-para-facturas" },
    reescribir: faltantePdfEnFacturita,
  };

  // Con la facturación apagada queda PENDIENTE; después se la autoriza «a mano» con un CAE de 14
  // números como los de ARCA (el del stub, STUB…, no se imprime) y un CAE no se puede editar.
  const env = process.env as Record<string, string | undefined>;
  env.ARCA_INVOICING_ENABLED = "false";
  t.after(() => {
    env.ARCA_INVOICING_ENABLED = "true";
  });
  const r = await p.emitir({
    descripcion: "Macetas de cerámica",
    total: 12_000,
    nombreReceptor: "Juana Gómez",
    docTipo: 96,
    docNro: "12345678",
  });
  assert.ok(r.ok, JSON.stringify(r));
  await p.duenio.invoice.update({
    where: { id: r.invoiceId },
    data: { status: "AUTHORIZED", tipoComprobante: 11, numero: 9001, cae: "76543210987654", caeVencimiento: p.hoy, authorizedAt: new Date() },
  });

  // 1) Sin «Datos para tus facturas»: 409 HTML que dice qué falta y lleva a Mi cuenta.
  const sinDatos = await enNegocio(() => respuestaPdfDeComprobante(r.invoiceId, p.negocio.id, volverA));
  assert.equal(sinDatos.status, 409);
  assert.match(sinDatos.headers.get("Content-Type") ?? "", /text\/html/);
  const html = await sinDatos.text();
  assert.match(html, /\/facturita\/app\/cuenta#datos-para-facturas/);
  assert.match(html, /Mi cuenta/);
  assert.doesNotMatch(html, /ficha del cliente|en Facturación/);

  // 2) Se completan en los MISMOS campos que lee el PDF.
  const g = await enNegocio(() =>
    guardarDatosParaFacturasAction({
      razonSocial: "Ana Pérez",
      domicilio: "Mitre 100, Quilmes",
      inicioActividades: "2024-01-15",
      iibbTipo: "exento",
      iibbNumero: "",
    }),
  );
  assert.deepEqual(g, { ok: true });
  const t2 = await p.duenio.tenant.findUniqueOrThrow({
    where: { id: p.negocio.id },
    select: { arcaRazonSocial: true, arcaDomicilioFiscal: true, arcaInicioActividades: true, arcaIibb: true },
  });
  assert.deepEqual(t2, { arcaRazonSocial: "Ana Pérez", arcaDomicilioFiscal: "Mitre 100, Quilmes", arcaInicioActividades: "20240115", arcaIibb: "Exento" });

  // 3) Ahora sale: PDF, con el comprador (copia guardada al emitir) y la descripción.
  const { leerComprobanteImpreso } = await import("@/lib/comprobante-pdf-datos");
  const leido = await enNegocio(() => leerComprobanteImpreso(r.invoiceId, p.negocio.id));
  assert.ok(leido);
  assert.equal(leido.receptor.nombre, "Juana Gómez");
  assert.equal(leido.receptor.condicionIva, "CONSUMIDOR_FINAL");
  assert.equal(leido.renglones[0].descripcion, "Macetas de cerámica");
  const pdf = await enNegocio(() => respuestaPdfDeComprobante(r.invoiceId, p.negocio.id, volverA));
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("Content-Type"), "application/pdf");

  // 4) Anular: nota de crédito por el total (queda pendiente: la facturación sigue apagada); la
  //    factura queda sin saldo y no se puede anular dos veces.
  const sinMotivo = await enNegocio(() => anularFacturitaAction(r.invoiceId, ""));
  assert.equal(sinMotivo.ok, false);
  const anular = await enNegocio(() => anularFacturitaAction(r.invoiceId, "Me equivoqué en el total"));
  assert.ok(anular.ok, JSON.stringify(anular));
  const lista = await enNegocio(() => facturasFacturitaAction());
  const original = lista.find((x) => x.id === r.invoiceId);
  const nota = lista.find((x) => x.esNotaDeCredito);
  assert.equal(original?.saldoAnulable, 0);
  assert.ok(nota, "la nota de crédito está en la lista");
  assert.equal(nota.total, 12_000);
  assert.equal(nota.status, "PENDING");
  assert.equal(original?.ambiente, "prueba", "en stub, la autorizada es de prueba (deducido como el PDF)");
  const segunda = await enNegocio(() => anularFacturitaAction(r.invoiceId, "otra vez"));
  assert.equal(segunda.ok, false, "no se anula más de lo facturado");
});
