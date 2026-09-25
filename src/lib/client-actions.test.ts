// ============================================================================
// R1-F5 · Ficha fiscal del cliente y letra de su factura, contra Postgres real (app_rls + RLS),
// la Server Action real con la sesión de la dueña, y el despacho real (cliente SOAP) hablando con
// el simulador de ARCA (src/plugins/arca/afip/simulador.ts).
// ============================================================================
//
//  · `guardarFichaFiscal` guarda la ficha validada (CUIT con dígito verificador, condición, razón
//    social), la audita con el valor anterior y no toca la de otro negocio.
//  · Un inscripto (Tenant.arcaCondicionIva, leído por getFiscalProfile) factura A a su cliente
//    inscripto guardado y a un monotributista, B a un consumidor final; ARCA (simulado) autoriza
//    ese tipo. Un monotributo sin condición cargada en homologación (el caso de CH) sigue igual:
//    condición asumida y Factura C. Sin condición en producción, se niega con el dato que falta.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { SimuladorArca } from "@/plugins/arca/afip/simulador";

const laBase = baseEfimeraDelArchivo();
const simuladores = new Map<string, SimuladorArca>();
const simDe = (tenantId: string) => {
  if (!simuladores.has(tenantId)) simuladores.set(tenantId, new SimuladorArca());
  return simuladores.get(tenantId)!;
};

// CUIT con dígito verificador correcto (calculado con validarCuit).
const CUIT_NEGOCIO = "30712345671";
const CUIT_CLIENTE_INSCRIPTO = "30500000003";
const CUIT_CLIENTE_MONOTRIBUTISTA = "27111111117";

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, {
    NODE_ENV: "development",
    DB_CONNECTION_LIMIT: "2",
    DB_CONNECT_TIMEOUT_MS: "3000",
  });
  prepararAccionesDeServidor();
  const { guardarFichaFiscal } = await import("@/lib/client-actions");
  const { operatorPrisma } = await import("@/lib/operator-db");
  return { base, guardarFichaFiscal, operatorPrisma };
}

function formulario(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

type Preparado = NonNullable<Awaited<ReturnType<typeof preparar>>>;

async function guardarComoDuenia(p: Preparado, negocio: BaseEfimera["a"], campos: Record<string, string>) {
  const r = await ejecutarAccion({ negocio, usuario: negocio.duenia }, () => p.guardarFichaFiscal(formulario(campos)));
  assert.equal(r.tipo, "respuesta");
  return r.tipo === "respuesta" ? r.valor : null;
}

// El perfil fiscal se lee como en un pedido del negocio (resuelto por su host): el cliente de
// Prisma con RLS no resuelve el negocio fuera de un pedido.
async function perfilDe(negocio: BaseEfimera["a"]) {
  const { getFiscalProfile } = await import("@/lib/fiscal");
  const r = await ejecutarAccion({ negocio, usuario: negocio.duenia }, () => getFiscalProfile(negocio.id));
  if (r.tipo !== "respuesta") throw new Error(`perfil fiscal: ${r.tipo}`);
  return r.valor;
}

const fichaDe = (p: Preparado, id: string) =>
  p.operatorPrisma.client.findUnique({
    where: { id },
    select: { docTipo: true, docNro: true, razonSocial: true, condicionIva: true, domicilio: true },
  });

test("la dueña guarda la ficha fiscal de su cliente: queda normalizada y auditada con el valor anterior", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = p.base.a.clientes[0];
  const r = await guardarComoDuenia(p, p.base.a, {
    id,
    docTipo: "80",
    docNro: "30-50000000-3",
    razonSocial: "Distribuidora del Sur SA",
    condicionIva: "RESPONSABLE_INSCRIPTO",
    domicilio: "Av. Mitre 1234, Avellaneda",
  });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(await fichaDe(p, id), {
    docTipo: 80,
    docNro: CUIT_CLIENTE_INSCRIPTO,
    razonSocial: "Distribuidora del Sur SA",
    condicionIva: "RESPONSABLE_INSCRIPTO",
    domicilio: "Av. Mitre 1234, Avellaneda",
  });
  const audit = await p.operatorPrisma.auditLog.findFirst({ where: { entity: "Client", entityId: id, action: "update" } });
  assert.ok(audit, "queda en la auditoría");
  assert.deepEqual((audit!.changes as Record<string, unknown>).docNro, { antes: null, despues: CUIT_CLIENTE_INSCRIPTO });
  assert.equal(audit!.tenantId, p.base.a.id);
});

test("un CUIT con el dígito verificador cambiado, o sin condición frente al IVA, no se guarda", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = p.base.a.clientes[1];
  const antes = await fichaDe(p, id);
  const malDigito = await guardarComoDuenia(p, p.base.a, {
    id, docTipo: "80", docNro: "30500000004", razonSocial: "X SA", condicionIva: "RESPONSABLE_INSCRIPTO",
    domicilio: "Av. Mitre 1234, Avellaneda",
  });
  assert.equal(malDigito?.ok, false);
  assert.match(malDigito && !malDigito.ok ? malDigito.error : "", /verificador/);
  const sinCondicion = await guardarComoDuenia(p, p.base.a, { id, docTipo: "80", docNro: CUIT_CLIENTE_INSCRIPTO, razonSocial: "X SA" });
  assert.match(sinCondicion && !sinCondicion.ok ? sinCondicion.error : "", /condición frente al IVA/);
  assert.deepEqual(await fichaDe(p, id), antes);
});

test("aislamiento: con el id de una ficha de otro negocio da 'no existe' y la ficha ajena no cambia", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const ajena = p.base.b.clientes[0];
  const antes = await fichaDe(p, ajena);
  const r = await guardarComoDuenia(p, p.base.a, {
    id: ajena, docTipo: "80", docNro: CUIT_CLIENTE_INSCRIPTO, razonSocial: "Robada SA", condicionIva: "RESPONSABLE_INSCRIPTO",
    domicilio: "Av. Mitre 1234, Avellaneda",
  });
  assert.deepEqual(r, { ok: false, error: "Esa ficha de cliente no existe." });
  assert.deepEqual(await fichaDe(p, ajena), antes);
  assert.equal(await p.operatorPrisma.auditLog.count({ where: { entityId: ajena, action: "update" } }), 0);
});

test("inscripto: B a consumidor final por el camino completo; la A que el impreso no puede entregar no se promete; la A común a la inscripta sale del despacho del plugin contra el simulador", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const a = p.base.a;
  await guardarComoDuenia(p, a, {
    id: a.clientes[1], docTipo: "80", docNro: CUIT_CLIENTE_MONOTRIBUTISTA, razonSocial: "Ana Gómez", condicionIva: "MONOTRIBUTO",
    domicilio: "Calle 12 Nº 345, La Plata",
  });
  await p.operatorPrisma.tenant.update({
    where: { id: a.id },
    data: { arcaCondicionIva: "RESPONSABLE_INSCRIPTO", arcaCuit: CUIT_NEGOCIO, arcaPuntoVenta: 1, arcaHomologacion: true },
  });

  const { calcularImpuestosPorAlicuota } = await import("@/lib/fiscal/impuestos-por-alicuota");
  const { decidirFacturaDeVenta, receptorParaComprobante } = await import("@/lib/fiscal/ficha-fiscal");
  const { puedeFacturarVenta } = await import("@/app/admin/(dashboard)/ventas/factura");
  const invoiceCore = await import("@/lib/invoice-core");
  const { processArcaOutbox } = await import("@/lib/arca-dispatch");
  const { SoapAfipClient, FetchSoapTransport } = await import("@/plugins/arca/afip/soap");
  const { procesarInvoiceCreated } = await import("@/plugins/arca/handler");
  const { fechaFiscalDelDia } = await import("@/lib/libros/fecha-fiscal");

  const perfil = await perfilDe(a);
  assert.equal(perfil.condicionIva, "RESPONSABLE_INSCRIPTO", "lee Tenant.arcaCondicionIva");
  assert.equal(perfil.condicionIvaAsumida, false);
  const hoy = fechaFiscalDelDia();
  const venta = { paid: true, anulada: false, total: 1210 };
  // Lo cobrado por producto, con su alícuota: 605 al 21 % y 605 al 10,5 % (suman los 1210).
  const renglones = [
    { total: 605, alicuotaIva: 5 },
    { total: 605, alicuotaIva: 4 },
  ];
  const calculo = calcularImpuestosPorAlicuota(perfil.condicionIva, { total: venta.total, renglones });
  assert.ok(calculo.ok && calculo.ivaPorProducto, "el IVA sale de la alícuota de cada producto");
  const impuestos = calculo.impuestos;
  assert.deepEqual(impuestos.iva.map((s) => s.alicuotaId), [4, 5]);
  const clienteSoap = (tenantId: string) =>
    new SoapAfipClient(
      { cuit: Number(CUIT_NEGOCIO), homologacion: true },
      {
        transport: new FetchSoapTransport({ fetch: simDe(tenantId).fetch, timeoutMs: 200 }),
        signer: { firmarCms: async () => "CMS-DE-PRUEBA" },
      },
    );
  const perfilVenta = { ok: true as const, condicionIva: perfil.condicionIva, cuit: perfil.cuit };

  // 1) Camino completo (Ventas → createInvoice → outbox → SOAP → simulador): a consumidor final, B.
  assert.deepEqual(
    puedeFacturarVenta({ facturacionEncendida: true, perfil: perfilVenta, venta, receptor: null, renglones, hoy }),
    { ok: true, letra: "B" },
  );
  await p.operatorPrisma.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });
  const invoiceId = await invoiceCore.createInvoice({
    tenantId: a.id,
    concepto: 1,
    fecha: hoy,
    emisor: { cuit: perfil.cuit, condicionIva: perfil.condicionIva, puntoVenta: perfil.puntoVenta },
    receptor: receptorParaComprobante(decidirFacturaDeVenta(perfilVenta, null, { hoy, total: venta.total }))!,
    ...impuestos,
    ivaPorProducto: calculo.ivaPorProducto,
    vencimientoPago: hoy,
  });
  await processArcaOutbox(20, { clientePara: clienteSoap, numeroUsadoPorOtraFactura: invoiceCore.numeroUsadoPorOtraFactura });
  const inv = await p.operatorPrisma.invoice.findUnique({ where: { id: invoiceId }, select: { status: true, tipoComprobante: true, rechazoMotivo: true } });
  assert.equal(inv?.status, "AUTHORIZED", inv?.rechazoMotivo ?? "");
  assert.equal(inv?.tipoComprobante, 6, "Factura B");

  // 2) Sin la clase A que ARCA le asignó (no hay dónde cargarla todavía), Ventas no promete una A:
  //    a su cliente inscripto no llama al facturador y dice qué falta.
  const fichaInscripto = await fichaDe(p, a.clientes[0]);
  const sinClase = puedeFacturarVenta({ facturacionEncendida: true, perfil: perfilVenta, venta, receptor: fichaInscripto, renglones, hoy });
  assert.match(sinClase.ok ? "" : sinClase.motivo, /Falta cargar qué Factura A te asignó ARCA/);

  // 3) Ventas no promete la A que el impreso no puede entregar (refutación r1f5), ni con la
  //    clase A cargada: a la monotributista (el impreso no trae la leyenda de la RG 5003/2021),
  //    ni a la inscripta con productos de dos alícuotas (no puede mostrar el precio sin IVA).
  const conClase = { ...perfilVenta, regimenFacturaA: "A" };
  const todoAl21 = [{ total: 1210, alicuotaIva: 5 }];
  const fichaMonotributista = await fichaDe(p, a.clientes[1]);
  const aLaMonotributista = puedeFacturarVenta({ facturacionEncendida: true, perfil: conClase, venta, receptor: fichaMonotributista, renglones: todoAl21, hoy });
  assert.match(aLaMonotributista.ok ? "" : aLaMonotributista.motivo, /RG 5003\/2021/);
  const conDosAlicuotas = puedeFacturarVenta({ facturacionEncendida: true, perfil: conClase, venta, receptor: fichaInscripto, renglones, hoy });
  assert.match(conDosAlicuotas.ok ? "" : conDosAlicuotas.motivo, /alícuotas/);

  // 4) Con la clase A común, todo al 21 % y el domicilio en la ficha, Ventas promete la A y el
  //    despacho del plugin (cliente SOAP real contra el simulador) la pide y ARCA la autoriza.
  //    NO es el camino del producto: la clase A todavía no tiene columna en Tenant y el despacho
  //    del outbox no la pasa (src/lib/arca-dispatch.ts:162-186), así que por el outbox esta A iría
  //    a revisión. Prueba que, cuando el dato llegue, la A que Ventas promete es la que sale.
  assert.deepEqual(
    puedeFacturarVenta({ facturacionEncendida: true, perfil: conClase, venta, receptor: fichaInscripto, renglones: todoAl21, hoy }),
    { ok: true, letra: "A" },
  );
  const calculo21 = calcularImpuestosPorAlicuota(perfil.condicionIva, { total: venta.total, renglones: todoAl21 });
  assert.ok(calculo21.ok);
  const registrados: { tipoComprobante: number }[] = [];
  const r = await procesarInvoiceCreated(
    {
      invoiceId: "inv-a-inscripta",
      tenantId: a.id,
      concepto: 1,
      fecha: hoy,
      emisor: { cuit: perfil.cuit, condicionIva: perfil.condicionIva, puntoVenta: perfil.puntoVenta, regimenFacturaA: "A" },
      receptor: receptorParaComprobante(decidirFacturaDeVenta(conClase, fichaInscripto, { hoy, total: venta.total }))!,
      ...calculo21.impuestos,
      ivaPorProducto: calculo21.ivaPorProducto,
    } as Parameters<typeof procesarInvoiceCreated>[0],
    {
      clientePara: () => clienteSoap(a.id),
      registrar: async (input) => {
        registrados.push(input);
      },
      anotarIntento: async () => {},
      numeroUsadoPorOtraFactura: async () => false,
      fechaDeEnvio: () => hoy,
    },
  );
  assert.equal(r.tipo, 1, "Factura A");
  assert.equal(registrados[0]?.tipoComprobante, 1);
  const tipos = simDe(a.id).comprobantesAutorizados().map((c) => c.tipo);
  assert.deepEqual([tipos.filter((x) => x === 1).length, tipos.filter((x) => x === 6).length], [1, 1], "ARCA autorizó una A y una B");
});

test("monotributo sin condición cargada (el caso de CH): en homologación igual que antes, C; en producción se niega", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const b = p.base.b;
  await p.operatorPrisma.tenant.update({
    where: { id: b.id },
    data: { arcaCondicionIva: null, arcaCuit: "20304050609", arcaPuntoVenta: 2, arcaHomologacion: true },
  });
  const { calcularImpuestos, PerfilFiscalIncompletoError } = await import("@/lib/fiscal");
  const perfil = await perfilDe(b);
  assert.deepEqual(
    { condicionIva: perfil.condicionIva, asumida: perfil.condicionIvaAsumida },
    { condicionIva: "MONOTRIBUTO", asumida: true },
  );
  assert.deepEqual(calcularImpuestos(perfil.condicionIva, 15500), {
    neto: 15500,
    iva: [{ alicuotaId: 3, base: 15500, importe: 0 }],
    total: 15500,
  });

  await p.operatorPrisma.tenant.update({ where: { id: b.id }, data: { arcaHomologacion: false } });
  await assert.rejects(
    perfilDe(b),
    (e: unknown) => e instanceof PerfilFiscalIncompletoError && e.campo === "condicionIva" && /no tiene condición de IVA/.test(e.message),
  );
  await p.operatorPrisma.tenant.update({ where: { id: b.id }, data: { arcaCondicionIva: "MONOTRIBUTO" } });
  const cargado = await perfilDe(b);
  assert.deepEqual({ c: cargado.condicionIva, asumida: cargado.condicionIvaAsumida }, { c: "MONOTRIBUTO", asumida: false });
});
