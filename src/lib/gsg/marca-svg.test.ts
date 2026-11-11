// La marca madre v10 «Doble G» (src/lib/gsg/marca-svg.ts): reglas de tamaño mínimo y los dos temas.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ISOTIPO_GSG,
  ISOTIPO_GSG_16,
  ISOTIPO_GSG_32,
  faviconGsgDataUri,
  faviconGsgSvg,
  geometriaIsotipoGsg,
  iconoAppGsgSvg,
  logoGsgSvg,
} from "./marca-svg";

test("isotipo: debajo de 32 px la grilla del favicon 32 y debajo de 24 la del 16", () => {
  assert.equal(geometriaIsotipoGsg(14), ISOTIPO_GSG_16);
  assert.equal(geometriaIsotipoGsg(23), ISOTIPO_GSG_16);
  assert.equal(geometriaIsotipoGsg(24), ISOTIPO_GSG_32);
  assert.equal(geometriaIsotipoGsg(31), ISOTIPO_GSG_32);
  assert.equal(geometriaIsotipoGsg(32), ISOTIPO_GSG);
});

test("logo: con nombre desde 56 px; debajo, el isotipo solo", () => {
  const logo = logoGsgSvg({ alto: 56 });
  assert.match(logo, /viewBox="0 0 300 100" width="168" height="56"/);
  assert.match(logo, /<title id="gsg-t">Gestión Studio Grow™<\/title>/);
  assert.match(logo, /fill:var\(--gsg-cobre,#C8541F\)/); // nudo y ™ en cobre, que el tema oscuro sube
  assert.ok(!/<text/.test(logo), "en curvas: no depende de una fuente");
  assert.match(logoGsgSvg({ alto: 40 }), /viewBox="0 0 100 100" width="40"/);
});

test("favicon: grilla de 32, sin fondo, claro y oscuro del sistema", () => {
  const f = faviconGsgSvg();
  assert.match(f, /viewBox='0 0 32 32'/);
  assert.match(f, /prefers-color-scheme:dark/);
  assert.ok(!/<rect/.test(f));
  assert.ok(faviconGsgDataUri().startsWith("data:image/svg+xml,"));
});

test("ícono de app: papel opaco; el maskable deja el isotipo al 50 % del lado", () => {
  assert.match(iconoAppGsgSvg(), /<rect width="1000" height="1000" fill="#F4F2EC"\/>/);
  assert.match(iconoAppGsgSvg(), /translate\(190 190\) scale\(6\.2\)/);
  assert.match(iconoAppGsgSvg({ zonaSegura: true }), /translate\(250 250\) scale\(5\)/);
});
