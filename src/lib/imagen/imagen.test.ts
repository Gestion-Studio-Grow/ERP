import { test } from "node:test";
import assert from "node:assert/strict";

import {
  generarImagen,
  resolverProvider,
  sanitizarPrompt,
  FaltaKeyError,
  PromptInvalidoError,
  type ImageProvider,
  type ImageBytes,
} from "./index";

// --- Proveedor MOCK (no toca la red) -----------------------------------------

// Registra el pedido recibido para poder asertar la composición del prompt.
function mockProvider(over: Partial<ImageProvider> = {}) {
  const calls: { prompt: string; aspectRatio: string; apiKey: string }[] = [];
  const bytes: ImageBytes = { data: new Uint8Array([1, 2, 3, 4]), contentType: "image/png", ext: "png" };
  const provider: ImageProvider = {
    id: "fal",
    envVar: "FAL_KEY",
    async generate(req) {
      calls.push({ prompt: req.prompt, aspectRatio: req.aspectRatio, apiKey: req.apiKey });
      return bytes;
    },
    ...over,
  };
  return { provider, calls, bytes };
}

// Captura de escritura a disco en memoria (sin tocar el filesystem real).
function fakeFs() {
  const written: { path: string; bytes: number }[] = [];
  const mkdirs: string[] = [];
  return {
    writeFileImpl: async (path: string, data: Uint8Array) => {
      written.push({ path, bytes: data.byteLength });
    },
    mkdirImpl: async (dir: string) => {
      mkdirs.push(dir);
    },
    written,
    mkdirs,
  };
}

// True si el texto tiene algún carácter de control C0 o DEL.
function tieneControl(s: string): boolean {
  return Array.from(s).some((c) => {
    const cp = c.codePointAt(0) ?? 0;
    return cp < 0x20 || cp === 0x7f;
  });
}

// --- sanitizarPrompt ----------------------------------------------------------

test("sanitizarPrompt: recorta, colapsa espacios y saca saltos de linea", () => {
  assert.equal(sanitizarPrompt("  hola \n\n  spa   editorial  "), "hola spa editorial");
});

test("sanitizarPrompt: elimina caracteres de control (inyeccion de log)", () => {
  // BEL (0x07) + secuencia ANSI de color (ESC 0x1B + "[31m") construidos por codigo:
  // asi el fuente queda ASCII puro y el input SI trae control chars de verdad.
  const ESC = String.fromCharCode(0x1b);
  const BEL = String.fromCharCode(0x07);
  const conControl = `hero ${BEL} spa ${ESC}[31mrojo${ESC}[0m`;
  assert.ok(tieneControl(conControl), "el input de prueba SI trae control chars");
  const limpio = sanitizarPrompt(conControl);
  assert.ok(!tieneControl(limpio), "no deben quedar control chars tras sanear");
  assert.match(limpio, /hero .*spa/);
});

test("sanitizarPrompt: no-string, vacio y demasiado largo -> PromptInvalidoError", () => {
  assert.throws(() => sanitizarPrompt(123 as unknown), PromptInvalidoError);
  assert.throws(() => sanitizarPrompt("   "), PromptInvalidoError);
  assert.throws(() => sanitizarPrompt("x".repeat(2000)), PromptInvalidoError);
});

// --- Composicion de prompt por rubro -----------------------------------------

test("generarImagen: compone el prompt con el estilo del rubro estetica", async () => {
  const { provider, calls } = mockProvider();
  const fs = fakeFs();
  const res = await generarImagen(
    { prompt: "hero de recepcion con toallas y velas", outPath: "out/ch/hero.png", rubro: "estetica", aspectRatio: "16:9" },
    { provider, env: { FAL_KEY: "clave-de-prueba" }, writeFileImpl: fs.writeFileImpl, mkdirImpl: fs.mkdirImpl },
  );

  assert.equal(calls.length, 1);
  // El pedido especifico esta + la direccion de arte del rubro estetica (tierra + teal).
  assert.match(calls[0].prompt, /toallas y velas/);
  assert.match(calls[0].prompt, /teal/);
  assert.match(calls[0].prompt, /banner\/hero/); // pista de aspecto horizontal
  assert.equal(calls[0].aspectRatio, "16:9");
  assert.equal(res.provider, "fal");
  assert.equal(res.bytes, 4);
  assert.equal(res.contentType, "image/png");
});

test("generarImagen: rubro carniceria trae la direccion MAGRA (carbon + oro)", async () => {
  const { provider, calls } = mockProvider();
  const fs = fakeFs();
  await generarImagen(
    { prompt: "bandeja de cortes premium", outPath: "out/magra/hero.png", rubro: "carniceria" },
    { provider, env: { FAL_KEY: "k" }, writeFileImpl: fs.writeFileImpl, mkdirImpl: fs.mkdirImpl },
  );
  assert.match(calls[0].prompt, /carb|oro/);
});

test("generarImagen: rubro desconocido cae al estilo generico (no rompe)", async () => {
  const { provider, calls } = mockProvider();
  const fs = fakeFs();
  await generarImagen(
    { prompt: "algo neutro", outPath: "out/x.png", rubro: "rubro-que-no-existe" },
    { provider, env: { FAL_KEY: "k" }, writeFileImpl: fs.writeFileImpl, mkdirImpl: fs.mkdirImpl },
  );
  assert.match(calls[0].prompt, /neutra|equilibrada/);
});

test("generarImagen: estilo override pisa al preset de rubro", async () => {
  const { provider, calls } = mockProvider();
  const fs = fakeFs();
  await generarImagen(
    { prompt: "hero", outPath: "out/x.png", rubro: "estetica", estilo: "cyberpunk neon" },
    { provider, env: { FAL_KEY: "k" }, writeFileImpl: fs.writeFileImpl, mkdirImpl: fs.mkdirImpl },
  );
  assert.match(calls[0].prompt, /cyberpunk neon/);
  assert.ok(!/teal/.test(calls[0].prompt), "el override reemplaza la direccion del rubro");
});

// --- Manejo de la clave -------------------------------------------------------

test("generarImagen: SIN FAL_KEY -> FaltaKeyError y NO escribe a disco ni llama al proveedor", async () => {
  const { provider, calls } = mockProvider();
  const fs = fakeFs();
  await assert.rejects(
    () =>
      generarImagen(
        { prompt: "hero de spa", outPath: "out/x.png", rubro: "estetica" },
        { provider, env: {}, writeFileImpl: fs.writeFileImpl, mkdirImpl: fs.mkdirImpl },
      ),
    (err: unknown) => {
      assert.ok(err instanceof FaltaKeyError);
      assert.equal((err as FaltaKeyError).envVar, "FAL_KEY");
      // El mensaje orienta al dueno y no filtra secretos.
      assert.match((err as Error).message, /FAL_KEY/);
      return true;
    },
  );
  assert.equal(calls.length, 0, "no debe llamar al proveedor sin clave");
  assert.equal(fs.written.length, 0, "no debe escribir a disco sin clave");
});

test("generarImagen: FAL_KEY vacia o solo espacios tambien corta con FaltaKeyError", async () => {
  const { provider } = mockProvider();
  const fs = fakeFs();
  await assert.rejects(
    () =>
      generarImagen(
        { prompt: "hero", outPath: "out/x.png" },
        { provider, env: { FAL_KEY: "   " }, writeFileImpl: fs.writeFileImpl, mkdirImpl: fs.mkdirImpl },
      ),
    FaltaKeyError,
  );
});

// --- Guardado -----------------------------------------------------------------

test("generarImagen: guarda los bytes en outPath y crea el directorio", async () => {
  const { provider } = mockProvider();
  const fs = fakeFs();
  const res = await generarImagen(
    { prompt: "hero de spa sereno", outPath: "out/ch/hero.png", rubro: "estetica" },
    { provider, env: { FAL_KEY: "k" }, writeFileImpl: fs.writeFileImpl, mkdirImpl: fs.mkdirImpl },
  );
  assert.deepEqual(fs.mkdirs, ["out/ch"]);
  assert.equal(fs.written.length, 1);
  assert.equal(fs.written[0].path, "out/ch/hero.png");
  assert.equal(fs.written[0].bytes, 4);
  assert.equal(res.outPath, "out/ch/hero.png");
});

test("generarImagen: outPath faltante -> PromptInvalidoError antes de tocar nada", async () => {
  const { provider } = mockProvider();
  await assert.rejects(
    () => generarImagen({ prompt: "hero", outPath: "" }, { provider, env: { FAL_KEY: "k" } }),
    PromptInvalidoError,
  );
});

// --- Resolucion de proveedor --------------------------------------------------

test("resolverProvider: default es fal", () => {
  assert.equal(resolverProvider().id, "fal");
  assert.equal(resolverProvider().envVar, "FAL_KEY");
});

test("resolverProvider: replicate y bfl existen (scaffold) con su envVar", () => {
  assert.equal(resolverProvider("replicate").envVar, "REPLICATE_API_TOKEN");
  assert.equal(resolverProvider("bfl").envVar, "BFL_API_KEY");
});

test("resolverProvider: id desconocido -> error", () => {
  assert.throws(() => resolverProvider("nope" as never));
});
