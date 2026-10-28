// ============================================================================
// ABONOS, LOTE DEL MES Y NOTA DE CRÉDITO DESDE LA CONSOLA — contra Postgres (base efímera, app_rls)
// ============================================================================
//
// El negocio A es el estudio (módulo `cartera`), el B es su cliente (monotributista, CUIT y punto
// de venta cargados, en homologación). Se corren las actions TAL CUAL, con la sesión de la dueña
// de A, y se mide en la base:
//   · la regla va a `ReglaFacturacion` del estudio; un negocio fuera de la cartera no entra;
//   · dos «Emitir el lote» simultáneos dejan UNA factura en B (origen ABONO, con la descripción
//     del mes); repetir no emite otra; si ARCA la rechaza, el lote la vuelve a emitir (misma fila);
//   · un envío DETENIDO no se toma con las opciones del lote y sí con las de una persona
//     («Mandar los pendientes a ARCA»), contra el simulador de ARCA;
//   · la nota de crédito desde la consola anula una parte y nunca más de lo facturado;
//   · la baja saca la regla del lote; B (sin cartera) no puede usar nada de esto.
// CUITs ficticios con dígito verificador válido. La facturación de la plataforma queda apagada:
// sólo el test del detenido habla con ARCA, y es el simulador.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { SimuladorArca } from "@/plugins/arca/afip/simulador";

const CUIT_CLIENTE = "20111111112";
const CUIT_RECEPTOR = "20222222223";

test("consola del contador: reglas, lote idempotente (ABONO), reintento de un detenido y nota de crédito", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const antes = { auth: process.env.AUTH_SECRET, arca: process.env.ARCA_INVOICING_ENABLED };
  process.env.AUTH_SECRET = "secreto-de-auth-qa";
  delete process.env.ARCA_INVOICING_ENABLED;
  t.after(() => {
    if (antes.auth === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = antes.auth;
    if (antes.arca !== undefined) process.env.ARCA_INVOICING_ENABLED = antes.arca;
  });
  prepararAccionesDeServidor();

  const acciones = await import("@/lib/cartera-abonos-actions");
  const abonos = await import("@/lib/cartera-abonos");
  const invoiceCore = await import("@/lib/invoice-core");
  const { mesDelNegocio } = await import("@/lib/libros/fecha-fiscal");
  const { SoapAfipClient, FetchSoapTransport } = await import("@/plugins/arca/afip/soap");
  const duenio = await prismaComoDuenio(base);

  await duenio.tenant.update({ where: { id: base.a.id }, data: { modules: ["cartera", "clients", "reports"] } });
  await duenio.tenant.update({
    where: { id: base.b.id },
    data: { arcaCuit: CUIT_CLIENTE, arcaPuntoVenta: 3, arcaCondicionIva: "MONOTRIBUTO", arcaHomologacion: true },
  });
  await duenio.carteraCliente.create({ data: { tenantId: base.a.id, clienteTenantId: base.b.id, alias: "Kiosco de Marta", estado: "activa" } });

  const comoEstudio = <T>(fn: () => Promise<T>) => ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, fn);
  const valor = <T>(r: { tipo: string; valor?: T }) => {
    assert.equal(r.tipo, "respuesta");
    return r.valor as T;
  };
  const mes = mesDelNegocio();
  const form = (p: Record<string, string>) => {
    const fd = new FormData();
    const datos = {
      clienteTenantId: base.b.id,
      descripcion: "Honorarios mensuales",
      importe: "150.000,50",
      concepto: "servicios",
      receptorNombre: "Inmobiliaria Ejemplo",
      receptorDocTipo: "CUIT",
      receptorDocNro: CUIT_RECEPTOR,
      receptorCondicionIva: "MONOTRIBUTO",
      diasVencimiento: "10",
      desde: mes,
      hasta: "",
      ...p,
    };
    for (const [k, v] of Object.entries(datos)) fd.set(k, v);
    return fd;
  };

  // ── 1) La regla va a ReglaFacturacion del estudio; fuera de la cartera, no ──
  assert.equal(valor<{ ok: boolean }>(await comoEstudio(() => acciones.guardarReglaAction(null, form({})))).ok, true);
  assert.deepEqual(valor(await comoEstudio(() => acciones.guardarReglaAction(null, form({ clienteTenantId: base.a.id })))), {
    ok: false,
    error: "Ese cliente no está en tu cartera.",
    campo: "clienteTenantId",
  });
  const reglas = await duenio.reglaFacturacion.findMany({});
  assert.equal(reglas.length, 1);
  assert.equal(reglas[0].tenantId, base.a.id, "la regla es del estudio");
  assert.equal(reglas[0].receptorDocTipo, 80);
  assert.equal(Number(reglas[0].importe), 150000.5);
  const reglaId = reglas[0].id;

  // ── 2) Dos «Emitir el lote» a la vez: UNA factura, con su clave de abono y su descripción ──
  const [e1, e2] = await Promise.all([comoEstudio(() => acciones.emitirLoteAction(mes)), comoEstudio(() => acciones.emitirLoteAction(mes))]);
  const emitidas = [e1, e2].map((e) => {
    const v = valor<Awaited<ReturnType<typeof acciones.emitirLoteAction>>>(e);
    return v.ok ? v.resultado.emitidas : -1;
  });
  assert.deepEqual(emitidas.sort(), [0, 1], `uno emite, el otro no repite: ${JSON.stringify([e1, e2])}`);
  const facturas = await duenio.invoice.findMany({ where: { tenantId: base.b.id } });
  assert.equal(facturas.length, 1);
  const f = facturas[0];
  assert.equal(f.status, "PENDING");
  assert.equal(f.abonoClave, invoiceCore.claveDeAbono(reglaId, mes));
  assert.match(f.descripcion ?? "", /^Honorarios mensuales · /);
  assert.equal(f.concepto, 2);
  assert.equal(f.docNro, CUIT_RECEPTOR);
  assert.equal(Number(f.total), 150000.5);
  assert.equal(await duenio.invoice.count({ where: { tenantId: base.a.id } }), 0, "nada se factura en el estudio");
  assert.deepEqual((await abonos.prepararLoteDelEstudio(base.a.id, mes)).renglones.map((r) => r.estado), ["ya_emitida"]);

  // ── 3) ARCA la rechaza: el lote la vuelve a emitir, en la MISMA fila ──
  await duenio.invoice.update({ where: { id: f.id }, data: { status: "REJECTED", rechazoMotivo: "10015: El campo DocNro es inválido" } });
  await duenio.outboxEvent.updateMany({ where: { tenantId: base.b.id }, data: { processedAt: new Date() } });
  assert.deepEqual((await abonos.prepararLoteDelEstudio(base.a.id, mes)).renglones.map((r) => r.estado), ["reemitir"]);
  const reemision = valor<Awaited<ReturnType<typeof acciones.emitirLoteAction>>>(await comoEstudio(() => acciones.emitirLoteAction(mes)));
  assert.ok(reemision.ok && reemision.resultado.emitidas === 1);
  assert.equal(await duenio.invoice.count({ where: { tenantId: base.b.id } }), 1, "misma fila");
  assert.equal((await duenio.invoice.findUniqueOrThrow({ where: { id: f.id } })).status, "PENDING");

  // ── 4) Un envío detenido: el lote no lo toma, la persona sí (simulador de ARCA) ──
  const sim = new SimuladorArca();
  const deps = {
    clientePara: () =>
      new SoapAfipClient(
        { cuit: Number(CUIT_CLIENTE), homologacion: true },
        { transport: new FetchSoapTransport({ fetch: sim.fetch, timeoutMs: 2000, interruptor: null }), signer: { firmarCms: async () => "CMS-DE-PRUEBA" } },
      ),
    numeroUsadoPorOtraFactura: invoiceCore.numeroUsadoPorOtraFactura,
  };
  await duenio.outboxEvent.updateMany({
    where: { tenantId: base.b.id, processedAt: null },
    data: { muertoEn: new Date(), attempts: 8, lastError: "ARCA no respondió (8 intentos)" },
  });
  const delLote = await abonos.mandarPendientesDelCliente(base.b.id, abonos.OPCIONES_DEL_LOTE, deps);
  assert.equal(delLote.autorizados, 0, "el lote no revive un detenido");
  assert.equal((await duenio.invoice.findUniqueOrThrow({ where: { id: f.id } })).status, "PENDING");
  const dePersona = await abonos.mandarPendientesDelCliente(base.b.id, abonos.OPCIONES_DE_UNA_PERSONA, deps);
  assert.equal(dePersona.autorizados, 1, "«Mandar los pendientes a ARCA» le da otro intento");
  const autorizada = await duenio.invoice.findUniqueOrThrow({ where: { id: f.id } });
  assert.equal(autorizada.status, "AUTHORIZED");
  assert.ok(autorizada.cae);

  // ── 5) Nota de crédito desde la consola: parcial, y nunca más de lo facturado ──
  const nc = (importe: string, motivo = "Servicio no prestado") => {
    const fd = new FormData();
    fd.set("clienteTenantId", base.b.id);
    fd.set("facturaId", f.id);
    fd.set("motivo", motivo);
    fd.set("importe", importe);
    return comoEstudio(() => acciones.anularFacturaAction(null, fd));
  };
  assert.equal(valor<{ ok: boolean }>(await nc("50.000")).ok, true);
  const demas = valor<{ ok: boolean; error?: string }>(await nc("200.000"));
  assert.equal(demas.ok, false, "no se anula más de lo que queda");
  const notas = await duenio.invoice.findMany({ where: { tenantId: base.b.id, comprobanteAsociadoId: f.id } });
  assert.equal(notas.length, 1);
  assert.equal(Number(notas[0].total), 50000);
  // Una factura de otro negocio (la del estudio no existe) no se alcanza desde la cartera.
  const ajena = new FormData();
  ajena.set("clienteTenantId", base.a.id);
  ajena.set("facturaId", f.id);
  ajena.set("motivo", "x");
  assert.equal(valor<{ ok: boolean }>(await comoEstudio(() => acciones.anularFacturaAction(null, ajena))).ok, false);

  // ── 6) Baja: sale del lote ──
  assert.deepEqual(valor(await comoEstudio(() => acciones.bajaReglaAction(reglaId))), { ok: true });
  assert.equal((await abonos.prepararLoteDelEstudio(base.a.id, mes)).renglones.length, 0);
  assert.equal((await duenio.reglaFacturacion.findUniqueOrThrow({ where: { id: reglaId } })).estado, "baja");

  // ── 7) B no es estudio ──
  const desdeB = await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () => acciones.emitirLoteAction(mes));
  assert.ok(desdeB.tipo !== "respuesta" || desdeB.valor.ok === false, "sin cartera no hay lote");
});
