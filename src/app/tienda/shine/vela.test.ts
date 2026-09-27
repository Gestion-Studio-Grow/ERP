// ============================================================================
// LA VELA 3D DE SHINE — reglas de la escena y frontera de three.js.
// ============================================================================
//
// Qué se prueba (sin GPU):
//   · el tono de la cera sigue al aroma elegido, con los aromas REALES de la marca (storefront.ts);
//   · movimiento reducido = un cuadro quieto (sin bucle, sin humo, sin transiciones);
//   · el bucle no corre fuera de pantalla, con la pestaña oculta ni con la vela apagada y quieta;
//   · la calidad baja sola en 3 pasos y nunca sube;
//   · el titileo es ruido determinista y acotado (la llama y su luz usan el mismo valor);
//   · la escena sólo se carga en Shine y ningún otro negocio importa three.js (lectura del código:
//     los imports son la frontera; el build lo confirma en .qa/shine3d-2709).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { getStorefrontCopy } from "@/tenants/storefront";
import {
  ajustesDelPaso,
  avisoDelEstado,
  bucleNecesario,
  CERA_DEL_CATALOGO,
  claveDeAroma,
  pasoDeEconomia,
  planDeEscena,
  textoDelBoton,
  tinteDeAroma,
  TINTE_POR_AROMA,
  titileo,
  TOPE_MS_POR_CUADRO,
  type PasoDeCalidad,
} from "./vela-reglas";

const SRC = path.resolve(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) out.push(...archivos(p));
    else if (/\.(ts|tsx|mts|js|jsx)$/.test(n) && !/\.test\./.test(n)) out.push(p);
  }
  return out;
}

describe("la cera sigue al aroma elegido", () => {
  test("cada aroma de temporada de Shine tiene su tono (no cae al de catálogo)", () => {
    const aromas = getStorefrontCopy("shinevelas")?.gourmetItems ?? [];
    assert.ok(aromas.length >= 5, "Shine publica sus aromas de temporada");
    for (const a of aromas) {
      assert.ok(TINTE_POR_AROMA[claveDeAroma(a)], `falta el tono de «${a}»`);
      assert.match(tinteDeAroma(a), /^#[0-9a-f]{6}$/);
    }
    // Tonos distintos: elegir otro aroma se nota.
    assert.equal(new Set(aromas.map(tinteDeAroma)).size, aromas.length);
  });

  test("sin aroma, o con uno desconocido, la cera es la miel de las fotos del catálogo", () => {
    assert.equal(tinteDeAroma(null), CERA_DEL_CATALOGO);
    assert.equal(tinteDeAroma(""), CERA_DEL_CATALOGO);
    assert.equal(tinteDeAroma("Aroma que no existe"), CERA_DEL_CATALOGO);
  });

  test("el nombre se compara sin tildes, mayúsculas ni espacios de más", () => {
    assert.equal(claveDeAroma("  Sándalo "), "sandalo");
    assert.equal(tinteDeAroma("CEDRO   Y ÁMBAR"), tinteDeAroma("cedro y ambar"));
  });
});

describe("movimiento reducido: un cuadro quieto", () => {
  test("sin movimiento no hay bucle, ni humo, ni transiciones", () => {
    assert.deepEqual(planDeEscena(false), { bucle: false, humo: false, transiciones: false });
    assert.deepEqual(planDeEscena(true), { bucle: true, humo: true, transiciones: true });
  });

  test("con movimiento reducido el bucle nunca corre, aunque la vela esté prendida en pantalla", () => {
    assert.equal(
      bucleNecesario({ movimiento: false, enPantalla: true, pestanaVisible: true, encendida: true, humoEnElAire: true, enTransicion: true, camaraMoviendose: true }),
      false,
    );
  });
});

describe("cero trabajo cuando no se ve", () => {
  const base = { movimiento: true, enPantalla: true, pestanaVisible: true, encendida: false, humoEnElAire: false, enTransicion: false, camaraMoviendose: false };

  test("fuera de pantalla o con la pestaña oculta, el bucle se apaga aunque la llama esté prendida", () => {
    assert.equal(bucleNecesario({ ...base, encendida: true, enPantalla: false }), false);
    assert.equal(bucleNecesario({ ...base, encendida: true, pestanaVisible: false }), false);
  });

  test("apagada y quieta no gasta cuadros; con humo en el aire, una transición o la cámara moviéndose, sí", () => {
    assert.equal(bucleNecesario(base), false);
    assert.equal(bucleNecesario({ ...base, encendida: true }), true);
    assert.equal(bucleNecesario({ ...base, humoEnElAire: true }), true);
    assert.equal(bucleNecesario({ ...base, enTransicion: true }), true);
    assert.equal(bucleNecesario({ ...base, camaraMoviendose: true }), true);
  });
});

describe("calidad adaptativa en 3 pasos", () => {
  test("con cuadros rápidos se queda; con cuadros lentos baja un paso por vez hasta el 3, y nunca sube", () => {
    assert.equal(pasoDeEconomia(TOPE_MS_POR_CUADRO, 0), 0);
    let paso: PasoDeCalidad = 0;
    const recorrido: number[] = [];
    for (let i = 0; i < 5; i++) {
      paso = pasoDeEconomia(40, paso);
      recorrido.push(paso);
    }
    assert.deepEqual(recorrido, [1, 2, 3, 3, 3]);
    assert.equal(pasoDeEconomia(5, 2), 2, "un cuadro rápido no devuelve calidad");
  });

  test("cada paso es más liviano que el anterior; el último deja de usar la transmisión del vidrio", () => {
    const pasos = ([0, 1, 2, 3] as const).map((p) => ajustesDelPaso(p, 1.75));
    for (let i = 1; i < pasos.length; i++) {
      assert.ok(pasos[i].densidad <= pasos[i - 1].densidad);
      assert.ok(pasos[i].transmision <= pasos[i - 1].transmision);
    }
    assert.deepEqual(
      pasos.map((p) => p.vidrioFisico),
      [true, true, true, false],
    );
    // Nunca más píxeles que los del equipo.
    assert.ok(([0, 1, 2, 3] as const).every((p) => ajustesDelPaso(p, 1).densidad <= 1));
  });
});

describe("el titileo de la llama", () => {
  test("es determinista, acotado y no es un seno: sube y baja sin período fijo", () => {
    const muestras = Array.from({ length: 2000 }, (_, i) => titileo(i / 60));
    assert.deepEqual(
      muestras.slice(0, 50),
      Array.from({ length: 50 }, (_, i) => titileo(i / 60)),
    );
    for (const f of muestras) assert.ok(f >= 0.764 && f <= 1.11, `fuera de rango: ${f}`);
    const min = Math.min(...muestras);
    const max = Math.max(...muestras);
    assert.ok(max - min > 0.08, "titila de verdad");
  });
});

describe("textos de la vela", () => {
  test("el botón dice lo que va a hacer y el aviso lo que pasó", () => {
    assert.equal(textoDelBoton(true), "Apagar la vela");
    assert.equal(textoDelBoton(false), "Encender la vela");
    assert.equal(avisoDelEstado(false), "La vela está apagada.");
  });
});

describe("la escena sólo se carga en Shine; el resto del ERP no importa three.js", () => {
  test("three sólo lo importan la escena del frasco de Qué Bien Olés y la de la vela de Shine", () => {
    const conThree = archivos(SRC)
      .filter((f) => /from\s+["']three(\/[^"']*)?["']|import\(\s*["']three/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC, f).split(path.sep).join("/"))
      .sort();
    assert.deepEqual(conThree, ["app/tienda/quebienoles/frasco-escena.ts", "app/tienda/shine/vela-escena.ts"]);
  });

  test("la escena se pide por import dinámico o desde su worker, nunca de entrada", () => {
    const usos = archivos(SRC)
      .filter((f) => !f.endsWith(path.join("shine", "vela-escena.ts")))
      .flatMap((f) => {
        const s = readFileSync(f, "utf8");
        return [...s.matchAll(/^.*["']\.\/vela-escena["'].*$/gm)].map((m) => [path.basename(f), m[0].trim()] as const);
      });
    for (const [archivo, linea] of usos) {
      const permitido =
        (archivo === "vela-worker.ts" && /^import \{ crearVela, type Vela \}/.test(linea)) ||
        (archivo === "EscenaVela.tsx" && (/^import type /.test(linea) || /import\("\.\/vela-escena"\)/.test(linea)));
      assert.ok(permitido, `${archivo}: ${linea}`);
    }
    assert.match(leer("app/tienda/shine/EscenaVela.tsx"), /new Worker\(new URL\("\.\/vela-worker\.ts", import\.meta\.url\)/);
  });

  test("los mandos y la escena llegan en un chunk aparte (dynamic sin SSR), no en el JS de todas las vidrieras", () => {
    const diferida = leer("app/tienda/shine/VelaDiferida.tsx");
    assert.match(diferida, /dynamic\(\(\) => import\("\.\/EscenaVela"\), \{ ssr: false \}\)/);
    const quienesImportanEscena = archivos(SRC).filter((f) => /from ["'][^"']*\/?EscenaVela["']/.test(readFileSync(f, "utf8")));
    assert.deepEqual(quienesImportanEscena, [], "EscenaVela no se importa de entrada en ningún lado");
  });

  test("la vela se dibuja sólo en las portadas de Shine (la de siempre y la nueva)", () => {
    const conVela = archivos(SRC)
      .filter((f) => /<VelaDiferida\b/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC, f).split(path.sep).join("/"))
      .sort();
    assert.deepEqual(conVela, ["app/tienda/ShineFront.tsx", "app/tienda/vidriera/TiendaNueva.tsx"]);

    // En la tienda nueva, sólo dentro de PortadaShine (MAGRA, A Dos Manos y la genérica no la tienen).
    const nueva = leer("app/tienda/vidriera/TiendaNueva.tsx");
    const inicio = nueva.indexOf("function PortadaShine(");
    const fin = nueva.indexOf("\nfunction ", inicio + 1);
    assert.ok(inicio > 0 && fin > inicio);
    assert.equal((nueva.match(/<VelaDiferida\b/g) ?? []).length, 1);
    assert.ok(nueva.slice(inicio, fin).includes("<VelaDiferida"), "la vela está en PortadaShine");
    assert.match(nueva, /if \(c\.marca === "shinevelas"\) return <PortadaShine \{\.\.\.c\} \/>;/);

    // La vidriera de siempre de Shine se sirve sólo con el front de Shine (tienda/page.tsx).
    const pagina = leer("app/tienda/page.tsx");
    const iShine = pagina.indexOf("<ShineFront");
    assert.ok(iShine > 0);
    assert.match(pagina.slice(Math.max(0, iShine - 200), iShine), /if \(front === "shinevelas" && data\.copy\) \{/);
  });
});
