// FACTURITA · Términos y condiciones — BORRADOR (ver DocumentoLegal). Pública y estática.
// Marco: Ley 24.240 de Defensa del Consumidor (arts. 4, 10 ter, 34 y 37), Código Civil y Comercial
// (arts. 1107 y 1110), Res. SCI 424/2020 (botón de arrepentimiento) y Res. 316/2018 (botón de baja).
// Lo que no se pudo afirmar con certeza va entre corchetes (PENDIENTES en ../legales).

import type { Metadata } from "next";
import Link from "next/link";
import DocumentoLegal from "../DocumentoLegal";
import { PENDIENTES, RESPONSABLE, VIGENCIA_BORRADOR } from "../legales";
import { LIMITE_FACTURAS_FACTURITA } from "@/lib/facturita-core";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Términos y condiciones — Facturita",
  description: "Las reglas de uso de Facturita, el emisor de facturas electrónicas de Gestión Studio Grow.",
  generator: "Gestión Studio Grow",
};

export default function TerminosPage() {
  return (
    <DocumentoLegal
      titulo="Términos y condiciones"
      vigencia={VIGENCIA_BORRADOR}
      secciones={[
        {
          titulo: "Quiénes somos",
          parrafos: [
            `Facturita es un servicio de ${RESPONSABLE.razonSocial} (CUIT ${RESPONSABLE.cuit}), con domicilio en ${RESPONSABLE.domicilio}. Al crear tu cuenta aceptás estos términos. Te recomendamos guardarlos o imprimirlos.`,
          ],
        },
        {
          titulo: "Qué hace Facturita (y qué no)",
          parrafos: [
            "Facturita te deja emitir facturas electrónicas con el servicio oficial de ARCA, a tu nombre y con tu CUIT. Nosotros transmitimos los datos que cargás; el comprobante lo autoriza ARCA, que le asigna el CAE.",
            "Facturita emite. No te lleva la contabilidad, no presenta declaraciones juradas, no te recategoriza en el monotributo, no calcula retenciones ni percepciones y no reemplaza a tu contador.",
          ],
        },
        {
          titulo: "Lo que tenés que saber antes de empezar",
          parrafos: [
            `El plan gratuito no tiene costo y te deja emitir hasta ${LIMITE_FACTURAS_FACTURITA} facturas por mes calendario. Cuando llegás al tope, no podés emitir más con Facturita hasta el mes siguiente, salvo que pases a un plan pago. No te pedimos tarjeta.`,
            "No incluye importar extractos bancarios, conciliación ni cobros con Mercado Pago: eso está en los planes de Comerciante.",
            "Para emitir necesitás tu CUIT, tu condición frente al IVA, un punto de venta habilitado en ARCA para facturar por web services y la delegación del servicio de facturación electrónica que se explica abajo.",
            "Si alguna vez cambiamos lo que incluye el plan gratuito, te avisamos antes de que rija.",
          ],
        },
        {
          titulo: "Delegación en ARCA",
          parrafos: [
            "Para emitir por vos, tenés que delegar el servicio de facturación electrónica de ARCA a Gestión Studio Grow desde el Administrador de Relaciones de Clave Fiscal. Con esa delegación sólo podemos emitir comprobantes electrónicos a tu nombre: no vemos ni tocamos ningún otro servicio de tu clave fiscal.",
            "Podés revocar la delegación cuando quieras, desde el mismo Administrador de Relaciones. Desde ese momento no vamos a poder emitir por vos, y las facturas que estuvieran pendientes de enviar no van a salir: las vas a ver como rechazadas o pendientes en «Mis facturas».",
            "Nunca te vamos a pedir tu clave fiscal. Si alguien te la pide en nombre de Facturita, no la des y avisanos.",
          ],
        },
        {
          titulo: "Certificado digital",
          parrafos: [
            "Con la delegación, Facturita se conecta con ARCA usando el certificado digital de Gestión Studio Grow, sólo para el servicio que nos delegaste y sólo para emitir a tu nombre.",
            `Si preferís usar tu propio certificado digital, lo cargamos nosotros a partir de lo que nos mandes por ${PENDIENTES.canalCertificado}. Lo guardamos cifrado, separado de las demás cuentas, y sólo lo usamos para firmar tus comprobantes. Antes de usarlo verificamos que sea de tu CUIT; si no coincide, no se emite. Podés revocarlo cuando quieras desde ARCA, en «Administración de Certificados Digitales».`,
          ],
        },
        {
          titulo: "La responsabilidad fiscal es tuya",
          parrafos: [
            "Vos sos el contribuyente y la responsabilidad fiscal es tuya: que los datos sean ciertos (tu CUIT, tu condición frente al IVA, tu punto de venta, el comprador, la descripción y los importes), que el comprobante corresponda a una operación real y que cumplas con tus presentaciones, pagos y topes ante ARCA. Ante cualquier duda, consultá a tu contador.",
            "Facturita aplica las reglas de ARCA que conoce para armar el comprobante y frena la emisión cuando falta un dato que ARCA exige; por ejemplo, identificar al consumidor final desde el importe que fija la RG ARCA 5700/2025. Eso te ayuda, pero no reemplaza tu revisión.",
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
            "Facturita depende de los servicios de ARCA. Si ARCA no responde, tu factura queda pendiente y la volvemos a mandar apenas vuelva, sin duplicarla. Las demoras o caídas de ARCA no dependen de nosotros y no respondemos por ellas.",
          ],
        },
        {
          titulo: "Planes pagos: arrepentimiento y baja",
          parrafos: [
            "Hoy Facturita es gratis y no cobramos nada. Si más adelante pasás a un plan pago, antes de contratar te vamos a mostrar el precio final en pesos con IVA incluido, qué incluye, cada cuánto se cobra y con qué medio de pago.",
            "Cuando contrates un plan pago a distancia, vas a tener 10 días corridos para arrepentirte, sin costo y sin dar explicaciones (art. 34 de la Ley 24.240 y art. 1110 del Código Civil y Comercial). Para eso, en la portada vas a tener un «Botón de arrepentimiento» que no te pide registrarte, y te vamos a mandar un código de tu pedido dentro de las 24 horas (Res. SCI 424/2020). [Botón de arrepentimiento — a implementar antes de habilitar planes pagos.]",
            "También vas a poder dar de baja el plan pago cuando quieras, por el mismo medio con el que lo contrataste, sin costo y con un «Botón de baja» visible; te mandamos la constancia de la baja dentro de las 72 horas (art. 10 ter de la Ley 24.240 y Res. 316/2018). [Botón de baja — a implementar antes de habilitar planes pagos.]",
          ],
        },
        {
          titulo: "Baja de la cuenta",
          parrafos: [
            `Podés darte de baja de Facturita cuando quieras y sin costo, por el mismo medio con el que te diste de alta o escribiendo a ${RESPONSABLE.email}. Acordate de revocar también la delegación en ARCA.`,
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
