import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/ui";
import { Encabezado } from "@/components/inicio/Encabezado";
import s from "@/components/inicio/paginas.module.css";
import { CORREO_CONTACTO } from "@/lib/contenido/textos";
import { PLANES } from "@/lib/planes";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description: "Las reglas de uso de buscatufoto para fotógrafos y compradores. Borrador provisional a confirmar por un abogado.",
};

const pct = (n: number) => `${Math.round(n * 100)} %`;

export default function PaginaTerminos() {
  return (
    <div className={`contenedor ${s.pagina}`}>
      <Encabezado rotulo="Legal" titulo="Términos y condiciones" bajada="Última actualización: 8 de octubre de 2026." />
      <article className={s.hoja}>
        <Aviso tono="demo" className={s.aviso}>
          <strong>Borrador provisional a confirmar por un abogado.</strong> Este texto explica cómo pensamos el servicio,
          pero todavía no es un contrato revisado.
        </Aviso>
        <div className={s.prosa}>
          <h2>1. Qué es buscatufoto</h2>
          <p>
            buscatufoto es una plataforma donde fotógrafos de eventos publican fotos y videos para que las personas que
            aparecen en ellos los encuentren y los compren. Hoy funciona como <strong>demostración</strong>: los datos
            quedan en tu navegador y los pagos y envíos por WhatsApp están simulados.
          </p>

          <h2>2. Quién puede usarlo</h2>
          <p>
            Para crear una cuenta de fotógrafo tenés que ser mayor de edad y dar datos verdaderos. Sos responsable de lo
            que pase con tu cuenta y de cuidar tu acceso.
          </p>

          <h2>3. Las fotos son de quien las saca</h2>
          <ul>
            <li>El fotógrafo conserva todos los derechos sobre sus fotos y videos.</li>
            <li>
              Al publicar, nos autoriza a guardarlas, mostrar vistas previas con marca de agua y entregar los originales a
              quien los pague.
            </li>
            <li>
              Quien compra recibe una licencia de uso personal: puede guardarlas, imprimirlas y compartirlas en sus redes,
              pero no revenderlas ni usarlas con fines comerciales sin permiso del fotógrafo.
            </li>
          </ul>

          <h2>4. Qué se puede publicar</h2>
          <p>
            Sólo fotos y videos de eventos que el fotógrafo tomó y tiene derecho a vender. No se permite contenido íntimo,
            ofensivo, que viole la ley o la imagen de alguien de forma abusiva. Ante un reclamo, podemos dar de baja el
            contenido y la cuenta.
          </p>
          <p>
            Si aparecés en una foto y querés que la saquen, escribile al fotógrafo o a nosotros y lo resolvemos.
          </p>

          <h2>5. Precios y comisiones</h2>
          <p>
            Cada fotógrafo pone el precio de sus fotos. buscatufoto cobra según el plan: en el Libre, un{" "}
            {pct(PLANES.libre.comision)} de cada venta; en el Pro, una cuota fija sin comisión por venta. Los precios de
            los planes son <strong>provisionales a confirmar</strong>, están en pesos argentinos y no incluyen impuestos ni
            el costo del medio de pago. Ver <Link href="/#precios">precios</Link>.
          </p>

          <h2>6. Pagos y entregas</h2>
          <p>
            El original se entrega sólo con el pedido pagado. Mientras el servicio sea una demostración, ningún pago es
            real y no se mueve dinero. Cuando haya cobros reales, se van a hacer a través del medio de pago que elija el
            fotógrafo, con sus propias condiciones.
          </p>

          <h2>7. Lo que no garantizamos</h2>
          <p>
            Hacemos lo posible para que el servicio funcione bien, pero puede tener cortes o errores, sobre todo en esta
            etapa. Como en la demo todo se guarda en tu navegador, si borrás los datos del sitio se pierden; conviene
            conservar siempre tus originales.
          </p>

          <h2>8. Cambios</h2>
          <p>
            Podemos actualizar estos términos. Si el cambio es importante, lo vamos a avisar en el sitio antes de que rija.
          </p>

          <h2>9. Ley aplicable y contacto</h2>
          <p>
            Rigen las leyes de la República Argentina (provisional a confirmar). Para cualquier consulta, escribinos a{" "}
            {CORREO_CONTACTO} (provisional a confirmar) o desde <Link href="/contacto">contacto</Link>.
          </p>
        </div>
      </article>
    </div>
  );
}
