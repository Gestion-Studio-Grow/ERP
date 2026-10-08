import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/ui";
import { Encabezado } from "@/components/inicio/Encabezado";
import s from "@/components/inicio/paginas.module.css";
import { CORREO_CONTACTO } from "@/lib/contenido/textos";

export const metadata: Metadata = {
  title: "Privacidad",
  description:
    "Qué datos usa buscatufoto y dónde quedan. En esta demo todo se guarda en tu navegador: no hay servidor y no se procesan rostros.",
};

export default function PaginaPrivacidad() {
  return (
    <div className={`contenedor ${s.pagina}`}>
      <Encabezado rotulo="Legal" titulo="Política de privacidad" bajada="Última actualización: 8 de octubre de 2026." />
      <article className={s.hoja}>
        <Aviso tono="demo" className={s.aviso}>
          <strong>Borrador provisional a confirmar por un abogado.</strong> Describe cómo funciona hoy la demostración.
        </Aviso>
        <div className={s.prosa}>
          <h2>Lo más importante, en corto</h2>
          <ul>
            <li>
              <strong>Todo queda en tu navegador.</strong> Cuentas, álbumes, fotos, pedidos y ajustes se guardan en el
              almacenamiento local de tu navegador (IndexedDB), en tu dispositivo.
            </li>
            <li>
              <strong>No hay servidor.</strong> En esta demo no enviamos tus fotos ni tus datos a ningún lado: nosotros no
              los vemos ni los guardamos.
            </li>
            <li>
              <strong>No se procesan rostros.</strong> No hay reconocimiento facial. La búsqueda por selfie está anunciada
              como próximamente y hoy no existe.
            </li>
            <li>
              <strong>Pagos y WhatsApp simulados.</strong> No se cobra nada ni se manda ningún mensaje.
            </li>
          </ul>

          <h2>Qué datos se usan</h2>
          <h3>Si sos fotógrafo</h3>
          <p>
            Nombre, correo, usuario público, bio, Instagram, datos de cobro (titular, alias o CVU, CUIT) y la configuración
            de tu marca de agua, además de las fotos y videos que subís. En la demo, los datos de cobro no se validan
            contra ningún banco ni billetera.
          </p>
          <h3>Si comprás</h3>
          <p>
            Nombre, correo y WhatsApp para armar el pedido y la entrega, más las fotos que elegiste. Todo queda en el
            navegador donde hiciste la compra.
          </p>

          <h2>Para qué</h2>
          <p>
            Sólo para que el servicio funcione: mostrar los álbumes, armar el carrito, simular el pago y habilitar la
            descarga. No vendemos datos ni hacemos publicidad con ellos, y la demo no carga herramientas de
            seguimiento de terceros.
          </p>

          <h2>Fotos y originales</h2>
          <p>
            Antes del pago, el comprador sólo ve una vista previa achicada y con marca de agua. El original se guarda
            aparte y sólo se ofrece con un pedido pagado. Un límite honesto de la demo: como todo vive en el navegador,
            alguien con conocimientos técnicos puede leer ese almacenamiento en su propio dispositivo. La protección
            completa necesita un servidor, y la vamos a sumar antes de operar con cobros reales.
          </p>

          <h2>Cuánto tiempo y cómo borrarlo</h2>
          <p>
            Los datos quedan hasta que los borres. Podés hacerlo desde la configuración de tu navegador, borrando los datos
            de este sitio. Como no tenemos copia, una vez borrados no se pueden recuperar.
          </p>

          <h2>Tus derechos</h2>
          <p>
            Tenés derecho a acceder, corregir y suprimir tus datos personales, según la Ley 25.326 de Protección de Datos
            Personales. En la demo lo hacés directamente desde tu navegador, porque los datos no salen de ahí.
          </p>

          <h2>Cuando deje de ser una demo</h2>
          <p>
            Si buscatufoto pasa a guardar datos en un servidor, vamos a actualizar esta política antes, contando qué se
            guarda, dónde y con quién se comparte (por ejemplo, el medio de pago).
          </p>

          <h2>Contacto</h2>
          <p>
            Escribinos a {CORREO_CONTACTO} (provisional a confirmar) o desde <Link href="/contacto">contacto</Link>.
          </p>
        </div>
      </article>
    </div>
  );
}
