// Oráculo de teléfono (certificación v3, ALTA): sin `clients:contact`, ningún buscador reconstruye el
// número de a un tramo. EJECUTADO contra Postgres con RLS: las Server Actions / loaders reales con la
// sesión de la recepción (casilla 5 apagada) y con la de la dueña (la ve).
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
// Tramos del medio y del principio; «1234» (aun como «1-234») son los últimos 4 y sí valen.
const TRAMOS = ["5555-12", "555512", "11555", "5555", "234", "51234"];

type Sembrado = { base: BaseEfimera; valeria: string };
let sembrado: Sembrado | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Sembrado | null> {
  if (sembrado) return sembrado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  await duenio.userPermissionOverride.create({ data: { tenantId: base.a.id, userId: base.a.recepcion.id, capability: "clients:contact", allowed: false } });
  const v = await duenio.client.create({ data: { tenantId: base.a.id, name: "Valeria Ríos", phone: "11 5555-1234", email: "valeria@mail.com" } });
  await duenio.client.create({ data: { tenantId: base.a.id, name: "Otra", phone: "11 4444-9876" } });
  await duenio.$disconnect();
  sembrado = { base, valeria: v.id };
  return sembrado;
}

test("lista de clientes (getPaginaDeClientes): la recepción sin casilla 5 no encuentra por tramo; sí por los últimos 4 y por nombre", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { getPaginaDeClientes } = await import("@/lib/actions");
  const recepcion = { negocio: s.base.a, usuario: s.base.a.recepcion };
  const buscar = async (q: string) => {
    const r = await ejecutarAccion(recepcion, () => getPaginaDeClientes({ q, pagina: 1, rubro: "servicios" }));
    assert.equal(r.tipo, "respuesta");
    return r.tipo === "respuesta" ? r.valor.filas : [];
  };
  for (const q of TRAMOS) {
    const filas = await buscar(q);
    assert.equal(filas.some((f) => f.id === s.valeria), false, `oráculo abierto con «${q}»`);
  }
  const porCuatro = await buscar("1234");
  assert.ok(porCuatro.some((f) => f.id === s.valeria), "los últimos 4 completos sí la encuentran");
  assert.ok(porCuatro.every((f) => !/5555/.test(f.phone)), "el teléfono sale enmascarado");
  assert.ok((await buscar("valeria")).some((f) => f.id === s.valeria), "por nombre siempre");

  // La dueña (con la casilla) busca como siempre: por un tramo del medio, y ve el número entero.
  const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.duenia }, () => getPaginaDeClientes({ q: "5555-12", pagina: 1, rubro: "servicios" }));
  assert.equal(r.tipo, "respuesta");
  if (r.tipo === "respuesta") assert.ok(r.valor.filas.some((f) => f.id === s.valeria && f.phone === "11 5555-1234"));
});

test("clientes con proyectos: sin casilla 5 tampoco por tramo ni por mail, y el contacto sale enmascarado", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { clientesConProyectos } = await import("@/lib/proyectos/datos.server");
  const recepcion = { negocio: s.base.a, usuario: s.base.a.recepcion };
  for (const q of [...TRAMOS, "valeria@mail", "mail.com"]) {
    const r = await ejecutarAccion(recepcion, () => clientesConProyectos(q));
    assert.equal(r.tipo, "respuesta");
    if (r.tipo === "respuesta") assert.equal(r.valor.some((c) => c.id === s.valeria), false, `oráculo abierto con «${q}»`);
  }
  const r = await ejecutarAccion(recepcion, () => clientesConProyectos("1234"));
  assert.equal(r.tipo, "respuesta");
  if (r.tipo === "respuesta") {
    const v = r.valor.find((c) => c.id === s.valeria);
    assert.ok(v, "los últimos 4 la encuentran");
    assert.equal(v?.phone, "•••• 1234");
    assert.equal(v?.email, "v…@…");
  }
  // Con la casilla, por mail como siempre.
  const d = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.duenia }, () => clientesConProyectos("valeria@mail"));
  assert.equal(d.tipo, "respuesta");
  if (d.tipo === "respuesta") assert.ok(d.valor.some((c) => c.id === s.valeria && c.email === "valeria@mail.com"));
});
