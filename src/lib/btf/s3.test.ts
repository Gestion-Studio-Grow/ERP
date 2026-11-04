// SigV4 a mano: contra el vector publicado por AWS (S3 · "Authenticating Requests: Using Query
// Parameters", GET de examplebucket/test.txt del 24/05/2013) y las reglas que usa el almacén.
import { test } from "node:test";
import assert from "node:assert/strict";
import { configS3, presignar, problemaS3, urlFirmadaGet, urlFirmadaPut } from "./s3";

const AWS = { key: "AKIAIOSFODNN7EXAMPLE", secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "us-east-1" };

test("presignar reproduce el vector oficial de AWS", () => {
  const url = presignar({
    metodo: "GET",
    host: "examplebucket.s3.amazonaws.com",
    ruta: "/test.txt",
    credenciales: AWS,
    fecha: new Date("2013-05-24T00:00:00Z"),
    segundos: 86400,
  });
  assert.equal(
    url,
    "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
  );
});

test("el Content-Type de un PUT entra en la firma: otro tipo da otra firma", () => {
  const base = { metodo: "PUT" as const, host: "h.example", ruta: "/b/o/f/a/m.jpg", credenciales: AWS, fecha: new Date("2026-11-04T12:00:00Z"), segundos: 600 };
  const jpg = presignar({ ...base, cabeceras: { "Content-Type": "image/jpeg" } });
  const png = presignar({ ...base, cabeceras: { "Content-Type": "image/png" } });
  assert.match(jpg, /X-Amz-SignedHeaders=content-type%3Bhost/);
  assert.notEqual(jpg.split("X-Amz-Signature=")[1], png.split("X-Amz-Signature=")[1]);
});

test("las claves se codifican por segmento (espacios, tildes) sin tocar las barras", () => {
  const url = presignar({ metodo: "GET", host: "h", ruta: "/b/p/año 1.jpg", credenciales: AWS, fecha: new Date(0), segundos: 1 });
  assert.ok(url.startsWith("https://h/b/p/a%C3%B1o%201.jpg?"), url);
});

test("configS3 exige todo el entorno y usa estilo de ruta con el endpoint", () => {
  const env = {
    BTF_S3_ENDPOINT: "https://cuenta.r2.cloudflarestorage.com",
    BTF_S3_KEY: "k",
    BTF_S3_SECRET: "s",
    BTF_S3_BUCKET_ORIGINALES: "orig",
    BTF_S3_BUCKET_PREVIAS: "prev",
    BTF_PREVIAS_URL_PUBLICA: "https://previas.example/",
  };
  assert.equal(configS3({ ...env, BTF_S3_KEY: "" }), null);
  assert.match(problemaS3({ ...env, BTF_S3_KEY: "" })!, /BTF_S3_KEY/);
  // Buckets iguales: los originales quedarían públicos → no configurado, y el motivo lo dice
  const iguales = { ...env, BTF_S3_BUCKET_PREVIAS: "orig" };
  assert.equal(configS3(iguales), null);
  assert.match(problemaS3(iguales)!, /mismo bucket.*públicos/);
  assert.equal(problemaS3(env), null);
  const c = configS3(env)!;
  assert.equal(c.credenciales.region, "auto");
  assert.equal(c.urlPublicaPrevias, "https://previas.example");

  const antes = { ...process.env };
  Object.assign(process.env, env);
  try {
    assert.match(urlFirmadaGet("orig", "o/f/a/m.jpg", 600), /^https:\/\/cuenta\.r2\.cloudflarestorage\.com\/orig\/o\/f\/a\/m\.jpg\?.*X-Amz-Expires=600/);
    assert.match(urlFirmadaPut("prev", "p/a/m.webp", "image/webp", 600), /\/prev\/p\/a\/m\.webp\?.*SignedHeaders=content-type%3Bhost/);
  } finally {
    for (const k of Object.keys(env)) if (!(k in antes)) delete process.env[k];
  }
});
