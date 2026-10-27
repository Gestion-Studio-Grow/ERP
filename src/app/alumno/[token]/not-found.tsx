// «Este link ya no funciona» (M-048): un token que no existe (o que el profe regeneró, O-1) no
// deja al alumno en el 404 genérico en inglés. Con la marca del profe y dos salidas: pedir el
// link de nuevo (llega por WhatsApp al número registrado, nunca a la pantalla) o ver horarios.
// Next no le pasa params a not-found: el negocio sale del host, como en el turnero.

import { getCurrentTenantId } from "@/lib/tenant";
import { datosDelNegocio } from "@/lib/padel/datos.server";
import { marcaProfe } from "@/lib/padel/marca";
import { Piel } from "@/app/clases/_piel";
import { CabeceraPublica } from "@/app/clases/_cabecera";

const boton =
  "flex min-h-12 items-center justify-center rounded-[0.875rem] px-4 text-base font-bold no-underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--padel-cancha)]";

export default async function LinkQueNoFunciona() {
  let negocio = { nombre: "Clases de pádel", slug: "", profe: "el profe" };
  try {
    const n = await datosDelNegocio(await getCurrentTenantId());
    negocio = { nombre: n.nombre, slug: n.slug, profe: n.profe };
  } catch {
    // Sin negocio resuelto (host raro): igual se muestra la salida, con la paleta neutra.
  }
  const m = marcaProfe(negocio.slug);

  return (
    <Piel marca={m}>
      <title>{`Este link ya no funciona · ${negocio.nombre}`}</title>
      <meta name="robots" content="noindex, nofollow" />
      <CabeceraPublica antetitulo={negocio.nombre} titulo="Este link ya no funciona" />
      <main className="mx-auto grid max-w-[35rem] gap-4 px-4 pb-12 pt-4">
        <section
          aria-labelledby="link-roto"
          className="rounded-[var(--radius-lg)] border border-[var(--padel-linea)] bg-[var(--padel-superficie)] p-4"
          data-qa="link-roto"
        >
          <h2 id="link-roto" className="mb-2 text-lg font-bold">
            Puede que {negocio.profe} te haya mandado uno nuevo
          </h2>
          <p className="mb-4 text-base text-[var(--padel-suave)]">
            Pedilo con tu celular y te llega por WhatsApp al número con el que pediste clase.
          </p>
          <div className="grid gap-3">
            <a href="/clases?link=1" className={`${boton} bg-[var(--padel-cancha)] text-[var(--padel-sobre-cancha)]`} data-qa="pedir-mi-link">
              Pedir mi link
            </a>
            <a href="/clases" className={`${boton} border-2 border-[var(--padel-cancha)] text-[var(--padel-cancha)]`} data-qa="ver-horarios">
              Ver horarios
            </a>
          </div>
        </section>
      </main>
    </Piel>
  );
}
