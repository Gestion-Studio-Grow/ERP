/**
 * CRM comercial · pantallas (GSG-CRM-011), EJECUTADO contra Postgres con RLS (base efímera local; nada toca Neon).
 *
 * Criterio P3: dos negocios, el interruptor «crm-comercial» prendido en uno y apagado en el otro. En el apagado
 * TODA acción del CRM rechaza sin escribir y la puerta de las páginas da 404; en el prendido, la puerta devuelve
 * la membresía. Además: el usuario de puesto entra por la misma puerta y el servidor le rechaza lo que la
 * pantalla no le muestra; corregir un borrador lleva versión. Datos ficticios (dominios .example).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
type Acc = typeof import("@/lib/crm-comercial/acciones");
interface Fx {
  base: BaseEfimera;
  acc: Acc;
  abrir: () => Promise<unknown>;
  u: { dirA: string; dirB: string; redac: string; ajeno: string };
}

let prep: Promise<Fx> | null = null;
async function preparar(t: import("node:test").TestContext): Promise<Fx | null> {
  const base = await laBase(t);
  if (!base) return null;
  prep ??= (async () => {
    apuntarLaAppA(base);
    prepararAccionesDeServidor();
    const acc = await import("@/lib/crm-comercial/acciones");
    const { requireUser } = await import("@/lib/authz");
    const { abrirCrm } = await import("./comun");
    const u = { dirA: base.a.duenia.id, dirB: base.b.duenia.id, redac: "crm-p-redac", ajeno: "crm-p-ajeno" };
    const c = new pg.Client({ connectionString: base.urlDuenio });
    await c.connect();
    try {
      for (const id of [u.redac, u.ajeno]) {
        await c.query(`INSERT INTO "User" (id, "tenantId", name, email, "passwordHash", role, "updatedAt") VALUES ($1, $2, $3, $4, 'x', 'RECEPTION'::"UserRole", now())`, [id, base.a.id, `Usuario ${id}`, `${id}@crm-p.example`]);
      }
    } finally {
      await c.end();
    }
    const d = await prismaComoDuenio(base);
    await d.miembroCrmComercial.create({ data: { tenantId: base.a.id, userId: u.dirA, rol: "DIRECCION" } });
    await d.miembroCrmComercial.create({ data: { tenantId: base.a.id, userId: u.redac, rol: "PUESTO", puesto: "redactor" } });
    // El negocio B tiene membresía pero el interruptor apagado: la membresía no alcanza.
    await d.miembroCrmComercial.create({ data: { tenantId: base.b.id, userId: u.dirB, rol: "DIRECCION" } });
    const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
    const { CRM_COMERCIAL } = await import("@/cambios/interruptores");
    await d.auditLog.create({ data: filaDeInterruptor({ tenantId: base.a.id, interruptor: CRM_COMERCIAL, accion: "encender", operador: "test" }) });
    return { base, acc, abrir: () => requireUser().then(abrirCrm), u };
  })();
  return prep;
}

function valor<R>(r: { tipo: string }): R {
  if (r.tipo !== "respuesta") assert.fail(`la acción no respondió: ${r.tipo}`);
  return (r as unknown as { valor: R }).valor;
}

test("P3 · interruptor apagado en un negocio: toda acción del CRM rechaza sin escribir y la página da 404; en el prendido, entra", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { base, acc, u } = f;
  const enB = (fn: () => Promise<unknown>) => ejecutarAccion({ negocio: base.b, usuario: { id: u.dirB } }, fn);

  const nombres = Object.keys(acc).filter((k) => typeof (acc as Record<string, unknown>)[k] === "function");
  assert.ok(nombres.length >= 30, `se prueban todas las acciones (${nombres.length})`);
  for (const k of nombres) {
    const fn = (acc as unknown as Record<string, (...a: unknown[]) => Promise<{ ok: boolean; motivo?: string }>>)[k];
    const r = valor<{ ok: boolean; motivo?: string }>(await enB(() => fn("id-ficticio", { tipo: "CONSULTA", nombre: "Demo", cuerpo: "x", canal: "MAIL", oportunidadId: "x", userId: u.dirB, rol: "DIRECCION", proximoPaso: "x", proximoPasoEl: "2026-11-20" }, {})));
    assert.equal(r.ok, false, `${k} tendría que rechazar con el interruptor apagado`);
    assert.match(r.motivo ?? "", /no está activado/, k);
  }
  const d = await prismaComoDuenio(base);
  assert.equal(await d.oportunidad.count({ where: { tenantId: base.b.id } }), 0);
  assert.equal(await d.actividadComercial.count({ where: { tenantId: base.b.id } }), 0);
  assert.equal(await d.miembroCrmComercial.count({ where: { tenantId: base.b.id } }), 1, "ni la membresía cambia");

  const pagB = await enB(f.abrir);
  assert.equal(pagB.tipo, "no-encontrado", "en el negocio apagado las páginas del CRM no existen");

  const pagA = valor<{ miembro: { rol: string } | null; bloqueo: unknown }>(await ejecutarAccion({ negocio: base.a, usuario: { id: u.dirA } }, f.abrir));
  assert.equal(pagA.miembro?.rol, "DIRECCION");
  assert.equal(pagA.bloqueo, null);
  const hoyA = valor<{ ok: boolean }>(await ejecutarAccion({ negocio: base.a, usuario: { id: u.dirA } }, () => acc.hoy()));
  assert.equal(hoyA.ok, true);

  // Prendido pero sin membresía: la página entra y dice cómo seguir (no es un 404 ni un 500).
  const ajeno = valor<{ miembro: unknown; bloqueo: unknown }>(await ejecutarAccion({ negocio: base.a, usuario: { id: u.ajeno } }, f.abrir));
  assert.equal(ajeno.miembro, null);
  assert.ok(ajeno.bloqueo);
});

test("Mirada del puesto: entra por la misma puerta, ve lo suyo y el servidor le rechaza lo que la pantalla no le muestra; corregir un borrador lleva versión", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { base, acc, u } = f;
  const como = async <R>(userId: string, fn: () => Promise<R>) => valor<R>(await ejecutarAccion({ negocio: base.a, usuario: { id: userId } }, fn));

  const puerta = await como<{ miembro: { rol: string; puesto: string } | null }>(u.redac, f.abrir as () => Promise<{ miembro: { rol: string; puesto: string } | null }>);
  assert.deepEqual([puerta.miembro?.rol, puerta.miembro?.puesto], ["PUESTO", "redactor"]);

  const op = await como(u.dirA, () => acc.proponerOportunidad({ tipo: "CONSULTA", marca: { nombre: "Pantallas Demo SA", dominio: "pantallas.example" }, proximoPaso: "Responder", proximoPasoEl: "2026-11-20" }));
  assert.equal(op.ok, true, JSON.stringify(op));
  const opId = (op as { id: string }).id;
  const b = await como(u.dirA, () => acc.escribirBorrador({ oportunidadId: opId, canal: "WHATSAPP", cuerpo: "Hola, ¿cuándo es el evento?" }));
  assert.equal(b.ok, true, JSON.stringify(b));
  const bId = (b as { id: string }).id;

  // El puesto no ve esa oportunidad (no la creó ni la tiene en curso): ni en la lista ni en sus borradores.
  const lista = await como(u.redac, () => acc.listarOportunidades());
  assert.ok(lista.ok && !lista.filas.some((x) => x.id === opId));
  const susBorradores = await como(u.redac, () => acc.listarBorradores());
  assert.ok(susBorradores.ok && !susBorradores.borradores.some((x) => x.id === bId));
  const cola = await como(u.redac, () => acc.colaDeTrabajo());
  assert.equal(cola.ok, true, JSON.stringify(cola));

  // Lo que la pantalla no le muestra, el servidor lo rechaza igual.
  for (const [que, fn] of [
    ["aprobar", () => acc.aprobarBorrador(bId)],
    ["corregir", () => acc.editarBorrador(bId, { cuerpo: "otro texto" })],
    ["marcar enviado", () => acc.marcarEnviado(bId)],
    ["ver la ficha", () => acc.ficha(opId)],
    ["confirmar destino", () => acc.confirmarDestino(opId, "AGENCIA")],
  ] as const) {
    const r = (await como(u.redac, fn as () => Promise<{ ok: boolean }>)) as { ok: boolean };
    assert.equal(r.ok, false, `el puesto no puede ${que}`);
  }

  // Dirección corrige con la versión leída; con una versión vieja, aviso.
  const vieja = await como(u.dirA, () => acc.editarBorrador(bId, { cuerpo: "Texto corregido", version: 99 }));
  assert.equal(vieja.ok, false);
  const ed = await como(u.dirA, () => acc.editarBorrador(bId, { cuerpo: "Hola, ¿para qué fecha es el evento?", version: 0 }));
  assert.equal(ed.ok, true, JSON.stringify(ed));
  const ap = await como(u.dirA, () => acc.aprobarBorrador(bId, 1));
  assert.equal(ap.ok, true, JSON.stringify(ap));
  const tarde = await como(u.dirA, () => acc.editarBorrador(bId, { cuerpo: "Ya aprobado", version: 2 }));
  assert.equal(tarde.ok, false, "aprobado ya no se corrige");
  const fi = await como(u.dirA, () => acc.ficha(opId));
  assert.ok(fi.ok && fi.actividades.some((a) => a.tipo === "BORRADOR_EDITADO"), "la corrección queda en la línea de tiempo");
  const det = await como(u.dirA, () => acc.detalleDeFicha(opId));
  assert.equal(det.ok, true, JSON.stringify(det));
  const personas = await como(u.dirA, () => acc.personasDelCrm());
  assert.ok(personas.ok && personas.personas.some((p) => p.userId === u.redac && p.puesto === "redactor"));
});
