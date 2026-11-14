// ============================================================================
// EQUIPO DE AGENTES · guardia estática del código del motor (03 §4.1, §6.1, §12.1).
// ============================================================================
// Recorre src/lib/agentes/ (sin los tests) y falla si aparece:
//   · SQL crudo ($executeRaw / $queryRaw y sus variantes Unsafe);
//   · `basePrisma` / `@/lib/prisma-base` (el cliente sin RLS);
//   · un import de src/lib/proyectos/ (el motor no conoce el rubro);
//   · una escritura que no sea sobre `tx.agente*` (create/update/delete/upsert…), o escrituras con `prisma.`;
//   · reloj o azar reales (`Date.now()`, `new Date()` sin argumentos, `Math.random()`);
//   · auditoría en estado.server.ts (trinquete de interruptores).
// Cada regla se prueba también contra un contraejemplo, para que la guardia no pase por estar rota.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const RAIZ = path.join(process.cwd(), "src/lib/agentes");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return archivos(p);
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

/** Saca comentarios para no marcar lo que sólo se nombra en la documentación. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const ESCRITURA = /\b(\w+)\.(\w+)\.(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\s*\(/g;

export function problemas(nombre: string, fuente: string): string[] {
  const src = sinComentarios(fuente);
  const p: string[] = [];
  if (/\$(executeRaw|queryRaw)(Unsafe)?\b/.test(src)) p.push("SQL crudo");
  if (/prisma-base|\bbasePrisma\b/.test(src)) p.push("cliente sin RLS");
  if (/from\s+["'](?:@\/lib\/proyectos|(?:\.\.\/)+proyectos)\b/.test(src)) p.push("importa proyectos");
  if (/\bDate\.now\s*\(|\bnew Date\(\s*\)|\bMath\.random\s*\(/.test(src)) p.push("reloj o azar reales");
  for (const m of src.matchAll(ESCRITURA)) {
    const [, cliente, delegado] = m;
    if (cliente !== "tx" || !/^agente[A-Z]/.test(delegado)) p.push(`escritura fuera de tx.agente*: ${cliente}.${delegado}.${m[3]}`);
  }
  if (path.basename(nombre) === "estado.server.ts" && /\baudit(Admin)?\s*\(/.test(src)) p.push("auditoría en estado.server");
  return p;
}

test("guardia: el código del motor no escribe fuera de tx.agente*, no usa SQL crudo ni reloj real", () => {
  const lista = archivos(RAIZ);
  assert.ok(lista.length >= 10, "encontró los archivos del motor");
  const encontrados = lista.flatMap((f) => problemas(f, readFileSync(f, "utf8")).map((x) => `${path.relative(RAIZ, f)}: ${x}`));
  assert.deepEqual(encontrados, []);
});

test("guardia: cada regla detecta su contraejemplo", () => {
  assert.deepEqual(problemas("x.ts", "await tx.$executeRaw`DELETE`"), ["SQL crudo"]);
  assert.deepEqual(problemas("x.ts", 'import { basePrisma } from "@/lib/prisma-base";'), ["cliente sin RLS"]);
  assert.deepEqual(problemas("x.ts", 'import { a } from "@/lib/proyectos/cuotas";'), ["importa proyectos"]);
  assert.deepEqual(problemas("x.ts", 'import { a } from "../proyectos/cuotas";'), ["importa proyectos"]);
  assert.deepEqual(problemas("x.ts", "const t = Date.now();"), ["reloj o azar reales"]);
  assert.deepEqual(problemas("x.ts", "const t = new Date();"), ["reloj o azar reales"]);
  assert.deepEqual(problemas("x.ts", "await tx.proyectoCuota.update({})"), ["escritura fuera de tx.agente*: tx.proyectoCuota.update"]);
  assert.deepEqual(problemas("x.ts", "await prisma.agentePedido.create({})"), ["escritura fuera de tx.agente*: prisma.agentePedido.create"]);
  assert.deepEqual(problemas("estado.server.ts", "await audit(tx, {})"), ["auditoría en estado.server"]);
  assert.deepEqual(problemas("x.ts", "// Date.now() sólo nombrado\nawait tx.agenteNota.createMany({ data: [] });\nconst d = new Date(x);"), []);
});
