// Revisión INMEDIATA de lo que la persona pega o sube como certificado (en el navegador, antes de mandar).
// Pura y sin dependencias (corre en el cliente). La validación de verdad la hace el servidor
// (certificadoEnPem + cargarCredencialTenant en asistente-arca*.ts): esto sólo evita el viaje cuando
// el error es obvio y lo dice en criollo.

export type RevisionCertificado = { ok: true } | { ok: false; motivo: string } | { ok: null };

/** Tope de lo que se acepta (uno de ARCA pesa ~2 KB). Espejo de TOPE_CERTIFICADO_BYTES. */
const TOPE = 64 * 1024;

export function revisarCertificadoPegado(texto: string): RevisionCertificado {
  const t = (texto ?? "").trim();
  if (!t) return { ok: null };
  if (t.length > TOPE) return { ok: false, motivo: "Es muy largo para ser un certificado: pegá sólo lo que te dio ARCA." };
  if (/BEGIN (NEW )?CERTIFICATE REQUEST/.test(t)) {
    return {
      ok: false,
      motivo: "Eso es el pedido de certificado (lo que va a ARCA), no lo que ARCA te devuelve. Pegá el certificado que bajaste de ARCA.",
    };
  }
  if (/BEGIN (RSA |ENCRYPTED )?PRIVATE KEY/.test(t)) {
    return { ok: false, motivo: "Eso es una clave privada: no se pega en ningún lado. Pegá el certificado que te dio ARCA." };
  }
  const tieneInicio = t.includes("-----BEGIN CERTIFICATE-----");
  const tieneFin = t.includes("-----END CERTIFICATE-----");
  if (tieneInicio && tieneFin) return { ok: true };
  if (tieneInicio) return { ok: false, motivo: "Falta el final («-----END CERTIFICATE-----»): copiá el certificado completo." };
  if (/^[A-Za-z0-9+/=\s]{100,}$/.test(t)) return { ok: true };
  return { ok: false, motivo: "Eso no parece un certificado: tiene que empezar con «-----BEGIN CERTIFICATE-----»." };
}

/** El archivo elegido: nombre y tamaño razonables (el contenido lo revisa el servidor). */
export function revisarArchivoCertificado(nombre: string, bytes: number): RevisionCertificado {
  if (!nombre) return { ok: null };
  if (bytes > TOPE) return { ok: false, motivo: "El archivo es muy grande para ser un certificado." };
  if (/\.csr$/i.test(nombre)) {
    return { ok: false, motivo: "Ese es el pedido de certificado (.csr). Subí el que bajaste de ARCA (termina en .crt)." };
  }
  if (!/\.(crt|cer|pem|txt)$/i.test(nombre)) {
    return { ok: false, motivo: "Subí el archivo que bajaste de ARCA: termina en .crt (o .cer / .pem)." };
  }
  return { ok: true };
}
