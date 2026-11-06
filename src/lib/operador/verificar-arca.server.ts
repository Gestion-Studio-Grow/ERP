// Verificar con ARCA el certificado cargado de un negocio (prueba con cliente nuevo).
// Lee la ficha y el certificado (con la guardia de CUIT de `credencialParaTenant`), elige el ambiente
// por quién firmó el certificado y corre `verificarConArca`. No crea facturas ni toca el outbox: el
// único efecto es el ticket de WSAA, que se guarda cifrado por huella para que la emisión lo reuse.
// No depende de ARCA_MODO: en homologación no hay efecto fiscal y en producción sólo se lee.
import "server-only";
import { operatorPrisma } from "@/lib/operator-db";
import { credencialParaTenant } from "@/lib/fiscal/tenant-cert";
import { guardarTicketAcceso, huellaDeCertificado, leerTicketAcceso } from "@/lib/fiscal/arca-ta-store";
import { normalizarCuit } from "@/lib/cuit";
import { Pkcs7TraSigner, SoapAfipClient } from "@/plugins/arca";
import { entornoDeCertPem } from "./pase-a-real.server";
import { textoDelError, verificarConArca, type ResultadoVerificacion } from "@/lib/fiscal/verificar-con-arca";

export async function verificarCertificadoDelNegocio(tenantId: string): Promise<ResultadoVerificacion> {
  const t = await operatorPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { arcaCuit: true, arcaPuntoVenta: true, arcaCondicionIva: true },
  });
  if (!t) return { ok: false, paso: "certificado", mensaje: "No existe el negocio." };

  let credencial: Awaited<ReturnType<typeof credencialParaTenant>>;
  let entorno: ReturnType<typeof entornoDeCertPem>["entorno"];
  try {
    credencial = await credencialParaTenant(tenantId);
    entorno = entornoDeCertPem(credencial.certPem).entorno;
  } catch (e) {
    return { ok: false, paso: "certificado", mensaje: textoDelError(e) };
  }

  const huella = huellaDeCertificado(credencial.certPem);
  const cliente = new SoapAfipClient(
    { cuit: Number(normalizarCuit(t.arcaCuit ?? "")), homologacion: entorno !== "produccion" },
    {
      signer: new Pkcs7TraSigner(credencial),
      ticketInicial: await leerTicketAcceso(tenantId, undefined, huella),
      alRenovarTicket: (ta) => guardarTicketAcceso(tenantId, ta, undefined, huella),
    },
  );
  return verificarConArca({ entorno, puntoVenta: t.arcaPuntoVenta, condicionIva: t.arcaCondicionIva, cliente });
}
