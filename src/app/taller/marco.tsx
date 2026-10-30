// El marco común de las páginas públicas del taller (home y turno): datos del negocio, barra, pie y la barra
// fija del celular. Componentes de SERVIDOR: no suman JS al navegador.
import { cache } from "react";
import { notFound } from "next/navigation";
import { getCurrentTenantId } from "@/lib/tenant";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { configTaller, datosDelNegocio } from "@/lib/taller/datos.server";
import { mostrarPatente, waLink } from "@/lib/taller/core";
import { marcaTaller, type MarcaTaller } from "@/lib/taller/marca";
import EnlaceTurno from "./EnlaceTurno";

// Logo chico para la barra (177×88, generado del original 498×247 con sharp). El grande queda para og:image.
const LOGO_BARRA_AGR = "/tenants/taller-agr/marca/logo-88.webp";

// Los dos textos de fábrica de `hoursLabel` (src/lib/settings.ts:26 y :38): el primero es el de CH, no del taller.
const HORARIOS_DE_FABRICA = new Set(["Lun a sáb · 9 a 19 h", "Horarios a confirmar"]);

export type Taller = Awaited<ReturnType<typeof cargarTaller>>;

/** Todo lo que necesitan las páginas del taller. Corta con 404 si el negocio no es del rubro taller.
 *  `cache`: metadata y página lo piden en el mismo request y se lee una sola vez. */
export const cargarTaller = cache(async function cargarTaller() {
  const identity = await getTenantIdentity();
  if (identity.blueprintId !== "taller") notFound();
  const tenantId = await getCurrentTenantId();
  const [negocio, config] = await Promise.all([datosDelNegocio(tenantId), configTaller(tenantId)]);
  const marca = marcaTaller(negocio.slug);
  const esAGR = marca.logo?.includes("/taller-agr/") ?? false;
  const corto = esAGR ? "AGR" : negocio.nombre;
  const barrio = negocio.direccion.split(",").pop()?.trim() || "";

  // Horario: si el panel todavía tiene el texto de fábrica no se publica (diría «Lun a sáb · 9 a 19 h», el de CH).
  // AGR: sólo el jueves está verificado (docs/tenants/taller-agr/README.md:35); el resto, provisional a confirmar.
  const horario = !negocio.horario || HORARIOS_DE_FABRICA.has(negocio.horario)
    ? esAGR
      ? "Jueves 8:30–12 y 14:30–19 · resto de la semana, consultá"
      : "Horario a confirmar: consultanos por WhatsApp"
    : negocio.horario;

  /** Link de WhatsApp con el mensaje prellenado; null si el negocio no cargó número (y entonces no hay botón). */
  const wa = (patente?: string | null) =>
    waLink(negocio.whatsapp, `Hola ${corto}! Quiero consultar por mi auto${patente ? ` ${mostrarPatente(patente)}` : ""}.`);

  return {
    tenantId,
    negocio,
    config,
    marca,
    esAGR,
    barrio,
    horario,
    wa,
    logoBarra: esAGR ? LOGO_BARRA_AGR : marca.logo,
  };
});

export function IconoWhatsApp({ tam = 26 }: { tam?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={tam} height={tam} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  );
}

export function Barra({ t, inicio = false, turno = "/taller/turno" }: { t: Taller; inicio?: boolean; turno?: string }) {
  const { negocio, logoBarra } = t;
  return (
    <header className="agr-barra">
      <div className="agr-cont agr-barra__in">
        <a href={inicio ? "#inicio" : "/taller"} className="agr-barra__logo">
          {logoBarra ? (
            // Única aparición del logo arriba del pliegue (DISENO §3). <img> con medidas declaradas: CLS 0.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoBarra} alt={negocio.nombre} width={89} height={44} fetchPriority="high" decoding="async" />
          ) : (
            negocio.nombre
          )}
        </a>
        <nav className="agr-barra__nav" aria-label="Secciones">
          <a href={inicio ? "#servicios" : "/taller#servicios"}>Qué hacemos</a>
          <a href={inicio ? "#trabajamos" : "/taller#trabajamos"}>Así trabajamos</a>
          <a href={inicio ? "#donde" : "/taller#donde"}>Dónde estamos</a>
        </nav>
        {turno === "/taller/turno" ? (
          <EnlaceTurno className="agr-btn agr-btn--chico agr-barra__cta">Sacar turno</EnlaceTurno>
        ) : (
          <a href={turno} className="agr-btn agr-btn--chico agr-barra__cta">Sacar turno</a>
        )}
      </div>
    </header>
  );
}

export function Pie({ t }: { t: Taller }) {
  const { negocio, marca } = t;
  return (
    <footer className="agr-pie">
      <div className="agr-cont agr-pie__in">
        <div>
          <p>
            © {new Date().getFullYear()} {negocio.nombre}
            {negocio.direccion ? ` · ${negocio.direccion}` : ""}
          </p>
          <p className="agr-pie__lema">{lemaSinPunto(marca)}</p>
        </div>
        <div className="agr-pie__links">
          {negocio.instagramUrl && (
            <a href={negocio.instagramUrl} target="_blank" rel="noopener noreferrer">
              Instagram {negocio.instagramLabel}
            </a>
          )}
          <a href="/admin">Ingreso del taller</a>
        </div>
      </div>
    </footer>
  );
}

export function lemaSinPunto(m: MarcaTaller): string {
  return m.lema.replace(/\.$/, "");
}

/** Barra fija del celular en la home: «Sacar turno» + WhatsApp (si hay número). Oculta desde 768 px. */
export function BarraFija({ t }: { t: Taller }) {
  const wa = t.wa();
  return (
    <div className="agr-fija">
      <EnlaceTurno className="agr-btn">Sacar turno</EnlaceTurno>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className="agr-fija__wa" aria-label="Escribinos por WhatsApp">
          <IconoWhatsApp />
        </a>
      )}
    </div>
  );
}
