// ============================================================================
// PAQUETE Y RECIBIDOS DEL CLIENTE — quién llega, contra Postgres (UAT 16/10, punto 11)
// ============================================================================
//
// Base efímera (src/test/base-efimera.ts). A es el estudio contable (módulo `cartera`), B es su
// cliente. Se llaman las RUTAS reales (`/contador/paquete` y `/contador/cliente/[id]/recibidos/csv`)
// y la guardia de la pantalla de recibidos (`accesoAClienteDeCartera`) con la sesión de la dueña, y
// se mide en la base:
//   · un estudio que NO tiene al cliente en su cartera no baja su paquete ni sus recibidos, y la
//     respuesta es IDÉNTICA a la de un cliente que no existe (no puede inferir que existe);
//   · un negocio con `cartera` y `multilocal` a la vez no abre ninguna de las dos pantallas
//     (`decidirAcceso`, la misma regla que el resto del panel), aunque el cliente sea suyo;
//   · ninguna de esas negativas deja una descarga escrita en la auditoría del cliente;
//   · con todo en regla, sí baja el paquete y queda la descarga en la auditoría de B.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const MES = "2026-08";

test("paquete y recibidos: sólo el estudio que tiene al cliente en su cartera y pasa decidirAcceso; nadie más infiere que existe", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const antes = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "secreto-de-auth-qa";
  t.after(() => {
    if (antes === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = antes;
  });
  prepararAccionesDeServidor();

  const { operatorPrisma } = await import("@/lib/operator-db");
  const paquete = await import("@/app/contador/paquete/route");
  const csv = await import("@/app/contador/cliente/[clienteId]/recibidos/csv/route");
  const { accesoAClienteDeCartera } = await import("./recibidos-db");
  const { ACCION_PAQUETE } = await import("@/lib/cierre-mes/cierre-mes");
  base.alBorrar(() => operatorPrisma.$disconnect());
  const duenio = await prismaComoDuenio(base);

  await duenio.tenant.update({ where: { id: base.a.id }, data: { modules: ["cartera", "clients", "reports"] } });
  await duenio.tenant.update({ where: { id: base.b.id }, data: { arcaCuit: "30700000067" } });

  const descargasEnB = () => duenio.auditLog.count({ where: { tenantId: base.b.id, action: ACCION_PAQUETE } });
  type Negocio = typeof base.a;
  const como = <T>(n: Negocio, fn: () => Promise<T>) => ejecutarAccion({ negocio: n, usuario: n.duenia }, fn);
  /** La respuesta de una ruta, reducida a lo que ve quien la pide: estado, tipo y cuerpo. */
  const visto = async (n: Negocio, fn: () => Promise<Response>) => {
    const r = await como(n, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    const res = (r as { valor: Response }).valor;
    return { status: res.status, tipo: res.headers.get("content-type"), cuerpo: await res.text() };
  };
  const pedirPaquete = (n: Negocio, cliente: string) =>
    visto(n, () => paquete.GET(new Request(`https://${n.host}/contador/paquete?cliente=${encodeURIComponent(cliente)}&mes=${MES}`)));
  const pedirCsv = (n: Negocio, cliente: string) =>
    visto(n, () =>
      csv.GET(new Request(`https://${n.host}/contador/cliente/${encodeURIComponent(cliente)}/recibidos/csv?mes=${MES}`), {
        params: Promise.resolve({ clienteId: cliente }),
      }),
    );
  const pantalla = async (n: Negocio, cliente: string) => {
    const r = await como(n, () => accesoAClienteDeCartera(cliente, false));
    assert.equal(r.tipo, "respuesta");
    return (r as { valor: Awaited<ReturnType<typeof accesoAClienteDeCartera>> }).valor;
  };

  // ── 1) B todavía no es de la cartera de A: igual que un cliente inexistente ──
  const paqueteAjeno = await pedirPaquete(base.a, base.b.id);
  const paqueteInexistente = await pedirPaquete(base.a, "no-existe-123");
  assert.equal(paqueteAjeno.status, 404);
  assert.deepEqual(paqueteAjeno, paqueteInexistente, "el paquete de un ajeno no se distingue del de uno que no existe");
  const csvAjeno = await pedirCsv(base.a, base.b.id);
  assert.equal(csvAjeno.status, 404);
  assert.deepEqual(csvAjeno, await pedirCsv(base.a, "no-existe-123"), "el archivo de recibidos tampoco");
  const pantallaAjena = await pantalla(base.a, base.b.id);
  assert.deepEqual(pantallaAjena, { ok: false, error: "Ese cliente no está en tu cartera." });
  assert.deepEqual(pantallaAjena, await pantalla(base.a, "no-existe-123"), "ni la pantalla de recibidos");
  assert.equal(await descargasEnB(), 0, "ninguna descarga escrita en B");

  // ── 2) Otro estudio (B, con cartera propia y sin A): no llega a los datos de A ──
  await duenio.tenant.update({ where: { id: base.b.id }, data: { modules: ["cartera", "clients"] } });
  const desdeB = await pedirPaquete(base.b, base.a.id);
  assert.deepEqual(desdeB, await pedirPaquete(base.b, "no-existe-123"));
  assert.deepEqual(await pedirCsv(base.b, base.a.id), await pedirCsv(base.b, "no-existe-123"));
  assert.deepEqual(await pantalla(base.b, base.a.id), await pantalla(base.b, "no-existe-123"));
  assert.equal(await duenio.auditLog.count({ where: { tenantId: base.a.id, action: ACCION_PAQUETE } }), 0);
  await duenio.tenant.update({ where: { id: base.b.id }, data: { modules: [] } });

  // ── 3) B entra a la cartera de A, pero A tiene también `multilocal`: decidirAcceso lo niega ──
  await duenio.carteraCliente.create({ data: { tenantId: base.a.id, clienteTenantId: base.b.id, alias: "Almacén de B" } });
  await duenio.tenant.update({ where: { id: base.a.id }, data: { modules: ["cartera", "multilocal", "clients"] } });
  const conLosDos = await pedirPaquete(base.a, base.b.id);
  assert.equal(conLosDos.status, 403, "el paquete no se baja con los dos paneles");
  assert.match(conLosDos.cuerpo, /no pueden convivir/);
  assert.deepEqual(conLosDos, await pedirPaquete(base.a, "no-existe-123"), "la negativa no depende del cliente pedido");
  const csvConLosDos = await pedirCsv(base.a, base.b.id);
  assert.equal(csvConLosDos.status, 404);
  assert.match(csvConLosDos.cuerpo, /no pueden convivir/);
  const pantallaConLosDos = await pantalla(base.a, base.b.id);
  assert.equal(pantallaConLosDos.ok, false);
  assert.match(!pantallaConLosDos.ok ? pantallaConLosDos.error : "", /no pueden convivir/);
  assert.equal(await descargasEnB(), 0, "ninguna descarga escrita en B");

  // ── 4) Todo en regla: el paquete baja y la descarga queda en la auditoría de B ──
  await duenio.tenant.update({ where: { id: base.a.id }, data: { modules: ["cartera", "clients", "reports"] } });
  const bueno = await pedirPaquete(base.a, base.b.id);
  assert.equal(bueno.status, 200, bueno.cuerpo.slice(0, 300));
  assert.match(bueno.tipo ?? "", /text\/csv/);
  assert.equal(await descargasEnB(), 1, "la descarga queda escrita en el cliente");
  const csvBueno = await pedirCsv(base.a, base.b.id);
  assert.equal(csvBueno.status, 200, csvBueno.cuerpo.slice(0, 300));
  const pantallaBuena = await pantalla(base.a, base.b.id);
  assert.equal(pantallaBuena.ok, true);
});
