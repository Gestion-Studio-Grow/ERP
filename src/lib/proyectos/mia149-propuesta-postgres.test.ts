// MIA T07 (GSG-MIA-149) · C-O17: la propuesta pública de un negocio que cotiza por total. Postgres real, la app como `app_rls`.
// Se pide la propuesta como la pide el link (sin sesión, por el host del negocio) y se busca en TODO lo que sale del servidor
// los precios y costos sembrados: 0 apariciones; el total es el del tablero y, aprobada, el congelado de la foto.
// En el negocio B, modo «con precio por ítem»: hay precios y nunca costos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";
import { RUBROS } from "./gestion-core";

const DIA = 86_400_000;
// Números que no pueden aparecer por casualidad: el costo y el precio de cada ítem, en pesos.
const COSTO_VISIBLE = 77_713;
const PRECIO_VISIBLE = 91_357;
const COSTO_OCULTO = 55_517;
const PRECIO_OCULTO = 66_619;
const TOTAL = 314_159;
const SEMBRADOS = [COSTO_VISIBLE, PRECIO_VISIBLE, COSTO_OCULTO, PRECIO_OCULTO, PRECIO_VISIBLE + PRECIO_OCULTO];
const aparece = (cuerpo: string, n: number) => [String(n), n.toLocaleString("es-AR")].some((x) => cuerpo.includes(x));

test("C-O17 · la propuesta por total no trae precio por ítem, costo ni proveedor, y muestra el total congelado", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  const { propuestaPublica } = await import("./datos.server");
  const { papelDeLaPropuesta } = await import("./ficha.server");
  const publica = await import("./acciones");
  type Tx = Parameters<Parameters<typeof duenio.$transaction>[0]>[0];
  const en = <T>(n: NegocioDePrueba, fn: (tx: Tx) => Promise<T>): Promise<T> =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${n.id}, true)`;
      return fn(tx);
    });

  const sembrar = async (n: NegocioDePrueba, numero: number) => {
    const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: n.id }, select: { modules: true } });
    await duenio.tenant.update({ where: { id: n.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
    const s = await duenio.supplier.create({ data: { tenantId: n.id, name: "Proveedor Secreto Uno" }, select: { id: true } });
    const p = await duenio.proyecto.create({ data: { tenantId: n.id, numero, clientId: n.clientes[0], nombre: "Propuesta por total", servicio: "EVENTOS", etapa: "COTIZACION", fechaEvento: new Date(Date.now() + 60 * DIA) }, select: { id: true } });
    const token = `tok-t07-o17-${numero}-${p.id}`;
    const v = await duenio.proyectoPresupuesto.create({ data: { tenantId: n.id, proyectoId: p.id, version: 1, estado: "ENVIADO", token, ivaPct: 21, enviadoEl: new Date() }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: n.id, presupuestoId: v.id, rubro: RUBROS[0], descripcion: "Escenario", cantidad: 1, costo: COSTO_VISIBLE, precio: PRECIO_VISIBLE, supplierId: s.id, proveedor: "Proveedor Secreto Uno" } });
    await duenio.proyectoItem.create({ data: { tenantId: n.id, presupuestoId: v.id, rubro: RUBROS[0], descripcion: "Traslados", cantidad: 1, costo: COSTO_OCULTO, precio: PRECIO_OCULTO, visibleCliente: false } });
    await en(n, (tx) => tx.proyectoPrecio.create({ data: { tenantId: n.id, proyectoId: p.id, totalVentaCentavos: BigInt(TOTAL * 100), actualizadoPor: "Dirección" } }));
    return { p, v, token };
  };
  const pedir = async (n: NegocioDePrueba, token: string) => {
    const r = await ejecutarAccion({ negocio: n }, () => propuestaPublica(token));
    assert.equal(r.tipo, "respuesta");
    return (r as { valor: Awaited<ReturnType<typeof propuestaPublica>> }).valor!;
  };
  const papel = async (n: NegocioDePrueba, token: string) => {
    const r = await ejecutarAccion({ negocio: n }, () => papelDeLaPropuesta(token));
    return (r as { valor: Awaited<ReturnType<typeof papelDeLaPropuesta>> }).valor!;
  };

  // ── Negocio A: el modo del rubro (sin precio por ítem, más IVA) ──
  const za = await sembrar(a, 9171);
  const pa = await pedir(a, za.token);
  const cuerpo = JSON.stringify(pa);
  for (const n of SEMBRADOS) assert.equal(aparece(cuerpo, n), false, `el ${n} sembrado no sale del servidor`);
  assert.doesNotMatch(cuerpo, /costo|supplier|proveedor|Proveedor Secreto|margen/i, "ni costo, ni margen, ni proveedor");
  assert.deepEqual(pa.presupuesto.items.map((i) => [i.descripcion, i.precio]), [["Escenario", null]], "el ítem oculto no se nombra; el visible va sin precio");
  assert.deepEqual(pa.totales, { neto: TOTAL, iva: 65_973.39, total: 380_132.39 });
  assert.deepEqual(pa.porTotal, { conIva: false, sinPrecioPorItem: true });
  const pdfA = await papel(a, za.token);
  const cuerpoPdf = JSON.stringify(pdfA.grupos);
  for (const n of SEMBRADOS) assert.equal(aparece(cuerpoPdf, n), false, `el PDF tampoco lleva ${n}`);
  assert.deepEqual([pdfA.neto, pdfA.total, pdfA.porTotal], [TOTAL, 380_132.39, { conIva: false }]);

  // Aprobada por el link: el total queda congelado en la foto; mover el tablero después no lo cambia.
  const r = await ejecutarAccion({ negocio: a }, () => publica.responderPropuesta({ token: za.token, aprueba: true, nombre: "Cliente O17" }));
  assert.deepEqual((r as { valor: unknown }).valor, { ok: true });
  await en(a, (tx) => tx.proyectoPrecio.update({ where: { proyectoId: za.p.id }, data: { totalVentaCentavos: BigInt(999_999 * 100) } }));
  assert.equal((await pedir(a, za.token)).totales.neto, TOTAL, "el total es el congelado");

  // IVA incluido: el total que se muestra es con IVA.
  await en(a, (tx) => tx.proyectoParametro.create({ data: { tenantId: a.id, clave: "precio.propuesta.iva", valor: "CON_IVA", provisional: true, actualizadoPor: a.duenia.id, actualizadoNombre: "Dirección" } }));
  assert.deepEqual((await pedir(a, za.token)).porTotal, { conIva: true, sinPrecioPorItem: true });

  // ── Negocio B: modo «con precio por ítem»: hay precios y nunca costos ──
  await en(b, (tx) => tx.proyectoParametro.create({ data: { tenantId: b.id, clave: "precio.propuesta.detalle", valor: "PRECIO_POR_ITEM", provisional: false, actualizadoPor: b.duenia.id, actualizadoNombre: "Dirección" } }));
  const zb = await sembrar(b, 9172);
  const pb = await pedir(b, zb.token);
  const cuerpoB = JSON.stringify(pb);
  assert.equal(aparece(cuerpoB, PRECIO_VISIBLE), true, "con precio por ítem, el precio sale");
  for (const n of [COSTO_VISIBLE, COSTO_OCULTO]) assert.equal(aparece(cuerpoB, n), false, `el costo ${n} nunca sale`);
  assert.doesNotMatch(cuerpoB, /costo|supplier|Proveedor Secreto/i);
  assert.deepEqual(pb.presupuesto.items.map((i) => [i.descripcion, i.precio]), [["Escenario", PRECIO_VISIBLE], ["Otros conceptos", PRECIO_OCULTO]]);
  assert.equal(pb.totales.neto, TOTAL);

  // R5: el token de A pedido desde el host de B no existe.
  const cruzado = await ejecutarAccion({ negocio: b }, () => propuestaPublica(za.token));
  assert.equal((cruzado as { valor: unknown }).valor, null);
});
