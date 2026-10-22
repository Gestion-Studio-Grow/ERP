import type { Metadata } from "next";
import { getCurrentTenantId } from "@/lib/tenant";
import { agendaPublica, configPadel, datosDelNegocio, franjas } from "@/lib/padel/datos.server";
import { marcaProfe } from "@/lib/padel/marca";
import { pesos } from "@/lib/padel/core";
import { leerTokenCookie } from "@/lib/padel/sesion-alumno.server";
import Turnero from "./Turnero";
import { Piel } from "./_piel";
import { CabeceraPublica } from "./_cabecera";

// El turnero pinta con la piel del contenedor (<Piel>): le pasamos las variables, no los hex.
const PIEL_EN_VARIABLES = {
  cancha: "var(--padel-cancha)",
  vivo: "var(--padel-vivo)",
  texto: "var(--padel-texto)",
  suave: "var(--padel-suave)",
  linea: "var(--padel-linea)",
};

// El turnero del profe: lo que va en la bio de Instagram. Sin login, tres pasos: día, hora y
// quién sos. Lo libre se calcula en el servidor en cada visita (no se cachea: una franja
// tomada hace un minuto no puede seguir ofreciéndose).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const n = await datosDelNegocio(await getCurrentTenantId());
    return {
      title: `${n.nombre} · Pedí tu clase`,
      description: "Elegí día y hora para tu clase de pádel. Te confirmo por WhatsApp.",
      generator: "Gestión Studio Grow",
    };
  } catch {
    return { title: "Pedí tu clase" };
  }
}

export default async function ClasesPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const tenantId = await getCurrentTenantId();
  const [negocio, config, dias, grilla, cookieAlumno, { link }] = await Promise.all([
    datosDelNegocio(tenantId),
    configPadel(tenantId),
    agendaPublica(tenantId),
    franjas(tenantId),
    leerTokenCookie(),
    searchParams,
  ]);
  // Sin ninguna franja en la que da clases, el profe todavía no publicó sus horarios: se dice eso,
  // no "no quedan horarios" (que sugiere una agenda llena que no existe).
  const sinHorarios = !grilla.some((f) => f.tipo === "DA");
  const m = marcaProfe(negocio.slug);

  return (
    <Piel marca={m}>
      <CabeceraPublica
        grande
        logo={m.logo ? { src: m.logo, alt: negocio.nombre } : null}
        antetitulo="Clases de pádel"
        titulo={negocio.nombre}
        lema={m.lema}
        detalle={
          config.precioIndividual > 0 || negocio.lugar ? (
            <>
              {config.precioIndividual > 0 && <span className="tabular-nums">{`Clase de ${config.duracionMin} min · ${pesos(config.precioIndividual)}`}</span>}
              {config.precioIndividual > 0 && negocio.lugar && " · "}
              {negocio.lugar}
            </>
          ) : null
        }
      />

      <main className="mx-auto max-w-[35rem] px-4 pb-12 pt-4">
        <Turnero
          dias={dias}
          sinHorarios={sinHorarios}
          hayGrupal={config.precioGrupal > 0}
          precioIndividual={config.precioIndividual}
          precioGrupal={config.precioGrupal}
          marca={PIEL_EN_VARIABLES}
          conSesion={Boolean(cookieAlumno)}
          abrirLink={link === "1"}
        />
        {negocio.instagramUrl && (
          <p className="mt-7 text-center text-sm text-[var(--padel-suave)]">
            <a href={negocio.instagramUrl} className="inline-flex min-h-12 items-center underline-offset-2 hover:underline" target="_blank" rel="noopener noreferrer">
              {negocio.instagramLabel || "Instagram"}
            </a>
          </p>
        )}
      </main>
    </Piel>
  );
}
