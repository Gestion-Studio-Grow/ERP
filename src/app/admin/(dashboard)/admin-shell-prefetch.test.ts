// ============================================================================
// EL MENÚ DEL BACKOFFICE NO HACE PREFETCH AUTOMÁTICO (GSG-PLAT-005).
// ============================================================================
//
// Cada <Link> visible en producción pide en segundo plano el RSC de su ruta. El menú del
// backoffice muestra entre 18 y 35 links: eran 18–35 pedidos por vista, cada uno resolviendo
// negocio y sesión con 2 o 3 consultas a la base. En Next 16 (App Router), `prefetch={false}`
// corta el prefetch al entrar en pantalla Y al pasar el mouse; la navegación sigue siendo del
// lado del cliente. Este test lee el fuente de AdminShell.tsx y exige que TODO <Link> lo lleve.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FUENTE = readFileSync(fileURLToPath(new URL("./AdminShell.tsx", import.meta.url)), "utf8");

/** Cada apertura de <Link ...> con sus props, hasta el primer `>` que cierra la etiqueta. */
function aperturasDeLink(src: string): string[] {
  const out: string[] = [];
  const re = /<Link\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + 5;
    let llaves = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "{") llaves++;
      else if (c === "}") llaves--;
      else if (c === ">" && llaves === 0) break;
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
}

describe("AdminShell: links del menú sin prefetch automático", () => {
  const links = aperturasDeLink(FUENTE);

  test("están los tres links del menú (NavLinks, búsqueda, sitio público)", () => {
    assert.ok(links.length >= 3, `se esperaban al menos 3 <Link>, hay ${links.length}`);
    assert.ok(links.some((l) => l.includes("data-nav-item")), "falta el link de NavLinks");
    assert.ok(links.some((l) => l.includes('role="option"')), "falta el link de la búsqueda");
    assert.ok(links.some((l) => l.includes('href="/"')), "falta el link al sitio público");
  });

  test("todo <Link> de AdminShell lleva prefetch={false}", () => {
    const sinPrefetch = links.filter((l) => !/\bprefetch=\{false\}/.test(l));
    assert.deepEqual(
      sinPrefetch.map((l) => l.split("\n").slice(0, 3).join(" ").trim()),
      [],
      "hay <Link> que vuelven a prefetchear cada ruta del menú",
    );
  });
});
