// PROFETURNOS · Términos y condiciones (ver ../DocumentoLegal). Pública y estática.
// Marco: Ley 24.240 de Defensa del Consumidor (arts. 4, 10 ter, 34 y 37), Código Civil y Comercial
// (arts. 1107 y 1110), Res. SCI 424/2020 (botón de arrepentimiento) y Res. 316/2018 (botón de baja).
// Responsable y pendientes: los mismos de Factoque (src/app/facturita/legales.ts). Precio y días de
// prueba: src/lib/profeturnos/planes.ts (provisional a confirmar).

import type { Metadata } from "next";
import Link from "next/link";
import DocumentoLegal from "../DocumentoLegal";
import { PENDIENTES, RESPONSABLE, VIGENCIA } from "@/app/facturita/legales";
import { DIAS_PRUEBA, precioMensualEnTexto } from "@/lib/profeturnos/planes";
import { PROFETURNOS } from "@/lib/factoque-tramites";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Términos y condiciones — ProfeTurnos",
  description: "Las reglas de uso de ProfeTurnos, la agenda y los turnos para profes de pádel de Gestión Studio Grow.",
  generator: "Gestión Studio Grow",
};

const R = PROFETURNOS.rutaBase;
const ENLACE = "font-medium text-strong underline";

export default function TerminosPage() {
  return (
    <DocumentoLegal
      titulo="Términos y condiciones"
      vigencia={VIGENCIA}
      secciones={[
        {
          titulo: "Quiénes somos",
          parrafos: [
            `ProfeTurnos es un servicio de ${RESPONSABLE.razonSocial} (CUIT ${RESPONSABLE.cuit}), con domicilio en ${RESPONSABLE.domicilio}. Al crear tu cuenta aceptás estos términos. Te recomendamos guardarlos o imprimirlos.`,
          ],
        },
        {
          titulo: "Qué hace ProfeTurnos (y qué no)",
          parrafos: [
            "ProfeTurnos es la agenda y el turnero de tus clases: tus alumnos piden turno desde tu link, vos confirmás, ves tu semana y anotás lo que te pagan y lo que te deben.",
            "ProfeTurnos no da clases, no reserva canchas en los clubes y no te lleva la contabilidad. Lo que pase entre vos y tus alumnos (horarios, cancelaciones, precios) lo acuerdan ustedes.",
          ],
        },
        {
          titulo: "La plata de tus alumnos es tuya",
          parrafos: [
            "Tus alumnos te pagan directo a vos: en efectivo, por transferencia o por Mercado Pago a tu propia cuenta. Gestión Studio Grow no recibe, no retiene y no toca esa plata, ni cobra comisión sobre tus clases.",
            "Lo que anotás en el panel (pagos, deudas, saldos a favor) es un registro tuyo para ordenarte. Facturarles a tus alumnos y cumplir con tus impuestos es responsabilidad tuya.",
          ],
        },
        {
          titulo: "Prueba gratis y abono mensual",
          parrafos: [
            `Cuando te das de alta tenés ${DIAS_PRUEBA} días de prueba gratis [provisional a confirmar]. Durante la prueba no te cobramos nada.`,
            `Para seguir después de la prueba, el abono cuesta ${precioMensualEnTexto()} por mes [precio provisional a confirmar], se paga por adelantado por Mercado Pago y te mostramos el precio final antes de pagar.`,
            `Si cambiamos el precio, te avisamos con ${PENDIENTES.avisoCambios} de anticipación y rige desde el mes siguiente. Si no estás de acuerdo, podés darte de baja sin costo antes de que rija.`,
          ],
        },
        {
          titulo: "Si el abono vence",
          parrafos: [
            "Si termina la prueba o vence el abono y no pagás, tu panel queda en modo lectura: ves todo lo que cargaste, pero no podés cargar ni confirmar clases nuevas.",
            "No se borra ningún dato: ni tus alumnos, ni tus clases, ni tus pagos. Cuando pagás el abono, todo vuelve a funcionar como estaba.",
          ],
        },
        {
          titulo: "Botón de arrepentimiento",
          parrafos: [
            <>
              Cuando contratás el abono a distancia, tenés {PROFETURNOS.diasArrepentimiento} días corridos para arrepentirte, sin costo y sin dar
              explicaciones (art. 34 de la Ley 24.240 y art. 1110 del Código Civil y Comercial). Usá el{" "}
              <Link href={`${R}/arrepentimiento`} className={ENLACE}>
                Botón de arrepentimiento
              </Link>
              : no te pide entrar a tu cuenta, te da un número de trámite en el momento y te devolvemos lo que pagaste por el mismo medio
              (Res. SCI 424/2020).
            </>,
          ],
        },
        {
          titulo: "Baja",
          parrafos: [
            <>
              Podés dar de baja el abono cuando quieras, sin costo, con el{" "}
              <Link href={`${R}/baja`} className={ENLACE}>
                Botón de baja
              </Link>{" "}
              (art. 10 ter de la Ley 24.240 y Res. 316/2018). Te damos un número de trámite en el momento, no se te cobra más y tu panel queda en
              modo lectura, sin borrar datos.
            </>,
            `Si además querés cerrar la cuenta y borrar tus datos, pedilo en el mismo trámite o escribiendo a ${RESPONSABLE.email}: los borramos dentro de ${PENDIENTES.plazoBorrado}.`,
          ],
        },
        {
          titulo: "Tu cuenta y tu responsabilidad",
          parrafos: [
            "El acceso a tu cuenta es personal: cuidá tu contraseña y avisanos si sospechás que alguien entró sin permiso.",
            "Hacemos lo posible para que ProfeTurnos funcione siempre, pero puede haber cortes. La responsabilidad de Gestión Studio Grow se limita, en total, a lo que nos hayas pagado por ProfeTurnos en los últimos 3 meses. Esto no limita los derechos que la Ley 24.240 de Defensa del Consumidor te da cuando sos consumidor.",
          ],
        },
        {
          titulo: "Tus datos y los de tus alumnos",
          parrafos: [
            <>
              Cómo usamos tus datos y los de tus alumnos está en la{" "}
              <Link href={`${R}/privacidad`} className={ENLACE}>
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
