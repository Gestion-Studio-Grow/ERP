// FACTOQUE · Términos y condiciones (ver DocumentoLegal). Pública y estática.
// Marco: Ley 24.240 de Defensa del Consumidor (arts. 4, 10 ter, 34 y 37), Código Civil y Comercial
// (arts. 1107 y 1110), Res. SCI 424/2020 (botón de arrepentimiento) y Res. 316/2018 (botón de baja).
// Lo que no se pudo afirmar con certeza va entre corchetes (PENDIENTES en ../legales).

import type { Metadata } from "next";
import Link from "next/link";
import DocumentoLegal from "../DocumentoLegal";
import { PENDIENTES, RESPONSABLE, VIGENCIA } from "../legales";
import { LIMITE_FACTURAS_FACTURITA } from "@/lib/facturita-core";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Términos y condiciones — Factoque",
  description: "Las reglas de uso de Factoque, el emisor de facturas electrónicas de Gestión Studio Grow.",
  generator: "Gestión Studio Grow",
};

export default function TerminosPage() {
  return (
    <DocumentoLegal
      titulo="Términos y condiciones"
      vigencia={VIGENCIA}
      secciones={[
        {
          titulo: "Quiénes somos",
          parrafos: [
            `Factoque es un servicio de ${RESPONSABLE.razonSocial} (CUIT ${RESPONSABLE.cuit}), con domicilio en ${RESPONSABLE.domicilio}. Al crear tu cuenta aceptás estos términos. Te recomendamos guardarlos o imprimirlos.`,
          ],
        },
        {
          titulo: "Qué hace Factoque (y qué no)",
          parrafos: [
            "Factoque te deja emitir facturas electrónicas con el servicio oficial de ARCA, a tu nombre y con tu CUIT. Nosotros transmitimos los datos que cargás; el comprobante lo autoriza ARCA, que le asigna el CAE.",
            "Factoque emite. No te lleva la contabilidad, no presenta declaraciones juradas, no te recategoriza en el monotributo, no calcula retenciones ni percepciones y no reemplaza a tu contador.",
          ],
        },
        {
          titulo: "Lo que tenés que saber antes de empezar",
          parrafos: [
            `El plan gratuito no tiene costo y te deja emitir hasta ${LIMITE_FACTURAS_FACTURITA} facturas por mes calendario. Cuando llegás al tope, no podés emitir más con Factoque hasta el mes siguiente, salvo que pases a un plan pago. No te pedimos tarjeta.`,
            "No incluye importar extractos bancarios, conciliación ni cobros con Mercado Pago: eso está en los planes de Comerciante.",
            "Para emitir necesitás tu CUIT, tu condición frente al IVA, un punto de venta habilitado en ARCA para facturar por web services y tu propio certificado digital de ARCA, que se explica abajo.",
            "Si alguna vez cambiamos lo que incluye el plan gratuito, te avisamos antes de que rija.",
          ],
        },
        {
          titulo: "Tu certificado de ARCA",
          parrafos: [
            "Para emitir, Factoque usa tu propio certificado digital de ARCA, a tu nombre y de tu CUIT. El certificado es tuyo: lo sacás vos en ARCA con tu clave fiscal y lo asociás al servicio de facturación electrónica. Gestión Studio Grow no saca certificados por vos ni emite con un certificado propio.",
            "En «Mi cuenta» → «Conectar con ARCA» te guiamos en 4 pasos. El sistema genera el pedido del certificado y guarda la clave privada cifrada, separada de las demás cuentas: nadie la ve. Antes de usar el certificado verificamos que sea de tu CUIT; si no coincide, no se emite.",
            "Podés revocar tu certificado cuando quieras desde ARCA, en «Administración de Certificados Digitales». Desde ese momento Factoque no puede emitir por vos, y las facturas que estuvieran pendientes de enviar no van a salir: las vas a ver como rechazadas o pendientes en «Mis facturas».",
            "Si necesitás ayuda con el trámite, desde la app podés encontrar a los contadores que usan nuestro sistema.",
            "Nunca te vamos a pedir tu clave fiscal. Si alguien te la pide en nombre de Factoque, no la des y avisanos.",
          ],
        },
        {
          titulo: "Factoque es una herramienta",
          parrafos: [
            "Factoque es una herramienta para emitir tus comprobantes. Vos, como contribuyente, sos responsable de lo que emitís, de tu clave fiscal y de tu certificado digital.",
            "La responsabilidad de Gestión Studio Grow se limita, en total, a lo que nos hayas pagado por Factoque en los últimos 3 meses. Esto no limita los derechos que la Ley 24.240 de Defensa del Consumidor te da cuando sos consumidor.",
          ],
        },
        {
          titulo: "La responsabilidad fiscal es tuya",
          parrafos: [
            "Vos sos el contribuyente y la responsabilidad fiscal es tuya: que los datos sean ciertos (tu CUIT, tu condición frente al IVA, tu punto de venta, el comprador, la descripción y los importes), que el comprobante corresponda a una operación real y que cumplas con tus presentaciones, pagos y topes ante ARCA. Ante cualquier duda, consultá a tu contador.",
            "Factoque aplica las reglas de ARCA que conoce para armar el comprobante y frena la emisión cuando falta un dato que ARCA exige; por ejemplo, identificar al consumidor final desde el importe que fija la RG ARCA 5700/2025. Eso te ayuda, pero no reemplaza tu revisión.",
            "Una factura mal emitida no se borra: se anula con una nota de crédito.",
          ],
        },
        {
          titulo: "Conservación de tus comprobantes",
          parrafos: [
            `Guardar tus comprobantes durante el tiempo que pide la normativa de ARCA ${PENDIENTES.plazoConservacionFiscal} es una obligación tuya como contribuyente. Los comprobantes autorizados quedan además registrados en ARCA.`,
            "Mientras tengas la cuenta, los ves en «Mis facturas». Si te das de baja, podés pedirnos una copia antes de que borremos tus datos (ver la Política de privacidad).",
          ],
        },
        {
          titulo: "Tu cuenta",
          parrafos: [
            "El acceso a tu cuenta es personal. Si alguien más emite desde tu cuenta, lo hace bajo tu responsabilidad: cuidá tu contraseña y avisanos si sospechás que alguien entró sin permiso.",
          ],
        },
        {
          titulo: "Disponibilidad",
          parrafos: [
            "Factoque depende de los servicios de ARCA. Si ARCA no responde, tu factura queda pendiente y la volvemos a mandar apenas vuelva, sin duplicarla. Las demoras o caídas de ARCA no dependen de nosotros y no respondemos por ellas.",
          ],
        },
        {
          titulo: "Planes pagos: arrepentimiento y baja",
          parrafos: [
            "Además del plan gratuito, Factoque tiene planes pagos (Plus y Pro). Si pasás a uno, antes de contratar te vamos a mostrar el precio final en pesos con IVA incluido, qué incluye, cada cuánto se cobra y con qué medio de pago.",
            "Cuando contrates un plan pago a distancia, vas a tener 10 días corridos para arrepentirte, sin costo y sin dar explicaciones (art. 34 de la Ley 24.240 y art. 1110 del Código Civil y Comercial). Para eso, en la portada vas a tener un «Botón de arrepentimiento» que no te pide registrarte, y te vamos a mandar un código de tu pedido dentro de las 24 horas (Res. SCI 424/2020). [Botón de arrepentimiento — a implementar antes de habilitar planes pagos.]",
            "También vas a poder dar de baja el plan pago cuando quieras, por el mismo medio con el que lo contrataste, sin costo y con un «Botón de baja» visible; te mandamos la constancia de la baja dentro de las 72 horas (art. 10 ter de la Ley 24.240 y Res. 316/2018). [Botón de baja — a implementar antes de habilitar planes pagos.]",
          ],
        },
        {
          titulo: "Baja de la cuenta",
          parrafos: [
            `Podés darte de baja de Factoque cuando quieras y sin costo, por el mismo medio con el que te diste de alta o escribiendo a ${RESPONSABLE.email}. Si querés, revocá también tu certificado en ARCA.`,
          ],
        },
        {
          titulo: "Tus datos",
          parrafos: [
            <>
              Cómo usamos tus datos y los de tus clientes está en la{" "}
              <Link href="/facturita/privacidad" className="font-medium text-strong underline">
                Política de privacidad
              </Link>
              .
            </>,
          ],
        },
        {
          titulo: "Cambios, ley aplicable y reclamos",
          parrafos: [
            `Si cambiamos estos términos, te avisamos con ${PENDIENTES.avisoCambios} de anticipación. Si no estás de acuerdo, podés darte de baja sin costo antes de que rijan.`,
            "Se aplica la ley argentina, incluida la Ley 24.240 de Defensa del Consumidor cuando corresponda. Si sos consumidor, podés reclamar ante la autoridad de defensa del consumidor y los tribunales de tu domicilio.",
            `Consultas y reclamos: ${RESPONSABLE.email}.`,
          ],
        },
      ]}
    />
  );
}
