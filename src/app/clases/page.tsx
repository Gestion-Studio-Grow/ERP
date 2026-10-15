import type { Metadata } from "next";
import { getCurrentTenantId } from "@/lib/tenant";
import { agendaPublica, configPadel, datosDelNegocio } from "@/lib/padel/datos.server";
import { marcaProfe } from "@/lib/padel/marca";
import { pesos } from "@/lib/padel/core";
import Turnero from "./Turnero";

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

export default async function ClasesPage() {
  const tenantId = await getCurrentTenantId();
  const [negocio, config, dias] = await Promise.all([datosDelNegocio(tenantId), configPadel(tenantId), agendaPublica(tenantId)]);
  const m = marcaProfe(negocio.slug);

  return (
    <div style={{ minHeight: "100dvh", background: m.papel, color: m.texto, fontFamily: "var(--font-body), system-ui, -apple-system, sans-serif" }}>
      <header style={{ background: m.tinta, color: "#fff", padding: "22px 16px 26px", borderBottom: `5px solid ${m.cancha}` }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          {m.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.logo} alt={negocio.nombre} style={{ height: 56 }} />
          ) : (
            <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.22em", textTransform: "uppercase", opacity: 0.8 }}>Clases de pádel</p>
          )}
          <h1 style={{ margin: "6px 0 6px", fontSize: 30, lineHeight: 1.1, letterSpacing: "-0.02em" }}>{negocio.nombre}</h1>
          <p style={{ margin: 0, fontSize: 16, opacity: 0.9 }}>{m.lema}</p>
          {(config.precioIndividual > 0 || negocio.lugar) && (
            <p style={{ margin: "10px 0 0", fontSize: 14, opacity: 0.8 }}>
              {config.precioIndividual > 0 && `Clase de ${config.duracionMin} min · ${pesos(config.precioIndividual)}`}
              {config.precioIndividual > 0 && negocio.lugar && " · "}
              {negocio.lugar}
            </p>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 560, margin: "0 auto", padding: "16px 16px 48px" }}>
        <Turnero
          dias={dias}
          hayGrupal={config.precioGrupal > 0}
          precioIndividual={config.precioIndividual}
          precioGrupal={config.precioGrupal}
          marca={{ cancha: m.cancha, vivo: m.vivo, texto: m.texto, suave: m.suave, linea: m.linea }}
        />
        {negocio.instagramUrl && (
          <p style={{ marginTop: 28, textAlign: "center", fontSize: 14, color: m.suave }}>
            <a href={negocio.instagramUrl} style={{ color: m.suave }} target="_blank" rel="noopener noreferrer">
              {negocio.instagramLabel || "Instagram"}
            </a>
          </p>
        )}
      </main>
    </div>
  );
}
