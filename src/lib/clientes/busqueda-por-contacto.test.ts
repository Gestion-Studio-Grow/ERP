// La regla única de búsqueda por teléfono/mail (casilla 5) y su guardián: ningún buscador decide solo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { criterioDeContacto, sqlPorContacto, wherePorContacto } from "./busqueda-por-contacto";

test("con permiso: texto tal cual, dígitos seguidos, clave nacional y número local", () => {
  const c = criterioDeContacto("+54 9 11 4000-7919", true);
  assert.equal(c.modo, "completo");
  if (c.modo !== "completo") return;
  assert.equal(c.crudo, "+54 9 11 4000-7919");
  assert.deepEqual(c.digitos, ["5491140007919", "1140007919", "40007919"]);
  const where = wherePorContacto(c);
  assert.deepEqual(where, [
    { phone: { contains: "+54 9 11 4000-7919" } },
    { phone: { contains: "5491140007919" } },
    { phone: { contains: "1140007919" } },
    { phone: { contains: "40007919" } },
  ]);
  // El mail sólo cuando el buscador lo pide.
  assert.ok(!JSON.stringify(where).includes("email"));
  assert.ok(JSON.stringify(wherePorContacto(c, { conMail: true })).includes('"email"'));
});

test("con permiso: un tramo corto sigue valiendo (lo de siempre); sin dígitos no se busca por teléfono pero sí por mail", () => {
  const corto = criterioDeContacto("40", true);
  assert.equal(corto.modo, "completo");
  if (corto.modo === "completo") assert.deepEqual(corto.digitos, []);
  assert.deepEqual(wherePorContacto(corto), [{ phone: { contains: "40" } }]);
  const letras = criterioDeContacto("ana@mail.com", true);
  assert.deepEqual(wherePorContacto(letras), []);
  assert.deepEqual(wherePorContacto(letras, { conMail: true }), [{ email: { contains: "ana@mail.com", mode: "insensitive" } }]);
  assert.equal(sqlPorContacto(letras).sql.trim(), "FALSE");
  assert.equal(criterioDeContacto("   ", true).modo, "ninguno");
});

test("sin permiso: sólo los últimos 4 completos; nunca un tramo del medio ni el mail", () => {
  for (const q of ["5555-12", "555512", "11555", "5555 1234", "123", "12345", "valeria@mail.com"]) {
    const c = criterioDeContacto(q, false);
    assert.equal(c.modo, "ninguno", `«${q}» no busca por contacto`);
    assert.deepEqual(wherePorContacto(c, { conMail: true }), []);
  }
  const c = criterioDeContacto(" 12-34 ", false);
  assert.deepEqual(c, { modo: "ultimos4", cuatro: "1234" });
  assert.deepEqual(wherePorContacto(c, { conMail: true }), [{ phone: { endsWith: "1234" } }]);
});

test("acepta la sesión además del booleano (sin sesión, cerrado)", () => {
  assert.equal(criterioDeContacto("5555-12", null).modo, "ninguno");
  assert.equal(criterioDeContacto("5555-12", { role: "OWNER", overrides: [] }).modo, "completo");
  assert.equal(criterioDeContacto("5555-12", { role: "RECEPTION", overrides: [{ capability: "clients:contact", allowed: false }] }).modo, "ninguno");
});

test("SQL: cada modo arma su expresión y «ninguno» es FALSE (se puede sumar a un OR)", () => {
  const sin = sqlPorContacto(criterioDeContacto("5555-12", false));
  assert.equal(sin.sql.trim(), "FALSE");
  const cuatro = sqlPorContacto(criterioDeContacto("1234", false));
  assert.match(cuatro.sql, /regexp_replace\(COALESCE\("phone", ''\), '\[\^0-9\]', '', 'g'\) LIKE/);
  assert.deepEqual(cuatro.values, ["%1234"]);
  const raro = sqlPorContacto(criterioDeContacto("50%_", true));
  assert.deepEqual(raro.values, ["%50\\%\\_%"], "lo tipeado se escapa para LIKE; con 2 dígitos no hay variante por dígitos");
  const con = sqlPorContacto(criterioDeContacto("11 5555", true));
  assert.deepEqual(con.values, ["%11 5555%", "%115555%"]);
  assert.ok(con.sql.startsWith("(") && con.sql.includes(" OR ") && con.sql.trimEnd().endsWith(")"));
});

// ── Guardián: la búsqueda por teléfono de clientas vive en un solo archivo ─────────────────────────
//
// Cuatro certificaciones encontraron el mismo oráculo en buscadores distintos porque cada uno armaba su
// `phone: { contains }` o su `phone LIKE`. Fuera de `busqueda-por-contacto.ts` y de los tests, cualquier
// condición sobre `phone` falla acá. Lo que no es teléfono de CLIENTA se exceptúa con el motivo escrito.
const EXCEPCIONES: Record<string, string> = {
  "src/lib/proyectos/gestion-lecturas.server.ts": "Supplier.phone: proveedores, no clientas (sin casilla 5).",
  "src/lib/proyectos/acciones-consultas.ts": "Formulario público: ata la consulta a su propia ficha por el número ENTERO; no devuelve fichas.",
};

function archivos(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === "generated" || n === "node_modules") continue;
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

test("guardián: ningún buscador arma solo la condición por teléfono", () => {
  const raiz = process.cwd();
  const prismaPhone = /\bphone"?\s*:\s*\{\s*(contains|endsWith|startsWith|search)\b/g;
  const sqlPhone = /\bphone"?\s*(NOT\s+)?I?LIKE\b/gi;
  const fallas: string[] = [];
  for (const f of archivos(join(raiz, "src"))) {
    const rel = relative(raiz, f).split("\\").join("/");
    if (rel === "src/lib/clientes/busqueda-por-contacto.ts" || rel in EXCEPCIONES) continue;
    const s = readFileSync(f, "utf8");
    for (const m of [...s.matchAll(prismaPhone), ...s.matchAll(sqlPhone)]) fallas.push(`${rel}: ${m[0]}`);
  }
  assert.deepEqual(fallas, [], "usá criterioDeContacto + wherePorContacto/sqlPorContacto (lib/clientes/busqueda-por-contacto.ts)");
});
