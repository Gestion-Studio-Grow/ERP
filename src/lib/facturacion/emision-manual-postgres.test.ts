// ============================================================================
// EMISIÓN MANUAL · el motor común desde el panel y desde la consola del contador, contra una base
// efímera con RLS y ARCA simulado (stub). Cada caso mira la fila que quedó, no sólo la respuesta.
//
//  · Panel: sin la facturación electrónica asignada, no emite; con ella, un negocio que NO es
//    Factoque no tiene el tope de 5 (sale la 6.ª), la letra la decide el Core (inscripto → A a un
//    inscripto) y el doble toque con la misma clave devuelve la MISMA factura.
//  · Contador: emite en el negocio DEL CLIENTE (no en el del estudio), queda registrado en el
//    estudio, y un negocio que no es de su cartera no se toca.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const CUIT_EMISOR = "20111111112";
const CUIT_EMPRESA = "30111111118"; // verificador válido, inventado

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  const antes = { arca: env.ARCA_INVOICING_ENABLED, modo: env.ARCA_MODO, auth: env.AUTH_SECRET };
  Object.assign(env, { ARCA_INVOICING_ENABLED: "true", AUTH_SECRET: "secreto-de-auth-qa" });
  delete env.ARCA_MODO; // stub: nada sale a la red
  t.after(() => {
    for (const [k, v] of [["ARCA_INVOICING_ENABLED", antes.arca], ["ARCA_MODO", antes.modo], ["AUTH_SECRET", antes.auth]] as const) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
  });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const acciones = await import("@/lib/facturacion/emitir-manual-actions");
  return { base, duenio, acciones };
}

const valor = <T>(r: { tipo: string; valor?: unknown }) => {
  assert.equal(r.tipo, "respuesta", JSON.stringify(r));
  return r.valor as T;
};

test("panel de cualquier negocio: sin módulo no emite; con él, sin tope, letra del Core y doble toque idempotente", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio, acciones } = p;
  const negocio = base.b;
  await duenio.tenant.update({
    where: { id: negocio.id },
    data: { arcaCuit: CUIT_EMISOR, arcaPuntoVenta: 4, arcaHomologacion: true, arcaCondicionIva: "RESPONSABLE_INSCRIPTO", modules: [] },
  });
  const comoNegocio = <T>(fn: () => Promise<T>) => ejecutarAccion({ negocio, usuario: negocio.duenia }, fn);
  const cf = { descripcion: "Torta", total: 12100, concepto: "productos" as const, alicuota: "21" as const };

  const sinModulo = valor<{ ok: boolean; error?: string }>(await comoNegocio(() => acciones.emitirComprobanteManualAction(cf)));
  assert.ok(!sinModulo.ok && /facturación electrónica/.test(sinModulo.error ?? ""));
  assert.equal(await duenio.invoice.count({ where: { tenantId: negocio.id } }), 0);

  await duenio.tenant.update({ where: { id: negocio.id }, data: { modules: ["arca"] } });
  // Seis a consumidor final: el tope de 5 es del plan Factoque, no de este negocio.
  for (let i = 0; i < 6; i++) {
    const r = valor<{ ok: boolean; limite?: unknown }>(await comoNegocio(() => acciones.emitirComprobanteManualAction(cf)));
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.limite, null);
  }
  const b = await duenio.invoice.findFirstOrThrow({ where: { tenantId: negocio.id }, select: { tipoComprobante: true, status: true } });
  assert.equal(b.tipoComprobante, 6, "inscripto → consumidor final: Factura B");
  assert.equal(b.status, "AUTHORIZED");

  // Soporte GSG cargó qué Factura A le asignó ARCA (A común): sin eso, la A va a revisión.
  const { guardarRegimenFacturaAEnTx } = await import("@/lib/fiscal/regimen-factura-a.server");
  const { tenantTransaction } = await import("@/lib/rls");
  await tenantTransaction(
    (tx) => guardarRegimenFacturaAEnTx(tx, { tenantId: negocio.id, regimen: "A", operador: "qa", origen: "ficha" }),
    { tenantId: negocio.id },
  );
  // A un inscripto, con domicilio: Factura A. Dos toques con la misma clave: UNA factura.
  const a = {
    ...cf,
    docTipo: 80 as const,
    docNro: CUIT_EMPRESA,
    condicionReceptor: "RESPONSABLE_INSCRIPTO" as const,
    nombreReceptor: "Distribuidora Sur SA",
    domicilioReceptor: "Av. Siempreviva 742",
    claveEmision: "clave-de-prueba-0001-abcdef",
  };
  const [r1, r2] = await Promise.all([
    comoNegocio(() => acciones.emitirComprobanteManualAction(a)),
    comoNegocio(() => acciones.emitirComprobanteManualAction(a)),
  ]);
  const v1 = valor<{ ok: boolean; invoiceId: string }>(r1);
  const v2 = valor<{ ok: boolean; invoiceId: string }>(r2);
  assert.ok(v1.ok && v2.ok, JSON.stringify([v1, v2]));
  assert.equal(v1.invoiceId, v2.invoiceId);
  const fa = await duenio.invoice.findUniqueOrThrow({ where: { id: v1.invoiceId }, select: { tipoComprobante: true, docNro: true } });
  assert.equal(fa.tipoComprobante, 1, "inscripto → inscripto: Factura A");
  assert.equal(String(fa.docNro), CUIT_EMPRESA);
  assert.equal(await duenio.invoice.count({ where: { tenantId: negocio.id } }), 7);
});

test("consola del contador: emite en el negocio del cliente de SU cartera, y a nadie más", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio, acciones } = p;
  const estudio = base.a;
  const cliente = base.b;
  await duenio.tenant.update({ where: { id: estudio.id }, data: { modules: ["cartera", "clients", "reports"] } });
  await duenio.tenant.update({
    where: { id: cliente.id },
    data: { arcaCuit: CUIT_EMISOR, arcaPuntoVenta: 3, arcaCondicionIva: "MONOTRIBUTO", arcaHomologacion: true },
  });
  const comoEstudio = <T>(fn: () => Promise<T>) => ejecutarAccion({ negocio: estudio, usuario: estudio.duenia }, fn);
  const datos = { descripcion: "Honorarios", total: 50000, concepto: "productos" as const };

  // Todavía no es de su cartera: no se toca.
  const antesDeTodo = await duenio.invoice.count({ where: { tenantId: cliente.id } });
  const fuera = valor<{ ok: boolean; error?: string }>(await comoEstudio(() => acciones.emitirParaClienteAction(cliente.id, datos)));
  assert.ok(!fuera.ok && /no está en tu cartera/.test(fuera.error ?? ""), JSON.stringify(fuera));
  assert.equal(await duenio.invoice.count({ where: { tenantId: cliente.id } }), antesDeTodo);
  const delCliente = () => duenio.invoice.count({ where: { tenantId: cliente.id } });
  const antes = await delCliente();
  assert.equal(await duenio.invoice.count({ where: { tenantId: estudio.id } }), 0);

  await duenio.carteraCliente.create({ data: { tenantId: estudio.id, clienteTenantId: cliente.id, alias: "Kiosco de Marta", estado: "activa" } });
  const r = valor<{ ok: boolean; invoiceId: string }>(await comoEstudio(() => acciones.emitirParaClienteAction(cliente.id, datos)));
  assert.ok(r.ok, JSON.stringify(r));
  const f = await duenio.invoice.findUniqueOrThrow({ where: { id: r.invoiceId }, select: { tenantId: true, tipoComprobante: true, puntoVenta: true } });
  assert.equal(f.tenantId, cliente.id, "la factura es del cliente, no del estudio");
  assert.equal(f.tipoComprobante, 11, "monotributista: Factura C");
  assert.equal(f.puntoVenta, 3);
  const registro = await duenio.auditLog.findFirst({ where: { tenantId: estudio.id, action: "cartera.emitir_a_mano" } });
  assert.ok(registro, "queda registrado en el estudio");

  // El estudio no puede emitir en su propio negocio por esta puerta.
  const propio = valor<{ ok: boolean }>(await comoEstudio(() => acciones.emitirParaClienteAction(estudio.id, datos)));
  assert.ok(!propio.ok);

  // Pausado: se consulta, no se le emite.
  await duenio.carteraCliente.updateMany({ where: { tenantId: estudio.id }, data: { estado: "pausada" } });
  const pausado = valor<{ ok: boolean }>(await comoEstudio(() => acciones.emitirParaClienteAction(cliente.id, datos)));
  assert.ok(!pausado.ok);
  assert.equal(await delCliente(), antes + 1);
  assert.equal(await duenio.invoice.count({ where: { tenantId: estudio.id } }), 0, "nada en el negocio del estudio");
});

test("tope de Factoque: emisiones simultáneas con claves distintas no pasan el último lugar", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const negocio = base.a;
  await duenio.tenant.update({
    where: { id: negocio.id },
    data: { blueprintId: "facturita", arcaCuit: CUIT_EMISOR, arcaPuntoVenta: 5, arcaHomologacion: true, arcaCondicionIva: "MONOTRIBUTO" },
  });
  const { emitirComprobanteManual } = await import("@/lib/facturacion/emision-manual.server");
  const emitir = (i: number) =>
    ejecutarAccion({ negocio, usuario: negocio.duenia }, () =>
      emitirComprobanteManual(
        { tenantId: negocio.id, actor: "user:qa", revalidar: [] },
        { descripcion: `Venta ${i}`, total: 1000, claveEmision: `clave-de-cupo-${String(i).padStart(4, "0")}-abcdef` },
      ),
    );
  for (let i = 0; i < 4; i++) assert.ok(valor<{ ok: boolean }>(await emitir(i)).ok);
  const rs = (await Promise.all([4, 5, 6, 7, 8, 9, 10, 11].map(emitir))).map((r) => valor<{ ok: boolean; error?: string }>(r));
  assert.equal(rs.filter((r) => r.ok).length, 1, JSON.stringify(rs));
  assert.ok(rs.filter((r) => !r.ok).every((r) => /tope/.test(r.error ?? "")));
  assert.equal(await duenio.invoice.count({ where: { tenantId: negocio.id } }), 5);
});
