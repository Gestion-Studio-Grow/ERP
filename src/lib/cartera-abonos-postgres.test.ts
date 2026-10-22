// ============================================================================
// ABONOS Y LOTE DEL MES — contra Postgres (base efímera, rol app_rls con RLS)
// ============================================================================
//
// El negocio A es el estudio (módulo `cartera`), el B es su cliente (monotributista, CUIT y punto
// de venta cargados, en homologación). Se corren las actions TAL CUAL, con la sesión de la dueña
// de A, y se mide en la base:
//   · la regla se guarda en la auditoría de A; una regla para un negocio fuera de la cartera no;
//   · dos «Emitir el lote» simultáneos dejan UNA factura en B (Factura C, servicio, período del
//     mes) y una sola anotación de emisión; repetir no emite otra;
//   · si ARCA la rechaza, el lote la ofrece de nuevo y emite otra; la baja la saca del lote;
//   · B (sin cartera) no puede usar nada de esto.
// CUITs ficticios con dígito verificador válido. Sin ARCA: la facturación queda apagada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const CUIT_CLIENTE = "27222222228";
const CUIT_RECEPTOR = "20111111112";

test("abonos: la regla se guarda en el estudio, el lote emite UNA vez por regla y mes, y el rechazo se vuelve a emitir", async (t) => {
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
  const { prepararLoteDelEstudio, ACCION_ABONO_EMITIDO, ACCION_REGLA_GUARDADA } = await import("@/lib/cartera-abonos");
  const { mesDelNegocio } = await import("@/lib/libros/fecha-fiscal");
  const duenio = await prismaComoDuenio(base);

  await duenio.tenant.update({ where: { id: base.a.id }, data: { modules: ["cartera", "clients", "reports"] } });
  await duenio.tenant.update({
    where: { id: base.b.id },
    data: { arcaCuit: CUIT_CLIENTE, arcaPuntoVenta: 3, arcaCondicionIva: "MONOTRIBUTO", arcaHomologacion: true },
  });
  await duenio.carteraCliente.create({ data: { tenantId: base.a.id, clienteTenantId: base.b.id, alias: "Kiosco de Marta", estado: "activa" } });

  const comoEstudio = <T>(fn: () => Promise<T>) => ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, fn);
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

  // ── 1) Guardar la regla; fuera de la cartera, no ──
  const guardada = await comoEstudio(() => acciones.guardarReglaAction(null, form({})));
  assert.equal(guardada.tipo, "respuesta");
  assert.equal(guardada.tipo === "respuesta" && guardada.valor.ok, true);
  const ajena = await comoEstudio(() => acciones.guardarReglaAction(null, form({ clienteTenantId: base.a.id })));
  assert.deepEqual(ajena.tipo === "respuesta" && ajena.valor, { ok: false, error: "Ese cliente no está en tu cartera.", campo: "clienteTenantId" });
  assert.equal(await duenio.auditLog.count({ where: { tenantId: base.a.id, action: ACCION_REGLA_GUARDADA } }), 1);
  assert.equal(await duenio.auditLog.count({ where: { tenantId: base.b.id, action: ACCION_REGLA_GUARDADA } }), 0, "la regla vive en el estudio");

  const lote0 = await prepararLoteDelEstudio(base.a.id, mes);
  assert.deepEqual(lote0.renglones.map((r) => r.estado), ["para_emitir"]);

  // ── 2) Dos «Emitir el lote» a la vez: UNA factura ──
  const [e1, e2] = await Promise.all([comoEstudio(() => acciones.emitirLoteAction(mes)), comoEstudio(() => acciones.emitirLoteAction(mes))]);
  const emitidas = [e1, e2].map((e) => (e.tipo === "respuesta" && e.valor.ok ? e.valor.resultado.emitidas : -1));
  assert.deepEqual(emitidas.sort(), [0, 1], `uno emite, el otro ve la emisión y no repite: ${JSON.stringify([e1, e2])}`);
  const facturas = await duenio.invoice.findMany({ where: { tenantId: base.b.id } });
  assert.equal(facturas.length, 1);
  const f = facturas[0];
  assert.equal(f.status, "PENDING");
  assert.equal(f.concepto, 2);
  assert.equal(f.docTipo, 80);
  assert.equal(f.docNro, CUIT_RECEPTOR);
  assert.equal(f.puntoVenta, 3);
  assert.equal(Number(f.total), 150000.5);
  assert.equal(await duenio.invoice.count({ where: { tenantId: base.a.id } }), 0, "nada se factura en el estudio");
  assert.equal(await duenio.auditLog.count({ where: { tenantId: base.b.id, action: ACCION_ABONO_EMITIDO } }), 1);
  assert.equal(await duenio.outboxEvent.count({ where: { tenantId: base.b.id, processedAt: null } }), 1, "queda encolada para ARCA");

  const otraVez = await comoEstudio(() => acciones.emitirLoteAction(mes));
  assert.equal(otraVez.tipo === "respuesta" && otraVez.valor.ok && otraVez.valor.resultado.emitidas, 0);
  assert.deepEqual((await prepararLoteDelEstudio(base.a.id, mes)).renglones.map((r) => r.estado), ["ya_emitida"]);

  // ── 3) ARCA la rechaza: se vuelve a emitir ──
  await duenio.invoice.update({ where: { id: f.id }, data: { status: "REJECTED", rechazoMotivo: "10015: El campo DocNro es inválido" } });
  await duenio.outboxEvent.updateMany({ where: { tenantId: base.b.id }, data: { processedAt: new Date() } });
  assert.deepEqual((await prepararLoteDelEstudio(base.a.id, mes)).renglones.map((r) => r.estado), ["reemitir"]);
  const reemision = await comoEstudio(() => acciones.emitirLoteAction(mes));
  assert.equal(reemision.tipo === "respuesta" && reemision.valor.ok && reemision.valor.resultado.emitidas, 1);
  assert.equal(await duenio.invoice.count({ where: { tenantId: base.b.id, status: "PENDING" } }), 1);

  // ── 4) Baja: sale del lote ──
  const regla = lote0.renglones[0].regla;
  const baja = await comoEstudio(() => acciones.bajaReglaAction(regla.id));
  assert.deepEqual(baja.tipo === "respuesta" && baja.valor, { ok: true });
  assert.equal((await prepararLoteDelEstudio(base.a.id, mes)).renglones.length, 0);

  // ── 5) B no es estudio ──
  const desdeB = await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () => acciones.emitirLoteAction(mes));
  assert.ok(desdeB.tipo !== "respuesta" || desdeB.valor.ok === false, "sin cartera no hay lote");
});
