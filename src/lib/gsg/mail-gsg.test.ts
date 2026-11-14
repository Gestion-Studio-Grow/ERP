import { test } from "node:test";
import assert from "node:assert/strict";
import { GSG_PAPEL, LOGO_GSG_ALTO_MINIMO } from "./marca-svg";
import { LOGO_MAIL_GSG, RUTA_LOGO_MAIL_GSG, htmlDePlataforma, htmlMailGsg, logoMailGsgSvg, origenPlataforma } from "./mail-gsg";

test("el logo del mail va al alto mínimo de la marca (56 px), con colores fijos sobre papel", () => {
  assert.equal(LOGO_MAIL_GSG.alto, LOGO_GSG_ALTO_MINIMO);
  assert.equal(LOGO_MAIL_GSG.ancho, 168);
  const svg = logoMailGsgSvg();
  assert.match(svg, new RegExp(`<rect [^>]*fill="${GSG_PAPEL}"`));
  assert.doesNotMatch(svg, /var\(|currentColor/);
});

test("origen de la plataforma desde APP_BASE_DOMAIN; sin variable, null", () => {
  assert.equal(origenPlataforma("gsgapp.com.ar"), "https://gsgapp.com.ar");
  assert.equal(origenPlataforma(" https://GSGapp.com.ar/ "), "https://gsgapp.com.ar");
  assert.equal(origenPlataforma(""), null);
  assert.equal(origenPlataforma(undefined), null);
});

test("el HTML lleva el logo PNG con alt y escapa el cuerpo", () => {
  const html = htmlMailGsg({ cuerpo: "Hola <b>vos</b> & co.\nSegunda línea\n\nOtro párrafo", origen: "https://gsgapp.com.ar" });
  assert.ok(html.includes(`src="https://gsgapp.com.ar${RUTA_LOGO_MAIL_GSG}"`));
  assert.ok(html.includes('alt="Gestión Studio Grow"'));
  assert.ok(html.includes('width="168" height="56"'));
  assert.ok(html.includes("Hola &lt;b&gt;vos&lt;/b&gt; &amp; co.<br>Segunda línea</p>"));
  assert.ok(html.includes(">Otro párrafo</p>"));
  assert.doesNotMatch(html, /<svg/);
});

test("sólo los mails marcados de la plataforma, y con origen, suman HTML", () => {
  assert.deepEqual(htmlDePlataforma({ cuerpo: "x" }, "https://gsgapp.com.ar"), {});
  assert.deepEqual(htmlDePlataforma({ cuerpo: "x", marcaGsg: true }, null), {});
  assert.ok(htmlDePlataforma({ cuerpo: "x", marcaGsg: true }, "https://gsgapp.com.ar").html?.includes("logo-mail.png"));
});
