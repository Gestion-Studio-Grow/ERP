// GSG-MIA-236 · «2A» por otra puerta (D1 de GSG-PR214-v7): las cuotas de PAGO al proveedor que salen de un adicional las
// fija sólo quien ve la plata (`veLaPlata`). Postgres real, la app como `app_rls` (sin BYPASSRLS), Server Actions reales.
//
// `agregarLineaAdicional` guarda el costo y el anticipo % de la línea; al aprobarse el adicional, `cuotasDeAdicionales`
// (presupuesto-core.ts) arma con eso las cuotas de PAGO. Comercial y Producción editan cotizaciones pero no ven la plata:
//  · con costo o anticipo → rechazo claro y 0 filas nuevas (ni línea, ni historial, ni la aprobación interna borrada);
//  · sin costo ni anticipo → la línea entra (el precio al cliente es cotización), con costo 0 y anticipo vacío;
//  · Dirección sí carga costo y anticipo, y al aprobarse el adicional sólo esa línea da cuotas de PAGO (a mano:
//    2 × $ 300 = $ 600; 30 % → $ 180 de anticipo y $ 420 de saldo).

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { RUBROS } from "./gestion-core";

const DIA = 86_400_000;

test("MIA-236 · adicionales: el costo y el anticipo al proveedor sólo los carga quien ve la plata", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const acc = await import("./acciones-presupuesto");

  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  type R = { ok: boolean; error?: string };
  const como = async (quien: "duenia" | "recepcion", fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: a[quien].id } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  type Tx = Parameters<Parameters<typeof duenio.$transaction>[0]>[0];
  const enA = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
      return fn(tx);
    });

  const proveedor = (await duenio.supplier.create({ data: { tenantId: a.id, name: "Proveedor MIA-236" }, select: { id: true } })).id;
  await duenio.proyectoProveedorFicha.create({ data: { tenantId: a.id, supplierId: proveedor, anticipoPct: 50 } });
  const p = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 23601, clientId: a.clientes[0], nombre: "Proyecto MIA-236", servicio: "EVENTOS", etapa: "APROBADO", fechaEvento: new Date(Date.now() + 90 * DIA), anticipoClientePct: 50 }, select: { id: true } });
  await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-mia236-${p.id}-xxxxxxxxxx`, ivaPct: 21, enviadoEl: new Date(), aprobadoInternoEl: new Date(), aprobadoInternoPor: "Dirección" } });
  // La recepcionista con ficha, en el equipo: lo que la frena tiene que ser la plata, no la visibilidad.
  const persona = await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: "Recepción MIA-236", rol: "COMERCIAL" }, select: { id: true } });
  await duenio.proyectoEquipo.create({ data: { tenantId: a.id, proyectoId: p.id, personaId: persona.id } });
  const conRol = (rol: string) => duenio.proyectoPersona.update({ where: { id: persona.id }, data: { rol } });

  assert.equal((await como("duenia", () => acc.crearAdicional(form({ proyectoId: p.id, nombre: "Pantalla extra" })))).ok, true);
  const ad = await enA((tx) => tx.proyectoAdicional.findFirstOrThrow({ where: { tenantId: a.id, proyectoId: p.id }, select: { id: true } }));
  const linea = { adicionalId: ad.id, sector: "Producción", categoria: RUBROS[0], supplierId: proveedor, cantidad: "2" };
  // Una línea de Dirección, aprobada por dentro: si un rechazo escribiera algo, la aprobación interna se borraría.
  assert.equal((await como("duenia", () => acc.agregarLineaAdicional(form({ ...linea, detalle: "Pantalla LED", costo: "300", precio: "500", anticipoPct: "30" })))).ok, true);
  assert.equal((await como("duenia", () => acc.aprobarAdicionalInterno(form({ adicionalId: ad.id })))).ok, true);

  const foto = () =>
    enA(async (tx) => ({
      lineas: await tx.proyectoAdicionalLinea.count({ where: { tenantId: a.id, adicionalId: ad.id } }),
      historial: await tx.proyectoCambio.count({ where: { tenantId: a.id, entidad: "ProyectoAdicional", entidadId: ad.id } }),
      aprobado: (await tx.proyectoAdicional.findUniqueOrThrow({ where: { id: ad.id }, select: { aprobadoInternoEl: true } })).aprobadoInternoEl?.toISOString() ?? null,
    }));

  for (const rol of ["COMERCIAL", "PRODUCCION"]) {
    await conRol(rol);
    for (const plata of [{ costo: "250", anticipoPct: "90" }, { costo: "250" }, { anticipoPct: "90" }]) {
      const antes = await foto();
      const r = await como("recepcion", () => acc.agregarLineaAdicional(form({ ...linea, detalle: `Línea de ${rol}`, precio: "400", ...plata })));
      assert.equal(r.ok, false, `${rol} con ${JSON.stringify(plata)}: no pasa (${JSON.stringify(r)})`);
      assert.match(r.error ?? "", /no ve la plata/, `${rol}: el rechazo dice por qué`);
      assert.deepEqual(await foto(), antes, `${rol} con ${JSON.stringify(plata)}: no se guarda nada`);
    }
  }

  // Sin costo ni anticipo, Comercial sí carga la línea (el precio al cliente es cotización): costo 0, anticipo vacío.
  await conRol("COMERCIAL");
  const sinPlata = await como("recepcion", () => acc.agregarLineaAdicional(form({ ...linea, detalle: "Operador extra", precio: "400" })));
  assert.equal(sinPlata.ok, true, JSON.stringify(sinPlata));
  const deComercial = await enA((tx) => tx.proyectoAdicionalLinea.findFirstOrThrow({ where: { tenantId: a.id, adicionalId: ad.id, detalle: "Operador extra" }, select: { costoCentavos: true, anticipoPct: true } }));
  assert.deepEqual([deComercial.costoCentavos, deComercial.anticipoPct], [0n, null]);

  // Aprobado por el cliente: sólo la línea de Dirección da cuotas de PAGO ($ 600 al 30 %).
  assert.equal((await como("duenia", () => acc.aprobarAdicionalInterno(form({ adicionalId: ad.id })))).ok, true);
  assert.equal((await como("duenia", () => acc.enviarAdicional(form({ adicionalId: ad.id })))).ok, true);
  assert.equal((await como("duenia", () => acc.responderAdicional(form({ adicionalId: ad.id, respuesta: "APROBADO", nombre: "Cliente por teléfono" })))).ok, true);
  const pagos = await duenio.proyectoCuota.findMany({ where: { tenantId: a.id, proyectoId: p.id, tipo: "PAGO", anuladoEl: null, clave: { contains: ":adic:" } }, select: { monto: true } });
  assert.deepEqual(pagos.map((c) => c.monto).sort((x, y) => x - y), [180, 420], "PAGO: 30 % de 2 × $ 300, y nada de la línea de Comercial");
});
