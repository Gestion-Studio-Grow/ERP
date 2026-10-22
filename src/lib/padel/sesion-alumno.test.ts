import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COOKIE_ALUMNO,
  RESPUESTA_FRENADO,
  VIDA_COOKIE_SEG,
  claseReconoce,
  conPisoDeTiempo,
  decidirPedidoDeLink,
  destinoMisClases,
  opcionesCookie,
  politicaDeToken,
  regenerarAlReconocer,
  respuestaLinkPedido,
  tokenAEntregar,
} from "./sesion-alumno";

const JUAN = "Jn4mR8tPq2Lx7Vw9Zb3Kc5Hd";
const OTRO = "Ot8rQ1wE5rT9yU3iO7pA2sD6";

test("H2/E31: un atacante con el celular de otro alumno NO recibe su link", () => {
  // Sin cookie (otro navegador): nada.
  assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: JUAN, tokenCookie: null }), null);
  assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: JUAN, tokenCookie: undefined }), null);
  // Con la cookie de OTRO alumno (el atacante es alumno también): nada.
  assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: JUAN, tokenCookie: OTRO }), null);
  // Cookie basura o casi igual: nada.
  assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: JUAN, tokenCookie: "../etc/passwd" }), null);
  assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: JUAN, tokenCookie: JUAN.slice(0, -1) + "X" }), null);
  assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: JUAN, tokenCookie: JUAN + "x" }), null);
});

test("M-003/M-004: el alumno nuevo recibe su link; el de siempre, sólo desde su mismo teléfono", () => {
  assert.equal(tokenAEntregar({ esNuevo: true, tokenAlumno: JUAN, tokenCookie: null }), JUAN, "nuevo: es su primer link");
  assert.equal(tokenAEntregar({ esNuevo: true, tokenAlumno: JUAN, tokenCookie: OTRO }), JUAN, "nuevo en un teléfono compartido");
  assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: JUAN, tokenCookie: JUAN }), JUAN, "mismo dispositivo");
});

test("cookie padel_alumno: httpOnly, SameSite=Lax, Path=/, un año; Secure salvo en localhost", () => {
  assert.equal(COOKIE_ALUMNO, "padel_alumno");
  const prod = opcionesCookie("agendaprofe.gsgapp.com.ar");
  assert.deepEqual(prod, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: VIDA_COOKIE_SEG });
  assert.equal(VIDA_COOKIE_SEG, 31_536_000);
  assert.equal(opcionesCookie("localhost:3000").secure, false);
  assert.equal(opcionesCookie("127.0.0.1:3000").secure, false);
  assert.equal(opcionesCookie("matias.localhost").secure, false);
  assert.equal(opcionesCookie(null).secure, true, "sin host, del lado seguro");
  assert.equal(opcionesCookie("localhost.evil.com").secure, true);
});

test("M-005/M-006: «Pedí tu link» responde lo mismo exista o no el celular, y nunca devuelve el link", () => {
  const existe = decidirPedidoDeLink({ frenado: false, esAlumno: true, yaPedidoHaceRato: false, profe: "Matías" });
  const noExiste = decidirPedidoDeLink({ frenado: false, esAlumno: false, yaPedidoHaceRato: false, profe: "Matías" });
  assert.ok(existe.ok && noExiste.ok);
  assert.equal(existe.mensaje, noExiste.mensaje, "mismo texto: no revela quién es alumno");
  assert.equal(existe.mensaje, "Si ese celular es de un alumno de Matías, le llega su link por WhatsApp.");
  assert.equal(existe.avisar, true, "al alumno de verdad le llega");
  assert.equal(noExiste.avisar, false, "y para un celular que no existe no se crea nada");
  assert.doesNotMatch(JSON.stringify(existe), /alumno\/|token/i);
  assert.equal(respuestaLinkPedido(""), "Si ese celular es de un alumno del profe, le llega su link por WhatsApp.");
});

test("M-007: frenado → «Probá de nuevo», sin aviso; dentro de los 10 min no se repite el WhatsApp", () => {
  assert.deepEqual(decidirPedidoDeLink({ frenado: true, esAlumno: true, yaPedidoHaceRato: false, profe: "Matías" }), { ok: false, error: RESPUESTA_FRENADO });
  const repetido = decidirPedidoDeLink({ frenado: false, esAlumno: true, yaPedidoHaceRato: true, profe: "Matías" });
  assert.ok(repetido.ok);
  assert.equal(repetido.avisar, false);
});

test("guardia de código: pedirClase entrega el token sólo vía tokenAEntregar y pedirMiLink nunca lo devuelve", async () => {
  const fuente = await fuenteAcciones();
  const cuerpo = (nombre: string) => {
    const i = fuente.indexOf(`export async function ${nombre}(`);
    assert.ok(i >= 0, nombre);
    const j = fuente.indexOf("\nexport async function ", i + 10);
    return fuente.slice(i, j < 0 ? undefined : j);
  };
  const pedir = cuerpo("pedirClase");
  assert.match(pedir, /politicaDeToken\(/, "el token sale sólo de la política (que usa tokenAEntregar)");
  assert.match(pedir, /const token = r\.entregar;/);
  assert.doesNotMatch(pedir, /token:\s*r\.alumno\.token/, "nunca el token del alumno a pelo");
  const link = cuerpo("pedirMiLink");
  assert.doesNotMatch(link, /return \{[^}]*token/, "la respuesta no lleva el token");
  assert.doesNotMatch(link, /return \{[^}]*wa:/, "ni el link de WhatsApp con el link adentro");
});

// ── O-1: «squatting» ────────────────────────────────────────────────────────

// Tanda 2A: las escrituras se partieron en acciones.ts (profe), acciones-alumno.ts (público) y
// acciones-compartido.ts (piezas comunes). Las guardias miran las tres juntas.
async function fuenteAcciones(): Promise<string> {
  const { readFileSync } = await import("node:fs");
  return ["./acciones.ts", "./acciones-alumno.ts", "./acciones-compartido.ts"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
}
const cuerpoDe = (fuente: string, nombre: string) => {
  const i = fuente.search(new RegExp(`(export )?async function ${nombre}\\(`));
  assert.ok(i >= 0, nombre);
  const j = fuente.indexOf("\nexport async function ", i + 10);
  const k = fuente.indexOf("\nasync function ", i + 10);
  const fin = [j, k].filter((x) => x > 0);
  return fuente.slice(i, fin.length ? Math.min(...fin) : undefined);
};

test("O-1: el profe reconoce al alumno cuando le confirma, le agenda, o le marca dada/ausente una clase", () => {
  const base = { estado: "PEDIDA", origen: "TURNERO", confirmadaEl: null };
  assert.equal(claseReconoce(base), false, "un pedido del turnero no reconoce a nadie");
  assert.equal(claseReconoce({ ...base, estado: "RECHAZADA" }), false);
  assert.equal(claseReconoce({ ...base, estado: "CANCELADA" }), false);
  assert.equal(claseReconoce({ ...base, estado: "SIN_RESPUESTA" }), false);
  assert.equal(claseReconoce({ ...base, estado: "CANCELADA", confirmadaEl: new Date() }), true, "la confirmó alguna vez");
  assert.equal(claseReconoce({ ...base, origen: "PROFE" }), true, "la agendó el profe");
  assert.equal(claseReconoce({ ...base, estado: "DADA" }), true);
  assert.equal(claseReconoce({ ...base, estado: "AUSENTE" }), true);
});

test("O-1: guardia — el filtro de la base (alumnoReconocido) dice lo mismo que claseReconoce", async () => {
  const f = cuerpoDe(await fuenteAcciones(), "alumnoReconocido");
  assert.match(f, /confirmadaEl: \{ not: null \}/);
  assert.match(f, /origen: "PROFE"/);
  assert.match(f, /estado: \{ in: \["DADA", "AUSENTE"\] \}/);
  assert.match(f, /tenantId,/, "acotado al negocio");
});

test("O-1: un pedido desde otro dispositivo sobre un alumno NO reconocido regenera el link y no se lo da a nadie", () => {
  const T1 = "Sq7uAtTeRtOkEn1234567890";
  // El primero que tipeó el celular (un tercero) recibió T1 y quedó en su cookie.
  assert.deepEqual(politicaDeToken({ esNuevo: true, recienCreado: true, reconocido: false, tokenAlumno: T1, tokenCookie: null }), { entregar: T1, rotar: false });
  // El dueño real pide desde SU teléfono (sin cookie): no recibe T1 y T1 se invalida.
  assert.deepEqual(politicaDeToken({ esNuevo: false, recienCreado: false, reconocido: false, tokenAlumno: T1, tokenCookie: null }), { entregar: null, rotar: true });
  // Con la cookie de OTRO alumno: igual.
  assert.deepEqual(politicaDeToken({ esNuevo: false, recienCreado: false, reconocido: false, tokenAlumno: T1, tokenCookie: OTRO }), { entregar: null, rotar: true });
  // El mismo dispositivo que ya lo tenía: sigue (no se le corta al alumno nuevo que pide otra clase).
  assert.deepEqual(politicaDeToken({ esNuevo: false, recienCreado: false, reconocido: false, tokenAlumno: T1, tokenCookie: T1 }), { entregar: T1, rotar: false });
  // Alumno ya reconocido por el profe: un teléfono nuevo NO le rompe el link (M-001/M-002 como antes).
  assert.deepEqual(politicaDeToken({ esNuevo: false, recienCreado: false, reconocido: true, tokenAlumno: JUAN, tokenCookie: null }), { entregar: null, rotar: false });
  // Alumno recién creado desde una ficha de cliente que ya existía: su token no lo vio nadie.
  assert.deepEqual(politicaDeToken({ esNuevo: false, recienCreado: true, reconocido: false, tokenAlumno: JUAN, tokenCookie: null }), { entregar: null, rotar: false });
});

test("O-1: el link se regenera la PRIMERA vez que el profe reconoce a un alumno que ya existía", () => {
  assert.equal(regenerarAlReconocer({ reconocidoAntes: false, recienCreado: false }), true, "pidió por el turnero y el profe lo confirma");
  assert.equal(regenerarAlReconocer({ reconocidoAntes: true, recienCreado: false }), false, "ya era alumno: su link no cambia");
  assert.equal(regenerarAlReconocer({ reconocidoAntes: false, recienCreado: true }), false, "lo da de alta el profe ahora: token nuevo de fábrica");
});

test("O-1: escenario completo — el que tipeó un celular ajeno pierde el acceso; el dueño real recibe un link que el otro nunca vio", () => {
  // Simulación con las reglas puras: un solo token por alumno (como la columna única de la base).
  let tokenEnBase = "Sq7uAtTeRtOkEn1234567890"; // nace con el pedido del tercero
  const cookieTercero = tokenEnBase;
  let reconocido = false;
  const nuevo = (n: number) => `NuEvOtOkEnDeLaBaSe00000${n}`;
  // 1) El dueño real pide desde su teléfono, sin cookie.
  const p1 = politicaDeToken({ esNuevo: false, recienCreado: false, reconocido, tokenAlumno: tokenEnBase, tokenCookie: null });
  assert.equal(p1.entregar, null);
  if (p1.rotar) tokenEnBase = nuevo(1);
  assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: tokenEnBase, tokenCookie: cookieTercero }), null, "la cookie del tercero ya no vale");
  // 2) El profe confirma → primera vez que lo reconoce → link nuevo por WhatsApp al número registrado.
  if (regenerarAlReconocer({ reconocidoAntes: reconocido, recienCreado: false })) tokenEnBase = nuevo(2);
  reconocido = true;
  assert.notEqual(tokenEnBase, cookieTercero);
  // 3) El tercero vuelve a pedir con ese celular: ni token ni rotación (ya es un alumno reconocido).
  assert.deepEqual(politicaDeToken({ esNuevo: false, recienCreado: false, reconocido, tokenAlumno: tokenEnBase, tokenCookie: cookieTercero }), { entregar: null, rotar: false });
  // 4) Una confirmación posterior no vuelve a cambiar el link del alumno real.
  assert.equal(regenerarAlReconocer({ reconocidoAntes: reconocido, recienCreado: false }), false);
});

test("O-1: guardia — confirmar/dar/ausente, agendar la próxima y el alta del profe pasan por reconocerAlumno; «Regenerar link» invalida el viejo", async () => {
  const f = await fuenteAcciones();
  // moverClase delega en transicionar (el corazón de confirmar/dar/ausente/cancelar).
  assert.match(cuerpoDe(f, "moverClase"), /return transicionar\(id, evento\)/);
  const mover = cuerpoDe(f, "transicionar");
  assert.match(mover, /\["CONFIRMADA", "DADA", "AUSENTE"\]\.includes\(nuevo\)\s*\?\s*await reconocerAlumno\(tx/);
  assert.match(mover, /alumno\.token = r\.token;/, "el WhatsApp sale con el link nuevo");
  const proxima = cuerpoDe(f, "agendarProxima");
  assert.ok(proxima.indexOf("reconocerAlumno(") > 0 && proxima.indexOf("reconocerAlumno(") < proxima.indexOf("padelClase.create("), "antes de crear la clase del profe");
  const alta = cuerpoDe(f, "agendarClase");
  assert.ok(alta.indexOf("reconocerAlumno(") > 0 && alta.indexOf("reconocerAlumno(") < alta.indexOf("padelClase.create("));
  const regen = cuerpoDe(f, "regenerarLink");
  assert.match(regen, /requireCapability\("agenda:manage"\)/, "sólo el profe");
  assert.match(regen, /updateMany\(\{ where: \{ tenantId, id: alumnoId, token: a\.token \}, data: \{ token \} \}\)/, "reemplaza el token leído: el viejo deja de andar");
  assert.match(regen, /auditAdmin\(/);
  assert.doesNotMatch(regen, /return \{[^}]*token[,:]/, "no devuelve el token a pelo: sólo el WhatsApp al número registrado");
  // Mandar el link de un alumno sin reconocer (a mano o por «Pedí tu link» con la Cloud API) manda uno recién hecho.
  assert.match(cuerpoDe(f, "tokenParaMandar"), /alumnoReconocido\(tx, tenantId, alumno\.id\)[\s\S]*regenerarToken\(tx/);
  assert.match(cuerpoDe(f, "mandarLinkAlAlumno"), /await tokenParaMandar\(tenantId, a\)/);
  assert.match(cuerpoDe(f, "mandarLinkPedido"), /await tokenParaMandar\(tenantId, alumno\)/);
  // El link del alumno sólo se encuentra por el token VIGENTE: el viejo da 404.
  const datos = (await import("node:fs")).readFileSync(new URL("./datos.server.ts", import.meta.url), "utf8");
  assert.match(datos, /padelAlumno\.findFirst\(\{\s*where: \{ tenantId, token \}/);
});

// ── O-2: la demora no delata ────────────────────────────────────────────────

test("O-2: conPisoDeTiempo — lo rápido espera hasta el piso; lo lento no suma; con error también espera", async () => {
  let t = 0;
  const dormidas: number[] = [];
  const reloj = { ahora: () => t, dormir: async (ms: number) => { dormidas.push(ms); t += ms; } };
  assert.equal(await conPisoDeTiempo(800, async () => { t += 30; return "a"; }, reloj), "a");
  assert.deepEqual(dormidas, [770]);
  assert.equal(await conPisoDeTiempo(800, async () => { t += 900; return "b"; }, reloj), "b");
  assert.deepEqual(dormidas, [770], "pasado el piso no espera más");
  await assert.rejects(conPisoDeTiempo(800, async () => { t += 10; throw new Error("x"); }, reloj));
  assert.deepEqual(dormidas, [770, 790], "un error tampoco responde antes");
});

test("O-2: con reloj real, «existe» (más idas a la base) y «no existe» tardan lo mismo", async () => {
  const medir = async (trabajoMs: number) => {
    const t0 = performance.now();
    await conPisoDeTiempo(120, () => new Promise((r) => setTimeout(r, trabajoMs)));
    return performance.now() - t0;
  };
  const [existe, noExiste] = await Promise.all([medir(60), medir(2)]);
  assert.ok(existe >= 115 && noExiste >= 115, `${existe} / ${noExiste}`);
  assert.ok(Math.abs(existe - noExiste) < 40, `diferencia ${Math.abs(existe - noExiste)} ms`);
});

test("O-2: guardia — pedirMiLink hace las mismas lecturas exista o no, con piso, y lo que sólo pasa si existe va después de responder", async () => {
  const link = cuerpoDe(await fuenteAcciones(), "pedirMiLink");
  assert.match(link, /conPisoDeTiempo\(PISO_PEDIR_LINK_MS,/);
  assert.match(link, /alumnoId: alumno\?\.id \?\? "sin-alumno"/, "la consulta de «ya pedido» corre también si no hay alumno");
  assert.match(link, /after\(async \(\) => \{/);
  // El aviso al profe y el WhatsApp no se esperan antes de responder.
  const antesDelAfter = link.slice(0, link.indexOf("after("));
  assert.doesNotMatch(antesDelAfter, /avisarAlProfe\(|notificador\.enviar\(|auditPublic\(/);
});

// ── O-6: freno de abuso ─────────────────────────────────────────────────────

test("O-6: guardia — recordarToken frena por IP antes de leer la base; el link público vence sólo lo del alumno y con freno", async () => {
  const recordar = cuerpoDe(await fuenteAcciones(), "recordarToken");
  const iFreno = recordar.indexOf("frenoDeRecordar.blocked(");
  assert.ok(iFreno > 0, "hay freno");
  assert.ok(iFreno < recordar.indexOf("prisma.padelAlumno.findFirst("), "el freno va antes de la lectura");
  assert.match(recordar, /requestIp\(\)/, "por IP");
  const datos = (await import("node:fs")).readFileSync(new URL("./datos.server.ts", import.meta.url), "utf8");
  const pub = datos.slice(datos.indexOf("export async function alumnoPublico("));
  assert.match(pub, /await vencerPedidosDelAlumno\(tenantId, alumno\.id, ahora\)/);
  assert.doesNotMatch(pub, /await vencerPedidos\(tenantId, ahora\)/, "nada de UPDATE de todo el negocio desde un link público");
  assert.match(datos, /frenoDeVencerPublico = createRateLimiter\(\{ max: 1, windowMs: 60_000 \}\)/);
  assert.match(pub, /estadoEnPantalla\(/, "lo que se muestra sale bien aunque el freno salte");
});

// ── M-003: «Mis clases» mínimo (la pantalla propia es T3C) ──────────────────

test("M-003: «Mis clases» lleva a la vista del alumno con la cookie; sin cookie (o link renovado), a «Pedí tu link»", async () => {
  assert.equal(destinoMisClases(JUAN), `/alumno/${JUAN}`);
  assert.equal(destinoMisClases(null), "/clases?link=1");
  assert.equal(destinoMisClases(undefined), "/clases?link=1");
  assert.equal(destinoMisClases("../etc/passwd"), "/clases?link=1");
  const { readFileSync } = await import("node:fs");
  const ruta = readFileSync(new URL("../../app/mis-clases/route.ts", import.meta.url), "utf8");
  assert.match(ruta, /leerTokenCookie\(\)/);
  assert.match(ruta, /where: \{ tenantId, token \}/, "el token tiene que existir EN ESTE negocio");
  assert.match(ruta, /destinoMisClases\(vigente \? token : null\)/);
  assert.match(ruta, /freno\.blocked\(/);
});
