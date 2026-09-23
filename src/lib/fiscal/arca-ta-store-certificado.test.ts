// El TA de ARCA se guarda POR CERTIFICADO, no por negocio, EJECUTADO con una tabla en
// memoria: dos negocios que firman con el mismo certificado (los locales de una marca con un
// solo CUIT) comparten el ticket; el segundo NO pide otro login, que ARCA bloquearía 10-15
// minutos. Otro certificado, otra fila. Sin credencial, no se cachea.
//
// Los certificados son de prueba (generados con openssl para este test, sin clave privada).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  depsPorCertificado,
  guardarTicketAcceso,
  huellaDeCertificado,
  leerTicketAcceso,
  type ArcaTaStoreDeps,
  type FilaTicket,
} from "./arca-ta-store";
import type { MasterKey } from "./cert-crypto";
import type { TicketAcceso } from "@/plugins/arca";

const CERT_MARCA = `-----BEGIN CERTIFICATE-----
MIIBrDCCAVGgAwIBAgIUOl9Z09UyAcBSK41euLoSiD5KZzMwCgYIKoZIzj0EAwIw
KzEOMAwGA1UEAwwFcWEtMmQxGTAXBgNVBAUTEENVSVQgMjAxMjM0NTY3ODYwHhcN
MjYwOTIzMTA1ODI5WhcNMzYwOTIwMTA1ODI5WjArMQ4wDAYDVQQDDAVxYS0yZDEZ
MBcGA1UEBRMQQ1VJVCAyMDEyMzQ1Njc4NjBZMBMGByqGSM49AgEGCCqGSM49AwEH
A0IABF81YnteIfDYV4KHZy6luBNS0AxtFqAeJ5SRotW12cvCPwyRDKKnjwNLci9Z
edjUXe6HtgWFj2NvUvk7e5brHJ6jUzBRMB0GA1UdDgQWBBT5D+hZpU9M8ISkm7Zl
jCnXHWZ/GjAfBgNVHSMEGDAWgBT5D+hZpU9M8ISkm7ZljCnXHWZ/GjAPBgNVHRMB
Af8EBTADAQH/MAoGCCqGSM49BAMCA0kAMEYCIQDmDKK07lcm6pn7zcsNxGH+mv6f
SCs8o0Cbgr5zxCcAbQIhAMrK9BdoPvFLd49qBhVreE6DP+rSwrlaVmBqb8rdDio3
-----END CERTIFICATE-----`;

const CERT_OTRO = `-----BEGIN CERTIFICATE-----
MIIBgDCCASWgAwIBAgIUBq95QeR6gazG5efwZ9w8DaVVg9YwCgYIKoZIzj0EAwIw
FTETMBEGA1UEAwwKcWEtMmQtb3RybzAeFw0yNjA5MjMxMDU4MjlaFw0zNjA5MjAx
MDU4MjlaMBUxEzARBgNVBAMMCnFhLTJkLW90cm8wWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAARbG3qBRcSyNksoQirLRjK0HMkgQ8wXt6gOZl2Fr9fDi4uCCt3vSbXV
Yr5fZnesmICl5aOf6fmzOP8MtcGCUGFzo1MwUTAdBgNVHQ4EFgQUuoseaUIobtO6
/r81P25id+FmMDcwHwYDVR0jBBgwFoAUuoseaUIobtO6/r81P25id+FmMDcwDwYD
VR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNJADBGAiEA+monp/LhUP8AR0YYwIqp
GfVUChIX2se1+nG7cA3/GEgCIQDCXVI7iMTiYbb8E6OkA3dXaL9PCYph5L1B610D
lJrZkg==
-----END CERTIFICATE-----`;

/** `openssl x509 -noout -fingerprint -sha256` de cada uno, sin los dos puntos. */
const HUELLA_MARCA = "5947a7689be681da231db355c71c94fba71cf3865e3cf3b372b66d52452d7467";
const HUELLA_OTRO = "7f48787d77c712c80ce01da5979fc09c3d33d481b568db3f373041a52dbe635e";

const master = (): MasterKey => ({ key: Buffer.alloc(32, 7), id: "test:v1" });
const AHORA = new Date("2026-07-05T12:00:00Z");
const TA: TicketAcceso = { token: "TOKEN-ABC", sign: "SIGN-XYZ", expiration: "2026-07-06T02:00:00.000-03:00" };

/** La tabla `ArcaAuthTicket` en memoria, con la clave única (certHuella, service) del SQL. */
function tablaEnMemoria(certificados: Record<string, string | null>) {
  const filas = new Map<string, FilaTicket & { tenantId: string }>();
  const deps: ArcaTaStoreDeps = {
    tablaExiste: async () => true,
    ...depsPorCertificado({
      huellaDelNegocio: async (tenantId) => {
        const pem = certificados[tenantId];
        return pem ? huellaDeCertificado(pem) : null;
      },
      leerPorHuella: async (huella, servicio) => filas.get(`${huella}|${servicio}`) ?? null,
      upsertPorHuella: async (huella, servicio, tenantId, fila) => {
        filas.set(`${huella}|${servicio}`, { ...fila, tenantId });
      },
    }),
    master,
    ahora: () => AHORA,
  };
  return { deps, filas };
}

test("la huella es la de openssl, y no cambia con los saltos de línea del PEM", () => {
  assert.equal(huellaDeCertificado(CERT_MARCA), HUELLA_MARCA);
  assert.equal(huellaDeCertificado(CERT_OTRO), HUELLA_OTRO);
  assert.equal(huellaDeCertificado(CERT_MARCA.replace(/\n/g, "\r\n")), HUELLA_MARCA);
});

test("dos locales con el mismo certificado comparten el TA: el segundo no vuelve a loguearse", async () => {
  const { deps, filas } = tablaEnMemoria({ "local-centro": CERT_MARCA, "local-canning": CERT_MARCA, "otro-negocio": CERT_OTRO });
  await guardarTicketAcceso("local-centro", TA, deps);
  assert.deepEqual(await leerTicketAcceso("local-canning", deps), TA, "el TA del certificado, pedido por el otro local");
  assert.equal(await leerTicketAcceso("otro-negocio", deps), undefined, "otro certificado, otro TA");

  // Una fila por certificado y servicio; el negocio queda como "quién lo pidió último".
  assert.equal(filas.size, 1);
  await guardarTicketAcceso("local-canning", { ...TA, token: "TOKEN-2" }, deps);
  assert.equal(filas.size, 1, "el segundo local pisa la fila del certificado, no crea otra");
  assert.equal([...filas.values()][0].tenantId, "local-canning");
  assert.equal((await leerTicketAcceso("local-centro", deps))?.token, "TOKEN-2");
});

test("sin credencial cargada no hay TA que cachear: no guarda ni lee", async () => {
  const { deps, filas } = tablaEnMemoria({ "sin-cert": null, "local-centro": CERT_MARCA });
  await guardarTicketAcceso("local-centro", TA, deps);
  await guardarTicketAcceso("sin-cert", TA, deps);
  assert.equal(filas.size, 1);
  assert.equal(await leerTicketAcceso("sin-cert", deps), undefined);
});
