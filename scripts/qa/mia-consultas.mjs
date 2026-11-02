// Prueba de las consultas de potenciales clientes contra la demo: formulario público, escalamiento, bandeja, respuesta, permisos y lead.
//   node scripts/qa/mia-consultas.mjs
import { abrir, entrar } from "./mia-base.mjs";

const fallas = [];
const ok = (cond, texto) => {
  console.log(`${cond ? "✔" : "✖"} ${texto}`);
  if (!cond) fallas.push(texto);
};

const n = await abrir();
const errores = [];
const admin = await entrar(n, "admin", errores);
const diseno = await entrar(n, "diseno", errores);
const marca = Date.now().toString(36);

// El formulario público se llama como lo haría un navegador cualquiera, sin sesión.
const publica = await (await n.newContext({ baseURL: admin.url().split("/admin")[0] })).newPage();
await publica.goto("/consulta");
const enviar = (cuerpo) =>
  publica.evaluate(async (c) => {
    const r = await fetch("/api/consultas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, cuerpo);

ok((await publica.getByRole("button", { name: "Enviar consulta" }).count()) === 1, "la página pública /consulta muestra el formulario");

// Validaciones
ok((await enviar({ mensaje: "hola" })).status === 400, "una consulta corta y sin contacto se rechaza");
ok((await enviar({ mensaje: "Quiero un stand para la expo", email: "no-es-mail" })).status === 400, "un mail inválido se rechaza");
ok((await enviar({ mensaje: "Quiero un stand para la expo", telefono: "123" })).status === 400, "un teléfono que no se entiende se rechaza");
const trampa = await enviar({ mensaje: `Soy un bot ${marca}`, email: "bot@ejemplo.com", sitio: "http://spam" });
ok(trampa.status === 200 && trampa.json?.ok === true, "el campo trampa responde bien pero no guarda nada (se comprueba abajo)");

// Una consulta normal y una que hay que escalar
const normal = await enviar({ nombre: `Ana ${marca}`, empresa: "Marca de prueba SA", email: "ana@ejemplo.com", telefono: "11 2682-3872", mensaje: `Hola, queremos un stand de 6x4 en una expo en Córdoba. ${marca}` });
ok(normal.status === 200 && normal.json?.ok === true && !("id" in (normal.json ?? {})), "una consulta normal se recibe y no devuelve datos internos");
const urgente = await enviar({ nombre: `Beto ${marca}`, telefono: "1126823872", mensaje: `Estoy muy molesto, nadie me contesta y necesito que me llame alguien. ${marca}` });
ok(urgente.status === 200, "una consulta urgente también se recibe");

// Bandeja
await admin.goto("/admin/proyectos/consultas");
await admin.waitForLoadState("networkidle");
await admin.waitForTimeout(1500);
let cuerpo = await admin.locator("main").innerText();
ok(cuerpo.includes(`Ana ${marca}`) || cuerpo.includes("Marca de prueba SA"), "la consulta normal aparece en la bandeja");
ok(cuerpo.includes(`Beto ${marca}`), "la consulta urgente aparece en la bandeja");
ok(!cuerpo.includes(`Soy un bot ${marca}`), "la del bot no se guardó");
ok(/Hay que atenderla ya/.test(cuerpo), "la urgente se marca «Hay que atenderla ya»");
ok(/Se está calificando/.test(cuerpo), "la normal queda «Se está calificando»");

await admin.goto("/admin/proyectos");
await admin.waitForLoadState("networkidle");
await admin.waitForTimeout(1500);
ok(/Consultas/.test(await admin.locator("main").innerText()), "Proyectos tiene el acceso a Consultas con el contador");

// Detalle de la normal
await admin.goto("/admin/proyectos/consultas");
await admin.waitForLoadState("networkidle");
await admin.waitForTimeout(1000);
await admin.locator("a", { hasText: "Marca de prueba SA" }).first().click();
await admin.waitForURL(/consultas\/c/);
await admin.waitForLoadState("networkidle");
await admin.waitForTimeout(1500);
cuerpo = await admin.locator("main").innerText();
ok(/Respuesta automática/.test(cuerpo), "el detalle muestra el acuse de recibo automático");
ok(/¿Qué tipo de evento|¿Para qué fecha|¿En qué lugar/.test(cuerpo), "el acuse trae las preguntas de calificación");
ok(!/\$|pesos|dólares/i.test(cuerpo.split("Conversación")[1] ?? ""), "la conversación no menciona importes");
ok(/No salió: no hay mail conectado/.test(cuerpo), "sin mail conectado se dice la verdad: no salió");
ok(/Stand \/ Feria \(inferido\)/.test(cuerpo.replace(/\s+/g, " ")) || /Stand \/ Feria/.test(cuerpo), "el tipo de evento se dedujo y está marcado como inferido");
ok(/\(indispensable\)/.test(cuerpo), "lo indispensable que falta se marca");
ok((await admin.locator('a[href^="https://wa.me/5491126823872"]').count()) >= 1, "el teléfono se normaliza y lleva a WhatsApp");

// El agente sin IA conectada: lo dice, no inventa
await admin.getByRole("button", { name: "Pedirle un borrador al agente" }).click();
await admin.waitForTimeout(2500);
ok(/Falta conectar la IA/.test(await admin.locator("main").innerText()), "sin IA conectada el agente avisa que falta conectarla");

// Respuesta de una persona
await admin.getByLabel("Tu respuesta").fill("Hola Ana, gracias por escribirnos. Una persona del equipo te llama mañana para ver los detalles.");
await admin.getByRole("button", { name: /Registrar respuesta|Enviar respuesta/ }).click();
await admin.waitForTimeout(2500);
cuerpo = await admin.locator("main").innerText();
ok(/Equipo · /.test(cuerpo) && /te llama mañana/.test(cuerpo), "la respuesta de la persona queda en la conversación con su autor");
ok((await admin.getByRole("link", { name: "Abrir WhatsApp con este texto" }).count()) === 1, "se ofrece mandarla por WhatsApp con el texto");

// Permisos: Diseño ve pero no responde
await diseno.goto(admin.url());
await diseno.waitForLoadState("networkidle");
await diseno.waitForTimeout(1500);
cuerpo = await diseno.locator("main").innerText();
ok(/Tu rol puede ver las consultas pero no responderlas/.test(cuerpo), "Diseño puede ver la consulta pero no tiene acciones");
ok((await diseno.getByRole("button", { name: /Convertir en lead|Registrar respuesta|Enviar respuesta/ }).count()) === 0, "Diseño no ve botones de acción");

// Convertir en lead
await admin.getByRole("button", { name: "Convertir en lead" }).click();
await admin.waitForURL((u) => !u.pathname.includes("/consultas/"), { timeout: 20000 });
await admin.waitForLoadState("networkidle");
await admin.waitForTimeout(2000);
cuerpo = await admin.locator("main").innerText();
ok(/Marca de prueba SA/.test(cuerpo), "se creó el proyecto con el nombre del cliente");
ok(/Consulta recibida por web/.test(cuerpo) || /Hola, queremos un stand de 6x4/.test(cuerpo) || /Lead \/ brief/.test(cuerpo), "el proyecto nuevo trae el brief de la consulta o está en «Lead / brief»");

await admin.goto("/admin/proyectos/consultas?estado=CONVERTIDA");
await admin.waitForLoadState("networkidle");
await admin.waitForTimeout(1500);
ok(/Marca de prueba SA/.test(await admin.locator("main").innerText()), "la consulta aparece en «Ya son proyectos»");

// Límite por IP: pasados 5 pedidos en 10 minutos se frena
let freno = false;
for (let i = 0; i < 8 && !freno; i++) freno = (await enviar({ mensaje: `Otra consulta de prueba ${i} ${marca}`, email: `x${i}@ejemplo.com` })).status === 429;
ok(freno, "tras varios pedidos seguidos el límite por IP frena con 429");

if (errores.length) console.log(errores.join("\n"));
await n.close();
console.log(fallas.length ? `\n✖ ${fallas.length} fallas` : "\n✔ consultas sin fallas");
process.exit(fallas.length ? 1 : 0);
