/**
 * Eventos y sponsors (GSG-CRM-009), EJECUTADO contra Postgres con RLS (base efímera local: la
 * migración 20261114231500_eventos_y_sponsors la aplica `migrate deploy` SÓLO en esta base):
 *
 *   · importar: entra el lote; reimportarlo no duplica nada; dos importaciones a la vez tampoco;
 *   · filtros por región (sin mayúsculas) y por fecha; ficha del evento y vista por marca;
 *   · aislamiento: el negocio B no ve, no lee por id, no escribe ni cuelga relaciones de A —
 *     por el repo y por SQL crudo como `app_rls` (RLS + FK compuesta (id, tenantId));
 *   · sin negocio en la conexión: cero filas; los CHECK de la migración frenan rol y URL inválidos;
 *   · la Server Action: apagada (default) rechaza sin escribir; prendida en A importa; B sigue apagado;
 *     un lote con datos de contacto de personas se rechaza entero.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { validarLote, type EventoDeLote } from "./core";

const laBase = baseEfimeraDelArchivo();

const LOTE = {
  eventos: [
    {
      nombre: "Expo Agro Demo 2027",
      fecha: "2027-03-10",
      fechaHasta: "2027-03-12",
      lugar: "Predio Ferial Demo",
      region: "Córdoba",
      organizador: "Cámara Demo",
      urlFuente: "https://expo-agro.example",
      marcas: [
        { nombre: "Banco Demo", rol: "SPONSOR_PRINCIPAL", nivel: "Oro", urlFuente: "https://expo-agro.example/sponsors" },
        { nombre: "Agro Demo SA", rol: "EXPOSITOR", urlFuente: "https://expo-agro.example/expositores" },
      ],
    },
    {
      nombre: "Congreso Salud Demo",
      fecha: "2027-05-20",
      lugar: "Hotel Demo",
      region: "CABA",
      marcas: [{ nombre: "Banco Demo", rol: "SPONSOR", urlFuente: "https://salud.example/sponsors" }],
    },
  ],
};

/** Como lo manda el equipo de agentes (Factory-GSG 20-PRODUCTO/crm-eventos/prueba-real): verificación, edición y registro. */
const CON_REGISTRO = {
  meta: { region: "Buenos Aires" },
  marcasDescartadasPorVerificador: [{ nombre: "Descartada SA", rol: "sponsor", urlFuente: "https://x.example" }],
  eventos: [
    {
      nombre: "Festival Registro Demo",
      tipo: "festival",
      fecha: "2027-03-20",
      fechaFin: "2027-03-22",
      lugar: "Hipódromo Demo",
      region: "CABA",
      organizador: "sin dato",
      urlFuente: "https://festival.example",
      verificacion: "confirmado",
      nota: "Edición 2025 (20-22/05/2025): sirve de referencia.",
      registro: [{ puesto: "descubridor", hora: "2026-11-14T23:14:46Z", accion: "encontró", url: "https://festival.example", detalle: "fecha y lugar" }],
      marcas: [
        {
          nombre: "Cerveza Demo",
          rol: "sponsor_principal",
          edicion: "anterior (2025)",
          urlFuente: "https://festival.example/partners",
          verificacion: "sin verificar",
          registro: [{ puesto: "identificador", hora: "2026-11-14T23:22:38Z", accion: "identificó", url: "https://festival.example/partners", detalle: "sponsor principal" }],
        },
        { nombre: "Productora Demo", rol: "organizador", urlFuente: "https://festival.example", verificacion: "en duda" },
      ],
    },
  ],
};

function eventos(lote: unknown): EventoDeLote[] {
  const r = validarLote(lote);
  assert.equal(r.ok, true);
  return r.ok ? r.eventos : [];
}

let prep: Promise<typeof import("./repo")> | null = null;
async function preparar(t: import("node:test").TestContext): Promise<{ base: BaseEfimera; repo: typeof import("./repo") } | null> {
  const base = await laBase(t);
  if (!base) return null;
  prep ??= (async () => {
    apuntarLaAppA(base);
    prepararAccionesDeServidor();
    return import("./repo");
  })();
  return { base, repo: await prep };
}

/** SQL crudo como la app (`app_rls`, con RLS), dentro de una transacción del negocio `tenantId` (o sin negocio). */
async function comoApp<T>(base: BaseEfimera, tenantId: string | null, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: base.urlApp });
  await c.connect();
  try {
    await c.query("BEGIN");
    if (tenantId) await c.query("SELECT set_config('app.current_tenant_id',$1,true)", [tenantId]);
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}

test("importar un lote: entra entero y reimportarlo no duplica nada", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, repo } = p;
  const r1 = await repo.importarLote(base.a.id, eventos(LOTE));
  assert.equal(r1.faltaMigracion, false);
  if (r1.faltaMigracion) return;
  assert.deepEqual(
    { e: r1.eventosNuevos, m: r1.marcasNuevas, r: r1.relacionesNuevas },
    { e: 2, m: 2, r: 3 },
  );
  const r2 = await repo.importarLote(base.a.id, eventos(LOTE));
  assert.equal(r2.faltaMigracion, false);
  if (r2.faltaMigracion) return;
  assert.deepEqual(
    { e: r2.eventosNuevos, ee: r2.eventosExistentes, m: r2.marcasNuevas, r: r2.relacionesNuevas, re: r2.relacionesExistentes },
    { e: 0, ee: 2, m: 0, r: 0, re: 3 },
  );
  // El mismo evento escrito distinto (mayúsculas, sin acento) tampoco se duplica.
  const r3 = await repo.importarLote(base.a.id, eventos({ eventos: [{ ...LOTE.eventos[0], nombre: "EXPO AGRO DEMO 2027", region: "cordoba", marcas: [] }] }));
  assert.ok(!r3.faltaMigracion && r3.eventosNuevos === 0);
});

test("dos importaciones a la vez del mismo lote: ni un duplicado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, repo } = p;
  const lote = eventos({ eventos: [{ nombre: "Feria Carrera", fecha: "2027-07-01", lugar: "Rural", region: "Mendoza", marcas: [{ nombre: "Marca Carrera", rol: "sponsor", urlFuente: "https://carrera.example" }] }] });
  const rs = await Promise.all([1, 2, 3, 4].map(() => repo.importarLote(base.a.id, lote)));
  const nuevos = rs.reduce((s, r) => s + (r.faltaMigracion ? 0 : r.eventosNuevos), 0);
  const rel = rs.reduce((s, r) => s + (r.faltaMigracion ? 0 : r.relacionesNuevas), 0);
  assert.equal(nuevos, 1);
  assert.equal(rel, 1);
  const n = await comoApp(base, base.a.id, (c) => c.query(`SELECT count(*)::int AS n FROM "EventoRelevado" WHERE region = 'Mendoza'`));
  assert.equal(n.rows[0].n, 1);
});

test("filtros por región y fecha, ficha del evento y vista por marca", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, repo } = p;
  await repo.importarLote(base.a.id, eventos(LOTE));

  const cba = await repo.listarEventos(base.a.id, { region: "CÓRDOBA", desde: null, hasta: null });
  assert.ok(!cba.faltaMigracion);
  if (cba.faltaMigracion) return;
  assert.deepEqual(cba.eventos.map((e) => e.nombre), ["Expo Agro Demo 2027"]);
  assert.equal(cba.eventos[0].marcas, 2);
  assert.ok(cba.regiones.includes("CABA") && cba.regiones.includes("Córdoba"));

  const mayo = await repo.listarEventos(base.a.id, { region: null, desde: "2027-05-01", hasta: "2027-05-31" });
  assert.ok(!mayo.faltaMigracion && mayo.eventos.length === 1 && mayo.eventos[0].nombre === "Congreso Salud Demo");

  const ficha = await repo.fichaEvento(base.a.id, cba.eventos[0].id);
  assert.ok(!ficha.faltaMigracion && ficha.evento);
  if (ficha.faltaMigracion || !ficha.evento) return;
  // Sponsor principal primero aunque «Agro» vaya antes por nombre: el orden es la jerarquía del rol.
  assert.deepEqual(ficha.evento.marcas.map((m) => [m.nombre, m.rol]), [["Banco Demo", "SPONSOR_PRINCIPAL"], ["Agro Demo SA", "EXPOSITOR"]]);
  assert.ok(ficha.evento.marcas.every((m) => m.urlFuente.startsWith("https://")));

  const banco = ficha.evento.marcas.find((m) => m.nombre === "Banco Demo")!;
  const vista = await repo.fichaMarca(base.a.id, banco.marcaId);
  assert.ok(!vista.faltaMigracion && vista.marca);
  if (vista.faltaMigracion || !vista.marca) return;
  assert.deepEqual(vista.marca.eventos.map((e) => e.evento.nombre), ["Expo Agro Demo 2027", "Congreso Salud Demo"]);

  const marcas = await repo.listarMarcas(base.a.id, "banco");
  assert.ok(!marcas.faltaMigracion && marcas.marcas.length === 1 && marcas.marcas[0].eventos === 2);
});

test("aislamiento por el repo: B no ve ni abre por id lo de A", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, repo } = p;
  await repo.importarLote(base.a.id, eventos(LOTE));
  const deA = await repo.listarEventos(base.a.id, { region: null, desde: null, hasta: null });
  assert.ok(!deA.faltaMigracion && deA.eventos.length > 0);
  if (deA.faltaMigracion) return;
  const idA = deA.eventos[0].id;

  const deB = await repo.listarEventos(base.b.id, { region: null, desde: null, hasta: null });
  assert.ok(!deB.faltaMigracion && deB.eventos.length === 0 && deB.regiones.length === 0);
  const fichaB = await repo.fichaEvento(base.b.id, idA);
  assert.ok(!fichaB.faltaMigracion && fichaB.evento === null);
  const marcasB = await repo.listarMarcas(base.b.id, null);
  assert.ok(!marcasB.faltaMigracion && marcasB.marcas.length === 0);

  // B importa el MISMO lote: le quedan sus propias filas, sin tocar ni «encontrar» las de A.
  const rB = await repo.importarLote(base.b.id, eventos(LOTE));
  assert.ok(!rB.faltaMigracion && rB.eventosNuevos === 2 && rB.marcasNuevas === 2);
  const otraVezA = await repo.listarEventos(base.a.id, { region: null, desde: null, hasta: null });
  assert.ok(!otraVezA.faltaMigracion && otraVezA.eventos.every((e) => deA.eventos.some((x) => x.id === e.id)));
});

test("aislamiento por SQL crudo (app_rls): RLS en lectura y escritura, y la FK compuesta", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, repo } = p;
  await repo.importarLote(base.a.id, eventos(LOTE));
  const filasA = await comoApp(base, base.a.id, async (c) => ({
    ev: (await c.query(`SELECT id FROM "EventoRelevado" LIMIT 1`)).rows[0].id as string,
    ma: (await c.query(`SELECT id FROM "MarcaRelevada" LIMIT 1`)).rows[0].id as string,
  }));

  // B no lee nada de A, ni por id.
  await repo.crearPedido(base.a.id, { puesto: "descubridor", pedido: "Buscá ferias en Córdoba", creadoPor: null });
  await repo.importarLote(base.a.id, eventos({ eventos: [{ ...CON_REGISTRO.eventos[0], nombre: "Festival Aislamiento Demo" }] }));
  for (const tabla of ["EventoRelevado", "MarcaRelevada", "EventoMarca", "AccionDelEquipo", "PedidoAlEquipo"]) {
    const r = await comoApp(base, base.b.id, (c) => c.query(`SELECT count(*)::int AS n FROM "${tabla}" WHERE "tenantId" = $1`, [base.a.id]));
    assert.equal(r.rows[0].n, 0, `${tabla}: B lee filas de A`);
  }
  // Sin negocio en la conexión: cero filas.
  const sin = await comoApp(base, null, (c) => c.query(`SELECT count(*)::int AS n FROM "EventoRelevado"`));
  assert.equal(sin.rows[0].n, 0);

  for (const [tabla, sql] of [
    ["AccionDelEquipo", `INSERT INTO "AccionDelEquipo" (id, "tenantId", clave, puesto, accion, hora, "eventoClave") VALUES ('x-acc', $1, 'k', 'verificador', 'confirmó', now(), 'e')`],
    ["PedidoAlEquipo", `INSERT INTO "PedidoAlEquipo" (id, "tenantId", pedido, "updatedAt") VALUES ('x-ped', $1, 'pedido ajeno', now())`],
  ] as const) {
    await assert.rejects(comoApp(base, base.b.id, (c) => c.query(sql, [base.a.id])), /row-level security/, `${tabla}: B escribe a nombre de A`);
  }
  // B no escribe filas a nombre de A (WITH CHECK).
  await assert.rejects(
    comoApp(base, base.b.id, (c) => c.query(`INSERT INTO "EventoRelevado" (id, "tenantId", clave, nombre, fecha, lugar, region, "updatedAt") VALUES ('x-ataque', $1, 'k', 'n', '2027-01-01', 'l', 'r', now())`, [base.a.id])),
    /row-level security/,
  );
  // B no modifica ni borra lo de A: las sentencias no ven filas.
  const upd = await comoApp(base, base.b.id, (c) => c.query(`UPDATE "EventoRelevado" SET nombre = 'pisado' WHERE id = $1`, [filasA.ev]));
  assert.equal(upd.rowCount, 0);
  const del = await comoApp(base, base.b.id, (c) => c.query(`DELETE FROM "MarcaRelevada" WHERE id = $1`, [filasA.ma]));
  assert.equal(del.rowCount, 0);

  // B no cuelga una relación propia de un evento o una marca de A (FK compuesta con su tenantId).
  await assert.rejects(
    comoApp(base, base.b.id, (c) => c.query(`INSERT INTO "EventoMarca" (id, "tenantId", "eventoId", "marcaId", rol, "urlFuente") VALUES ('x-rel', $1, $2, $3, 'SPONSOR', 'https://x.example')`, [base.b.id, filasA.ev, filasA.ma])),
    /foreign key|violates/,
  );
  const intacto = await comoApp(base, base.a.id, (c) => c.query(`SELECT nombre FROM "EventoRelevado" WHERE id = $1`, [filasA.ev]));
  assert.notEqual(intacto.rows[0].nombre, "pisado");
});

test("los CHECK de la migración frenan rol y URL inválidos aunque se saltee la validación", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, repo } = p;
  await repo.importarLote(base.a.id, eventos(LOTE));
  const ids = await comoApp(base, base.a.id, async (c) => ({
    ev: (await c.query(`SELECT id FROM "EventoRelevado" LIMIT 1`)).rows[0].id as string,
    ma: (await c.query(`SELECT id FROM "MarcaRelevada" LIMIT 1`)).rows[0].id as string,
  }));
  await assert.rejects(
    comoApp(base, base.a.id, (c) => c.query(`INSERT INTO "EventoMarca" (id, "tenantId", "eventoId", "marcaId", rol, "urlFuente") VALUES ('x1', $1, $2, $3, 'AMIGO', 'https://x.example')`, [base.a.id, ids.ev, ids.ma])),
    /EventoMarca_rol_check/,
  );
  await assert.rejects(
    comoApp(base, base.a.id, (c) => c.query(`INSERT INTO "EventoMarca" (id, "tenantId", "eventoId", "marcaId", rol, "urlFuente") VALUES ('x2', $1, $2, $3, 'OTRO', 'javascript:alert(1)')`, [base.a.id, ids.ev, ids.ma])),
    /EventoMarca_urlFuente_check/,
  );
});

test("la Server Action: apagada rechaza, prendida importa, el interruptor es por negocio y los contactos no entran", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base } = p;
  const { importarEventos } = await import("./acciones");
  const lote = { eventos: [{ nombre: "Evento Accion", fecha: "2027-09-01", lugar: "Club", region: "Rosario", marcas: [{ nombre: "Marca Accion", rol: "SPONSOR", urlFuente: "https://accion.example" }] }] };
  const correr = async (negocio: BaseEfimera["a"], contenido: unknown) => {
    const f = new FormData();
    f.set("lote", JSON.stringify(contenido));
    const r = await ejecutarAccion({ negocio, usuario: negocio.duenia }, () => importarEventos({ estado: "inicial" }, f));
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return r.tipo === "respuesta" ? r.valor : null;
  };
  const cuantos = async (tenantId: string) =>
    (await comoApp(base, tenantId, (c) => c.query(`SELECT count(*)::int AS n FROM "EventoRelevado" WHERE region = 'Rosario'`))).rows[0].n as number;

  const apagada = await correr(base.a, lote);
  assert.equal(apagada?.estado, "error");
  assert.match(apagada?.estado === "error" ? apagada.mensaje : "", /no está activado/);
  assert.equal(await cuantos(base.a.id), 0);

  const duenio = await prismaComoDuenio(base);
  const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
  const { EVENTOS_SPONSORS } = await import("@/cambios/interruptores");
  await duenio.auditLog.create({ data: filaDeInterruptor({ tenantId: base.a.id, interruptor: EVENTOS_SPONSORS, accion: "encender", operador: "test" }) });

  const prendida = await correr(base.a, lote);
  assert.equal(prendida?.estado, "ok", JSON.stringify(prendida));
  assert.equal(await cuantos(base.a.id), 1);

  const enB = await correr(base.b, lote);
  assert.equal(enB?.estado, "error", "B sigue apagado");
  assert.equal(await cuantos(base.b.id), 0);

  const conMail = await correr(base.a, { eventos: [{ ...lote.eventos[0], nombre: "Con mail", marcas: [{ nombre: "M", rol: "SPONSOR", urlFuente: "https://x.example", email: "alguien@empresa.com" }] }] });
  assert.equal(conMail?.estado, "error");
  assert.match(conMail?.estado === "error" ? conMail.mensaje : "", /contacto/);
  const conMailFilas = await comoApp(base, base.a.id, (c) => c.query(`SELECT count(*)::int AS n FROM "EventoRelevado" WHERE nombre = 'Con mail'`));
  assert.equal(conMailFilas.rows[0].n, 0);
});

test("el lote del equipo de agentes: verificación, edición y registro; reimportar actualiza la verificación sin duplicar pasos", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, repo } = p;
  const r1 = await repo.importarLote(base.a.id, eventos(CON_REGISTRO));
  assert.ok(!r1.faltaMigracion);
  if (r1.faltaMigracion) return;
  assert.deepEqual({ e: r1.eventosNuevos, r: r1.relacionesNuevas, a: r1.accionesNuevas, v: r1.verificacionesActualizadas }, { e: 1, r: 2, a: 2, v: 0 });

  // El Verificador volvió a mirar: la marca pasa a confirmada y suma su paso. Lo demás no se duplica.
  const final = structuredClone(CON_REGISTRO);
  final.eventos[0].marcas[0].verificacion = "confirmado";
  final.eventos[0].marcas[0].registro!.push({ puesto: "verificador", hora: "2026-11-14T23:40:00Z", accion: "confirmó", url: "https://festival.example/partners", detalle: "logo en la página" });
  const r2 = await repo.importarLote(base.a.id, eventos(final));
  assert.ok(!r2.faltaMigracion);
  if (r2.faltaMigracion) return;
  assert.deepEqual({ e: r2.eventosNuevos, r: r2.relacionesNuevas, a: r2.accionesNuevas, v: r2.verificacionesActualizadas }, { e: 0, r: 0, a: 1, v: 1 });

  const lista = await repo.listarEventos(base.a.id, { region: "CABA", desde: "2027-03-01", hasta: "2027-03-31" });
  assert.ok(!lista.faltaMigracion);
  if (lista.faltaMigracion) return;
  const ev = lista.eventos.find((e) => e.nombre === "Festival Registro Demo")!;
  assert.equal(ev.organizador, null, "«sin dato» no se guarda como texto");
  const ficha = await repo.fichaEvento(base.a.id, ev.id);
  assert.ok(!ficha.faltaMigracion && ficha.evento);
  if (ficha.faltaMigracion || !ficha.evento) return;
  assert.equal(ficha.evento.verificacion, "confirmado");
  assert.equal(ficha.evento.tipo, "festival");
  assert.equal(ficha.evento.registro.length, 1);
  const [principal, organizador] = ficha.evento.marcas;
  assert.deepEqual([principal.nombre, principal.rol, principal.edicion, principal.verificacion], ["Cerveza Demo", "SPONSOR_PRINCIPAL", "anterior (2025)", "confirmado"]);
  assert.deepEqual(principal.registro.map((l) => l.puesto), ["identificador", "verificador"]);
  assert.deepEqual([organizador.rol, organizador.verificacion], ["ORGANIZADOR", "en duda"]);
  assert.ok(!ficha.evento.marcas.some((m) => m.nombre === "Descartada SA"), "las descartadas por el Verificador no entran");

  const eq = await repo.resumenDelEquipo(base.a.id);
  assert.ok(!eq.faltaMigracion);
  if (eq.faltaMigracion) return;
  assert.equal(eq.porPuesto.find((x) => x.puesto === "verificador")?.acciones, 1);
  assert.ok(eq.enDuda.some((d) => d.marca === "Productora Demo"));
  const eqB = await repo.resumenDelEquipo(base.b.id);
  // B tiene sus propios eventos de otras pruebas, pero ningún paso del equipo ni lo que A dejó en duda.
  assert.ok(!eqB.faltaMigracion && eqB.porPuesto.every((x) => x.acciones === 0) && !eqB.enDuda.some((d) => d.marca === "Productora Demo"), "B no ve el equipo de A");
});

test("pedido al equipo: la acción valida, guarda en la cola del negocio y B no lo ve", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, repo } = p;
  const { pedirAlEquipo } = await import("./acciones");
  const pedir = async (negocio: BaseEfimera["a"], puesto: string, texto: string) => {
    const f = new FormData();
    f.set("puesto", puesto);
    f.set("pedido", texto);
    const r = await ejecutarAccion({ negocio, usuario: negocio.duenia }, () => pedirAlEquipo({ estado: "inicial" }, f));
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return r.tipo === "respuesta" ? r.valor : null;
  };
  const duenio = await prismaComoDuenio(base);
  const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
  const { EVENTOS_SPONSORS } = await import("@/cambios/interruptores");
  await duenio.auditLog.create({ data: filaDeInterruptor({ tenantId: base.a.id, interruptor: EVENTOS_SPONSORS, accion: "encender", operador: "test" }) });

  assert.equal((await pedir(base.a, "descubridor", "Buscá congresos en Mendoza para abril"))?.estado, "ok");
  assert.equal((await pedir(base.a, "redactor", "Escribile a todos"))?.estado, "error", "el Redactor no recibe pedidos todavía");
  assert.equal((await pedir(base.a, "descubridor", "Llamá al 11 4567 8901"))?.estado, "error", "sin datos de contacto");
  assert.equal((await pedir(base.b, "descubridor", "Buscá ferias en Salta"))?.estado, "error", "B tiene el interruptor apagado");

  const a = await repo.resumenDelEquipo(base.a.id);
  const b = await repo.resumenDelEquipo(base.b.id);
  assert.ok(!a.faltaMigracion && !b.faltaMigracion);
  if (a.faltaMigracion || b.faltaMigracion) return;
  assert.ok(a.pedidos.some((x) => x.pedido === "Buscá congresos en Mendoza para abril" && x.estado === "EN_COLA"));
  assert.ok(!b.pedidos.some((x) => x.pedido.includes("Mendoza")));
});
