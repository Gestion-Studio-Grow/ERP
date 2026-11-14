// Entrada de tickets por canal: disparador, origen, secretos tapados y el ticket que nace. PURO.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CANAL, CANALES, TIPO } from "./config";
import {
  ASUNTO_MAX,
  DETALLE_MAX,
  TAPADO,
  esDisparador,
  origenDeCanal,
  taparSecretos,
  ticketDesdeMensaje,
  tipoDeMensaje,
} from "./canales-core";
import { venceElPara } from "./tickets-core";

const AHORA = new Date("2026-11-09T12:00:00Z");

test("config: el canal erp existe y los viejos siguen", () => {
  assert.deepEqual([...CANALES], ["pedido_cartera", "consola", "whatsapp", "mail", "erp"]);
  assert.equal(CANAL.erp, "Botón Pedir ayuda del sistema");
});

test("disparador de WhatsApp: AYUDA o #ayuda al principio, sin importar mayúsculas, tildes ni espacios", () => {
  for (const t of ["AYUDA no me factura", "ayuda", "  Ayuda: se cayó", "#ayuda", "#AYUDA!", "\n\tÁYUDA por favor", "AYÚDA", "ayuda, hola", "AYUDA\nlinea 2"]) {
    assert.equal(esDisparador("whatsapp", t), true, t);
  }
  for (const t of ["hola, ayuda", "necesito AYUDA", "ayudante", "ayudame", "#ayudas", "", "  ", "# ayuda", "ayuda1"]) {
    assert.equal(esDisparador("whatsapp", t), false, t);
  }
});

test("D1 (14/11): el mismo número nuevo hace soporte, verificación y avisos; «VERIFICAR <código>» no abre ticket", () => {
  for (const t of ["VERIFICAR 482913", "verificar 482913", "  VERIFICAR ayuda", "Verificar: 123456"]) {
    assert.equal(esDisparador("whatsapp", t), false, t);
  }
  assert.equal(esDisparador("whatsapp", "AYUDA no me llega el VERIFICAR"), true);
});

test("disparador de mail: [AYUDA] en el asunto o la etiqueta GSG/soporte", () => {
  assert.equal(esDisparador("mail", "", "[AYUDA] no anda la caja"), true);
  assert.equal(esDisparador("mail", "", "Re: [ayuda] factura"), true);
  assert.equal(esDisparador("mail", "", "[ Ayúda ] x"), true);
  assert.equal(esDisparador("mail", "", "AYUDA sin corchetes"), false);
  assert.equal(esDisparador("mail", "AYUDA en el cuerpo", "Consulta"), false);
  assert.equal(esDisparador("mail", "", "Consulta", ["Inbox", "GSG/soporte"]), true);
  assert.equal(esDisparador("mail", "", "Consulta", [" gsg/SOPORTE "]), true);
  assert.equal(esDisparador("mail", "", "Consulta", ["GSG/soporte-viejo", "soporte"]), false);
  assert.equal(esDisparador("mail", "", null, null), false);
});

test("disparador del botón erp: siempre; otro canal: nunca", () => {
  assert.equal(esDisparador("erp", ""), true);
  assert.equal(esDisparador("erp", "lo que sea"), true);
  for (const c of ["consola", "pedido_cartera", "sms", ""]) assert.equal(esDisparador(c, "AYUDA", "[AYUDA]", ["GSG/soporte"]), false, c);
});

test("origen: canal:id validado", () => {
  assert.deepEqual(origenDeCanal("whatsapp", "wamid.ABC123=="), { ok: true, valor: "whatsapp:wamid.ABC123==" });
  assert.deepEqual(origenDeCanal("mail", "<abc@mail.gmail.com>"), { ok: true, valor: "mail:<abc@mail.gmail.com>" });
  assert.equal(origenDeCanal("erp", "x".repeat(200)).ok, true);
  for (const [c, id] of [
    ["erp", "x".repeat(201)],
    ["erp", ""],
    ["erp", "con espacio"],
    ["erp", " x"],
    ["erp", "x\n"],
    ["erp", "x​y"],
    ["erp", 42],
    ["erp", null],
    ["consola", "abc"],
    ["sms", "abc"],
  ] as const) {
    assert.equal(origenDeCanal(c, id).ok, false, `${c} ${String(id)}`);
  }
});

test("secretos: contraseñas y claves con etiqueta (el valor se va, la etiqueta queda)", () => {
  const casos: [string, string][] = [
    ["contraseña: Hunter2!", "Hunter2!"],
    ["Contraseña Hunter2", "Hunter2"],
    ["CONTRASENA=abc123", "abc123"],
    ["mi clave x9y8z7 no anda", "x9y8z7"],
    ["clave fiscal: Afip2026$", "Afip2026$"],
    ["mi clave fiscal es Afip2026", "Afip2026"],
    ["mi clave de ARCA nueva es Zeta.77", "Zeta.77"],
    ["pass=qwerty", "qwerty"],
    ["password: hola mundo", "hola"],
    ["el PIN 4455", "4455"],
    ["pin:1234", "1234"],
    ["token: abcdef123456", "abcdef123456"],
    ["api key = k-998877", "k-998877"],
    ["contraseña: «con espacios adentro»", "con espacios adentro"],
    ['password "otra cosa"', "otra cosa"],
    ["cvv 123", "123"],
    ["código de seguridad: 987", "987"],
    ["clave\nSecreta99", "Secreta99"],
  ];
  for (const [entrada, secreto] of casos) {
    const r = taparSecretos(entrada);
    assert.ok(!r.texto.includes(secreto), `${entrada} → ${r.texto}`);
    assert.ok(r.texto.includes(TAPADO), entrada);
    assert.ok(r.tapados >= 1, entrada);
  }
  assert.equal(taparSecretos("contraseña: Hunter2!").texto, `contraseña: ${TAPADO}`);
});

test("secretos: frases sin secreto no se rompen; ante «:» se tapa igual (lado seguro)", () => {
  for (const t of ["olvidé la contraseña y no puedo entrar", "no me acuerdo la clave", "quiero cambiar la contraseña", "no anda la caja", ""]) {
    const r = taparSecretos(t);
    assert.equal(r.texto, t, t);
    assert.equal(r.tapados, 0, t);
  }
  assert.equal(taparSecretos("contraseña: y").tapados, 1, "con «:» lo que sigue es el secreto");
});

test("secretos: tokens con forma, aunque nadie diga «token»", () => {
  const casos = [
    "Authorization: Bearer eyAbCdEf123456.xyz",
    "usé sk-ant-api03-AbCdEfGhIjKlMn",
    "sk_live_51Habcdefghijk",
    "ghp_abcdefghijklmnopqrstuvwxyz0123",
    "xoxb-1234567890-abcdefghij",
    "AKIAABCDEFGHIJKLMNOP",
    "APP_USR-1234567890123456-abcdef",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.firma",
    "postgres://usuario:SuperClave@host/db",
  ];
  const secretos = ["eyAbCdEf123456", "AbCdEfGhIjKlMn", "51Habcdefghijk", "abcdefghijklmnopqrstuvwxyz0123", "1234567890-abcdefghij", "ABCDEFGHIJKLMNOP", "1234567890123456", "eyJzdWIi", "SuperClave"];
  casos.forEach((c, k) => {
    const r = taparSecretos(c);
    assert.ok(!r.texto.includes(secretos[k]), `${c} → ${r.texto}`);
    assert.ok(r.tapados >= 1, c);
  });
  assert.equal(taparSecretos("Bearer abcdef123456").texto, `Bearer ${TAPADO}`);
  assert.equal(taparSecretos("postgres://u:clave1@h/db").texto, `postgres://u:${TAPADO}@h/db`);
});

test("secretos: tarjetas con Luhn (con y sin separadores) y CBU/CVU de 22 dígitos", () => {
  for (const t of ["4111111111111111", "4111 1111 1111 1111", "4111-1111-1111-1111", "5500 0000 0000 0004", "378282246310005", "tarjeta 4111111111111111."]) {
    const r = taparSecretos(t);
    assert.ok(!/\d{4}/.test(r.texto), `${t} → ${r.texto}`);
    assert.equal(r.tapados, 1, t);
  }
  for (const t of ["0170099220000067797370", "CBU 0170 0992 2000 0067 7973 70", "CVU: 0000003100010000000001"]) {
    const r = taparSecretos(t);
    assert.ok(!/\d{5}/.test(r.texto.replace(/\s/g, "")), `${t} → ${r.texto}`);
    assert.equal(r.tapados, 1, t);
  }
  // 16 dígitos que NO pasan Luhn: no es tarjeta (y no se cuenta).
  assert.equal(taparSecretos("pedido 4111111111111112").tapados, 0);
  // Pegada a un CUIT por un espacio: se encuentra igual, el CUIT queda.
  const pegada = taparSecretos("20 12345678 9 4111 1111 1111 1111");
  assert.equal(pegada.texto, `20 12345678 9 ${TAPADO}`);
  // Lo corto (teléfono, CUIT, fecha, importe) queda.
  for (const t of ["11 4444-5555", "20-12345678-9", "2026-11-09", "$ 150.000"]) assert.equal(taparSecretos(t).texto, t, t);
  // Dos tarjetas: dos tapados.
  assert.equal(taparSecretos("4111111111111111 y 5500000000000004").tapados, 2);
});

test("tipo por palabras simples (sin tildes) y prioridad del tipo", () => {
  for (const t of ["no anda la caja", "NO FUNCIONA", "me da ERROR", "se cayó el sistema", "ARCA rechazó la factura", "no puedo entrar"]) assert.equal(tipoDeMensaje(t), "problema", t);
  for (const t of ["¿cómo cargo un producto?", "quiero saber el precio", ""]) assert.equal(tipoDeMensaje(t), "consulta", t);
});

test("ticket desde WhatsApp: sin el disparador, tapado, con origen y prioridad del tipo", () => {
  const r = ticketDesdeMensaje({ canal: "whatsapp", idExterno: "wamid.1", texto: "AYUDA: no anda la caja, mi clave es Caja2026", remitente: "+54 9 11 5555-0000" }, AHORA);
  assert.ok(r.ok);
  assert.equal(r.datos.tipo, "problema");
  assert.equal(r.datos.prioridad, TIPO.problema.prioridad);
  assert.equal(r.datos.canal, "whatsapp");
  assert.equal(r.datos.origenId, "whatsapp:wamid.1");
  assert.equal(r.datos.creadoPor, "cliente:whatsapp");
  assert.equal(r.datos.clienteTenantId, null);
  assert.equal(r.datos.venceEl.getTime(), venceElPara(r.datos.prioridad, AHORA).getTime());
  assert.ok(!r.datos.asunto.toUpperCase().startsWith("AYUDA"), r.datos.asunto);
  assert.ok(!JSON.stringify(r.datos).includes("Caja2026"));
  assert.ok(r.datos.detalle?.includes("+54 9 11 5555-0000"));
  assert.equal(r.tapados, 1, "el asunto sale del cuerpo: el secreto se cuenta una vez");
});

test("ticket desde WhatsApp sin texto: asunto por defecto, consulta", () => {
  const r = ticketDesdeMensaje({ canal: "whatsapp", idExterno: "w2", texto: "AYUDA", remitente: "+5411" }, AHORA);
  assert.ok(r.ok);
  assert.equal(r.datos.asunto, "Pedido de ayuda por WhatsApp");
  assert.equal(r.datos.tipo, "consulta");
  assert.equal(r.datos.prioridad, TIPO.consulta.prioridad);
  assert.equal(r.tapados, 0);
});

test("ticket desde mail: asunto sin [AYUDA], recortado; detalle recortado DESPUÉS de tapar", () => {
  const largo = "x".repeat(300);
  const r = ticketDesdeMensaje({ canal: "mail", idExterno: "<m1@x>", asunto: `[AYUDA] ${largo}`, texto: `${"a".repeat(DETALLE_MAX - 10)} 4111 1111 1111 1111`, remitente: "ana@estudio.com" }, AHORA);
  assert.ok(r.ok);
  assert.ok([...r.datos.asunto].length <= ASUNTO_MAX && !r.datos.asunto.includes("[AYUDA]"));
  assert.ok(!r.datos.detalle?.includes("4111"));
  const conEtiqueta = ticketDesdeMensaje({ canal: "mail", idExterno: "<m2@x>", asunto: "Consulta", texto: "hola", remitente: "a@b.c", etiquetas: ["GSG/soporte"] }, AHORA);
  assert.ok(conEtiqueta.ok && conEtiqueta.datos.asunto === "Consulta");
});

test("ticket desde el botón erp; vacío se rechaza", () => {
  const r = ticketDesdeMensaje({ canal: "erp", idExterno: "pedido-1", texto: "¿Cómo emito una nota de crédito?", remitente: "user:abc" }, AHORA);
  assert.ok(r.ok && r.datos.tipo === "consulta" && r.datos.creadoPor === "cliente:erp");
  const vacio = ticketDesdeMensaje({ canal: "erp", idExterno: "pedido-2", texto: "  ", remitente: "user:abc" }, AHORA);
  assert.equal(vacio.ok, false);
});

test("rechazos: sin disparador, canal ajeno, id inválido, sin remitente", () => {
  const base = { canal: "whatsapp", idExterno: "w", texto: "AYUDA x", remitente: "+54" };
  for (const m of [
    { ...base, texto: "hola" },
    { ...base, canal: "consola" },
    { ...base, idExterno: "" },
    { ...base, idExterno: "a b" },
    { ...base, remitente: " " },
    { ...base, remitente: "x".repeat(201) },
    { ...base, canal: "mail", asunto: "sin marca" },
  ]) {
    const r = ticketDesdeMensaje(m, AHORA);
    assert.equal(r.ok, false, JSON.stringify(m));
    assert.ok(!r.ok && r.motivo.length > 0);
  }
});

// ── Vuelta 1 de corrección (certificación GSG-MANT-001 T-A) ────────────────────────────────────

test("ReDoS: 100 KB de entradas patológicas se resuelven en menos de 200 ms", () => {
  const K = 100_000;
  const patologicas: Record<string, string> = {
    a: "a".repeat(K),
    esquemaSinBarra: `${"a".repeat(K)}:`,
    urlSinArroba: `x://${"u".repeat(K / 2)}:${"p".repeat(K / 2)}`,
    muchasUrls: "a://b:".repeat(K / 6),
    esquemasPegados: "a+".repeat(K / 2),
    jwtCortados: "eyJ-".repeat(K / 4),
    jwtSinPunto: `eyJ${"a".repeat(K)}`,
    etiquetas: "clave ".repeat(K / 6),
    etiquetasConRelleno: "clave es ".repeat(K / 9),
    comillasSinCierre: "clave “".repeat(K / 7),
    puntos: `clave ${".".repeat(K)}`,
    digitos: "1 ".repeat(K / 2),
    digitosConPuntos: "4.".repeat(K / 2),
    espacios: `1${" ".repeat(K)}x`,
    pem: "-----BEGIN ".repeat(K / 11),
    corchetes: "[ ".repeat(K / 2),
  };
  for (const [nombre, t] of Object.entries(patologicas)) {
    const t0 = performance.now();
    taparSecretos(t);
    ticketDesdeMensaje({ canal: "mail", idExterno: "<x@y>", asunto: `[AYUDA] ${t}`, texto: t, remitente: "a@b.c" }, AHORA);
    const ms = performance.now() - t0;
    assert.ok(ms < 200, `${nombre}: ${ms.toFixed(0)} ms`);
  }
  const t0 = performance.now();
  ticketDesdeMensaje({ canal: "whatsapp", idExterno: "w", texto: `AYUDA ${"clave: x ".repeat(110_000)}`, remitente: "+54" }, AHORA);
  assert.ok(performance.now() - t0 < 200, "1 MB por WhatsApp se recorta antes de tapar");
});

test("secretos: la puntuación separa pero no corta el tapado; frases y JSON", () => {
  const casos: [string, string[]][] = [
    ["mi clave - Hunter2x", ["Hunter2x"]],
    ["contraseña, Hunter2x", ["Hunter2x"]],
    ["la contraseña... Hunter2x", ["Hunter2x"]],
    ["clave → Hunter2x", ["Hunter2x"]],
    ["usuario y clave: juan / Hunter2x", ["juan", "Hunter2x"]],
    ["usuario y clave juan Hunter2x", ["juan", "Hunter2x"]],
    ["mi contraseña es Hola Mundo99", ["Hola", "Mundo99"]],
    ["la clave que me dieron es Hunter2x", ["Hunter2x"]],
    ['{"password":"Hunter2x"}', ["Hunter2x"]],
    ['{"user": "ana", "pass": "Hunter2x"}', ["Hunter2x"]],
    ["clave es es es es es es es es es es Hunter2x", ["Hunter2x"]],
    ["contra\u200bseña: Hunter2x", ["Hunter2x"]],
    ["mi clave -\nHunter2x", ["Hunter2x"]],
  ];
  for (const [entrada, secretos] of casos) {
    const r = taparSecretos(entrada);
    for (const s of secretos) assert.ok(!r.texto.includes(s), `${entrada} → ${r.texto}`);
    assert.ok(r.tapados >= 1, entrada);
  }
  // Lo que sigue al valor queda si es charla («y no entro»), y las frases sin secreto no se tocan.
  assert.equal(taparSecretos("mi clave es Hunter2x y no entro").texto, `mi clave es ${TAPADO} y no entro`);
  for (const t of ["olvidé la contraseña, no puedo entrar", "la contraseña no anda", "olvidé la clave y no sé qué hacer"]) {
    assert.equal(taparSecretos(t).tapados, 0, t);
  }
  // Una contraseña que empieza con puntuación se tapa entera.
  assert.ok(!taparSecretos("clave: !Abc123").texto.includes("Abc"));
  assert.ok(!taparSecretos("clave ,Abc123").texto.includes("Abc"));
});

test("secretos: tarjetas con puntos, espacios dobles, NBSP o saltos de línea; clave privada PEM", () => {
  for (const t of ["4111.1111.1111.1111", "tarjeta 4111  1111  1111  1111", "4111\u00a01111\u00a01111\u00a01111", "4111\n1111\n1111\n1111", "4111/1111/1111/1111", "4111 - 1111 - 1111 - 1111", "CBU 0170.0992.2000.0067.7973.70"]) {
    const r = taparSecretos(t);
    assert.ok(!/\d{4}/.test(r.texto), `${JSON.stringify(t)} → ${JSON.stringify(r.texto)}`);
    assert.equal(r.tapados, 1, t);
  }
  const pem = "acá va:\n-----BEGIN RSA PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\nAbCdEf==\n-----END RSA PRIVATE KEY-----\ngracias";
  const r = taparSecretos(pem);
  assert.ok(!r.texto.includes("MIIEvQ") && !r.texto.includes("AbCdEf"), r.texto);
  assert.ok(r.texto.startsWith("acá va:") && r.texto.endsWith("gracias"), r.texto);
  const sinFin = taparSecretos("-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\nAAAABG5vbmU");
  assert.ok(!sinFin.texto.includes("b3Blbn") && !sinFin.texto.includes("AAAABG"), "sin END se tapa hasta el final");
});

test("remitente con secreto se tapa (el teléfono queda); idExterno en NFC", () => {
  const r = ticketDesdeMensaje({ canal: "erp", idExterno: "p1", texto: "hola", remitente: "user clave: Hunter2x" }, AHORA);
  assert.ok(r.ok && !r.datos.detalle?.includes("Hunter2x"), JSON.stringify(r));
  const tel = ticketDesdeMensaje({ canal: "whatsapp", idExterno: "w9", texto: "AYUDA x", remitente: "5491155550000" }, AHORA);
  assert.ok(tel.ok && tel.datos.detalle?.includes("5491155550000"));
  const nfd = origenDeCanal("mail", "<cafe\u0301@x>");
  const nfc = origenDeCanal("mail", "<caf\u00e9@x>");
  assert.deepEqual(nfd, nfc);
});

// ── Recertificación de T-A: hallazgos del certificador ──────────────────────────────────────────

const X = "Hunter2Zq"; // secreto ficticio

/** Los casos de ataque del certificador: [nombre, entrada, lo que NO puede quedar en la salida]. */
const ATAQUES: [string, string, string][] = [
  ["LRM tras etiqueta", `contraseña\u200e: ${X}`, X],
  ["LRM dentro de la etiqueta", `contra\u200eseña: ${X}`, X],
  ["U+2063 tras etiqueta", `clave\u2063: ${X}`, X],
  ["CGJ dentro", `cla\u034fve: ${X}`, X],
  ["VS16 dentro", `cla\ufe0fve: ${X}`, X],
  ["clave_fiscal", `clave_fiscal: ${X}`, X],
  ["secret_key", `secret_key: ${X}`, X],
  ["JSON secret_key", `{"secret_key":"${X}"}`, X],
  ["clave-fiscal", `clave-fiscal: ${X}`, X],
  ["password1", `password1: ${X}`, X],
  ["contraseñas plural", `mis contraseñas son: ${X}`, X],
  ["claves plural", `las claves: ${X}`, X],
  ["relleno largo", `la contraseña que te pasé ayer para entrar al sistema es ${X}`, X],
  ["código por SMS", "el código que me llegó por SMS es 482913", "482913"],
  ["PGP", `-----BEGIN PGP PRIVATE KEY BLOCK-----\nlQOYBF${X}\n-----END PGP PRIVATE KEY BLOCK-----`, X],
  ["URL con barra", `postgres://u:ab/${X}@host/db`, X],
  ["JSON normal", `{"password": "${X}"}`, X],
  ["mayúsculas", `CONTRASEÑA ES ${X}`, X],
  ["NFD", `contrasen\u0303a: ${X}`, X],
  ["ZWSP", `contra\u200bseña: ${X}`, X],
  ["comillas", `clave «${X} con espacios»`, X],
  ["puntuación", `contraseña... ${X}`, X],
  ["pin", "mi pin de la tarjeta es 4821", "4821"],
  ["tarjeta con raya", "4111–1111–1111–1111", "1111–1111"],
  ["tarjeta con guion bajo", "4111_1111_1111_1111", "1111_1111"],
  ["tarjeta con comas", "4111,1111,1111,1111", "1111,1111"],
  ["tarjeta con LRM", "4111\u200e1111\u200e1111\u200e1111", "1111"],
  ["tarjeta de ancho completo", "４１１１１１１１１１１１１１１１", "１１１１"],
  ["tarjeta de ancho completo (salida ASCII)", "４１１１１１１１１１１１１１１１", "1111"],
  ["CBU con espacios", "0170099 2200000677 97370", "97370"],
  ["token npg_", "npg_aB3dE5fG7hJ9kL", "aB3dE5fG7hJ9kL"],
  ["token whsec_", "whsec_aB3dE5fG7hJ9kL1mN3pQ", "aB3dE5fG7hJ9kL1mN3pQ"],
  ["token sk_", "sk_aB3dE5fG7hJ9", "aB3dE5fG7hJ9"],
  ["token ghp_ corto", "ghp_aB3dE5fG7hJ9", "aB3dE5fG7hJ9"],
  ["token xoxe", "xoxe-1234567890-abcdef", "1234567890"],
  ["tarjeta tras una fecha", "01/07/2026 4111 1111 1111 1111", "1111 1111"],
];

test("invariante: ningún caso de ataque deja el secreto en la salida (y si se tapó, se contó)", () => {
  const fugas: string[] = [];
  for (const [nombre, entrada, secreto] of ATAQUES) {
    const r = taparSecretos(entrada);
    if (r.texto.includes(secreto) || r.tapados < 1) fugas.push(`${nombre}: ${JSON.stringify(r.texto)} (${r.tapados})`);
  }
  assert.deepEqual(fugas, []);
});

test("invariante en el ticket: el secreto no queda en asunto ni detalle cuando se cuenta tapado", () => {
  for (const [nombre, entrada, secreto] of ATAQUES) {
    const r = ticketDesdeMensaje({ canal: "whatsapp", idExterno: "w-at", texto: `AYUDA ${entrada}`, remitente: "+54 11" }, AHORA);
    assert.ok(r.ok, nombre);
    assert.ok(!JSON.stringify(r.datos).includes(JSON.stringify(secreto).slice(1, -1)), `${nombre}: ${JSON.stringify(r.datos)}`);
    assert.ok(r.tapados >= 1, nombre);
  }
});

test("etiqueta seguida de _, -, dígitos o invisibles: lo pegado que termina en «:» o «=» es separador", () => {
  assert.equal(taparSecretos(`secret_key: ${X}`).texto, `secret_key: ${TAPADO}`);
  assert.equal(taparSecretos(`clave-fiscal= ${X}`).texto, `clave-fiscal= ${TAPADO}`);
  assert.equal(taparSecretos(`contraseña\u200e: ${X}`).texto, `contraseña: ${TAPADO}`);
  assert.equal(taparSecretos(`las claves: ${X}`).texto, `las claves: ${TAPADO}`);
  // Sin «:» ni «=» la etiqueta compuesta igual tapa lo que sigue (lado seguro).
  assert.ok(!taparSecretos(`mi clave-fiscal ${X}`).texto.includes(X));
  // Un emoji con unión (ZWJ) o variante se conserva: sólo se sacan los invisibles fuera de un emoji.
  assert.equal(taparSecretos("gracias 🤦\u200d♀\ufe0f").texto, "gracias 🤦\u200d♀\ufe0f");
});

test("cópula hasta 12 palabras más adelante, en la misma oración", () => {
  assert.equal(taparSecretos(`la contraseña que te pasé ayer para entrar al sistema es ${X}`).texto, `la contraseña que te pasé ayer para entrar al sistema es ${TAPADO}`);
  // Otra oración: el «es» no es de la clave.
  assert.equal(taparSecretos("olvidé la clave. El sistema es nuevo").tapados, 0);
});

test("tipo y prioridad con el texto crudo; «clave: no puedo…» es charla, no un valor", () => {
  const r = ticketDesdeMensaje({ canal: "whatsapp", idExterno: "w-tipo", texto: "AYUDA: problema con la clave: no puedo entrar ni abrir la caja del lunes", remitente: "+54 11" }, AHORA);
  assert.ok(r.ok);
  assert.equal(r.datos.tipo, "problema");
  assert.equal(r.datos.prioridad, TIPO.problema.prioridad);
  assert.equal(r.tapados, 0);
  assert.ok(r.datos.detalle?.includes("no puedo entrar ni abrir la caja del lunes"), r.datos.detalle ?? "");
  for (const t of ["clave: no me deja entrar", "contraseña: ¿cuál era?", "clave: la olvidé"]) assert.equal(taparSecretos(t).tapados, 0, t);
  // Charla y después el valor: se busca la cópula.
  assert.ok(!taparSecretos(`clave: no puedo entrar y la que tengo es ${X}`).texto.includes(X));
  // El secreto del texto crudo no se guarda aunque decida el tipo.
  const s = ticketDesdeMensaje({ canal: "whatsapp", idExterno: "w-tipo2", texto: `AYUDA clave: error${X}`, remitente: "+54 11" }, AHORA);
  assert.ok(s.ok && !JSON.stringify(s.datos).includes(X));
  // Falsos positivos baratos.
  assert.equal(taparSecretos("el pin pad no anda").tapados, 0);
  assert.equal(taparSecretos("el código de error es 500").tapados, 0);
});

test("BAJA: tarjeta tras fecha, separadores raros, PGP, URL con barra, prefijos de token", () => {
  assert.equal(taparSecretos("01/07/2026 4111 1111 1111 1111").texto.replace(/\D/g, "").includes("1111"), false);
  assert.equal(taparSecretos("20 12345678 9 4111 1111 1111 1111").texto, `20 12345678 9 ${TAPADO}`);
  // Una lista con «, » no se junta en una tarjeta.
  assert.equal(taparSecretos("facturas 4111, 1111, 1111, 1111").tapados, 0);
  assert.equal(taparSecretos(`postgres://u:ab/${X}@host/db`).texto, `postgres://u:${TAPADO}@host/db`);
});

test("ReDoS: 1 MB de entradas patológicas por ticketDesdeMensaje en menos de 200 ms", () => {
  const MB = 1 << 20;
  const pat: Record<string, string> = {
    a: "a".repeat(MB), espacios: " ".repeat(MB), claveRep: "clave ".repeat(MB / 6), claveColon: "clave:".repeat(MB / 6),
    claveGuion: "clave_".repeat(MB / 6), claveDigito: "clave1".repeat(MB / 6), claveQuote: `clave"${" ".repeat(200)}`.repeat(MB / 206),
    digs: "1 ".repeat(MB / 2), digs2: "1.".repeat(MB / 2), digsComa: "1,".repeat(MB / 2), url: "a://b:".repeat(MB / 6),
    urlBarra: "a://b:/".repeat(MB / 7), eyJ: "eyJaaaaaaaaa.".repeat(MB / 13), pem: "-----BEGIN RSA PRIVATE KEY-----".repeat(MB / 31),
    noEsVal: "clave que ".repeat(MB / 10), charla: "clave: no ".repeat(MB / 10), codigo: "codigo que ".repeat(MB / 11),
    invisibles: "\u200d\ufe0f".repeat(MB / 2), emoji: "😀\u200d".repeat(MB / 3), relleno: `clave ${"es ".repeat(50)}`.repeat(MB / 156),
  };
  for (const [nombre, v] of Object.entries(pat)) {
    for (const campo of ["texto", "asunto", "remitente"] as const) {
      const m = { canal: "mail", idExterno: "x1", texto: "hola", asunto: "[AYUDA]", remitente: "a@b.c", etiquetas: ["GSG/soporte"] };
      m[campo] = campo === "asunto" ? `[AYUDA] ${v}` : v;
      const t0 = performance.now();
      ticketDesdeMensaje(m, AHORA);
      const ms = performance.now() - t0;
      assert.ok(ms < 200, `${nombre}/${campo}: ${ms.toFixed(0)} ms`);
    }
  }
});

// ── Escalamiento (certificación 3): criterio estructural por vocabulario, que falla cerrado ─────

test("estructural: en la línea de una etiqueta, lo que no es palabra de charla se tapa (cualquier redacción)", () => {
  const S = "Hunter2x";
  const casos = [
    `Clave de acceso a ARCA: ${S}`, `Contraseña para entrar: ${S}`, `La clave que me dieron: ${S}`, `Clave fiscal de la empresa: ${S}`,
    `Clave (ARCA): ${S}`, `Datos de acceso: juan@x.com / ${S}`, `credenciales: juan / ${S}`, `login: juan / ${S}`, `psw: ${S}`,
    `contaseña: ${S}`, `la contra es ${S}`, `${S} es la clave`, `la clave: me pide ${S}`, `clave: no sé si es ${S}`, `¿Clave? ${S}`,
    `pass [${S}]`, `DB_PASSWORD=${S}`, `la clave es la siguiente:\n${S}`, `te paso la clave\n${S}`, `clave: caja lunes ${S}`,
    `https://:${S}@host.com`, `probé con la contraseña ${S} y nada`, `clave: "${S} con no"`,
  ];
  for (const e of casos) {
    const r = taparSecretos(e);
    assert.ok(!r.texto.includes(S), `${e} → ${r.texto}`);
    assert.ok(r.tapados >= 1, e);
    const t = ticketDesdeMensaje({ canal: "whatsapp", idExterno: "w-es", texto: `AYUDA ${e}`, remitente: "+54 11" }, AHORA);
    assert.ok(t.ok && !JSON.stringify(t.datos).includes(S), e);
  }
  for (const [e, s] of [["el código es 482913", "482913"], ["2FA es 482913", "482913"], ["tarjeta vto 12/28 cod 123", "123"], ["CBU 0170099-2-2000000677-97370", "97370"]]) {
    assert.ok(!taparSecretos(e).texto.includes(s), e);
  }
  // Tras «:» o «es», palabras conocidas que no son charla también se tapan.
  assert.equal(taparSecretos("clave: caja lunes").texto, `clave: ${TAPADO}`);
  assert.equal(taparSecretos("mi clave es caja lunes").texto, `mi clave es ${TAPADO}`);
  assert.equal(taparSecretos(`La clave que me dieron: ${S}`).texto, `La clave que me dieron: ${TAPADO}`);
  assert.equal(taparSecretos(`${S} es la clave`).texto, `${TAPADO} es la clave`);
  // La charla pura queda como está.
  for (const t of ["¿cuál es la clave del wifi?", "la clave no me anda desde ayer", "no me llega el código por mail", "la contraseña es incorrecta", "el código de barras 7790001 no lee", "necesito blanquear la clave fiscal"]) {
    assert.deepEqual(taparSecretos(t), { texto: t, tapados: 0 }, t);
  }
});

test("MEDIA: «no me anda» es problema; factura, CAE y celular no se tapan; la tarjeta sí", () => {
  for (const t of ["no me anda la caja", "no me funciona el posnet", "no me factura", "se colgó todo", "se trabó la caja", "no funca"]) assert.equal(tipoDeMensaje(t), "problema", t);
  for (let k = 0; k < 500; k++) {
    const t = `Factura 00003-${String(10000000 + k * 7919).slice(-8)} CAE ${74000000000000 + k * 104729} cel +54 9 11 ${4000 + k}-${1000 + k}`;
    assert.equal(taparSecretos(t).tapados, 0, t);
  }
  assert.equal(taparSecretos("tarjeta 4111 1111 1111 1111").texto, `tarjeta ${TAPADO}`);
  assert.equal(taparSecretos("CAE 4111111111111111").tapados, 1, "16 dígitos con Luhn no son un CAE");
});
