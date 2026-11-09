// Etapa 2 · T5 — el portal por cliente contra una base migrada, con RLS (app_rls) y sesiones de verdad.
//
// (a) un token de otro negocio no abre nada (el negocio sale del host); (b) sólo los eventos de ESE cliente y sin los
// perdidos; (c) ningún dato fuera de la lista blanca, mirado clave por clave y recursivo; (d) revocar corta el link y dos
// «Generar» a la vez dan un solo link; (e) con el portal apagado la acción niega y la lectura (lo que la página convierte en
// 404) da null; (f) sin la tabla (migración sin aplicar) la lectura da null y la acción niega sin escribir.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { CLAVES_EVENTO_DEL_CLIENTE } from "./portal-cliente-core";

/** Todas las rutas de claves de un valor («eventos[].nombre»); una fecha es una hoja. */
function rutasDe(v: unknown, prefijo = ""): string[] {
  if (v === null || typeof v !== "object" || v instanceof Date) return [];
  if (Array.isArray(v)) return v.flatMap((x) => rutasDe(x, `${prefijo}[]`));
  return Object.entries(v).flatMap(([k, x]) => {
    const ruta = prefijo ? `${prefijo}.${k}` : k;
    return [ruta, ...rutasDe(x, ruta)];
  });
}

const PERMITIDAS = new Set([
  "tenantId",
  "negocio",
  "negocio.nombre",
  "negocio.slug",
  "negocio.whatsapp",
  "cliente",
  "eventos",
  ...CLAVES_EVENTO_DEL_CLIENTE.map((k) => `eventos[].${k}`),
]);

test("Portal por cliente: aislado por negocio, sólo sus eventos, lista blanca, revocar, un link, interruptor y sin tabla", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  const { generarPortalCliente, revocarPortalCliente } = await import("./acciones-ficha");
  const { portalClientePublico } = await import("./gestion-lecturas.server");

  const prender = (tenantId: string, on: boolean) =>
    duenio.tenant.update({ where: { id: tenantId }, data: { modules: on ? { push: "proyectos-portal" } : { set: [] } } });
  await Promise.all([prender(a.id, true), prender(b.id, true)]);

  const [cliente, otroCliente] = a.clientes;
  const proyecto = (datos: { numero: number; clientId: string; nombre: string; etapa?: string; perdidoEl?: Date; tokenPortal?: string; fechaEvento?: Date }) =>
    duenio.proyecto.create({
      data: {
        tenantId: a.id,
        servicio: "EVENTOS",
        etapa: datos.etapa ?? "PEDIDO",
        brief: "NOTA-INTERNA-SECRETA",
        responsable: "RESPONSABLE-INTERNO",
        lugar: "Costa Salguero",
        ciudad: "CABA",
        ...datos,
      },
      select: { id: true },
    });
  const p1 = await proyecto({ numero: 1, clientId: cliente, nombre: "Lanzamiento", etapa: "APROBADO", tokenPortal: "tokenDelProyecto1234567890", fechaEvento: new Date("2026-12-01T12:00:00-03:00") });
  await proyecto({ numero: 2, clientId: cliente, nombre: "Convención", etapa: "PRESUPUESTO" });
  await proyecto({ numero: 3, clientId: cliente, nombre: "Perdido", perdidoEl: new Date() });
  await proyecto({ numero: 4, clientId: otroCliente, nombre: "De otro cliente" });

  const comoDuenia = { negocio: a, usuario: { id: a.duenia.id } };
  const form = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    return fd;
  };
  const accion = async (pedido: typeof comoDuenia, fn: typeof generarPortalCliente, id = p1.id) => {
    const r = await ejecutarAccion(pedido, () => fn(form(id)));
    assert.equal(r.tipo, "respuesta");
    return (r as { valor: Awaited<ReturnType<typeof generarPortalCliente>> }).valor;
  };
  const leer = async (host: { host: string }, token: string) => {
    const r = await ejecutarAccion({ negocio: host }, () => portalClientePublico(token));
    assert.equal(r.tipo, "respuesta");
    return (r as { valor: Awaited<ReturnType<typeof portalClientePublico>> }).valor;
  };
  const filas = () => duenio.portalCliente.findMany({ where: { clientId: cliente } });

  // (d) Dos «Generar» a la vez: un solo link. Generar otra vez con el link vigente: el mismo.
  const [r1, r2] = await Promise.all([accion(comoDuenia, generarPortalCliente), accion(comoDuenia, generarPortalCliente)]);
  assert.deepEqual([r1, r2], [{ ok: true }, { ok: true }]);
  let vigentes = await filas();
  assert.equal(vigentes.length, 1, "dos clics a la vez = un link");
  const token = vigentes[0].token;
  assert.equal(vigentes[0].tenantId, a.id);
  assert.ok(token.length >= 40, "32 bytes al azar");
  assert.deepEqual(await accion(comoDuenia, generarPortalCliente), { ok: true });
  assert.equal((await filas())[0].token, token, "con link vigente, generar no lo cambia");

  // Quien no ve todos los proyectos (Producción, en el equipo) no maneja el link del cliente.
  const persona = await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: "Prod", rol: "PRODUCCION" }, select: { id: true } });
  await duenio.proyectoEquipo.create({ data: { tenantId: a.id, proyectoId: p1.id, personaId: persona.id } });
  assert.equal((await accion({ negocio: a, usuario: { id: a.recepcion.id } }, revocarPortalCliente)).ok, false);
  assert.equal((await filas()).length, 1);

  // (b) + (c) Con el host de A: sólo los eventos del cliente, sin el perdido, y nada fuera de la lista blanca.
  const data = await leer(a, token);
  assert.ok(data);
  assert.equal(data.tenantId, a.id);
  assert.deepEqual(data.eventos.map((e) => e.nombre).sort(), ["Convención", "Lanzamiento"]);
  const fuera = rutasDe(data).filter((r) => !PERMITIDAS.has(r));
  assert.deepEqual(fuera, [], "claves fuera de la lista blanca");
  const json = JSON.stringify(data);
  for (const secreto of ["NOTA-INTERNA-SECRETA", "RESPONSABLE-INTERNO", p1.id, cliente]) assert.equal(json.includes(secreto), false, secreto);
  const lanz = data.eventos.find((e) => e.nombre === "Lanzamiento")!;
  assert.equal(lanz.etapa, "Confirmado");
  assert.equal(lanz.tokenPortal, "tokenDelProyecto1234567890");
  const conv = data.eventos.find((e) => e.nombre === "Convención")!;
  assert.equal(conv.etapa, "En preparación", "la cotización es interna");
  assert.equal(conv.tokenPortal, null, "sin portal del proyecto: sin link");

  // (a) El mismo token con el host de B: nada. Un token inventado o con otra forma: nada.
  assert.equal(await leer(b, token), null);
  assert.equal(await leer(a, "x".repeat(43)), null);
  assert.equal(await leer(a, "../../etc"), null);
  // Y B no ve ni toca la fila de A (RLS + filtro): su acción sobre el proyecto de A no existe.
  assert.equal((await accion({ negocio: b, usuario: { id: b.duenia.id } }, revocarPortalCliente)).ok, false);
  assert.equal((await filas()).length, 1);

  // (e) Portal apagado para A: la lectura da null (la página, 404) y generar niega sin escribir.
  await prender(a.id, false);
  assert.equal(await leer(a, token), null);
  // Revocar sí se puede con el portal apagado (sacar un acceso nunca se bloquea).
  assert.deepEqual(await accion(comoDuenia, revocarPortalCliente), { ok: true });
  assert.equal((await filas()).length, 0);
  const apagado = await accion(comoDuenia, generarPortalCliente);
  assert.equal(apagado.ok, false);
  assert.equal((await filas()).length, 0, "apagado: no escribe");

  // (d) Revocado: el token viejo no abre nada aunque se prenda de nuevo; generar da OTRO token.
  await prender(a.id, true);
  assert.equal(await leer(a, token), null);
  assert.deepEqual(await accion(comoDuenia, generarPortalCliente), { ok: true });
  vigentes = await filas();
  assert.equal(vigentes.length, 1);
  assert.notEqual(vigentes[0].token, token, "regenerado = otro token");
  const tokenNuevo = vigentes[0].token;
  assert.ok(await leer(a, tokenNuevo));

  // (f) Sin la tabla (migración sin aplicar): la lectura da null y la acción niega sin escribir.
  const auditsAntes = await duenio.auditLog.count({ where: { tenantId: a.id, action: { startsWith: "proyecto.portalCliente" } } });
  await duenio.$executeRawUnsafe(`DROP TABLE "PortalCliente"`);
  assert.equal(await leer(a, tokenNuevo), null);
  const sinTabla = await accion(comoDuenia, generarPortalCliente);
  assert.equal(sinTabla.ok, false);
  assert.equal((await accion(comoDuenia, revocarPortalCliente)).ok, false);
  const auditsDespues = await duenio.auditLog.count({ where: { tenantId: a.id, action: { startsWith: "proyecto.portalCliente" } } });
  assert.equal(auditsDespues, auditsAntes, "sin tabla: no se registra nada");
});
