// UAT del DÍA DE TORNEO (jornada real en el local): el club arranca en blanco, los dueños (Roberto Ronco y Majo
// Gimenez) arman su PIN en la consola de configuración y dan de alta a recepción; recepción carga las 4 canchas
// completas con 4 jugadores, mucho buffet, «a cargo de» de cancha y de cargos, cierra la cancha mientras la mesa
// sigue comiendo, abre el turno siguiente, cobra de todas las formas, pide un fiado que el dueño aprueba desde su
// celular con un código, carga un pedido de la tienda que llegó por WhatsApp y cierra la caja. Se recarga y todo
// sigue. Corre contra el sitio empaquetado servido por el MISMO manejador del ERP que usa producción.
// Uso: npm run test:club-torneo [carpeta de capturas]
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { responderSitioEstatico } from "../../../../lib/sitio-estatico.ts";
import * as M from "../../../../../public/previews/breakpoint/club/motor.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const OUT = process.argv[2] ?? path.join(RAIZ, "dist/uat-torneo");
await mkdir(OUT, { recursive: true });
const filas = []; let n = 0;
const ok = (id, cond, que) => { filas.push({ id, estado: cond ? "OK" : "FALLA", que }); console.log(`${cond ? "✓" : "✗"} ${id} ${que}`); };
const srv = createServer(async (req, res) => {
  const segs = new URL(req.url, "http://x").pathname.split("/").filter(Boolean);
  const r = await responderSitioEstatico("breakpoint", segs, async (rel) => new Uint8Array(await readFile(path.join(RAIZ, rel))));
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((o) => srv.listen(0, "127.0.0.1", o));
const BASE = `http://breakpointpadel.test:${srv.address().port}`;
const ARGS = [`--host-resolver-rules=MAP breakpointpadel.test 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=${BASE}`];
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium", args: ARGS }).catch(() => chromium.launch({ args: ARGS }));
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: "America/Argentina/Buenos_Aires", acceptDownloads: true });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
// Sábado de torneo: todo el día es pico (28.000/h → turno de 90′ = 42.000; cuota por jugador 10.500).
await ctx.clock.install({ time: new Date("2026-10-17T14:50:00-03:00") });
const errores = [];
const p = await ctx.newPage();
p.on("pageerror", (e) => errores.push(e.message));
p.on("console", (m) => { if (m.type() === "error" && !/fonts|ERR_FAILED|404/.test(m.text())) errores.push(m.text()); });
const W = (ms = 250) => p.waitForTimeout(ms);
const foto = (nombre, pg = p) => pg.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${nombre}.png` });
const aviso = async () => ((await p.$("#dlg[open] #dlg-aviso")) ? (await p.textContent("#dlg-aviso")) : "") || (await p.textContent("#toasts"));
const dlgAbierto = () => p.evaluate(() => document.getElementById("dlg").open);
const cerrar = async () => { if (await dlgAbierto()) { await p.click('#dlg .dlg-h [data-a="cerrar"]').catch(() => p.keyboard.press("Escape")); await W(); } };
const estado = async () => { await W(450); return JSON.parse(await p.evaluate(() => localStorage.getItem("bp-jornada-v1"))).estado; };
const ingresos = (e) => e.caja.movimientos.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
const porMedio = (e, medio) => e.caja.movimientos.filter((m) => m.tipo === "ingreso" && m.medio === medio).reduce((s, m) => s + m.monto, 0);
const pestanas = () => p.evaluate(() => [...document.querySelectorAll('#tabs [data-a="tab"], #mas-menu [data-a="tab"]')].map((x) => x.dataset.v).sort());
async function irTab(id) {
  await cerrar();
  const vis = await p.$(`#tabs [data-a="tab"][data-v="${id}"]`);
  if (vis) await vis.click(); else { await p.click("#btn-mas"); await W(150); await p.click(`#mas-menu [data-v="${id}"]`); }
  await W(300);
}
async function desbloquear(pin, usuarioId = null) {
  if (usuarioId) { await p.click('#bloqueo [data-a="bloqueoOtro"]'); await W(150); await p.click(`#bloqueo [data-a="bloqueoUsuario"][data-v="${usuarioId}"]`); await W(150); }
  await p.fill("#bl-pin", pin); await W(400);
}
async function entrarComo(id, pin) {
  await cerrar();
  await p.click('[data-a="usuario"]'); await W();
  await p.click(`[data-a="elegirUsuario"][data-v="${id}"]`); await p.fill("#pin-usuario", pin);
  await p.click('#dlg [data-a="entrar"]'); await W(300);
}
const bloqueada = () => p.evaluate(() => document.getElementById("bloqueo").open);
async function abrirTurno(id) { await cerrar(); await irTab("agenda"); await p.click(`#app .blk[data-v="${id}"]`); await W(300); }
async function medio(m) { await p.click(`#dlg .cuenta-turno [data-a="medio"][data-v="${m}"]`); await W(100); }
async function cargar(reservaId, jugador, buscar, productoId, cant) {
  await p.check(`#jug-${jugador}`); await W(100);
  await p.fill("#bp-turno", buscar); await W(300);
  await p.click(`[data-a="elegirProducto"][data-c="turno"][data-v="${productoId}"]`); await W(150);
  await p.fill("#cant-turno", String(cant));
  await p.click(`[data-a="consumo"][data-v="${reservaId}"][data-m="cuenta"]`); await W(250);
}
async function nuevoTurno({ cancha, hora, titular, tel }) {
  await cerrar(); await irTab("agenda");
  await p.click('#app [data-a="nuevo"]:not([data-c])'); await W(300);
  await p.selectOption("#f-cancha", cancha); await W(200);
  await p.selectOption("#f-hora", String(hora)); await W(200);
  await p.fill("#f-titular", titular); await p.fill("#f-tel", tel);
  await p.click('#dlg [data-a="confirmarTurno"]'); await W(300);
  await cerrar();
  const e = await estado();
  return e.reservas.find((r) => r.titular === titular && r.canchaId === cancha && r.inicio === hora && r.estado === "reservada");
}
async function completarYAbrir(r, jugadores) {
  await abrirTurno(r.id);
  for (const nombre of jugadores) { await p.fill("#nuevo-jug", nombre); await p.click(`[data-a="sumarJugador"][data-v="${r.id}"]`); await W(200); }
  await p.click(`#dlg [data-a="checkin"][data-v="${r.id}"]`); await W(250);
}

// ═══ 0. Primer arranque: consola de configuración (dueños) ═══
await p.goto(`${BASE}/club?modo=real`); await W(800);
ok("0.consola", await p.isVisible("#t-consola") && (await pestanas()).length === 0, "Arranca en la consola de configuración (sin pestañas, sin datos)");
let e0 = await estado();
ok("0.blanco", e0.reservas.length + e0.clientes.length + e0.cuentas.length + e0.caja.movimientos.length === 0 && e0.config.modo === "real", "El club está vacío: 0 turnos, 0 clientes, 0 cuentas, caja en cero");
ok("0.duenios", JSON.stringify(e0.usuarios.map((u) => u.nombre)) === JSON.stringify(["Roberto Ronco", "Majo Gimenez"]), `Usuarios: ${e0.usuarios.map((u) => u.nombre).join(" y ")} (dueños, sin recepción todavía)`);
await p.click('[data-a="terminarConsola"]', { force: true }).catch(() => {}); await W();
ok("0.sinpin", await p.isVisible("#t-consola"), "Sin un dueño con PIN no se puede abrir el club");
await p.fill("#pi-u-rober", "57"); await p.fill("#pi2-u-rober", "75"); await p.click('[data-a="pinInicial"][data-v="u-rober"]'); await W();
ok("0.pin-distinto", /no coinciden/.test(await aviso()), "Si los dos PIN no coinciden, avisa y no guarda");
await p.fill("#pi-u-rober", "57"); await p.fill("#pi2-u-rober", "57"); await p.click('[data-a="pinInicial"][data-v="u-rober"]'); await W();
await p.fill("#pi-u-majo", "57"); await p.fill("#pi2-u-majo", "57"); await p.click('[data-a="pinInicial"][data-v="u-majo"]'); await W();
ok("0.pin-repetido", /otra persona/.test(await aviso()), "Majo no puede usar el mismo PIN que Roberto");
await p.fill("#pi-u-majo", "84"); await p.fill("#pi2-u-majo", "84"); await p.click('[data-a="pinInicial"][data-v="u-majo"]'); await W();
for (const [sel, v] of [['[data-a="contacto"][data-v="u-rober"]', "5491100000001"], ['[data-a="contacto"][data-v="u-majo"]', "5491100000002"], ['[data-a="contacto"][data-v="club"]', "5491100000009"], ['[data-a="alias"]', "bp.prueba.uat"]]) { await p.fill(`#app ${sel}`, v); await p.press(`#app ${sel}`, "Tab"); await W(200); }
const pinesRecepcion = {};
for (const nombre of ["Lu", "Caro"]) {
  await p.fill("#nu-nombre", nombre); await p.click('[data-a="altaUsuarioConsola"]'); await W();
  pinesRecepcion[nombre] = (await aviso()).match(/PIN (\d{2})/)?.[1];
}
ok("0.recepcion", /^\d{2}$/.test(pinesRecepcion.Lu ?? "") && /^\d{2}$/.test(pinesRecepcion.Caro ?? ""), `Alta de Lu y Caro en recepción: el PIN se muestra una vez (${Object.keys(pinesRecepcion).length} usuarios)`);
await foto("consola");
await p.click('[data-a="terminarConsola"]'); await W(400);
ok("0.abre", await bloqueada() && /Roberto Ronco/.test(await p.textContent("#bloqueo")) && !(await p.$("#bloqueo .demo-pins")), "«Abrir el club» → pantalla bloqueada de Roberto Ronco, sin PIN de ejemplo a la vista");
await desbloquear("57");
const dueno = await pestanas();
ok("0.dueno", !(await bloqueada()) && dueno.includes("ajustes") && dueno.includes("contenido") && dueno.includes("tablero"), `Roberto entra con su PIN y ve todo: ${dueno.join(", ")}`);
ok("0.reloj", (await p.textContent("#reloj")) === "14:50" && !(await p.isVisible('[data-a="reloj"]')), "Reloj real (14:50) y sin los botones ±30′ de la demo");
const ids = Object.fromEntries((await estado()).usuarios.map((u) => [u.nombre, u.id]));

// ═══ 1. Recepción: sábado de torneo, 4 canchas completas ═══
await entrarComo(ids.Lu, pinesRecepcion.Lu);
const rec = await pestanas();
ok("1.recepcion", JSON.stringify(rec) === JSON.stringify(["agenda", "buffet", "caja", "clientes"]), `Lu entra con su PIN y ve sólo lo de recepción: ${rec.join(", ")}`);
const GRUPOS = [
  { cancha: "c1", titular: "Tomás Medina", tel: "1155550001", jug: ["Sofía Gómez", "Lucas Ríos", "Martín Paz"] },
  { cancha: "c2", titular: "Camila Sosa", tel: "1155550002", jug: ["Valen Luna", "Fede Acosta", "Juli Vera"] },
  { cancha: "c3", titular: "Nico Herrera", tel: "1155550003", jug: ["Agus Romero", "Mati Benítez", "Flor Díaz"] },
  { cancha: "c4", titular: "Juan Pérez", tel: "1155550004", jug: ["Gonza Ortiz", "Mica Castro", "Diego Molina"] },
];
const R = {};
for (const g of GRUPOS) { R[g.cancha] = await nuevoTurno({ cancha: g.cancha, hora: 900, titular: g.titular, tel: g.tel }); await completarYAbrir(R[g.cancha], g.jug); }
let e1 = await estado();
const de15 = e1.reservas.filter((r) => r.inicio === 900);
ok("1.canchas", de15.length === 4 && de15.every((r) => r.estado === "en_cancha" && r.jugadores.length === 4 && r.precio === 42000), "4 canchas a las 15:00, 4 jugadores cada una, $42.000 el turno, todas en juego");
// Mucho buffet: por cancha 2 aguas, 2 cervezas, una picada y una milanesa (47.100).
for (const g of GRUPOS) {
  await abrirTurno(R[g.cancha].id);
  await cargar(R[g.cancha].id, 0, "agua", "p2", 2);
  await cargar(R[g.cancha].id, 1, "cerveza", "p9", 2);
  await cargar(R[g.cancha].id, 2, "picada", "k-pica", 1);
  await cargar(R[g.cancha].id, 3, "milanesa", "k-mila", 1);
}
e1 = await estado();
const tot = (id, e = e1) => M.cuentaDelTurno(e, id).totales;
ok("1.cargos", GRUPOS.every((g) => tot(R[g.cancha].id).pendiente === 89100 && tot(R[g.cancha].id).cargos === 47100), "Cada turno: cancha $42.000 + cargos $47.100 = $89.100 en un solo lugar");
ok("1.stock", e1.productos.find((x) => x.id === "p2").stock === 42 - 8 && e1.productos.find((x) => x.id === "p9").stock === 48 - 8, "Stock: agua 42 → 34, cerveza 48 → 40");
// «A cargo de» en la cancha 1: Tomás paga la cancha y los cargos de Sofía.
await abrirTurno(R.c1.id);
await p.selectOption('select[data-a="aCargo"][data-j="1"]', "0"); await W(300);
const ctaTomas = M.cuentaDeJugador(e1, M.reserva(e1, R.c1.id), 0).id;
await p.selectOption("#acc-1", ctaTomas); await W(300);
e1 = await estado();
const fila0 = M.cuentaDelTurno(e1, R.c1.id).jugadores[0];
ok("1.acargo", fila0.aPagar === 10500 * 2 + 4000 + 7600 && /Cobrar \$\s?32\.600/.test(await p.textContent('#dlg [data-a="cobrarJugador"][data-j="0"]')), "A cargo de: Tomás paga su cancha + la de Sofía + sus cargos + los de Sofía = $32.600, visible en la fila de Tomás");
await foto("cuenta-del-turno");

// ═══ 2. Termina el turno: se cierra la cancha y la mesa sigue comiendo ═══
await cerrar();
await ctx.clock.runFor(101 * 60 * 1000); await W(500);
ok("2.hora", (await p.textContent("#reloj")) === "16:31", "El reloj real avanzó a las 16:31");
ok("2.inactividad", await bloqueada(), "Después de 5 minutos sin uso la pantalla se bloqueó sola");
await desbloquear(pinesRecepcion.Lu);
await abrirTurno(R.c1.id);
await medio("efectivo");
await p.click(`#dlg [data-a="cerrarYSeguir"][data-v="${R.c1.id}"]`); await W(400);
let e2 = await estado();
const r1 = M.reserva(e2, R.c1.id);
ok("2.cerrada", r1.estado === "finalizada" && e2.luces.c1 === false && M.cobrado(r1) === 42000, "«Cobrar la cancha y cerrarla · la mesa sigue»: cobró $42.000, luz apagada, cancha libre");
ok("2.mesa", M.mesasAbiertas(e2).length === 1 && M.cuentaDelTurno(e2, R.c1.id).totales.cargos === 47100, "La mesa de la cancha 1 sigue abierta con $47.100 de cargos");
const sig = await nuevoTurno({ cancha: "c1", hora: 990, titular: "Pablo Suárez", tel: "1155550005" });
await completarYAbrir(sig, ["Lucía Torres", "Ezequiel Rojas", "Dani Navarro"]);
e2 = await estado();
ok("2.siguiente", M.reserva(e2, sig.id).estado === "en_cancha", "El turno de las 16:30 abre la cancha 1 aunque la mesa anterior siga comiendo");
await irTab("buffet");
ok("2.buffet", await p.isVisible(`[data-k="mesa-${R.c1.id}"]`), "Buffet → «Mesas que siguen cargando» muestra la mesa de Tomás");
await p.click(`[data-a="verMesa"][data-v="${R.c1.id}"]`); await W(300);
await cargar(R.c1.id, 3, "cerveza", "p9", 4);
e2 = await estado();
ok("2.sigue", M.cuentaDelTurno(e2, R.c1.id).totales.cargos === 47100 + 15200, "Con la cancha cerrada se siguen sumando cargos: 4 cervezas más → $62.300");
await foto("mesa-sigue");
const cajaAntesMesa = ingresos(e2);
await medio("mercadopago");
await p.click('#dlg [data-a="cobrarJugador"][data-j="0"]'); await W(300);
e2 = await estado();
ok("2.tomas", ingresos(e2) - cajaAntesMesa === 4000 + 7600 && porMedio(e2, "mercadopago") === 11600, "Tomás paga sus cargos y los de Sofía por Mercado Pago: $11.600");
await medio("efectivo");
await p.click(`#dlg [data-a="cerrarCargos"][data-v="${R.c1.id}"]`); await W(300);
e2 = await estado();
ok("2.cierre-mesa", ingresos(e2) - cajaAntesMesa === 62300 && M.mesasAbiertas(e2).length === 0 && M.cuentaDelTurno(e2, R.c1.id).totales.pendiente === 0, "«Cerrar los cargos» cobra el resto ($50.700) y la mesa queda cerrada: nada pendiente");

// ═══ 3. Las otras canchas: cobrar todo, por jugador y un fiado aprobado por el dueño ═══
await abrirTurno(R.c2.id);
await medio("debito");
let antes = ingresos(e2);
await p.click(`#dlg [data-a="cobrarTodo"][data-v="${R.c2.id}"]`); await W(300);
await p.click(`#dlg [data-a="cerrarYSeguir"][data-v="${R.c2.id}"]`); await W(300);
let e3 = await estado();
ok("3.todo", ingresos(e3) - antes === 89100 && M.reserva(e3, R.c2.id).estado === "finalizada" && M.cuentaDelTurno(e3, R.c2.id).totales.pendiente === 0, "Cancha 2: «Cobrar todo» $89.100 con débito y se cierra");
await abrirTurno(R.c3.id);
antes = ingresos(e3);
for (const [j, m] of [[0, "efectivo"], [1, "mercadopago"], [2, "transferencia"], [3, "debito"]]) { await medio(m); await p.click(`#dlg [data-a="cobrarJugador"][data-j="${j}"]`); await W(250); }
e3 = await estado();
ok("3.porjugador", ingresos(e3) - antes === 89100 && M.cuentaDelTurno(e3, R.c3.id).totales.pendiente === 0, "Cancha 3: cada jugador paga lo suyo (cancha + cargos) con su medio: suma $89.100");
await p.click(`#dlg [data-a="cerrarYSeguir"][data-v="${R.c3.id}"]`); await W(300);
// Cancha 4: se cobra la cancha y los cargos de los invitados; Juan quiere que le fíen lo suyo.
await abrirTurno(R.c4.id);
await medio("efectivo");
await p.click(`#dlg [data-a="cerrarYSeguir"][data-v="${R.c4.id}"]`); await W(300);
await abrirTurno(R.c4.id);
for (const j of [1, 2, 3]) { await medio("efectivo"); await p.click(`#dlg [data-a="cobrarJugador"][data-j="${j}"]`); await W(250); }
e3 = await estado();
const ctaJuan = M.cuentaDeJugador(e3, M.reserva(e3, R.c4.id), 0);
ok("3.juan", ctaJuan && M.saldoCuenta(ctaJuan) === 4000, "Juan (sin cuenta corriente) quedó debiendo sus 2 aguas: $4.000");
await abrirTurno(R.c4.id);
await p.click(`#dlg .jug-cargos [data-a="verCuenta"][data-v="${ctaJuan.id}"]`); await W(300);
ok("3.sincc", await p.isDisabled(`#dlg [data-a="cerrarCuenta"][data-m="cuenta"]`), "Sin cuenta corriente ni fiado, «Sumar a su cuenta corriente» está deshabilitado");
await p.click(`#dlg [data-a="pedirFiado"][data-v="${ctaJuan.id}"]`); await W(300);
const hrefMajo = await p.getAttribute('#dlg [data-wa-aprob="u-majo"]', "href");
const textoWa = decodeURIComponent(hrefMajo.split("?text=")[1] ?? "");
const linkAprob = textoWa.match(/https?:\/\/\S+#aprobar&\S+/)?.[0];
ok("3.whatsapp", hrefMajo.startsWith("https://wa.me/5491100000002?text=") && /Juan Pérez pide fiar \$\s?4\.000/.test(textoWa) && !!linkAprob, "El pedido sale por WhatsApp al celular de Majo con el link para aprobar");
await foto("fiado-pedido");
// El celular de Majo (otro dispositivo: sin la jornada) abre el link, pone su PIN y le sale el código.
const cel = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Argentina/Buenos_Aires" });
await cel.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const pc = await cel.newPage();
await pc.goto(linkAprob); await pc.waitForTimeout(800);
ok("3.celular", /Pedido de crédito/.test(await pc.textContent("#dlg")) && /fiarle \$\s?4\.000 a Juan Pérez/.test(await pc.textContent("#dlg")), "En el celular de Majo se abre «Lu pide fiarle $4.000 a Juan Pérez»");
await pc.click('#dlg [data-a="aprobQuien"][data-v="u-majo"]'); await pc.waitForTimeout(200);
await pc.fill("#ap-pin", "84"); await pc.click('#dlg [data-a="aprobarLink"]'); await pc.waitForTimeout(300);
const codigo = (await pc.textContent(".codigo-aprob"))?.trim();
const d = Object.fromEntries(new URLSearchParams(linkAprob.split("#aprobar&")[1]));
ok("3.codigo", codigo === M.codigoAprobacion({ pin: "84", novedadId: d.id, clienteId: d.c, monto: 4000, fecha: d.f }), `Con el PIN de Majo sale el código ${codigo}`);
await foto("celular-codigo", pc);
const scrollCel = await pc.evaluate(() => document.documentElement.scrollWidth);
ok("3.celular-390", scrollCel <= 390, `Celular 390 px sin scroll horizontal (${scrollCel})`);
await cel.close();
await p.fill("#codigo-aprob", "AAA-AAA"); await p.click('#dlg [data-a="aprobarCodigo"]'); await W();
ok("3.codigo-malo", /1 de 5/.test(await aviso()), "Un código inventado no sirve (1 de 5)");
await p.fill("#codigo-aprob", codigo.toLowerCase()); await p.click('#dlg [data-a="aprobarCodigo"]'); await W();
ok("3.aprobado", /Aprobado por Majo Gimenez/.test(await aviso()), "El código de Majo aprueba el fiado");
await p.click(`#dlg [data-a="cerrarCuenta"][data-m="cuenta"]`); await W(300);
e3 = await estado();
const juan = e3.clientes.find((c) => c.nombre === "Juan Pérez");
ok("3.cc", juan.deuda === 4000 && M.cuentaDelTurno(e3, R.c4.id).totales.pendiente === 0, "Los $4.000 pasan a la cuenta corriente de Juan y la mesa de la cancha 4 queda en cero");

// ═══ 4. Tienda: el pedido llega por WhatsApp desde el celular de un cliente ═══
const cli = await b.newContext({ viewport: { width: 390, height: 844 } });
await cli.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const pt = await cli.newPage();
pt.on("pageerror", (e) => errores.push(`tienda: ${e.message}`));
await pt.goto(`${BASE}/turnero?modo=pedido&wa=5491100000009#tienda`);
await pt.waitForSelector("#dlg-tienda[open] [data-mas]", { timeout: 10000 });
await pt.click('#dlg-tienda [data-mas="p1"]'); await pt.click('#dlg-tienda [data-mas="p4"]'); await pt.click('#dlg-tienda [data-mas="p4"]');
await pt.fill("#tienda-nombre", "Pedro Gómez"); await pt.fill("#tienda-tel", "11 5555 0006");
await pt.click("#btn-tienda-pedir");
await pt.waitForSelector("#tienda-listo:not([hidden])", { timeout: 6000 });
const hrefTienda = await pt.getAttribute("#tienda-wa", "href");
const codigoTienda = (await pt.textContent("#tienda-codigo")).trim();
const mensajeTienda = decodeURIComponent(hrefTienda.split("?text=")[1] ?? "");
ok("4.tienda", hrefTienda.startsWith("https://wa.me/5491100000009?text=") && /Total \$\s?21\.000/.test(mensajeTienda) && mensajeTienda.includes(codigoTienda), `Tienda en el celular del cliente: 1 tubo + 2 overgrips = $21.000, pedido ${codigoTienda} por WhatsApp al club`);
await foto("tienda-cliente", pt);
await cli.close();
const pedido = { mensaje: mensajeTienda, pedido: { codigo: codigoTienda } };
await irTab("buffet");
await p.click('[data-a="pegarPedido"]'); await W();
await p.fill("#pd-texto", pedido.mensaje); await p.click('#dlg [data-a="cargarPedidoPegado"]'); await W(300);
ok("4.pedido", await p.isVisible(`text=${pedido.pedido.codigo} · Pedro Gómez`), `Pedido ${pedido.pedido.codigo} pegado desde WhatsApp: aparece en «Pedidos de la tienda»`);
antes = ingresos(await estado());
await p.click('[data-a="entregarPedido"]'); await W(); await p.click('#dlg [data-a="medio"][data-v="efectivo"]'); await p.click('#dlg [data-a="confirmarEntrega"]'); await W(300);
const e4 = await estado();
ok("4.entregado", ingresos(e4) - antes === 21000 && e4.productos.find((x) => x.id === "p1").stock === 17 && e4.productos.find((x) => x.id === "p4").stock === 28, "Entregar y cobrar: caja +$21.000, tubos 18 → 17, overgrips 30 → 28");

// ═══ 5. La compu se reinicia: todo sigue y vuelve bloqueada ═══
const cajaAntes = ingresos(e4);
await p.reload(); await W(1000);
ok("5.bloqueada", await bloqueada() && /Se volvió a abrir el sistema/.test(await p.textContent("#bloqueo")), "Al recargar vuelve bloqueada: «Se volvió a abrir el sistema: poné tu PIN»");
await desbloquear(pinesRecepcion.Lu);
const e5 = await estado();
ok("5.sigue", ingresos(e5) === cajaAntes && e5.reservas.length === e4.reservas.length && M.reserva(e5, sig.id).estado === "en_cancha", `Después de recargar está todo: caja $${cajaAntes.toLocaleString("es-AR")}, ${e5.reservas.length} turnos, el de las 16:30 en juego`);
const otra = await ctx.newPage();
await otra.goto(`${BASE}/club`); await otra.waitForTimeout(800);
ok("5.otra-pestana", /ya está abierta en otra pestaña/.test(await otra.textContent("body")), "Una segunda pestaña del club avisa que la jornada ya está abierta y no pisa nada");
await otra.close();

// ═══ 6. Dueña: novedades por difusión, accesos, respaldo y cierre de caja ═══
await entrarComo(ids["Majo Gimenez"], "84");
await irTab("contenido");
await p.selectOption("#df-tipo", "torneo"); await W(100);
await p.fill("#df-titulo", "Torneo de categorías el sábado 24"); await p.fill("#df-texto", "Inscripción $20.000 por pareja. Anotate respondiendo este mensaje."); await W(500);
await p.click('[data-a="armarDifusion"]'); await W(300);
const e6 = await estado();
const dif = e6.difusiones[0];
const conCel = e6.clientes.filter((c) => c.tel).length;
ok("6.difusion", dif && dif.destinatarios.length === conCel && conCel >= 5, `Novedad «${dif?.titulo}» lista para ${dif?.destinatarios.length} clientes con celular`);
const primer = p.locator("a[data-envio]").first();
const hrefEnvio = await primer.getAttribute("href");
await primer.click({ modifiers: [] }).catch(() => {}); await W(400);
for (const pg of ctx.pages()) if (pg !== p) await pg.close();
ok("6.uno", /^https:\/\/wa\.me\/\d+\?text=/.test(hrefEnvio) && /BAJA/.test(decodeURIComponent(hrefEnvio)) && (await estado()).difusiones[0].enviados.length === 1, "Uno por uno: el link abre WhatsApp con su nombre y la baja, y queda tildado");
const [csv] = await Promise.all([p.waitForEvent("download"), p.click('[data-a="csvDifusion"]')]);
ok("6.csv", /\.csv$/.test(csv.suggestedFilename()), `Contactos para la lista de difusión: ${csv.suggestedFilename()}`);
await foto("difusion");
await irTab("ajustes");
await p.fill("#nu-nombre", "Agus (finde)"); await p.selectOption("#nu-rol", "recepcion"); await p.click('[data-a="altaUsuario"]'); await W();
await p.fill("#cf-pin", "84"); await p.click('#dlg [data-a="confirmarAltaUsuario"]'); await W(300);
const pinAgus = (await p.textContent("#dlg .codigo-aprob"))?.trim();
ok("6.alta", /^\d{2}$/.test(pinAgus ?? "") && (await estado()).usuarios.some((u) => u.nombre === "Agus (finde)" && u.rol === "recepcion"), `Majo da de alta a Agus en recepción: PIN ${pinAgus} (se ve una vez)`);
await cerrar();
const [resp] = await Promise.all([p.waitForEvent("download"), p.click('#app [data-a="respaldo"]')]);
const respaldo = JSON.parse(await readFile(await resp.path(), "utf8"));
ok("6.respaldo", respaldo.v === 1 && respaldo.estado.reservas.length === e5.reservas.length, `Respaldo descargado (${resp.suggestedFilename()}) con toda la jornada`);
// Cierre de caja: la caja de hoy (12 a 12).
await irTab("caja");
await p.click('[data-a="cerrarCaja"]'); await W();
await p.fill("#k-pin", "84"); await p.click('#dlg [data-a="aplicarCierre"]'); await W(300);
const e7 = await estado();
ok("6.caja", e7.caja.cierres.length === 1, "Majo cierra la caja del día con su PIN");
await p.click('[data-a="cerrarCaja"]'); await W();
ok("6.caja-una-vez", /ya está cerrada/.test(await p.textContent("#dlg")), "La caja no se cierra dos veces");
await cerrar();

// ═══ 7. Cuentas claras ═══
const cobradoCanchas = e7.reservas.reduce((s, r) => s + r.pagos.filter((x) => x.medio !== "monedero").reduce((t, x) => t + x.monto, 0), 0);
const cobradoCargos = e7.cuentas.reduce((s, c) => s + c.pagos.filter((x) => x.medio !== "monedero").reduce((t, x) => t + x.monto, 0), 0);
ok("7.caja", ingresos(e7) === cobradoCanchas + cobradoCargos, `La caja ($${ingresos(e7).toLocaleString("es-AR")}) es exactamente lo cobrado en canchas + cargos + tienda`);
ok("7.abiertas", e7.cuentas.filter((c) => c.estado === "abierta").every((c) => c.reservaId === sig.id || M.saldoCuenta(c) === 0), "No quedó ninguna cuenta con saldo salvo la del turno que sigue jugando");
ok("7.nada-negativo", e7.cuentas.every((c) => M.saldoCuenta(c) >= 0) && e7.productos.every((x) => x.stock == null || x.stock >= 0), "Ninguna cuenta ni stock en negativo");

// ═══ 8. Medianoche y celular ═══
await ctx.clock.setFixedTime(new Date("2026-10-18T00:30:00-03:00")); await ctx.clock.runFor(20_000); await W(500);
// El salto de reloj dispara el bloqueo por inactividad (como pasaría de verdad): se desbloquea y se mira la agenda.
let relojMedianoche = "", diaAgenda = "";
for (let i = 0; i < 4 && diaAgenda === ""; i++) {
  await W(400);
  if (await bloqueada()) await desbloquear("84");
  await irTab("agenda");
  relojMedianoche = await p.textContent("#reloj");
  diaAgenda = await p.evaluate(() => document.querySelector('#app [data-a="dia"][aria-pressed="true"]')?.dataset.v ?? "");
}
ok("8.medianoche", relojMedianoche === "00:30" && diaAgenda === "2026-10-17", `A las 00:30 la agenda sigue en el sábado (el club cierra a la 01:00): reloj ${relojMedianoche}, día «${diaAgenda.trim()}»`);
await p.setViewportSize({ width: 390, height: 844 }); await W(300);
await abrirTurno(sig.id);
const sw = await p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.getElementById("dlg").scrollWidth));
ok("8.390", sw <= 390, `Celular 390 px: la cuenta del turno sin scroll horizontal (${sw})`);
await foto("movil-cuenta-turno");

// ═══ 9. Gate B1: desde la demo (PIN de ejemplo) no se puede borrar la jornada real guardada ═══
await p.setViewportSize({ width: 1366, height: 900 }); await cerrar();
const cajaFinal = ingresos(await estado());
if (await bloqueada()) await desbloquear("84");
await irTab("ajustes");
await p.click('#app [data-a="jornada"][data-v="demo"]'); await W(); await p.fill("#cf-pin", "84"); await p.click('#dlg [data-a="confirmarJornada"]');
await p.waitForLoadState("load"); await W(1200);
await entrarComo("u-rober", "11"); await irTab("ajustes");
const enBlanco = await p.locator('#app [data-a="jornada"][data-v="blanco"]').count();
ok("9.demo-no-borra", enBlanco === 0 && await p.isVisible('#app [data-a="jornada"][data-v="retomar"]'), "En la demo, con una jornada real guardada, no aparece «Empezar en blanco»: sólo «Seguir la jornada real guardada»");
await p.click('#app [data-a="jornada"][data-v="retomar"]'); await W(); await p.fill("#cf-pin", "11"); await p.click('#dlg [data-a="confirmarJornada"]');
await p.waitForLoadState("load"); await W(1200);
ok("9.vuelve", await bloqueada() && !(await p.$("#bloqueo .demo-pins")) && ingresos(await estado()) === cajaFinal, "Volver a la jornada: queda bloqueada (con el PIN de la demo no se entra) y la caja está intacta");
await desbloquear("11");
ok("9.pin-demo", await bloqueada(), "El PIN 11 de la demo no abre la jornada real");

ok("errores", errores.length === 0, `Cero errores de consola${errores.length ? `: ${errores.slice(0, 3).join(" | ")}` : ""}`);
await writeFile(`${OUT}/resultado.json`, JSON.stringify({ fecha: new Date().toISOString(), filas }, null, 2));
const malas = filas.filter((f) => f.estado !== "OK");
console.log(`\nRESUMEN ${filas.length - malas.length}/${filas.length} OK`);
await b.close(); srv.close();
process.exit(malas.length ? 1 : 0);
