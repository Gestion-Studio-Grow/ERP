/**
 * Interfaz de comandos para operar como un puesto (B6 · GSG-CRM-011 parte 3), EJECUTADO contra Postgres con
 * RLS (base efímera local). Por ahí un puesto no crea contactos, no marca enviado, no aprueba pases ni ve lo que
 * no le pasaron, y cada rechazo queda registrado como en la acción del servidor (lo registra el repo).
 * Sin Postgres local se saltea diciendo por qué (en CI falla).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import type { ClienteDePrueba, LeadDePrueba } from "./carga-prueba";

const laBase = baseEfimeraDelArchivo();
const CARPETA = path.join(process.cwd(), "docs", "tenants", "mia-producciones", "crm-prueba");
const LEADS = (JSON.parse(readFileSync(path.join(CARPETA, "leads.json"), "utf8")) as { leads: LeadDePrueba[] }).leads;
const CLIENTES = (JSON.parse(readFileSync(path.join(CARPETA, "clientes-activos.json"), "utf8")) as { clientes: ClienteDePrueba[] }).clientes;

const MAILS = { verif: "verif@op.example", calif: "calif@op.example", redac: "redac@op.example", com1: "com1@op.example" } as const;

interface Fixture {
  base: BaseEfimera;
  operar: typeof import("./operar").operar;
  dueno: Awaited<ReturnType<typeof prismaComoDuenio>>;
  ids: Record<keyof typeof MAILS, string>;
}

let prep: Promise<Fixture> | null = null;
async function preparar(t: import("node:test").TestContext): Promise<Fixture | null> {
  const base = await laBase(t);
  if (!base) return null;
  prep ??= (async () => {
    apuntarLaAppA(base);
    const { operar } = await import("./operar");
    const { cargarPrueba } = await import("./carga-prueba");
    const a = base.a;
    const ids = { verif: "op-verif", calif: "op-calif", redac: "op-redac", com1: "op-com1" };
    const c = new pg.Client({ connectionString: base.urlDuenio });
    await c.connect();
    try {
      // GSG-CRM-018: la tabla de apoyo de la carga no es una migración; se aplica como en el ambiente local.
      await c.query(readFileSync(path.join(process.cwd(), "scripts", "crm-comercial", "local", "filas-de-prueba.sql"), "utf8"));
      for (const [k, id] of Object.entries(ids)) {
        await c.query(`INSERT INTO "User" (id, "tenantId", name, email, "passwordHash", role, "updatedAt") VALUES ($1, $2, $3, $4, 'x', 'RECEPTION'::"UserRole", now())`, [id, a.id, `Usuario ${k}`, MAILS[k as keyof typeof MAILS]]);
      }
    } finally {
      await c.end();
    }
    const dueno = await prismaComoDuenio(base);
    const miembros: [string, string, string | null][] = [
      [a.duenia.id, "DIRECCION", null],
      [ids.com1, "COMERCIAL", null],
      [ids.verif, "PUESTO", "verificador"],
      [ids.calif, "PUESTO", "calificador"],
      [ids.redac, "PUESTO", "redactor"],
    ];
    for (const [userId, rol, puesto] of miembros) await dueno.miembroCrmComercial.create({ data: { tenantId: a.id, userId, rol, puesto } });
    await dueno.miembroCrmComercial.create({ data: { tenantId: base.b.id, userId: base.b.duenia.id, rol: "DIRECCION" } });
    // Interruptor prendido SÓLO en A (B queda apagado).
    const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
    const { CRM_COMERCIAL } = await import("@/cambios/interruptores");
    await dueno.auditLog.create({ data: filaDeInterruptor({ tenantId: a.id, interruptor: CRM_COMERCIAL, accion: "encender", operador: "test" }) });
    await cargarPrueba({ slug: a.slug, leads: LEADS, clientes: CLIENTES });
    return { base, operar, dueno, ids };
  })();
  return prep;
}

type Salida = { ok: boolean; motivo?: string; [k: string]: unknown };

async function rechazadas(f: Fixture, userId: string) {
  return f.dueno.actividadComercial.findMany({ where: { tenantId: f.base.a.id, usuarioId: userId, tipo: "ACCION_RECHAZADA" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { texto: true, puesto: true, oportunidadId: true } });
}

/** Opera como `mail` en A, y si rechaza, comprueba que el rechazo quedó registrado (fila nueva con el mismo motivo). */
async function como(f: Fixture, mail: string, comando: string, datos: Record<string, unknown> = {}, userId?: string): Promise<Salida> {
  const antes = userId ? (await rechazadas(f, userId)).length : 0;
  const r = (await f.operar({ negocio: f.base.a.slug, como: mail, comando, datos })) as Salida;
  if (userId && !r.ok) {
    const despues = await rechazadas(f, userId);
    assert.equal(despues.length, antes + 1, `${comando}: el rechazo tiene que quedar registrado`);
    assert.equal(despues.at(-1)?.texto, r.motivo, `${comando}: se registra el mismo motivo que se devuelve`);
  }
  return r;
}

test("B6 · E16 · E12: por la interfaz, un puesto no crea contactos, no marca enviado, no aprueba pases ni ve lo que no le pasaron (y queda registrado)", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { ids } = f;
  const a = f.base.a;
  const prospectos = await f.dueno.oportunidad.findMany({ where: { tenantId: a.id, tipo: "PROSPECTO", etapa: "DETECTADA" }, select: { id: true } });
  const consulta = await f.dueno.oportunidad.findFirstOrThrow({ where: { tenantId: a.id, tipo: "CONSULTA", etapa: "RECIBIDA" }, select: { id: true } });

  // No ve lo que no le pasaron: sin tarea tomada, la ficha se rechaza y queda registrado.
  const ajena = await como(f, MAILS.verif, "ficha", { id: prospectos[0].id }, ids.verif);
  assert.equal(ajena.ok, false);
  assert.match(ajena.motivo ?? "", /no tiene esa oportunidad/);
  const lista0 = await como(f, MAILS.verif, "listar");
  assert.equal(lista0.ok, true);
  assert.equal((lista0.filas as unknown[]).length, 0, "un puesto sin tareas no ve ninguna oportunidad");

  // Toma su tarea de la cola (la dejó la carga): ahora ve ESA y sólo esa.
  const tomada = await como(f, MAILS.verif, "tomar-tarea");
  assert.equal(tomada.ok, true, JSON.stringify(tomada));
  const tarea = tomada.tarea as { oportunidadId: string; para: string };
  assert.equal(tarea.para, "verificador");
  const lista1 = await como(f, MAILS.verif, "listar");
  assert.deepEqual((lista1.filas as { id: string }[]).map((x) => x.id), [tarea.oportunidadId]);
  assert.equal((await como(f, MAILS.verif, "ficha", { id: tarea.oportunidadId })).ok, true);

  // No crea contactos (ni sobre la que tiene).
  const contacto = await como(f, MAILS.verif, "crear-contacto", { oportunidadId: tarea.oportunidadId, nombre: "Ficticia Pérez", email: "ficticia@algo.example" }, ids.verif);
  assert.equal(contacto.ok, false);
  assert.match(contacto.motivo ?? "", /no carga contactos/);

  // Propone un pase que le toca; aprobarlo no puede (ni él ni otro puesto).
  const propuesto = await como(f, MAILS.verif, "proponer-pase", { id: tarea.oportunidadId, destino: "DESCARTADA", motivo: "OTRO", nota: "prueba de la interfaz" });
  assert.equal(propuesto.ok, true, JSON.stringify(propuesto));
  const aprobar = await como(f, MAILS.verif, "aprobar-pase", { id: tarea.oportunidadId }, ids.verif);
  assert.equal(aprobar.ok, false);
  const aprobarOtro = await como(f, MAILS.calif, "aprobar-pase", { id: tarea.oportunidadId }, ids.calif);
  assert.equal(aprobarOtro.ok, false);
  const op = await f.dueno.oportunidad.findUniqueOrThrow({ where: { id: tarea.oportunidadId }, select: { etapa: true, pasePropuesto: true } });
  assert.deepEqual(op, { etapa: "DETECTADA", pasePropuesto: "DESCARTADA" }, "el pase sigue propuesto, sin aplicar");
  const aplicar = await como(f, MAILS.verif, "aplicar-pase", { id: tarea.oportunidadId, destino: "DESCARTADA", motivo: "OTRO" }, ids.verif);
  assert.equal(aplicar.ok, false, "tampoco lo aplica por su cuenta");

  // Borrador: el redactor lo escribe (con una tarea que le pasó Dirección), no lo aprueba ni lo marca enviado.
  const dir = a.duenia.email;
  const nueva = await como(f, dir, "crear-tarea", { oportunidadId: consulta.id, para: "redactor", tipo: "REDACTAR" });
  assert.equal(nueva.ok, true, JSON.stringify(nueva));
  const tRedac = await como(f, MAILS.redac, "tomar-tarea");
  assert.equal((tRedac.tarea as { oportunidadId: string }).oportunidadId, consulta.id);
  const borrador = await como(f, MAILS.redac, "escribir-borrador", { oportunidadId: consulta.id, canal: "MAIL", asunto: "Tu consulta", cuerpo: "Hola, gracias por escribirnos (texto ficticio)." });
  assert.equal(borrador.ok, true, JSON.stringify(borrador));
  const bId = borrador.id as string;
  const aprobarB = await como(f, MAILS.redac, "aprobar-borrador", { id: bId }, ids.redac);
  assert.equal(aprobarB.ok, false);
  assert.equal((await como(f, dir, "aprobar-borrador", { id: bId })).ok, true, "Dirección sí lo aprueba");
  const enviado = await como(f, MAILS.redac, "marcar-enviado", { id: bId }, ids.redac);
  assert.equal(enviado.ok, false);
  assert.match(enviado.motivo ?? "", /persona que mandó/);
  const b = await f.dueno.borradorMensaje.findUniqueOrThrow({ where: { id: bId }, select: { estado: true } });
  assert.equal(b.estado, "APROBADO");

  // El comercial tampoco ve lo que no le asignaron (E12), y el rechazo queda registrado.
  const comercial = await como(f, MAILS.com1, "ficha", { id: prospectos[1].id }, ids.com1);
  assert.equal(comercial.ok, false);

  // Los rechazos llevan el puesto (como cuando los registra la acción del servidor).
  const filas = await rechazadas(f, ids.verif);
  assert.ok(filas.length >= 4 && filas.every((x) => x.puesto === "verificador"));
});

test("B6: identidad, interruptor y base — sin usuario del negocio, con el CRM apagado o fuera de esta máquina no se opera", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const b = f.base.b;
  const apagado = (await f.operar({ negocio: b.slug, como: b.duenia.email, comando: "listar" })) as Salida;
  assert.equal(apagado.ok, false);
  assert.match(apagado.motivo ?? "", /no está activado/);
  // Un usuario de B no opera en A (identidad por negocio).
  const cruzado = (await f.operar({ negocio: f.base.a.slug, como: b.duenia.email, comando: "listar" })) as Salida;
  assert.equal(cruzado.ok, false);
  assert.match(cruzado.motivo ?? "", /No hay un usuario/);
  const sinComando = (await f.operar({ negocio: f.base.a.slug, como: MAILS.verif, comando: "borrar-todo" })) as Salida;
  assert.match(sinComando.motivo ?? "", /No conozco el comando/);
  const neon = (await f.operar({ negocio: f.base.a.slug, como: MAILS.verif, comando: "listar" }, { DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/neondb" })) as Salida;
  assert.match(neon.motivo ?? "", /Neon/);
  const remota = (await f.operar({ negocio: f.base.a.slug, como: MAILS.verif, comando: "listar" }, { DATABASE_URL: "postgresql://u:p@db.ejemplo.example:5432/x" })) as Salida;
  assert.match(remota.motivo ?? "", /sólo local/);
});
