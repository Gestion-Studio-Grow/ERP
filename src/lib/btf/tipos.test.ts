// tipos.ts del servidor = copia exacta de los de la app (tras 2 líneas de cabecera) + la sección «Por red».
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

test("src/lib/btf/tipos.ts empieza con la copia exacta de los tipos de la app", () => {
  const leer = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
  const servidor = leer("src/lib/btf/tipos.ts").split("\n").slice(2).join("\n");
  const app = leer("celula-negocios-digitales/buscatufoto/src/lib/tipos.ts");
  assert.ok(servidor.startsWith(app), "tipos.ts del servidor divergió del de la app: resincronizar");
  assert.match(servidor.slice(app.length), /^\n\/\/ ── Por red/);
});
