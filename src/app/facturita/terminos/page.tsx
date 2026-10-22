// FACTURITA · Términos y condiciones — BORRADOR (ver DocumentoLegal). Pública y estática.

import type { Metadata } from "next";
import DocumentoLegal from "../DocumentoLegal";
import { RESPONSABLE, VIGENCIA_BORRADOR } from "../legales";
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
            `Facturita es un servicio de ${RESPONSABLE.razonSocial} (CUIT ${RESPONSABLE.cuit}), con domicilio en ${RESPONSABLE.domicilio}. Al crear tu cuenta aceptás estos términos.`,
          ],
        },
        {
          titulo: "Qué hace Facturita",
          parrafos: [
            "Facturita te deja emitir facturas electrónicas con el servicio oficial de ARCA, a tu nombre y con tu CUIT. Nosotros transmitimos los datos que cargás; el comprobante lo autoriza ARCA.",
            `El plan gratuito incluye hasta ${LIMITE_FACTURAS_FACTURITA} facturas por mes. No incluye importar extractos bancarios, conciliación ni cobros con Mercado Pago: eso está en los planes de Comerciante.`,
          ],
        },
        {
          titulo: "Lo que te toca a vos",
          parrafos: [
            "Sos responsable de que los datos que cargás sean ciertos: tu CUIT, tu condición frente al IVA, tu punto de venta, el comprador y los importes. Una factura mal emitida se corrige con una nota de crédito.",
            "Para emitir, tenés que delegar en ARCA el servicio de facturación electrónica a Gestión Studio Grow desde el Administrador de Relaciones. Podés revocar esa delegación cuando quieras; desde ese momento no vamos a poder emitir por vos.",
            "Nunca te vamos a pedir tu clave fiscal. Si alguien te la pide en nombre de Facturita, no la des y avisanos.",
          ],
        },
        {
          titulo: "Alcance fiscal",
          parrafos: [
            "Facturita es una herramienta para emitir: no es un servicio de asesoramiento contable ni impositivo. La responsabilidad fiscal es tuya como contribuyente: elegir el tipo de comprobante, la categoría de monotributo, los topes, las retenciones y las presentaciones ante ARCA. Para eso, consultá a tu contador.",
            "Facturita usa el certificado digital de Gestión Studio Grow para conectarse con ARCA, sólo para el servicio que nos delegás y sólo para emitir a tu nombre. Si cargás un certificado propio, lo guardamos cifrado y únicamente lo usamos para firmar tus comprobantes.",
          ],
        },
        {
          titulo: "Disponibilidad",
          parrafos: [
            "Facturita depende de los servicios de ARCA. Si ARCA no responde, tu factura queda pendiente y la mandamos apenas vuelva, sin duplicarla. No respondemos por demoras o caídas de ARCA.",
          ],
        },
        {
          titulo: "Planes pagos y baja",
          parrafos: [
            "Si pasás a un plan pago, el precio y la forma de cobro se te informan antes de contratar. Podés darte de baja cuando quieras. [Botón de arrepentimiento y condiciones de cobro — a definir antes de habilitar planes pagos (Res. SCI 424/2020).]",
            "Si te das de baja, podés pedirnos una copia de tus comprobantes. Los comprobantes autorizados quedan además en ARCA.",
          ],
        },
        {
          titulo: "Cambios y ley aplicable",
          parrafos: [
            "Si cambiamos estos términos, te avisamos antes de que rijan. Se aplica la ley argentina, incluida la Ley 24.240 de Defensa del Consumidor cuando corresponda.",
            `Consultas: ${RESPONSABLE.email}.`,
          ],
        },
      ]}
    />
  );
}
