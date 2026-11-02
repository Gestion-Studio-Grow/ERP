import { test } from "node:test";
import assert from "node:assert/strict";
import { archivoAdmitido, cabeceraDeArchivo, claveDeArchivo, claveEsDelProyecto, comoSeEntrega, TOPE_ARCHIVO, urlFirmada } from "./r2-core";

test("firma: el ejemplo de la documentación de AWS", () => {
  const url = urlFirmada(
    { endpoint: "https://examplebucket.s3.amazonaws.com", bucket: "", accessKey: "AKIAIOSFODNN7EXAMPLE", secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "us-east-1" },
    { metodo: "GET", clave: "test.txt", ahora: new Date("2013-05-24T00:00:00Z"), segundos: 86400 },
  );
  assert.match(url, /^https:\/\/examplebucket\.s3\.amazonaws\.com\/test\.txt\?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=/);
  assert.equal(url.split("Signature=")[1], "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
});

test("firma: nombres raros y parámetros de respuesta van codificados y ordenados", () => {
  const url = urlFirmada(
    { endpoint: "https://cuenta.r2.cloudflarestorage.com", bucket: "mia", accessKey: "k", secret: "s", region: "auto" },
    { metodo: "GET", clave: "proyectos/t/p/a b(1).pdf", ahora: new Date("2026-11-01T12:00:00Z"), segundos: 300, consulta: { "response-content-disposition": 'inline; filename="a b.pdf"' } },
  );
  assert.ok(url.startsWith("https://cuenta.r2.cloudflarestorage.com/mia/proyectos/t/p/a%20b%281%29.pdf?X-Amz-Algorithm"));
  assert.ok(url.indexOf("X-Amz-SignedHeaders") < url.indexOf("response-content-disposition"));
  assert.match(url, /response-content-disposition=inline%3B%20filename%3D%22a%20b\.pdf%22&X-Amz-Signature=[0-9a-f]{64}$/);
});

test("qué se puede subir", () => {
  assert.equal(archivoAdmitido("plano.dwg", 1000), null);
  assert.equal(archivoAdmitido("planilla.xlsx", TOPE_ARCHIVO), null);
  assert.match(archivoAdmitido("video.mp4", TOPE_ARCHIVO + 1) ?? "", /200 MB/);
  assert.match(archivoAdmitido("virus.EXE", 10) ?? "", /se ejecuta/);
  assert.match(archivoAdmitido("pagina.html", 10) ?? "", /se ejecuta/);
  assert.match(archivoAdmitido("vacio.pdf", 0) ?? "", /vacío/);
});

test("lo desconocido se baja; lo que el navegador muestra se abre", () => {
  assert.deepEqual(comoSeEntrega("a.PDF"), { tipo: "application/pdf", disposicion: "inline" });
  assert.deepEqual(comoSeEntrega("plano.dwg"), { tipo: "application/octet-stream", disposicion: "attachment" });
  assert.deepEqual(comoSeEntrega("sinextension"), { tipo: "application/octet-stream", disposicion: "attachment" });
});

test("la clave queda dentro de la carpeta del proyecto, aunque el nombre intente salir", () => {
  const c = claveDeArchivo("t1", "p1", "abc", "../../otro/Plano Técnico.DWG");
  assert.equal(c, "proyectos/t1/p1/abc-..-..-otro-plano-tecnico.dwg");
  assert.ok(claveEsDelProyecto(c, "t1", "p1"));
});

test("no se confirma un archivo de otro negocio, de otro proyecto ni de una subcarpeta", () => {
  assert.equal(claveEsDelProyecto("proyectos/t2/p1/a.pdf", "t1", "p1"), false);
  assert.equal(claveEsDelProyecto("proyectos/t1/p2/a.pdf", "t1", "p1"), false);
  assert.equal(claveEsDelProyecto("proyectos/t1/p1/../../t2/p1/a.pdf", "t1", "p1"), false);
  assert.equal(claveEsDelProyecto("proyectos/t1/p1/", "t1", "p1"), false);
  assert.equal(claveEsDelProyecto("", "t1", "p1"), false);
});

test("la cabecera del archivo no deja escapar comillas ni acentos", () => {
  assert.equal(cabeceraDeArchivo('Plano "A" ñ.pdf', "attachment"), `attachment; filename="Plano A n.pdf"; filename*=UTF-8''Plano%20%22A%22%20%C3%B1.pdf`);
  assert.ok(cabeceraDeArchivo("O'Brien.pdf", "inline").endsWith("filename*=UTF-8''O%27Brien.pdf"));
});
