import type { Metadata } from "next";
import { getCurrentTenantId } from "@/lib/tenant";
import { alumnoPublico, datosDelNegocio } from "@/lib/padel/datos.server";
import { marcaProfe } from "@/lib/padel/marca";
import { leerTokenCookie } from "@/lib/padel/sesion-alumno.server";
import { requestIp } from "@/lib/audit-core";
import { createRateLimiter } from "@/lib/rate-limit";
import { Piel } from "@/app/clases/_piel";
import { CabeceraPublica } from "@/app/clases/_cabecera";
import { EntrarConCelular } from "@/app/clases/YaSoyAlumno";
import { botonBorde, caja } from "@/app/clases/_estilos";
import { VistaAlumno } from "@/app/alumno/_vista/VistaAlumno";

// «Mis clases» (§2.2): lo que abre el ícono instalado (start_url del manifiesto del alumno). Lee la
// cookie `padel_alumno` de ESTE negocio (es por dominio: la de otro negocio no llega) y muestra la
// misma vista que el link. El token NO se escribe en la página: las acciones lo toman de la cookie.
// Sin cookie, o con un link que el profe renovó: «Entrá con tu celular» → el link llega por
// WhatsApp al número registrado, nunca a la pantalla.
export const dynamic = "force-dynamic";

// La lectura con la cookie va frenada por IP (como lo hacía la ruta mínima de T1): 60 cada 10 min
// alcanzan para diez alumnos en el wifi del club. Frenado, no se lee la base: «Probá en un rato».
const freno = createRateLimiter({ max: 60, windowMs: 10 * 60 * 1000 });

export async function generateMetadata(): Promise<Metadata> {
  const base: Metadata = { robots: { index: false, follow: false }, manifest: "/mis-clases/app.webmanifest", generator: "Gestión Studio Grow" };
  try {
    const n = await datosDelNegocio(await getCurrentTenantId());
    return { ...base, title: `Mis clases · ${n.nombre}` };
  } catch {
    return { ...base, title: "Mis clases" };
  }
}

export default async function MisClasesPage() {
  const token = await leerTokenCookie();
  const tenantId = await getCurrentTenantId();
  let frenado = false;
  let datos: Awaited<ReturnType<typeof alumnoPublico>> = null;
  if (token) {
    const clave = `padel-mis-clases:${tenantId}:${(await requestIp()) ?? "sin-ip"}`;
    frenado = freno.blocked(clave);
    if (!frenado) {
      freno.fail(clave);
      // alumnoPublico busca el token EN ESTE negocio (where: { tenantId, token }): una cookie vieja o
      // renovada no encuentra a nadie y cae a «Entrá con tu celular».
      datos = await alumnoPublico(token).catch(() => null);
    }
  }
  if (datos) return <VistaAlumno datos={datos} token={null} />;

  const negocio = await datosDelNegocio(tenantId);
  return (
    <Piel marca={marcaProfe(negocio.slug)}>
      <CabeceraPublica antetitulo={negocio.nombre} titulo="Entrá con tu celular" />
      <main className="mx-auto grid max-w-[35rem] grid-cols-1 gap-4 px-4 pb-12 pt-4">
        {frenado && (
          <p role="alert" className="rounded-[0.75rem] bg-[var(--padel-peligro-suave)] p-3 text-base font-semibold text-[var(--padel-peligro)]">
            Entraron muchas veces seguidas desde esta conexión. Probá de nuevo en unos minutos.
          </p>
        )}
        <section aria-labelledby="entrar" className={caja} data-qa="entrar-con-celular">
          <h2 id="entrar" className="mb-1 text-lg font-bold">
            Te mandamos tu link por WhatsApp
          </h2>
          <p className="mb-4 text-base text-[var(--padel-suave)]">
            Poné el celular con el que pediste clase con {negocio.profe}. Abrí el link que te llega y este teléfono queda recordado.
          </p>
          <EntrarConCelular />
        </section>
        <a href="/clases" className={`${botonBorde} w-full`} data-qa="ver-horarios">
          Ver horarios y pedir clase
        </a>
      </main>
    </Piel>
  );
}
