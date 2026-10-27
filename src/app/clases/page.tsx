import type { Metadata } from "next";
import { getCurrentTenantId } from "@/lib/tenant";
import { agendaPublica, configPadel, datosDelNegocio, franjas, saludoDelAlumno } from "@/lib/padel/datos.server";
import { marcaProfe } from "@/lib/padel/marca";
import { diaCorto, horaHumana, linkWhatsApp, pesos } from "@/lib/padel/core";
import { leerTokenCookie } from "@/lib/padel/sesion-alumno.server";
import { reglaDeCancelacion, urlMaps } from "@/app/alumno/_vista/estado";
import Turnero from "./Turnero";
import { Piel } from "./_piel";
import { CabeceraPublica } from "./_cabecera";
import { botonBorde, foco } from "./_estilos";

// El turnero del profe: lo que va en la bio de Instagram (§2.4). Sin login: tipo, día, hora y
// «Pedir». Lo libre se calcula en el servidor en cada visita (no se cachea: una franja tomada hace un
// minuto no puede seguir ofreciéndose). Con la cookie del alumno, lo saluda («Hola Juan · tu
// próxima jue 18:00 ✓ · Mis clases») sin pedirle nada. El manifiesto que se enlaza es el del ALUMNO
// (/mis-clases/app.webmanifest), nunca el del profe (que arranca en el backoffice).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const base: Metadata = { manifest: "/mis-clases/app.webmanifest", generator: "Gestión Studio Grow" };
  try {
    const n = await datosDelNegocio(await getCurrentTenantId());
    return { ...base, title: `${n.nombre} · Pedí tu clase`, description: `Elegí día y hora para tu clase de pádel con ${n.profe}. Te confirma por WhatsApp.` };
  } catch {
    return { ...base, title: "Pedí tu clase" };
  }
}

const ZONA = "America/Argentina/Buenos_Aires";
const fechaDe = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: ZONA });

export default async function ClasesPage({ searchParams }: { searchParams: Promise<{ link?: string; fecha?: string; hora?: string }> }) {
  const tenantId = await getCurrentTenantId();
  const [negocio, config, dias, grilla, cookieAlumno, sp] = await Promise.all([
    datosDelNegocio(tenantId),
    configPadel(tenantId),
    agendaPublica(tenantId),
    franjas(tenantId),
    leerTokenCookie(),
    searchParams,
  ]);
  const saludo = cookieAlumno ? await saludoDelAlumno(tenantId, cookieAlumno) : null;
  // Sin ninguna franja en la que da clases, el profe todavía no publicó sus horarios: se dice eso,
  // no "no quedan horarios" (que sugiere una agenda llena que no existe).
  const sinHorarios = !grilla.some((f) => f.tipo === "DA");
  const m = marcaProfe(negocio.slug);
  const profe = negocio.profe;
  const maps = urlMaps(negocio.lugar);
  const wa = linkWhatsApp(negocio.whatsapp, `Hola ${profe}! Te escribo por las clases de pádel.`);
  const nombreApp = profe && profe !== "profe" ? `Clases con ${profe}` : "Mis clases";
  const proxima = saludo?.miProxima ?? null;

  return (
    <Piel marca={m}>
      <CabeceraPublica
        grande
        logo={m.logo ? { src: m.logo, alt: negocio.nombre } : null}
        antetitulo="Clases de pádel"
        titulo={negocio.nombre}
        lema={m.lema}
        detalle={
          <>
            {config.precioIndividual > 0 && <span className="tabular-nums">{`${config.duracionMin} min · ${pesos(config.precioIndividual)}`}</span>}
            {config.precioIndividual > 0 && negocio.lugar && " · "}
            {negocio.lugar &&
              (maps ? (
                <a href={maps} target="_blank" rel="noopener noreferrer" className={`underline underline-offset-2 ${foco}`} data-qa="lugar">
                  {negocio.lugar} <span aria-hidden>↗</span>
                  <span className="sr-only"> (abre el mapa)</span>
                </a>
              ) : (
                negocio.lugar
              ))}
            {(config.precioIndividual > 0 || negocio.lugar) && <br />}
            <span data-qa="regla-cancelacion">{reglaDeCancelacion(config.anticipacionMin)}.</span>
          </>
        }
      />

      <main className="mx-auto grid max-w-[35rem] grid-cols-1 gap-4 px-4 pb-44 pt-4">
        {saludo && (
          <section className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg,1rem)] border border-[var(--padel-linea)] bg-[var(--padel-superficie)] p-3" data-qa="saludo">
            <p className="text-base">
              <strong>Hola {saludo.nombre}</strong>
              {proxima && (
                <>
                  {" · tu próxima "}
                  <span className="tabular-nums">
                    {diaCorto(fechaDe(proxima.empiezaEn))} {horaHumana(proxima.empiezaEn)}
                  </span>{" "}
                  <span aria-label={proxima.estado === "CONFIRMADA" ? "confirmada" : "esperando confirmación"}>{proxima.estado === "CONFIRMADA" ? "✓" : "⏳"}</span>
                </>
              )}
            </p>
            <a href="/mis-clases" className={botonBorde} data-qa="mis-clases">
              Mis clases
            </a>
          </section>
        )}

        <details className="rounded-[var(--radius-lg,1rem)] border border-[var(--padel-linea)] bg-[var(--padel-superficie)] px-4" data-qa="como-funciona">
          <summary className={`flex min-h-12 cursor-pointer items-center text-base font-semibold ${foco}`}>¿Cómo funciona?</summary>
          <ol className="grid gap-1 pb-4 text-base">
            <li>1 · Elegís día y hora.</li>
            <li>2 · {profe} te confirma por WhatsApp.</li>
            <li>3 · Pagás por alias o en efectivo.</li>
            <li>{reglaDeCancelacion(config.anticipacionMin)} desde tu link.</li>
          </ol>
        </details>

        <Turnero
          dias={dias}
          sinHorarios={sinHorarios}
          precioIndividual={config.precioIndividual}
          precioGrupal={config.precioGrupal}
          profe={profe}
          wa={wa}
          conSesion={Boolean(saludo)}
          nombreAlumno={saludo?.nombre ?? null}
          abrirLink={sp.link === "1"}
          inicio={{ fecha: typeof sp.fecha === "string" ? sp.fecha : null, hora: typeof sp.hora === "string" ? sp.hora : null }}
          nombreApp={nombreApp}
        />

        {negocio.instagramUrl && (
          <p className="text-center text-sm text-[var(--padel-suave)]">
            <a href={negocio.instagramUrl} className={`inline-flex min-h-12 items-center underline-offset-2 hover:underline ${foco}`} target="_blank" rel="noopener noreferrer">
              {negocio.instagramLabel || "Instagram"}
            </a>
          </p>
        )}
      </main>
    </Piel>
  );
}
