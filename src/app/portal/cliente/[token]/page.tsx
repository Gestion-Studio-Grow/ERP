import type { Metadata } from "next";
import { Work_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { fechaCorta, SERVICIO_LABEL, waLink, type Servicio } from "@/lib/proyectos/core";
import { portalClientePublico } from "@/lib/proyectos/gestion-lecturas.server";
import { marcaProductora } from "@/lib/proyectos/marca";
import { separarEventos, type EventoDelCliente } from "@/lib/proyectos/portal-cliente-core";

// Etapa 2 · T5 — el link del cliente con todos sus eventos. Sin login: la llave es el token. No se indexa ni se cachea.
// La lectura ya trae sólo la lista blanca (nada de plata, proveedores, equipo ni notas) y da null si el token no es de
// este negocio, si no está la tabla o si el portal está apagado para la productora: acá eso es 404.
// No choca con /portal/[token]: este es de dos segmentos y «cliente» es fijo.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tus eventos", robots: { index: false, follow: false } };

const letra = Work_Sans({ subsets: ["latin"], weight: ["300", "400", "500", "600"], preload: false });

const ESTILOS = `
.mia-boton{min-height:48px;padding:0 20px;border:0;border-radius:999px;font:inherit;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;text-decoration:none}
.mia-boton-linea{background:transparent;color:inherit;border:1px solid currentColor}`;

function fechasDe(e: EventoDelCliente): string {
  if (!e.fechaEvento) return "Fecha a confirmar";
  return e.fechaFin && fechaCorta(e.fechaFin) !== fechaCorta(e.fechaEvento) ? `${fechaCorta(e.fechaEvento)} al ${fechaCorta(e.fechaFin)}` : fechaCorta(e.fechaEvento);
}

export default async function PortalClientePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await portalClientePublico(token).catch(() => null);
  if (!data) notFound();
  const { negocio, cliente, eventos } = data;
  const marca = marcaProductora(negocio.slug);
  const wa = waLink(negocio.whatsapp, `Hola! Soy de ${cliente}, consulto por nuestros eventos.`);
  const { proximos, pasados } = separarEventos(eventos, new Date());
  const titulo: React.CSSProperties = { margin: "0 0 12px", fontSize: 12, fontWeight: 500, letterSpacing: 3, textTransform: "uppercase" };

  const lista = (items: EventoDelCliente[], nombre: string) => (
    <section aria-label={nombre} style={{ display: "grid", gap: 16 }}>
      <h2 style={{ ...titulo, margin: 0 }}>{nombre}</h2>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 16 }}>
        {items.map((e, i) => (
          <li key={`${e.nombre}-${i}`} style={{ borderTop: `4px solid ${marca.acento}`, paddingTop: 16, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>{SERVICIO_LABEL[e.servicio as Servicio] ?? e.servicio} · {e.etapa}</p>
            <h3 style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 500 }}>{e.nombre}</h3>
            {(e.evento || e.tipoEvento) && <p style={{ margin: "6px 0 0", fontSize: 16, fontWeight: 300 }}>{[e.evento, e.tipoEvento].filter(Boolean).join(" · ")}</p>}
            <p style={{ margin: "6px 0 0", fontSize: 14 }}>{[e.lugar, e.ciudad, fechasDe(e)].filter(Boolean).join(" · ")}</p>
            {e.tokenPortal ? (
              <a href={`/portal/${e.tokenPortal}`} className="mia-boton mia-boton-linea" style={{ marginTop: 12 }}>Ver el detalle</a>
            ) : (
              <p style={{ margin: "12px 0 0", fontSize: 14, fontStyle: "italic" }}>Tu productora todavía no compartió el detalle.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className={letra.className} style={{ minHeight: "100dvh", background: marca.papel, color: marca.tinta, overflowWrap: "anywhere" }}>
      <style>{ESTILOS}</style>
      <header style={{ background: marca.tinta, color: marca.papel }}>
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          {marca.logoClaro ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={marca.logoClaro} alt={negocio.nombre} style={{ height: 30 }} />
          ) : (
            <strong style={{ fontSize: 20 }}>{negocio.nombre}</strong>
          )}
          <span style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>Tus eventos</span>
        </div>
      </header>

      <main style={{ maxWidth: 880, margin: "0 auto", padding: "40px 16px 64px", display: "grid", gap: 48 }}>
        <section>
          <p style={titulo}>Para {cliente}</p>
          <h1 style={{ margin: 0, fontSize: "clamp(32px, 7vw, 56px)", lineHeight: 1.05, fontWeight: 500 }}>Tus eventos con {negocio.nombre}</h1>
        </section>

        {proximos.length > 0 && lista(proximos, "Próximos")}
        {pasados.length > 0 && lista(pasados, "Realizados")}
        {eventos.length === 0 && <p style={{ margin: 0, fontSize: 18 }}>Todavía no hay eventos para mostrar. Te avisamos cuando haya novedades.</p>}
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="mia-boton mia-boton-linea" style={{ justifySelf: "start" }}>Consultar por WhatsApp</a>}
      </main>

      {marca.lema && <footer style={{ background: marca.acento, color: "#fff", padding: "16px", textAlign: "center", fontSize: 13, letterSpacing: 1 }}>{marca.lema}</footer>}
    </div>
  );
}
