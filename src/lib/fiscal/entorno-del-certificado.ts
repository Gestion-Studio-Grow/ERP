// Quién firmó un certificado de ARCA y, por eso, de qué entorno es. Sin secretos (sólo el emisor) y
// sin dependencias del servidor: lo usan la ficha del operador, «Verificar con ARCA» y el despacho.
import forge from "node-forge";
import { entornoDelEmisor, type EntornoDeCertificado } from "./modo-del-negocio";

function textoDelCampo(campo: unknown): string | null {
  const v = (campo as { value?: unknown } | null | undefined)?.value;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Abre el certificado y devuelve SÓLO quién lo firmó y su entorno. Lanza si el PEM no se lee. */
export function entornoDeCertPem(certPem: string): { entorno: EntornoDeCertificado; emisor: string | null } {
  const issuer = forge.pki.certificateFromPem(certPem).issuer;
  const cn = textoDelCampo(issuer.getField("CN"));
  const o = textoDelCampo(issuer.getField("O"));
  const emisor = [cn, o].filter((x): x is string => !!x).join(" · ") || null;
  return { entorno: entornoDelEmisor({ cn, o }), emisor };
}
