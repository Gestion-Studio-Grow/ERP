import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import {
  MENSAJE_COMPRIMIDO_GRANDE,
  MENSAJE_DANIADA,
  MENSAJE_NO_LLEGO,
  MENSAJE_TEXTO_GRANDE,
  TOPE_COMPRIMIDO,
  TOPE_TEXTO,
  textoDelGzip,
  textoSubido,
} from "./estado-subida";

const conArchivo = (contenido: Uint8Array | string) => {
  const fd = new FormData();
  fd.set("foto", new Blob([contenido as BlobPart]), "foto.json.gz");
  return fd;
};

test("el tope de lo descomprimido es 10 MB (Gate M3), no 48", () => {
  assert.equal(TOPE_TEXTO, 10 * 1024 * 1024);
});

test("una foto normal sube y se lee tal cual", async () => {
  const texto = JSON.stringify({ v: 1, estado: { config: { nombre: "Break Point Pádel" } }, secuencia: 3 });
  assert.deepEqual(await textoSubido(conArchivo(gzipSync(texto)), "foto"), { texto });
});

test("un gzip chico que se infla a más de 10 MB se rechaza con el motivo en criollo, no como 'dañado'", async () => {
  // 11 MB de espacios comprimen a unos pocos KB: pasa el tope de lo comprimido y revienta el de lo descomprimido.
  const bomba = gzipSync(Buffer.alloc(11 * 1024 * 1024, 0x20));
  assert.ok(bomba.length < TOPE_COMPRIMIDO, "la bomba entra en el tope de lo comprimido");
  const r = await textoSubido(conArchivo(bomba), "foto");
  assert.deepEqual(r, { error: MENSAJE_TEXTO_GRANDE });
  assert.match(MENSAJE_TEXTO_GRANDE, /10 MB/);
  assert.match(MENSAJE_TEXTO_GRANDE, /No se guardó/);
  // Justo en el tope pasa; un byte más, no.
  assert.ok("texto" in textoDelGzip(gzipSync(Buffer.alloc(TOPE_TEXTO, 0x20))));
  assert.deepEqual(textoDelGzip(gzipSync(Buffer.alloc(TOPE_TEXTO + 1, 0x20))), { error: MENSAJE_TEXTO_GRANDE });
});

test("sin archivo, comprimido de más o basura: cada uno con su motivo", async () => {
  assert.deepEqual(await textoSubido(new FormData(), "foto"), { error: MENSAJE_NO_LLEGO });
  const grande = new Uint8Array(TOPE_COMPRIMIDO + 1);
  assert.deepEqual(await textoSubido(conArchivo(grande), "foto"), { error: MENSAJE_COMPRIMIDO_GRANDE });
  assert.deepEqual(await textoSubido(conArchivo("esto no es gzip"), "foto"), { error: MENSAJE_DANIADA });
});
