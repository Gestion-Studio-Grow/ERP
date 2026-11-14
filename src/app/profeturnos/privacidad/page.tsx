// PROFETURNOS · Política de privacidad (ver ../DocumentoLegal). Pública y estática.
// Marco: Ley 25.326 de Protección de los Datos Personales (arts. 5, 6, 11, 12, 14, 16, 21 y 25) y
// Disp. DNPDP 10/2008 (leyendas obligatorias; hoy el órgano de control es la AAIP). Responsable y
// pendientes: los mismos de Factoque (src/app/facturita/legales.ts).

import type { Metadata } from "next";
import DocumentoLegal from "../DocumentoLegal";
import { PENDIENTES, RESPONSABLE, SITIO_AAIP, VIGENCIA } from "@/app/facturita/legales";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Privacidad — ProfeTurnos",
  description: "Qué datos usa ProfeTurnos, para qué, y cómo ejercés tus derechos sobre ellos.",
  generator: "Gestión Studio Grow",
};

export default function PrivacidadPage() {
  return (
    <DocumentoLegal
      titulo="Política de privacidad"
      vigencia={VIGENCIA}
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
            "Los tuyos: nombre, email y contraseña para entrar a tu cuenta, tu teléfono, tus clubes, tus horarios y tus precios.",
            "Los de tus alumnos: nombre, teléfono y los turnos que piden, más lo que anotes de pagos y deudas.",
            "No usamos cookies de publicidad ni de medición: sólo la necesaria para mantener abierta tu sesión.",
          ],
        },
        {
          titulo: "Para qué los usamos",
          parrafos: [
            "Para que funcione tu agenda y tu turnero, avisarte cosas del servicio, cobrarte el abono y darte soporte. Los usamos porque los necesitamos para darte el servicio que pediste (art. 5, inc. 2, apartado d, Ley 25.326).",
            "No vendemos ni alquilamos tus datos, y no los usamos para publicidad de terceros.",
          ],
        },
        {
          titulo: "Los datos de tus alumnos",
          parrafos: [
            "Los datos de tus alumnos los tratamos por cuenta tuya (art. 25, Ley 25.326): sólo para tu agenda y tu turnero. No los usamos para otra cosa y no se los damos a nadie. Frente a tus alumnos, el responsable de esos datos sos vos.",
          ],
        },
        {
          titulo: "Con quién los compartimos",
          parrafos: [
            `Con los proveedores que alojan el servicio: ${PENDIENTES.proveedores}. Sólo los procesan para que ProfeTurnos funcione y no los pueden usar para otra cosa. Si alguno guarda datos fuera de la Argentina, la transferencia se hace con las garantías del art. 12 de la Ley 25.326. [Mecanismo de transferencia internacional — provisional a confirmar.]`,
            "Con Mercado Pago, cuando pagás el abono: los datos de tu pago los trata Mercado Pago con sus propias políticas.",
            "Si nos escribís por WhatsApp, lo que nos mandes pasa también por WhatsApp, que tiene sus propias políticas.",
            "Fuera de esos casos, sólo los entregamos si nos lo ordena un juez u otra autoridad con facultades legales.",
          ],
        },
        {
          titulo: "Cuánto tiempo los guardamos",
          parrafos: [
            "Mientras tengas la cuenta, aunque el abono esté vencido (el panel queda en modo lectura y no se borra nada).",
            `Si pedís cerrar la cuenta, te damos una copia de tus datos si nos la pedís, y después borramos tus datos y los de tus alumnos dentro de ${PENDIENTES.plazoBorrado}, salvo lo que una norma nos obligue a conservar.`,
          ],
        },
        {
          titulo: "Seguridad",
          parrafos: ["Cada cuenta está aislada de las demás: ningún profe ve los datos de otro."],
        },
        {
          titulo: "Tus derechos",
          parrafos: [
            `Podés pedirnos acceso a tus datos, que los corrijamos, los actualicemos o los borremos, escribiendo a ${RESPONSABLE.email}. Te contestamos el acceso dentro de los 10 días corridos (art. 14, Ley 25.326) y la corrección o el borrado dentro de los 5 días hábiles (art. 16, Ley 25.326). No borramos lo que una norma nos obligue a conservar ni lo que pueda perjudicar derechos de otras personas (art. 16, inc. 5).`,
            "Si no te contestamos en esos plazos, o la respuesta no te conforma, podés hacer un reclamo ante la Agencia de Acceso a la Información Pública o iniciar una acción de hábeas data.",
            "El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley Nº 25.326.",
            <>
              La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de
              atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas
              vigentes en materia de protección de datos personales. Sitio:{" "}
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
