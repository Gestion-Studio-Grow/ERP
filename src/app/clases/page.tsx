import type { Metadata } from "next";
import { headers } from "next/headers";
import { getCurrentTenantId } from "@/lib/tenant";
import { agendaPublica, configPadel, datosDelNegocio, franjas, saludoDelAlumno } from "@/lib/padel/datos.server";
import { marcaProfe } from "@/lib/padel/marca";
import { diaCorto, horaHumana, linkWhatsApp, pesos } from "@/lib/padel/core";
import { leerTokenCookie } from "@/lib/padel/sesion-alumno.server";
import { reglaDeCancelacion, urlMaps } from "@/app/alumno/_vista/estado";
import Turnero from "./Turnero";
import { Piel } from "./_piel";
import { CabeceraPublica } from "./_cabecera";
import { DetallesProfe, PresentacionProfe } from "./_placa";
import { Logotipo, iniciales, nombreDelProfe } from "./_logotipo";
import { IconoInstagram, IconoReloj, IconoTilde } from "./_iconos";
import { botonBorde, foco } from "./_estilos";
import { turneroAbiertoDe } from "@/lib/profeturnos/verificacion.server";
import { MENSAJE_TURNERO_EN_VERIFICACION } from "@/lib/profeturnos/verificacion-core";

// El turnero del profe: lo que va en la bio de Instagram (§2.4). Sin login: tipo, día, hora y
// «Pedir». Lo libre se calcula en el servidor en cada visita (no se cachea: una franja tomada hace un
// minuto no puede seguir ofreciéndose). Con la cookie del alumno, lo saluda («Hola Juan · tu
// próxima jue 18:00 · Mis clases») sin pedirle nada. El manifiesto que se enlaza es el del ALUMNO
// (/mis-clases/app.webmanifest), nunca el del profe (que arranca en el backoffice).
//
// Piel: la placa de horarios del club (fronts/agendaprofe/DISENO.md). En la compu, dos columnas: la
// placa del profe (quieta, a la izquierda) y el turnero; en el celular, una sola, con la barra fija.
export const dynamic = "force-dynamic";

// Base de las URL absolutas de la metadata (og:image), sacada del host del request: sin esto Next
// las resuelve contra el .vercel.app del proyecto (trampa de la vidriera de autor, SKILL §5).
async function baseDelRequest(): Promise<URL | null> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0]!.trim();
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return null;
  const local = /(^|\.)localhost(:|$)|^127\.0\.0\.1(:|$)/.test(host);
  return new URL(`${local ? "http" : "https"}://${host}`);
}

export async function generateMetadata(): Promise<Metadata> {
  const base: Metadata = { manifest: "/mis-clases/app.webmanifest", generator: "Gestión Studio Grow" };
  try {
    const tenantId = await getCurrentTenantId();
    const [n, grilla] = await Promise.all([datosDelNegocio(tenantId), franjas(tenantId)]);
    const m = marcaProfe(n.slug);
    const title = `${n.nombre} · Pedí tu clase`;
    // Sin horarios publicados no se promete «elegí día y hora»: el turno se pide por mensaje.
    const description = grilla.some((f) => f.tipo === "DA")
      ? `Elegí día y hora para tu clase de pádel con ${n.profe}. Te confirma por WhatsApp.`
      : `Clases de pádel con ${n.profe}. Pedile un turno por mensaje y te contesta por WhatsApp.`;
    const metadataBase = m.og ? await baseDelRequest() : null;
    return {
      ...base,
      title,
      description,
      ...(metadataBase ? { metadataBase } : {}),
      ...(m.icono ? { icons: { icon: m.icono } } : {}),
      openGraph: { title, description, type: "website", locale: "es_AR", ...(m.og ? { images: [{ url: m.og, width: 1200, height: 630, alt: n.nombre }] } : {}) },
    };
  } catch {
    return { ...base, title: "Pedí tu clase" };
  }
}

const ZONA = "America/Argentina/Buenos_Aires";
const fechaDe = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: ZONA });

export default async function ClasesPage({ searchParams }: { searchParams: Promise<{ link?: string; fecha?: string; hora?: string; desde?: string }> }) {
  const tenantId = await getCurrentTenantId();
  // Alta asistida: el profe que se dio de alta solo y GSG todavía no verificó no recibe pedidos.
  // Sin horarios ni WhatsApp del profe (todavía no está confirmado). Lectura fallida → igual
  // (fail-closed). Negocios sin alta web: no-aplica (src/lib/profeturnos/verificacion-core.ts).
  if (!(await turneroAbiertoDe(tenantId))) return <TurneroEnVerificacion tenantId={tenantId} />;
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
  const nombre = nombreDelProfe(negocio.nombre);
  const maps = urlMaps(negocio.lugar);
  const wa = linkWhatsApp(negocio.whatsapp, `Hola ${profe}! Te escribo por las clases de pádel.`);
  const nombreApp = profe && profe !== "profe" ? `Clases con ${profe}` : "Mis clases";
  const proxima = saludo?.miProxima ?? null;
  const regla = reglaDeCancelacion(config.anticipacionMin);
  // QA 29/10: sin horarios publicados, ni el lema ni los pasos dicen «Elegí día y hora» (no hay qué
  // elegir): el turno se pide por mensaje, que es lo que ofrece la barra fija.
  const lema = sinHorarios ? `${config.precioGrupal > 0 ? "Clases individuales y con amigos. " : ""}Pedime un turno por mensaje y te contesto por WhatsApp.` : m.lema;
  const pasos = sinHorarios
    ? ["Me pedís un turno por mensaje", "Te confirmo por WhatsApp", "Pagás por alias o en efectivo"]
    : ["Elegís día y hora", "Te confirmo por WhatsApp", "Pagás por alias o en efectivo"];
  const enlaceCabecera = `inline-flex min-h-12 items-center rounded-[0.875rem] px-2 text-[0.9375rem] font-semibold text-[var(--padel-sobre-tinta)] underline underline-offset-4 ${foco}`;

  return (
    <Piel marca={m}>
      <CabeceraPublica
        grande
        logo={m.logo ? { src: m.logo, alt: negocio.nombre } : null}
        marca={m.logo ? undefined : <Logotipo nombre={nombre} />}
        derecha={
          saludo ? (
            <a href="/mis-clases" className={enlaceCabecera}>
              Mis clases
            </a>
          ) : (
            // «Entrá con tu celular» (/mis-clases sin cookie) es el mismo «Pedí tu link» de la barra.
            <a href="/mis-clases" className={enlaceCabecera} data-qa="ya-soy-alumno-cabecera">
              ¿Ya sos alumno?
            </a>
          )
        }
      />

      <main className="mx-auto max-w-[76rem] px-[clamp(1rem,4vw,3.5rem)] pb-40 pt-[clamp(1.5rem,4vw,3rem)] text-[clamp(1.0625rem,1.05vw,1.1875rem)] leading-[1.5] lg:pb-16">
        {saludo && (
          <section className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-[1.25rem] border-[1.5px] border-[var(--padel-linea)] bg-[var(--padel-superficie)] p-3" data-qa="saludo">
            <p className="inline-flex flex-wrap items-center gap-x-1.5">
              <strong>Hola {saludo.nombre}</strong>
              {proxima && (
                <>
                  {" · tu próxima "}
                  <span className="pz-num">
                    {diaCorto(fechaDe(proxima.empiezaEn))} {horaHumana(proxima.empiezaEn)}
                  </span>
                  {proxima.estado === "CONFIRMADA" ? (
                    <span className="inline-flex items-center text-[var(--padel-cancha)]" aria-label="confirmada" role="img">
                      <IconoTilde className="size-5" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[var(--padel-suave)]" aria-label="esperando confirmación" role="img">
                      <IconoReloj className="size-5" />
                    </span>
                  )}
                </>
              )}
            </p>
            <a href="/mis-clases" className={botonBorde} data-qa="mis-clases">
              Mis clases
            </a>
          </section>
        )}

        {/* Celular: presentación compacta → turnero (el primer horario en la primera pantalla) → detalles.
            Compu: placa entera a la izquierda (quieta) y turnero a la derecha, en el orden del diseño. El
            envoltorio de la placa es `contents` en el celular para que sus dos piezas se ordenen sueltas. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="contents lg:sticky lg:top-6 lg:col-span-5 lg:grid lg:gap-6 lg:self-start">
            <div className="order-1 lg:order-none">
              <PresentacionProfe nombre={nombre} lema={lema} />
            </div>
            <div className="order-3 mt-4 lg:order-none lg:mt-0">
              <DetallesProfe
                duracionMin={config.duracionMin}
                precio={config.precioIndividual > 0 ? pesos(config.precioIndividual) : null}
                precioGrupal={config.precioGrupal > 0 ? pesos(config.precioGrupal) : null}
                lugar={negocio.lugar}
                maps={maps}
                regla={regla}
                monograma={iniciales(nombre)}
              />
            </div>
          </div>
          <div className="order-2 min-w-0 lg:order-none lg:col-span-7">
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
              desde={typeof sp.desde === "string" ? sp.desde.slice(0, 20) : undefined}
              nombreApp={nombreApp}
              info={{ duracionMin: config.duracionMin, precioIndividual: config.precioIndividual, precioGrupal: config.precioGrupal, lugar: negocio.lugar, maps, regla }}
            />
          </div>
        </div>

        {/* «¿Cómo funciona?» deja de ser un desplegable cerrado: tres pasos a la vista, en la voz del profe. */}
        <section aria-labelledby="como-funciona" className="mt-[clamp(2rem,5vw,4rem)] rounded-[1.25rem] bg-[var(--padel-tinta)] p-5 text-[var(--padel-sobre-tinta)] sm:p-8" data-qa="como-funciona">
          <h2 id="como-funciona" className="pz-display text-[clamp(1.625rem,2.6vw,2.5rem)] font-bold leading-none">
            ¿Cómo funciona?
          </h2>
          <ol className="mt-5 grid gap-5 md:grid-cols-3 md:gap-8">
            {pasos.map((paso, i) => (
              <li key={paso} className="flex items-start gap-4">
                <span aria-hidden className="pz-display pz-num text-[clamp(3rem,5vw,4.5rem)] font-extrabold leading-[0.8] text-[var(--padel-vivo)]">
                  {i + 1}
                </span>
                <span className="pt-1 text-[1.125rem] font-semibold leading-snug">{paso}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-[0.9375rem] opacity-85">{regla} desde tu link.</p>
        </section>

        <footer className="mt-8 grid justify-items-center gap-2 text-center text-[0.875rem] text-[var(--padel-suave)]">
          {negocio.instagramUrl && (
            <a href={negocio.instagramUrl} className={`inline-flex min-h-12 items-center gap-2 text-base font-semibold text-[var(--padel-texto)] underline-offset-4 hover:underline ${foco}`} target="_blank" rel="noopener noreferrer">
              <IconoInstagram className="size-6" />
              {negocio.instagramLabel || "Instagram"}
            </a>
          )}
          {m.provisional && <p data-qa="identidad-provisoria">Identidad provisoria · se reemplaza por la marca de {profe}</p>}
        </footer>
      </main>
    </Piel>
  );
}

/** El turnero de un profe todavía sin verificar: sólo el aviso, sin nada que pedir. */
async function TurneroEnVerificacion({ tenantId }: { tenantId: string }) {
  const negocio = await datosDelNegocio(tenantId).catch(() => null);
  const m = marcaProfe(negocio?.slug);
  const nombre = nombreDelProfe(negocio?.nombre ?? "Clases de pádel");
  return (
    <Piel marca={m}>
      <CabeceraPublica grande marca={<Logotipo nombre={nombre} />} />
      <main className="mx-auto max-w-[40rem] px-[clamp(1rem,4vw,3.5rem)] pb-16 pt-[clamp(1.5rem,4vw,3rem)] text-[clamp(1.0625rem,1.05vw,1.1875rem)] leading-[1.5]">
        <section role="status" className="rounded-[1.25rem] border-[1.5px] border-[var(--padel-linea)] bg-[var(--padel-superficie)] p-5 sm:p-8" data-qa="turnero-en-verificacion">
          <h1 className="pz-display text-[clamp(1.625rem,2.6vw,2.5rem)] font-bold leading-tight">{MENSAJE_TURNERO_EN_VERIFICACION}</h1>
          <p className="mt-3 text-[var(--padel-suave)]">Estamos confirmando los datos del profe. En cuanto esté listo, desde acá vas a poder pedir tu clase.</p>
        </section>
        <footer className="mt-8 text-center text-[0.875rem] text-[var(--padel-suave)]">
          <p>Con tecnología de Gestión Studio Grow</p>
        </footer>
      </main>
    </Piel>
  );
}
