// Tests del núcleo del tren de releases: `npm run test:release`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CABECERA_CHANGELOG,
  codigoSalidaSmoke,
  colisionesDeMigraciones,
  evaluarSmoke,
  insertarEnChangelog,
  leerLote,
  paginasSinSello,
  parsearCommit,
  renderNotas,
  revisarChecklistPR,
  saltoDeVersion,
  siguienteVersion,
  ultimoTagSemver,
} from "./lib.mjs";

const c = (asunto, cuerpo = "", hash = "abcdef1234567890") => parsearCommit({ hash, asunto, cuerpo });

test("parsea commits convencionales con alcance, !, y BREAKING CHANGE", () => {
  assert.deepEqual(c("feat(club): PIN con hash"), {
    hash: "abcdef1234567890", tipo: "feat", alcance: "club", asunto: "PIN con hash", rompe: false, convencional: true,
  });
  assert.equal(c("fix!: cambia la API").rompe, true);
  assert.equal(c("refactor(x): algo", "texto\nBREAKING CHANGE: se va el campo").rompe, true);
  assert.equal(c("ci: workflow nuevo").tipo, "build");
  assert.equal(c("Sec: endurece").tipo, "security");
});

test("los no convencionales van a «Otros» y los merges se ignoran", () => {
  const o = c("Pedidos: el ancho del nombre arranca después");
  assert.equal(o.tipo, "otros");
  assert.equal(o.convencional, false);
  assert.equal(o.asunto, "Pedidos: el ancho del nombre arranca después");
  assert.equal(c("Merge branch 'bp-agenda' into claude/x"), null);
  assert.equal(c("Merge remote-tracking branch 'origin/a' into b"), null);
  assert.equal(c(""), null);
});

test("salto de versión: feat → minor, fix → patch, rompe → major (minor en 0.x)", () => {
  assert.equal(saltoDeVersion([c("fix: a"), c("docs: b")], "1.2.3"), "patch");
  assert.equal(saltoDeVersion([c("fix: a"), c("feat: b")], "1.2.3"), "minor");
  assert.equal(saltoDeVersion([c("feat!: b")], "1.2.3"), "major");
  assert.equal(saltoDeVersion([c("feat!: b")], "0.4.0"), "minor");
  assert.equal(saltoDeVersion([null], "1.0.0"), null);
  assert.equal(siguienteVersion("1.2.3", "major"), "2.0.0");
  assert.equal(siguienteVersion("v1.2.3", "minor"), "1.3.0");
  assert.equal(siguienteVersion("1.2.3", "patch"), "1.2.4");
  assert.throws(() => siguienteVersion("uno", "patch"));
});

test("último tag semver: ignora snapshots y tags sin v", () => {
  assert.equal(ultimoTagSemver(["snapshot/2026-07-07-f4", "v0.2.0", "v0.10.1", "1.0.0", "v0.9.9"]), "v0.10.1");
  assert.equal(ultimoTagSemver(["snapshot/x"]), null);
});

test("notas: secciones en orden, los que rompen también arriba, link al commit", () => {
  const notas = renderNotas({
    version: "0.2.0",
    fecha: "2026-10-22",
    repoUrl: "https://github.com/o/r",
    commits: [c("fix(arca): reintento", "", "1111111111"), c("feat!: flags", "", "2222222222"), c("Algo libre", "", "3333333333")],
  });
  const i = (s) => notas.indexOf(s);
  assert.ok(notas.startsWith("## 0.2.0 — 2026-10-22"));
  assert.ok(i("Cambios que rompen") < i("Novedades") && i("Novedades") < i("Arreglos") && i("Arreglos") < i("Otros cambios"));
  assert.match(notas, /- \*\*arca:\*\* reintento \(\[`11111111`\]\(https:\/\/github\.com\/o\/r\/commit\/1111111111\)\)/);
  assert.equal(renderNotas({ version: "1.0.0", fecha: "x", commits: [] }).includes("_Sin cambios._"), true);
});

test("changelog: inserta arriba, reemplaza la misma versión y es idempotente", () => {
  const n1 = renderNotas({ version: "0.1.1", fecha: "d1", commits: [c("fix: a", "", "aaaaaaaaaa")] });
  const n2 = renderNotas({ version: "0.2.0", fecha: "d2", commits: [c("feat: b", "", "bbbbbbbbbb")] });
  const uno = insertarEnChangelog("", n1, "0.1.1");
  assert.ok(uno.startsWith(CABECERA_CHANGELOG));
  const dos = insertarEnChangelog(uno, n2, "0.2.0");
  assert.ok(dos.indexOf("## 0.2.0") < dos.indexOf("## 0.1.1"));
  assert.equal(insertarEnChangelog(dos, n2, "0.2.0"), dos);
  assert.equal((dos.match(/^## /gm) ?? []).length, 2);
});

const PR_OK = `## Qué cambia
algo
## 🛡️ Gate de Excelencia
### 1. Auditoría SAP Fiori + ángulo argentino
- [x] Rol-based
- [ ] Accesibilidad — N/A: no hay UI
### 2. Sello de marca GSG
- [x] metadata.generator
### 3. Excelencia Arquitectura
- [x] Capas
### 4. Confiabilidad de Producción
- [x] Verde
`;

test("checklist del PR: 4 bloques, todo tildado o N/A", () => {
  assert.deepEqual(revisarChecklistPR(PR_OK), { ok: true, faltan: [], sinTildar: [], tildadas: 4 });
});

test("checklist del PR: falta un bloque o queda una casilla sin tildar → no pasa", () => {
  const sinSello = PR_OK.replace("### 2. Sello de marca GSG\n", "");
  assert.deepEqual(revisarChecklistPR(sinSello).faltan, ["el bloque «2. Sello de marca GSG»"]);
  const conVacia = PR_OK.replace("- [x] Capas", "- [ ] Capas");
  assert.deepEqual(revisarChecklistPR(conVacia).sinTildar, ["- [ ] Capas"]);
  assert.equal(revisarChecklistPR("").ok, false);
  // Mencionar "Sello" en el texto, no en un título, no cuenta como bloque.
  assert.equal(revisarChecklistPR(sinSello + "\nel sello está").faltan.length, 1);
});

test("sello GSG: la página o un layout ancestro tiene el generator", () => {
  const archivos = new Map([
    ["src/app/contador/layout.tsx", 'export const metadata = { generator: "Gestión Studio Grow" };'],
    ["src/app/contador/cliente/page.tsx", "export default function P() {}"],
    ["src/app/facturita/page.tsx", "metadata = { generator: 'Gestión Studio Grow' }"],
    ["src/app/admin/(dashboard)/facturacion/page.tsx", "sin sello"],
  ]);
  assert.deepEqual(
    paginasSinSello(archivos, ["src/app/contador/cliente/page.tsx", "src/app/facturita/page.tsx", "src/app/admin/(dashboard)/facturacion/page.tsx"]),
    ["src/app/admin/(dashboard)/facturacion/page.tsx"],
  );
});

test("smoke: health OK, commit distinto falla, ARCA encendida sin CRON_SECRET falla", () => {
  const sano = { status: 200, json: { status: "ok", commit: "abc12345ff", arca: { facturacion: true, modo: "homologacion", cronProtegido: true, flags: { erroresDeConfig: 0 } } } };
  assert.equal(evaluarSmoke("health", sano).nivel, "ok");
  assert.equal(evaluarSmoke("health", sano, { commit: "abc12345" }).nivel, "ok");
  assert.equal(evaluarSmoke("health", sano, { commit: "fff" }).nivel, "falla");
  const sinCron = structuredClone(sano);
  sinCron.json.arca.cronProtegido = false;
  assert.equal(evaluarSmoke("health", sinCron).nivel, "falla");
  assert.equal(evaluarSmoke("health", { status: 500 }).nivel, "falla");
});

test("smoke: ready con ARCA crítico avisa (no frena el deploy); base caída falla", () => {
  assert.equal(evaluarSmoke("ready", { status: 200, json: { status: "ready", arca: { estado: "ok", alertas: [] } } }).nivel, "ok");
  const r = evaluarSmoke("ready", { status: 200, json: { status: "ready", arca: { estado: "critico", alertas: ["cae-en-duda"] } } });
  assert.equal(r.nivel, "aviso");
  assert.match(r.texto, /cae-en-duda/);
  assert.equal(evaluarSmoke("ready", { status: 503, json: { status: "not-ready" } }).nivel, "falla");
});

test("smoke: /contador sin sesión tiene que mandar al login; 200 sin sesión es falla grave", () => {
  assert.equal(evaluarSmoke("contador", { status: 307, location: "/admin/login?next=%2Fcontador" }).nivel, "ok");
  assert.equal(evaluarSmoke("contador", { status: 200 }).nivel, "falla");
  assert.equal(evaluarSmoke("login", { status: 200 }).nivel, "ok");
  assert.equal(evaluarSmoke("facturita", { status: 200 }).nivel, "ok");
  assert.equal(evaluarSmoke("facturita", { status: 404 }).nivel, "falla");
});

test("smoke: en preview, protección y preview bloqueado son avisos; en producción, fallas", () => {
  const bloqueado = { status: 503, texto: "<title>Preview bloqueado</title>" };
  assert.equal(evaluarSmoke("ready", bloqueado, { modo: "preview" }).nivel, "aviso");
  assert.equal(evaluarSmoke("ready", bloqueado).nivel, "falla");
  assert.equal(evaluarSmoke("facturita", { status: 401 }, { modo: "preview" }).nivel, "aviso");
  assert.equal(codigoSalidaSmoke([{ nivel: "ok" }, { nivel: "aviso" }]), 0);
  assert.equal(codigoSalidaSmoke([{ nivel: "ok" }, { nivel: "falla" }]), 1);
});

test("migraciones: detecta colisiones de timestamp y lee el lote", () => {
  assert.deepEqual(
    colisionesDeMigraciones(["20260101000000_a", "20260101000000_b", "20260102000000_c", "migration_lock.toml"]),
    [["20260101000000_a", "20260101000000_b"]],
  );
  assert.deepEqual(leerLote("# comentario\n20261013120000_inmo # aditiva\n\n  20261014000000_x\nbasura"), [
    "20261013120000_inmo",
    "20261014000000_x",
  ]);
});
