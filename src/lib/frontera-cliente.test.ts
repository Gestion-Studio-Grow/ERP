// ============================================================================
// TEST — FRONTERA CLIENTE / SERVIDOR: lo que baja al navegador no arrastra código de servidor. PURO.
// ============================================================================
//
// Defensa contra la copia por ingeniería reversa: lo que corre en el servidor (Server Actions, Prisma, ARCA, cobros)
// no se puede extraer; lo que baja al navegador sí, aunque esté minificado. Este test recorre el grafo de imports
// de cada archivo `"use client"` (directos y transitivos, sin contar los `import type`) y falla si alcanza:
//   1. Código de servidor: `*.server.*`, archivos con `import "server-only"`, el cliente de Prisma o sus drivers.
//   2. Un motor de negocio fuera de su carpeta permitida. Hoy el único motor que corre en el navegador es el del
//      club (`src/lib/club/motor.mjs` y `dominio/`), y lo hace a propósito: el modo sin internet del mostrador (G9)
//      lo necesita en la compu del club. Pasarlo al servidor es el back separado (G10, PARIDAD-REACT.md). Hasta
//      entonces queda confinado a /admin/club; que lo pida otra pantalla cliente es una decisión, no un descuido.
//
// Un archivo `"use server"` corta el recorrido: al navegador baja sólo la referencia a la acción, no su código.
// Si una regla se rompe a propósito, se agrega acá con el porqué, no se apaga el test.
//
// — Elaborado por GSG

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..", "..");
const SRC = join(RAIZ, "src");
const EXTENSIONES = [".ts", ".tsx", ".mjs", ".js", ".jsx"];

/** Paquetes que sólo tienen sentido en el servidor. */
const PAQUETES_DE_SERVIDOR = [/^server-only$/, /^@prisma\//, /^@neondatabase\//, /^pg$/, /^bcrypt/];

/** Archivos de servidor por ruta (relativa al repo, con `/`). */
const RUTAS_DE_SERVIDOR = [/\.server\.[cm]?[jt]sx?$/, /^src\/generated\/prisma\//, /^src\/lib\/prisma(-base)?\.ts$/];

/** Motores de negocio y desde qué carpetas de pantallas cliente se los puede pedir. */
const MOTORES_CONFINADOS = [
  { motor: /^src\/lib\/club\/(motor\.mjs|dominio\/)/, permitido: /^src\/app\/admin\/\(dashboard\)\/club\// },
];

const aPosix = (ruta: string) => relative(RAIZ, ruta).split(sep).join("/");

function archivosDe(carpeta: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(carpeta)) {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre !== "node_modules" && nombre !== "generated") salida.push(...archivosDe(ruta));
    } else if (EXTENSIONES.some((e) => nombre.endsWith(e)) && !/\.(test|e2e)\.[cm]?[jt]sx?$/.test(nombre)) {
      salida.push(ruta);
    }
  }
  return salida;
}

const textos = new Map<string, string>();
const leer = (ruta: string) => {
  let t = textos.get(ruta);
  if (t === undefined) textos.set(ruta, (t = readFileSync(ruta, "utf8")));
  return t;
};

/** La directiva va antes de cualquier import; alcanza con mirar lo que hay antes del primer código. */
function directiva(texto: string): "client" | "server" | null {
  const sinComentarios = texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").trimStart();
  const m = /^["']use (client|server)["']/.exec(sinComentarios);
  return m ? (m[1] as "client" | "server") : null;
}

const esSoloTipos = (clausula: string) => {
  const llaves = /^\{([\s\S]*)\}$/.exec(clausula.trim());
  if (!llaves) return false;
  const nombres = llaves[1].split(",").map((n) => n.trim()).filter(Boolean);
  return nombres.length > 0 && nombres.every((n) => n.startsWith("type "));
};

/** Especificadores de los imports que existen en tiempo de ejecución. */
export function importsDeEjecucion(texto: string): string[] {
  const salida: string[] = [];
  const estaticos = /^\s*(import|export)\s+(type\s+)?([\s\S]*?)\s*from\s*["']([^"']+)["']/gm;
  for (const m of texto.matchAll(estaticos)) {
    if (m[2] || esSoloTipos(m[3])) continue;
    salida.push(m[4]);
  }
  for (const m of texto.matchAll(/^\s*import\s*["']([^"']+)["']/gm)) salida.push(m[1]);
  for (const m of texto.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) salida.push(m[1]);
  return salida;
}

function resolverLocal(desde: string, especificador: string): string | null {
  const base = especificador.startsWith("@/") ? join(SRC, especificador.slice(2)) : resolve(dirname(desde), especificador);
  const candidatos = [base, ...EXTENSIONES.map((e) => base + e), ...EXTENSIONES.map((e) => join(base, "index" + e))];
  if (/\.[cm]?js$/.test(base)) candidatos.push(...[".ts", ".tsx"].map((e) => base.replace(/\.[cm]?js$/, e)));
  return candidatos.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

interface Hallazgo { raiz: string; cadena: string[]; motivo: string }

function recorrer(raiz: string): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  const visto = new Set<string>([raiz]);
  const cola: { ruta: string; cadena: string[] }[] = [{ ruta: raiz, cadena: [aPosix(raiz)] }];
  const rel = aPosix(raiz);
  while (cola.length) {
    const { ruta, cadena } = cola.shift()!;
    for (const esp of importsDeEjecucion(leer(ruta))) {
      const local = esp.startsWith("@/") || esp.startsWith(".");
      if (!local) {
        if (PAQUETES_DE_SERVIDOR.some((r) => r.test(esp))) {
          hallazgos.push({ raiz: rel, cadena: [...cadena, esp], motivo: `paquete de servidor «${esp}»` });
        }
        continue;
      }
      const destino = resolverLocal(ruta, esp);
      if (!destino || visto.has(destino)) continue;
      visto.add(destino);
      const destRel = aPosix(destino);
      const nuevaCadena = [...cadena, destRel];
      if (directiva(leer(destino)) === "server") continue;
      if (RUTAS_DE_SERVIDOR.some((r) => r.test(destRel))) {
        hallazgos.push({ raiz: rel, cadena: nuevaCadena, motivo: "archivo de servidor" });
        continue;
      }
      for (const { motor, permitido } of MOTORES_CONFINADOS) {
        if (motor.test(destRel) && !permitido.test(rel)) {
          hallazgos.push({ raiz: rel, cadena: nuevaCadena, motivo: "motor de negocio fuera de su carpeta" });
        }
      }
      cola.push({ ruta: destino, cadena: nuevaCadena });
    }
  }
  return hallazgos;
}

const raicesCliente = () => archivosDe(SRC).filter((r) => directiva(leer(r)) === "client");

test("importsDeEjecucion: ignora los import type y toma los dinámicos", () => {
  const texto = [
    'import type { A } from "./a";',
    'import { type B, type C } from "./b";',
    'import { type D, e } from "./d";',
    'import "./efecto";',
    'export { f } from "./f";',
    'export type { G } from "./g";',
    'const h = () => import("./h");',
  ].join("\n");
  assert.deepEqual(importsDeEjecucion(texto).sort(), ["./d", "./efecto", "./f", "./h"]);
});

test("frontera: hay pantallas cliente para revisar (el recorrido encuentra la app)", () => {
  assert.ok(raicesCliente().length > 100);
});

test("frontera: ninguna pantalla cliente arrastra código de servidor ni un motor fuera de su carpeta", () => {
  const hallazgos = raicesCliente().flatMap(recorrer);
  const detalle = hallazgos.map((h) => `· ${h.motivo}: ${h.cadena.join(" → ")}`).join("\n");
  assert.equal(hallazgos.length, 0, `Lo que baja al navegador no puede llevar esto:\n${detalle}`);
});
