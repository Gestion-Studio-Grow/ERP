// FACTURITA · Política de privacidad — BORRADOR (ver DocumentoLegal). Pública y estática.
// Marco: Ley 25.326 de Protección de los Datos Personales (arts. 5, 6, 11, 12, 14, 16, 21 y 25) y
// Disp. DNPDP 10/2008 (leyendas obligatorias; hoy el órgano de control es la AAIP). Lo que no se pudo
// afirmar con certeza va entre corchetes (PENDIENTES en ../legales).

import type { Metadata } from "next";
import DocumentoLegal from "../DocumentoLegal";
import { PENDIENTES, RESPONSABLE, SITIO_AAIP, VIGENCIA_BORRADOR } from "../legales";

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
            `El responsable de la base de datos es ${RESPONSABLE.razonSocial} (CUIT ${RESPONSABLE.cuit}), con domicilio en ${RESPONSABLE.domicilio}. Tratamos los datos según la Ley 25.326 de Protección de los Datos Personales.`,
            `Base inscripta en el Registro Nacional de Bases de Datos: ${PENDIENTES.registroAaip}.`,
          ],
        },
        {
          titulo: "Qué datos usamos",
          parrafos: [
            "Los tuyos: nombre, email y contraseña para entrar a tu cuenta, teléfono si nos escribís, CUIT, condición frente al IVA y punto de venta.",
            "Los de tus facturas: el comprador (CUIT, CUIL o DNI, o consumidor final sin identificar), la descripción, los importes, la fecha, el número y el CAE que da ARCA.",
            "Si usás tu propio certificado digital, el certificado y su clave privada, guardados cifrados.",
            "No guardamos tu clave fiscal: no la necesitamos. Tampoco usamos cookies de publicidad ni de medición: sólo la necesaria para mantener abierta tu sesión.",
          ],
        },
        {
          titulo: "Para qué los usamos",
          parrafos: [
            "Para emitir tus facturas en ARCA, mostrártelas, avisarte cosas del servicio y darte soporte. Los usamos porque los necesitamos para darte el servicio que pediste (art. 5, inc. 2, apartado d, Ley 25.326).",
            "No vendemos ni alquilamos tus datos, y no los usamos para publicidad de terceros.",
          ],
        },
        {
          titulo: "Qué datos son obligatorios",
          parrafos: [
            "El CUIT, la condición frente al IVA y el punto de venta son obligatorios: sin ellos ARCA no autoriza la factura y no podemos emitir. El teléfono es opcional. Si un dato está mal, la factura puede salir rechazada o con errores que después tenés que corregir con una nota de crédito.",
          ],
        },
        {
          titulo: "Los datos de tus clientes",
          parrafos: [
            "Cuando cargás en una factura el CUIT, el CUIL o el DNI de tu comprador, esos datos los tratamos por cuenta tuya (art. 25, Ley 25.326): sólo para emitir y guardar la factura. No los usamos para otra cosa y no se los damos a nadie más que a ARCA. Frente a tus clientes, el responsable de esos datos sos vos.",
          ],
        },
        {
          titulo: "Con quién los compartimos",
          parrafos: [
            "Con ARCA, porque la normativa fiscal exige informarle cada comprobante para autorizarlo.",
            `Con los proveedores que alojan el servicio: ${PENDIENTES.proveedores}. Sólo los procesan para que Facturita funcione y no los pueden usar para otra cosa. Si alguno guarda datos fuera de la Argentina, la transferencia se hace con las garantías del art. 12 de la Ley 25.326. [Mecanismo de transferencia internacional — a definir con el abogado.]`,
            "Si nos escribís por WhatsApp, lo que nos mandes pasa también por WhatsApp, que tiene sus propias políticas.",
            "Fuera de esos casos, sólo los entregamos si nos lo ordena un juez u otra autoridad con facultades legales.",
          ],
        },
        {
          titulo: "Cuánto tiempo los guardamos",
          parrafos: [
            `Mientras tengas la cuenta. Si te das de baja, te damos una copia de tus comprobantes si nos la pedís, y después borramos tus datos y los de tus clientes dentro de ${PENDIENTES.plazoBorrado}, salvo lo que una norma nos obligue a conservar.`,
            `Guardar tus comprobantes durante el tiempo que pide la normativa de ARCA ${PENDIENTES.plazoConservacionFiscal} es una obligación tuya como contribuyente. Los comprobantes autorizados quedan además registrados en ARCA.`,
          ],
        },
        {
          titulo: "Seguridad",
          parrafos: [
            "Cada cuenta está aislada de las demás y los certificados fiscales se guardan cifrados. La app instalada en tu celular no guarda copias de tus facturas.",
          ],
        },
        {
          titulo: "Tus derechos",
          parrafos: [
            `Podés pedirnos acceso a tus datos, que los corrijamos, los actualicemos o los borremos, escribiendo a ${RESPONSABLE.email}. Te contestamos el acceso dentro de los 10 días corridos (art. 14, Ley 25.326) y la corrección o el borrado dentro de los 5 días hábiles (art. 16, Ley 25.326). No borramos lo que una norma nos obligue a conservar ni lo que pueda perjudicar derechos de otras personas (art. 16, inc. 5).`,
            "Si no te contestamos en esos plazos, o la respuesta no te conforma, podés hacer un reclamo ante la Agencia de Acceso a la Información Pública o iniciar una acción de hábeas data.",
            "El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley Nº 25.326.",
            <>
              La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N°
              25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten
              afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos
              personales. Sitio:{" "}
              <a href={SITIO_AAIP} className="font-medium text-strong underline" rel="noopener noreferrer" target="_blank">
                argentina.gob.ar/aaip
              </a>
              .
            </>,
          ],
        },
        {
          titulo: "Cambios",
          parrafos: [
            `Si cambiamos esta política, te avisamos con ${PENDIENTES.avisoCambios} de anticipación y no usamos tus datos para algo nuevo sin decírtelo antes.`,
          ],
        },
      ]}
    />
  );
}
