import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/ui";
import { Encabezado } from "@/components/inicio/Encabezado";
import s from "@/components/inicio/paginas.module.css";
import { CORREO_CONTACTO } from "@/lib/contenido/textos";

export const metadata: Metadata = {
  title: "Privacidad",
  description:
    "Qué datos usa buscatufoto, dónde quedan y quién responde por ellos, en el modo demostración y en las cuentas habilitadas. No hay reconocimiento facial.",
};

export default function PaginaPrivacidad() {
  return (
    <div className={`contenedor ${s.pagina}`}>
      <Encabezado rotulo="Legal" titulo="Política de privacidad" bajada="Última actualización: 4 de noviembre de 2026." />
      <article className={s.hoja}>
        <Aviso tono="demo" className={s.aviso}>
          <strong>Borrador provisional a confirmar por un abogado.</strong> Describe cómo funciona hoy buscatufoto, en
          sus dos modos.
        </Aviso>
        <div className={s.prosa}>
          <h2>Lo más importante, en corto</h2>
          <ul>
            <li>
              <strong>Dos modos.</strong> En el <strong>modo demostración</strong> todo queda en tu navegador
              (IndexedDB) y los pagos están simulados. En las <strong>cuentas habilitadas</strong> los datos se guardan
              en nuestro servidor y los cobros son reales.
            </li>
            <li>
              <strong>El responsable es el fotógrafo.</strong> Cada fotógrafo decide qué publica y a quién le vende.
              Gestión Studio Grow presta la plataforma y trata los datos por cuenta de él, como encargado.
            </li>
            <li>
              <strong>No se procesan rostros.</strong> No hay reconocimiento facial: las fotos se buscan por número de
              dorsal o por nombre de archivo. La búsqueda por selfie está anunciada como próximamente y hoy no existe.
            </li>
            <li>
              <strong>No vemos tu tarjeta.</strong> Los pagos los procesa Mercado Pago en la cuenta del fotógrafo.
            </li>
          </ul>

          <h2>Quién es responsable</h2>
          <p>
            El <strong>responsable</strong> de los datos de cada álbum y de cada venta es el fotógrafo que lo publica.{" "}
            <strong>Gestión Studio Grow</strong> es el <strong>encargado</strong>: guarda y procesa esos datos sólo para
            que el servicio funcione, siguiendo las instrucciones del fotógrafo.
          </p>

          <h2>Qué datos se guardan en el servidor (cuentas habilitadas)</h2>
          <h3>Si sos fotógrafo</h3>
          <p>
            Nombre, correo, usuario público, bio, Instagram, datos de cobro (titular, alias o CVU, CUIT), la configuración
            de tu marca de agua y tu contraseña guardada de forma irreversible (nunca en texto plano). Si conectás Mercado
            Pago, tu token de acceso se guarda <strong>cifrado</strong> y no se vuelve a mostrar ni a enviar al navegador.
          </p>
          <h3>Si comprás</h3>
          <p>
            Sólo nombre, correo y WhatsApp, para armar el pedido y hacerte llegar la entrega, más las fotos que elegiste.
          </p>
          <h3>Las fotos y videos</h3>
          <ul>
            <li>
              <strong>Original:</strong> se guarda en un almacén <strong>privado</strong>. Nunca se lista ni se muestra:
              sólo se entrega con un pedido pagado y su clave, mediante un enlace que vence a los pocos minutos.
            </li>
            <li>
              <strong>Vista previa:</strong> una copia achicada y con marca de agua, en un almacén{" "}
              <strong>público</strong>, que es lo que ve cualquiera que abra el álbum.
            </li>
          </ul>

          <h2>En el modo demostración</h2>
          <p>
            Cuentas, álbumes, fotos, pedidos y ajustes quedan en el almacenamiento local de tu navegador, en tu
            dispositivo: no nos llegan. Pagos y WhatsApp están simulados. Un límite honesto: alguien con conocimientos
            técnicos puede leer ese almacenamiento en su propio dispositivo. Para borrarlo, borrá los datos de este sitio
            desde la configuración del navegador; como no tenemos copia, no se pueden recuperar.
          </p>

          <h2>Para qué</h2>
          <p>
            Sólo para que el servicio funcione: mostrar los álbumes, armar el carrito, cobrar y habilitar la descarga. No
            vendemos datos ni hacemos publicidad con ellos, y no cargamos herramientas de seguimiento de terceros.
          </p>

          <h2>Pagos</h2>
          <p>
            Los cobros con Mercado Pago se hacen en la <strong>cuenta del fotógrafo</strong>, no en la nuestra. Los datos
            de tu tarjeta o de tu cuenta los carga y los procesa Mercado Pago, con sus propias políticas: nosotros no los
            vemos ni los guardamos. Sólo recibimos la confirmación de que el pago se aprobó y por qué monto. Si pagás por
            transferencia, la hacés directamente a los datos que publica el fotógrafo.
          </p>

          <h2>Menores de edad</h2>
          <p>
            En eventos puede haber menores. Al crear cada álbum, el fotógrafo declara —y queda registrado con la fecha— que
            el organizador tiene el consentimiento de los participantes y de los responsables de los menores para tomar y
            vender imágenes del evento. Si sos madre, padre o responsable y querés que se saque una foto, pedilo como se
            explica abajo.
          </p>

          <h2>Cómo pedir que saquen una foto</h2>
          <p>
            Si aparecés en una foto (o aparece un menor a tu cargo) y no querés que esté publicada, tocá{" "}
            <strong>«Pedir que saquen esta foto»</strong> en el visor de la foto: se abre un WhatsApp al fotógrafo con la
            referencia de la imagen (si el fotógrafo no cargó WhatsApp, te lleva a contacto). También podés escribirle al fotógrafo por WhatsApp o escribirnos a {CORREO_CONTACTO}{" "}
            (provisional a confirmar). Cuando el fotógrafo la oculta, la foto desaparece del álbum y deja de poder
            comprarse o descargarse.
          </p>

          <h2>Cuánto tiempo se guardan</h2>
          <p>
            Los originales y las vistas previas se borran a los <strong>90 días desde la fecha del evento</strong>{" "}
            (provisional a confirmar). Los pedidos quedan registrados, sin los archivos, para las cuentas del fotógrafo.
            El fotógrafo puede borrar antes un álbum, una foto o su cuenta.
          </p>

          <h2>Tus derechos</h2>
          <p>
            Según la Ley 25.326 de Protección de Datos Personales, tenés derecho a <strong>acceder</strong> a tus datos,
            a <strong>rectificarlos</strong> y a pedir su <strong>supresión</strong>. Podés pedirlo al fotógrafo o
            escribirnos a {CORREO_CONTACTO} (provisional a confirmar); el acceso es gratuito y te respondemos en los plazos
            de la ley. La autoridad de control es la <strong>Agencia de Acceso a la Información Pública (AAIP)</strong>,
            ante la que podés presentar un reclamo si no te respondemos.
          </p>

          <h2>Cambios</h2>
          <p>
            Si cambia qué guardamos, dónde o con quién lo compartimos, vamos a actualizar esta política y avisarlo en el
            sitio antes de que rija.
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
