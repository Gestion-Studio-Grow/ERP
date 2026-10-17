// UAT · Profe Matías Consoli (módulo padel-clases) — recorrido de punta a punta en Chromium,
// a 390 px (el celular del alumno y el del profe), contra la demo local con base en memoria:
//
//   node scripts/padel/demo-local.mjs                     (en otra terminal)
//   PADEL_DEMO_PASSWORD=... node .qa/padel-1510/01-uat.mjs http://matiasconsoli.localhost:3219 .qa/padel-1510/capturas
//
// "Sesión iniciada": el profe entra UNA vez por el login real, se guarda su sesión (storageState,
// fuera del repo) y todas las pantallas del profe se recorren con esa sesión, como en su Chrome.
// El alumno navega en contextos limpios, sin sesión. Cada caso queda OK/FALLA con su captura;
// cualquier error de consola del navegador cuenta como falla. La clave no se escribe en la evidencia.

import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const BASE = process.argv[2] ?? "http://matiasconsoli.localhost:3219";
const OUT = process.argv[3] ?? ".qa/padel-1510/capturas";
const CLAVE = process.env.PADEL_DEMO_PASSWORD ?? "padel-demo-2026";
const PROFE = { email: "matias@matiasconsoli.demo", clave: CLAVE };
const SESION = path.join(os.tmpdir(), `padel-uat-sesion-${process.pid}.json`);
const COMPROBANTE = path.resolve("scripts/padel/comprobante-ejemplo.jpg");
const CEL_PROFE = "11 5555-0000"; // de prueba: sólo existe en la base local
const ALUMNA = { nombre: "Valentina Ríos", tel: "11 5555-0201" };
fs.mkdirSync(OUT, { recursive: true });

// Chromium resuelve *.localhost solo; Node no. Las llamadas sin navegador van a 127.0.0.1 con el Host.
function pedir(metodo, ruta, cuerpo) {
  const u = new URL(`${BASE}${ruta}`);
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: u.port, path: u.pathname + u.search, method: metodo, headers: { Host: u.host, "Content-Type": "application/json" } },
      (res) => {
        let b = "";
        res.on("data", (d) => (b += d));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
      },
    );
    req.on("error", reject);
    if (cuerpo) req.write(JSON.stringify(cuerpo));
    req.end();
  });
}
// Avisos de consola que NO son de este módulo: se registran como observación, no como falla.
const PREEXISTENTES = [/Encountered a script tag while rendering React component/];
const observaciones = new Set();

const resultados = [];
const errores = [];
let n = 0;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

async function contexto(nombre, conSesion) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    ...(conSesion ? { storageState: SESION } : {}),
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (PREEXISTENTES.some((r) => r.test(m.text()))) return void observaciones.add(`[${nombre}] ${m.text().slice(0, 160)}`);
    errores.push(`[${nombre}] consola: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => errores.push(`[${nombre}] página: ${String(e).slice(0, 300)}`));
  return { ctx, page };
}

async function caso(titulo, fn) {
  const id = `U${String(++n).padStart(2, "0")}`;
  const antes = errores.length;
  const t0 = Date.now();
  try {
    const nota = await fn(id);
    const nuevos = errores.slice(antes);
    if (nuevos.length) throw new Error(`errores de consola: ${nuevos.join(" | ")}`);
    resultados.push({ id, titulo, ok: true, nota: nota ?? "", ms: Date.now() - t0 });
    console.log(`✅ ${id} ${titulo}${nota ? ` — ${nota}` : ""}`);
  } catch (e) {
    resultados.push({ id, titulo, ok: false, nota: String(e.message ?? e).slice(0, 500), ms: Date.now() - t0 });
    console.log(`❌ ${id} ${titulo} — ${String(e.message ?? e).slice(0, 300)}`);
  }
}

const foto = (page, id, nombre) => page.screenshot({ path: `${OUT}/${id}-${nombre}.png`, fullPage: true });
const esperar = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const sinDesborde = async (page, donde) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  esperar(w <= 391, `${donde}: se sale de la pantalla (${w}px > 390px)`);
};
// La barra de abajo con el resultado de la acción y el WhatsApp (src/app/admin/(dashboard)/clases/_aviso.tsx).
const barra = async (page, texto) => {
  const b = page.locator('[data-qa="aviso-ok"]');
  await (texto ? b.filter({ hasText: texto }) : b).waitFor();
  const wa = (await b.locator('[data-qa="avisar-alumno"]').count()) ? await b.locator('[data-qa="avisar-alumno"]').getAttribute("href") : null;
  return { wa, cerrar: () => b.locator('[data-qa="listo"]').click() };
};
const recargar = async (page, url) => {
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
};

// Contextos fijos: el profe con su sesión (después del login) y la alumna nueva.
let profe;
const alumna = await contexto("alumna", false);
let linkAlumna = "";
let pedidoUno = "";

await caso("La raíz del negocio abre el turnero; carga sin errores y sin desbordar a 390 px", async (id) => {
  const { page } = alumna;
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  esperar(new URL(page.url()).pathname === "/clases", `quedó en ${page.url()}`);
  await page.getByRole("heading", { name: "1 · ¿Qué día?" }).waitFor();
  const dias = await page.locator('[data-qa="dia"]').count();
  esperar(dias > 0, "no ofrece ningún día");
  await sinDesborde(page, "turnero");
  const m = await pedir("GET", "/clases/app.webmanifest");
  esperar(String(m.headers["content-type"]).includes("application/manifest+json"), "el manifiesto no es application/manifest+json");
  esperar(JSON.parse(m.body).start_url === "/admin/clases", "la app instalable no abre en Hoy");
  await foto(page, id, "turnero");
  return `${dias} días con lugar`;
});

await caso("El profe inicia sesión en Chrome y la sesión queda guardada", async (id) => {
  const { ctx, page } = await contexto("login", false);
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', PROFE.email);
  await page.fill('input[name="password"]', PROFE.clave);
  await Promise.all([page.waitForURL((u) => !/\/admin\/login/.test(u.pathname), { timeout: 60_000 }), page.click('button[type="submit"]')]);
  await ctx.storageState({ path: SESION });
  await ctx.close();
  profe = await contexto("profe", true);
  await recargar(profe.page, "/admin/clases");
  esperar(new URL(profe.page.url()).pathname === "/admin/clases", `con la sesión guardada no entra: ${profe.page.url()}`);
  await foto(profe.page, id, "hoy-al-entrar");
  return "sesión reutilizada en un contexto nuevo";
});

await caso("Hoy: la próxima clase arriba con sus botones, y el aviso de pendientes con su número", async (id) => {
  const { page } = profe;
  await page.locator('[data-qa="proxima"]').waitFor();
  const badge = Number(await page.locator('[data-qa="badge-pendientes"]').innerText());
  esperar(badge >= 2, `el badge dice ${badge}, se esperaban al menos 2 (pedido de Sofía + comprobante de Lucas)`);
  await page.locator('[data-qa="aviso-pendientes"]').waitFor();
  await sinDesborde(page, "hoy");
  await foto(page, id, "hoy");
  return `badge ${badge}`;
});

await caso("Configuración: el profe carga su celular para que los alumnos le avisen", async (id) => {
  const { page } = profe;
  await recargar(page, "/admin/clases/config");
  const link = await page.locator('[data-qa="link-turnero"]').innerText();
  esperar(link.endsWith("/clases"), `el link para Instagram es ${link}`);
  await page.fill('[data-qa="whatsapp-profe"]', CEL_PROFE);
  await page.click('[data-qa="guardar-config"]');
  await page.getByRole("status").filter({ hasText: "Guardado" }).waitFor();
  await sinDesborde(page, "config");
  await foto(page, id, "config");
  return link;
});

await caso("Alumna nueva pide clase en 3 pasos y recibe el botón de WhatsApp al profe y su link", async (id) => {
  const { page } = alumna;
  await recargar(page, "/clases");
  await page.locator('[data-qa="dia"]').nth(1).click();
  const hora = page.locator('[data-qa="hora"]').first();
  pedidoUno = await hora.getAttribute("data-hora");
  await hora.click();
  await page.fill("#t-nombre", ALUMNA.nombre);
  await page.fill("#t-tel", ALUMNA.tel);
  await foto(page, id, "1-completo");
  await page.click('[data-qa="pedir"]');
  await page.getByRole("heading", { name: "¡Listo! Pediste tu clase" }).waitFor();
  const wa = await page.locator('[data-qa="avisar-profe"]').getAttribute("href");
  esperar(wa?.startsWith("https://wa.me/5491155550000?text="), `el WhatsApp al profe es ${wa}`);
  esperar(decodeURIComponent(wa).includes(ALUMNA.nombre), "el mensaje al profe no dice quién pide");
  linkAlumna = await page.locator('[data-qa="mi-link"]').getAttribute("href");
  esperar(/^\/alumno\/[A-Za-z0-9_-]{20,}$/.test(linkAlumna), `link del alumno raro: ${linkAlumna}`);
  await foto(page, id, "2-listo");
  return `pidió ${pedidoUno}`;
});

await caso("Esa franja ya no se le ofrece a otro visitante", async (id) => {
  const otro = await contexto("otro", false);
  await otro.page.goto(`${BASE}/clases`, { waitUntil: "networkidle" });
  await otro.page.locator('[data-qa="dia"]').nth(1).click();
  const igual = await otro.page.locator(`[data-qa="hora"][data-hora="${pedidoUno}"]`).count();
  await foto(otro.page, id, "franja-tomada");
  await otro.ctx.close();
  esperar(igual === 0, "la franja pedida se sigue ofreciendo");
});

await caso("Tope antispam: el mismo celular no puede dejar más de 2 pedidos sin confirmar", async (id) => {
  const { page } = alumna;
  const pedir = async () => {
    await recargar(page, "/clases");
    await page.locator('[data-qa="dia"]').nth(2).click();
    await page.locator('[data-qa="hora"]').first().click();
    await page.fill("#t-nombre", ALUMNA.nombre);
    await page.fill("#t-tel", ALUMNA.tel);
    await page.click('[data-qa="pedir"]');
  };
  await pedir();
  await page.getByRole("heading", { name: "¡Listo! Pediste tu clase" }).waitFor();
  await pedir();
  // Ojo: Next tiene su propio role="alert" (el anunciador de rutas); el nuestro es el <p>.
  const alerta = page.locator('p[role="alert"]');
  await alerta.waitFor();
  const texto = await alerta.innerText();
  await foto(page, id, "tope");
  esperar(/esperando que el profe confirme/.test(texto), `mensaje: ${texto}`);
  return texto;
});

await caso("Anticipación mínima: hoy no se ofrece nada que empiece en menos de 2 horas", async (id) => {
  const { page } = alumna;
  await recargar(page, "/clases");
  const primero = page.locator('[data-qa="dia"]').first();
  if ((await primero.innerText()).trim() !== "Hoy") return "hoy no quedan franjas (no aplica)";
  await primero.click();
  const horas = await page.locator('[data-qa="hora"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-hora")));
  const limite = Date.now() + 120 * 60_000;
  const malas = horas.filter((h) => new Date(h).getTime() < limite);
  await foto(page, id, "hoy");
  esperar(malas.length === 0, `ofrece ${malas.join(", ")}`);
  return `${horas.length} franjas hoy, todas a +2 h`;
});

await caso("Pendientes: el profe confirma el pedido con un toque y le sale el WhatsApp al alumno", async (id) => {
  const { page } = profe;
  await recargar(page, "/admin/clases/pendientes");
  const tarjeta = page.locator('[data-qa="pedido"]', { hasText: ALUMNA.nombre }).first();
  await tarjeta.waitFor();
  await foto(page, id, "1-pendientes");
  await tarjeta.locator('[data-qa="confirmar"]').click();
  const { wa } = await barra(page, "Confirmada");
  // La tarjeta sale de la lista (ya no es un pedido), pero el botón verde sigue ahí.
  await page.waitForLoadState("networkidle");
  esperar((await page.locator('[data-qa="avisar-alumno"]').count()) === 1, "el botón de WhatsApp se fue con la tarjeta");
  esperar(wa?.startsWith("https://wa.me/5491155550201?text="), `WhatsApp al alumno: ${wa}`);
  esperar(/confirmo/i.test(decodeURIComponent(wa)), "el texto no confirma la clase");
  esperar(decodeURIComponent(wa).includes("/alumno/"), "el texto no lleva el link del alumno");
  await foto(page, id, "2-confirmada");
});

await caso("Pendientes: el profe rechaza el otro pedido y le avisa con el link del turnero", async (id) => {
  const { page } = profe;
  await recargar(page, "/admin/clases/pendientes");
  const tarjeta = page.locator('[data-qa="pedido"]', { hasText: ALUMNA.nombre }).first();
  await tarjeta.locator('[data-qa="rechazar"]').click();
  const { wa } = await barra(page, "Rechazada");
  esperar(decodeURIComponent(wa ?? "").includes("/clases"), `el rechazo no ofrece el turnero: ${wa}`);
  await foto(page, id, "rechazada");
});

await caso("Link del alumno: ve la clase confirmada, el alias y manda el comprobante", async (id) => {
  const { page } = alumna;
  await recargar(page, linkAlumna);
  const estado = await page.locator('[data-qa="estado"]').innerText();
  esperar(estado === "Confirmada", `estado: ${estado}`);
  esperar((await page.locator('[data-qa="alias"]').innerText()) === "ALIAS-DE-EJEMPLO", "no muestra el alias");
  await foto(page, id, "1-link");
  await page.locator('[data-qa="archivo-comprobante"]').first().setInputFiles(COMPROBANTE);
  await page.getByRole("status").filter({ hasText: "Recibido" }).waitFor();
  await page.waitForLoadState("networkidle");
  await recargar(page, linkAlumna);
  const pago = await page.locator('[data-qa="pago-estado"]').first().innerText();
  await sinDesborde(page, "link alumno");
  await foto(page, id, "2-enviado");
  esperar(pago === "Comprobante por revisar", `estado del pago: ${pago}`);
});

await caso("El profe ve la foto del comprobante y lo valida; al alumno le sale el gracias", async (id) => {
  const { page } = profe;
  await recargar(page, "/admin/clases/pendientes");
  const tarjeta = page.locator('[data-qa="comprobante"]', { hasText: ALUMNA.nombre });
  await tarjeta.locator("img").waitFor();
  await foto(page, id, "1-comprobante");
  await tarjeta.locator('[data-qa="validar"]').click();
  const { wa } = await barra(page, "Pago validado");
  esperar(/recib/i.test(decodeURIComponent(wa ?? "")), `texto: ${wa}`);
  await recargar(page, linkAlumna);
  await foto(page, id, "2-validado");
});

await caso("Hoy, entre clase y clase: valida el comprobante de la próxima, la marca dada y agenda la próxima", async (id) => {
  const { page } = profe;
  await recargar(page, "/admin/clases");
  const proxima = page.locator('[data-qa="proxima"]');
  const nombre = await proxima.locator("p.text-lg").innerText();
  const botones = await proxima.locator("button[data-qa]").evaluateAll((b) => b.map((x) => x.getAttribute("data-qa")));
  if (botones.includes("ver-comprobante")) {
    await proxima.locator('[data-qa="ver-comprobante"]').click();
    await proxima.locator("img").waitFor();
    await foto(page, id, "1-comprobante-inline");
    await proxima.locator('[data-qa="validar"]').click();
    await barra(page, "Pago validado");
    await recargar(page, "/admin/clases");
  }
  const t0 = Date.now();
  await page.locator('[data-qa="proxima"] [data-qa="dada"]').click();
  await barra(page, "Clase dada");
  await recargar(page, "/admin/clases");
  const sigue = page.locator('[data-qa="proxima"]', { hasText: nombre });
  if (await sigue.count()) {
    await sigue.locator('[data-qa="agendar-proxima"]').click();
  } else {
    const fila = page.locator('[data-qa="clase-hoy"]', { hasText: nombre });
    await fila.locator("summary").click();
    await fila.locator('[data-qa="agendar-proxima"]').click();
  }
  const { wa } = await barra(page, "Próxima agendada");
  esperar(wa?.includes("wa.me/549"), `sin WhatsApp para avisar la próxima: ${wa}`);
  const seg = ((Date.now() - t0) / 1000).toFixed(1);
  await foto(page, id, "2-dada-y-proxima");
  return `${nombre}: dada + próxima agendada en ${seg} s (incluye recargas)`;
});

await caso("Cobro en efectivo con un toque (alumno de la mañana que debía)", async (id) => {
  const { page } = profe;
  await recargar(page, "/admin/clases");
  // Juan puede estar arriba (si ya no quedan clases por dar, la "próxima" es la que falta cobrar) o en el resto del día.
  const arriba = page.locator('[data-qa="proxima"]', { hasText: "Juan Pérez" });
  let fila = arriba;
  if (!(await arriba.count())) {
    fila = page.locator('[data-qa="clase-hoy"]', { hasText: "Juan Pérez" });
    await fila.locator("summary").click();
  }
  await fila.locator('[data-qa="efectivo"]').click();
  await barra(page, "Cobrada en efectivo");
  await recargar(page, "/admin/clases");
  await foto(page, id, "efectivo");
  const txt = await page.locator("header p").first().innerText();
  esperar(/cobrado/.test(txt), `la cabecera no suma lo cobrado: ${txt}`);
  return txt;
});

let juanLink = "";
await caso("Agendar a mano (le piden en la cancha): alumno nuevo, día y hora, queda confirmada", async (id) => {
  const { page } = profe;
  // Juan va a querer repetir la semana que viene a las 8: el profe le ocupa ese horario a otro.
  const proxSemana = new Date(Date.now() + 7 * 86_400_000 - 3 * 3_600_000).toISOString().slice(0, 10);
  await recargar(page, "/admin/clases/agendar");
  await page.getByRole("button", { name: "Es alguien nuevo" }).click();
  await page.fill("#ag-nombre", "Pedro Díaz");
  await page.fill("#ag-tel", "11 5555-0301");
  await page.fill("#ag-fecha", proxSemana);
  await page.fill("#ag-hora", "08:00");
  await page.click('[data-qa="guardar-clase"]');
  await page.getByRole("status").waitFor();
  const wa = await page.locator('[data-qa="avisar-alumno"]').getAttribute("href");
  esperar(wa?.startsWith("https://wa.me/5491155550301"), `WhatsApp: ${wa}`);
  await foto(page, id, "agendada");
  return `Pedro Díaz el ${proxSemana} 08:00`;
});

await caso("El alumno repite desde su link; si la hora está tomada le ofrece alternativas y reserva una", async (id) => {
  // El link de Juan sale de la ficha (Ver su link) o del mensaje "Mandarle su link".
  const { page } = profe;
  await recargar(page, "/admin/clases/alumnos?q=Juan");
  const tarjeta = page.locator('[data-qa="alumno"]', { hasText: "Juan Pérez" });
  await tarjeta.locator('[data-qa="mandar-link"]').click();
  const { wa } = await barra(page, "Link listo");
  const m = /\/alumno\/([A-Za-z0-9_-]{20,})/.exec(decodeURIComponent(wa ?? ""));
  esperar(m, `el mensaje no trae el link: ${wa}`);
  juanLink = `/alumno/${m[1]}`;
  const juan = await contexto("juan", false);
  await juan.page.goto(`${BASE}${juanLink}`, { waitUntil: "networkidle" });
  await foto(juan.page, id, "1-link-juan");
  await juan.page.locator('[data-qa="repetir"]').click();
  await juan.page.getByRole("alert").filter({ hasText: "ya no está libre" }).waitFor();
  const alternativas = await juan.page.locator('[data-qa="alternativa"]').count();
  esperar(alternativas > 0, "no ofrece alternativas");
  await foto(juan.page, id, "2-alternativas");
  await juan.page.locator('[data-qa="alternativa"]').first().click();
  const ok = await juan.page.getByRole("status").filter({ hasText: "confirmada" }).innerText();
  await foto(juan.page, id, "3-reservada");
  await juan.ctx.close();
  return `${alternativas} alternativas · ${ok}`;
});

await caso("La alumna cancela desde su link; el horario vuelve al turnero y el profe se entera", async (id) => {
  const { page } = alumna;
  await recargar(page, linkAlumna);
  await page.locator('[data-qa="cancelar"]').click();
  await page.locator('[data-qa="cancelar-si"]').click();
  await page.waitForLoadState("networkidle");
  await recargar(page, linkAlumna);
  await foto(page, id, "1-cancelada");
  await recargar(page, "/clases");
  await page.locator('[data-qa="dia"]').nth(1).click();
  const vuelve = await page.locator(`[data-qa="hora"][data-hora="${pedidoUno}"]`).count();
  esperar(vuelve === 1, "el horario cancelado no volvió al turnero");
  await recargar(profe.page, "/admin/clases/pendientes");
  await profe.page.getByText(`${ALUMNA.nombre} canceló`).first().waitFor();
  await foto(profe.page, id, "2-profe-se-entera");
});

await caso("Bloquear un día (lluvia) y cerrar los sábados: el turnero deja de ofrecerlos", async (id) => {
  const { page } = profe;
  await recargar(page, "/clases");
  const fechas = await page.locator('[data-qa="dia"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-fecha")));
  const lluvia = fechas[fechas.length - 1];
  await recargar(page, "/admin/clases/config");
  await page.fill('[data-qa="bloqueo-fecha"]', lluvia);
  await page.click('[data-qa="bloquear"]');
  await page.getByRole("status").filter({ hasText: "Día bloqueado" }).waitFor();
  await page.fill('[data-qa="dia-6"]', "");
  await page.click('[data-qa="guardar-horarios"]');
  await page.getByRole("status").filter({ hasText: "Horarios guardados" }).waitFor();
  await foto(page, id, "1-config");
  await recargar(page, "/clases");
  const despues = await page.locator('[data-qa="dia"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-fecha")));
  const sabados = despues.filter((f) => new Date(`${f}T12:00:00Z`).getUTCDay() === 6);
  await foto(page, id, "2-turnero");
  esperar(!despues.includes(lluvia), `sigue ofreciendo el día bloqueado ${lluvia}`);
  esperar(sabados.length === 0, `sigue ofreciendo sábados: ${sabados.join(", ")}`);
  return `bloqueado ${lluvia}; sin sábados`;
});

await caso("Semana y Alumnos: se ven las clases y quién debe; todo entra en 390 px", async (id) => {
  const { page } = profe;
  await recargar(page, "/admin/clases/semana");
  const clases = await page.locator('[data-qa="clase-semana"]').count();
  esperar(clases > 0, "la semana está vacía");
  await sinDesborde(page, "semana");
  await foto(page, id, "1-semana");
  await page.getByRole("link", { name: "Siguiente →" }).click();
  await page.waitForURL(/desde=/);
  await recargar(page, "/admin/clases/alumnos");
  const alumnos = await page.locator('[data-qa="alumno"]').count();
  esperar(alumnos >= 4, `sólo ${alumnos} alumnos`);
  await sinDesborde(page, "alumnos");
  await foto(page, id, "2-alumnos");
  return `${clases} clases esta semana · ${alumnos} alumnos`;
});

await caso("Seguridad: link inválido da 404, sin sesión el panel pide login, webhook cerrado", async (id) => {
  const anon = await contexto("anon", false);
  const r404 = await anon.page.goto(`${BASE}/alumno/esto-no-es-un-token-valido-123`);
  esperar(r404.status() === 404, `link inválido dio ${r404.status()}`);
  await anon.page.goto(`${BASE}/admin/clases`, { waitUntil: "networkidle" });
  esperar(new URL(anon.page.url()).pathname === "/admin/login", `sin sesión quedó en ${anon.page.url()}`);
  await foto(anon.page, id, "login");
  const g = await pedir("GET", "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=x&hub.challenge=123");
  esperar(g.status === 503, `GET del webhook sin token configurado dio ${g.status}`);
  const p = await pedir("POST", "/api/webhooks/whatsapp", { entry: [] });
  const pj = JSON.parse(p.body);
  esperar(pj.skipped === "whatsapp-apagado", `POST del webhook apagado: ${JSON.stringify(pj)}`);
  await anon.ctx.close();
  // El 404 del navegador se loguea en consola: no cuenta como error de la app.
  errores.splice(0, errores.length, ...errores.filter((e) => !/404/.test(e)));
});

await browser.close();
try {
  fs.unlinkSync(SESION);
} catch {}

const ok = resultados.filter((r) => r.ok).length;
const informe = {
  fecha: new Date().toISOString(),
  base: BASE,
  viewport: "390x844 (móvil)",
  navegador: "Chromium (Playwright) con sesión del profe guardada y reutilizada",
  resultado: `${ok}/${resultados.length} OK`,
  casos: resultados,
  observaciones: [...observaciones],
};
fs.writeFileSync(`${OUT}/resultado.json`, JSON.stringify(informe, null, 2));
console.log(`\n${informe.resultado}`);
process.exit(ok === resultados.length ? 0 : 1);
