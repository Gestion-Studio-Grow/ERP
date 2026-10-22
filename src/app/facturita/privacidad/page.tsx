// FACTURITA · Política de privacidad — BORRADOR (ver DocumentoLegal). Pública y estática.

import type { Metadata } from "next";
import DocumentoLegal from "../DocumentoLegal";
import { RESPONSABLE, VIGENCIA_BORRADOR } from "../legales";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Privacidad — Facturita",
  description: "Qué datos usa Facturita, para qué, y cómo ejercés tus derechos sobre ellos.",
  generator: "Gestión Studio Grow",
};

export default function PrivacidadPage() {
  return (
    <DocumentoLegal
      titulo="Política de privacidad"
      vigencia={VIGENCIA_BORRADOR}
      secciones={[
        {
          titulo: "Quién trata tus datos",
          parrafos: [
            `El responsable es ${RESPONSABLE.razonSocial} (CUIT ${RESPONSABLE.cuit}), ${RESPONSABLE.domicilio}. Tratamos los datos según la Ley 25.326 de Protección de los Datos Personales.`,
          ],
        },
        {
          titulo: "Qué datos usamos",
          parrafos: [
            "Los tuyos: nombre, email, teléfono si lo das, CUIT, condición frente al IVA y punto de venta.",
            "Los de tus facturas: comprador (CUIT, DNI o consumidor final), conceptos, importes, fecha y el CAE que da ARCA.",
            "No guardamos tu clave fiscal: no la necesitamos.",
          ],
        },
        {
          titulo: "Para qué",
          parrafos: [
            "Para emitir tus facturas en ARCA, mostrártelas, mandarte avisos del servicio y darte soporte. No vendemos ni alquilamos tus datos, y no los usamos para publicidad de terceros.",
          ],
        },
        {
          titulo: "Con quién los compartimos",
          parrafos: [
            "Con ARCA, que es quien autoriza cada comprobante. Con proveedores que alojan el servicio [hosting y base de datos — listar antes de publicar], que sólo los procesan para que Facturita funcione.",
          ],
        },
        {
          titulo: "Cuánto tiempo los guardamos",
          parrafos: [
            "Mientras tengas la cuenta y, después, el tiempo que pidan las normas fiscales para conservar comprobantes. [Plazo exacto — a confirmar con el contador.]",
          ],
        },
        {
          titulo: "Tus derechos",
          parrafos: [
            `Podés pedir acceso, corrección o supresión de tus datos escribiendo a ${RESPONSABLE.email}. El acceso es gratuito en intervalos no menores a seis meses, salvo interés legítimo (art. 14, Ley 25.326).`,
            "La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.",
          ],
        },
        {
          titulo: "Seguridad",
          parrafos: [
            "Cada cuenta está aislada de las demás y los certificados fiscales se guardan cifrados. La app instalada en tu celular no guarda copias de tus facturas.",
          ],
        },
      ]}
    />
  );
}
