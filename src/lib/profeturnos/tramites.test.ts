// Botón de arrepentimiento y Botón de baja de ProfeTurnos: el núcleo puro compartido con Factoque
// (src/lib/factoque-tramites.ts, producto PROFETURNOS) y las constantes del abono.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACCION_TRAMITE,
  avisoParaGsg,
  constanciaPorMail,
  FACTOQUE,
  leerFormularioTramiteProfeturnos,
  mensajeDelTramite,
  PROFETURNOS,
  usuarioDelLink,
} from "@/lib/factoque-tramites";
import { DIAS_ARREPENTIMIENTO, DIAS_PRUEBA, PRECIO_MENSUAL, precioMensualEnTexto } from "@/lib/profeturnos/planes";

const datos = { email: "profe@padel.com", usuario: "matias", motivo: "" };

test("producto: ProfeTurnos tiene su ruta y su acción de auditoría; Factoque no cambia", () => {
  assert.deepEqual(PROFETURNOS.accion, { arrepentimiento: "profeturnos.tramite.arrepentimiento", baja: "profeturnos.tramite.baja" });
  assert.equal(PROFETURNOS.rutaBase, "/profeturnos");
  assert.equal(PROFETURNOS.diasArrepentimiento, 10);
  assert.deepEqual(ACCION_TRAMITE, { arrepentimiento: "factoque.arrepentimiento", baja: "factoque.baja" });
  assert.equal(FACTOQUE.rutaBase, "/facturita");
});

test("usuario: sale del link del turnero, del dominio o escrito solo", () => {
  assert.equal(usuarioDelLink("matias"), "matias");
  assert.equal(usuarioDelLink("  Matias.gsgapp.com.ar "), "matias");
  assert.equal(usuarioDelLink("https://matias.gsgapp.com.ar/clases?x=1"), "matias");
  assert.equal(usuarioDelLink("http://www.matias-padel.com:3000/"), "matias-padel");
  assert.equal(usuarioDelLink(""), null);
  assert.equal(usuarioDelLink("no vale!"), null);
  assert.equal(usuarioDelLink("-guion"), null);
  assert.equal(usuarioDelLink(undefined), null);
});

test("formulario de ProfeTurnos: email y usuario obligatorios; motivo opcional y acotado", () => {
  assert.deepEqual(leerFormularioTramiteProfeturnos("x", "matias", ""), { ok: false, error: "Poné un email válido: ahí te mandamos la constancia.", campo: "email" });
  const sinUsuario = leerFormularioTramiteProfeturnos("a@b.com", "  ", "");
  assert.ok(!sinUsuario.ok && sinUsuario.campo === "usuario");
  assert.deepEqual(leerFormularioTramiteProfeturnos(" Profe@Padel.com ", "https://Matias.gsgapp.com.ar/clases", "  me   mudo "), {
    ok: true,
    datos: { email: "profe@padel.com", usuario: "matias", motivo: "me mudo" },
  });
  const largo = leerFormularioTramiteProfeturnos("a@b.com", "matias", "a".repeat(500));
  assert.ok(largo.ok && largo.datos.motivo.length === 300);
});

test("mensaje sin mail conectado (fail-closed): registrado y «guardá este número»", () => {
  for (const tipo of ["arrepentimiento", "baja"] as const) {
    const m = mensajeDelTramite(tipo, "registrado", false, PROFETURNOS);
    assert.match(m, /ProfeTurnos/);
    assert.match(m, /quedó registrado/);
    assert.match(m, /guardá este número/);
    assert.doesNotMatch(m, /Factoque/);
  }
  assert.match(mensajeDelTramite("arrepentimiento", "registrado", false, PROFETURNOS), /devolvemos lo que pagaste/);
  assert.match(mensajeDelTramite("baja", "registrado", false, PROFETURNOS), /72 horas/);
});

test("mensaje con mail conectado y los efectos que cablea T2: modo lectura, sin borrar datos", () => {
  assert.match(mensajeDelTramite("baja", "registrado", true, PROFETURNOS), /constancia a tu mail/);
  const baja = mensajeDelTramite("baja", "plan_a_gratis", true, PROFETURNOS);
  assert.match(baja, /no se te cobra más/);
  assert.match(baja, /modo lectura y no se borra nada/);
  assert.match(mensajeDelTramite("arrepentimiento", "ya_era_gratis", true, PROFETURNOS), /No tenías un abono activo/);
});

test("aviso a GSG y constancia: nombre de ProfeTurnos y el usuario en lugar del CUIT", () => {
  const a = avisoParaGsg("baja", "BAJ-1", datos, "registrado", PROFETURNOS);
  assert.match(a, /^ProfeTurnos · Botón de baja · trámite BAJ-1/);
  assert.match(a, /Usuario: matias/);
  assert.doesNotMatch(a, /CUIT/);
  assert.match(a, /Estado: para procesar/);
  const c = constanciaPorMail("arrepentimiento", "ARR-20261110-AB2CD", datos, "registrado", "10/11/2026, 10:00:00", PROFETURNOS);
  assert.equal(c.asunto, "ProfeTurnos · Botón de arrepentimiento · trámite ARR-20261110-AB2CD");
  assert.match(c.cuerpo, /de ProfeTurnos\./);
  assert.match(c.cuerpo, /Usuario: matias/);
  assert.match(c.cuerpo, /Gestión Studio Grow · ProfeTurnos$/);
  assert.doesNotMatch(c.cuerpo, /Factoque|guardá este número/);
});

test("planes: prueba, precio y arrepentimiento provisionales en una sola constante", () => {
  assert.equal(DIAS_PRUEBA, 14);
  assert.equal(PRECIO_MENSUAL, 12900);
  assert.equal(DIAS_ARREPENTIMIENTO, PROFETURNOS.diasArrepentimiento);
  assert.equal(precioMensualEnTexto(), "$ 12.900");
});

test("páginas legales: sello GSG y textos atados a la constante (no a un número escrito a mano)", () => {
  const raiz = "src/app/profeturnos";
  for (const p of ["terminos", "privacidad", "arrepentimiento", "baja"]) {
    assert.match(readFileSync(`${raiz}/${p}/page.tsx`, "utf8"), /generator: "Gestión Studio Grow"/, p);
  }
  const terminos = readFileSync(`${raiz}/terminos/page.tsx`, "utf8");
  assert.match(terminos, /DIAS_PRUEBA/);
  assert.match(terminos, /precioMensualEnTexto\(\)/);
  assert.match(terminos, /modo lectura/);
  assert.match(terminos, /no toca esa plata/);
  assert.doesNotMatch(terminos, /12\.?900|14 días/);
  assert.match(readFileSync(`${raiz}/MarcoLegal.tsx`, "utf8"), /Hecho por Gestión Studio Grow/);
});
