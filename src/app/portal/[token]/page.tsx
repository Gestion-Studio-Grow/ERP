import type { Metadata } from "next";
import { Work_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { fechaCorta, SERVICIO_LABEL, waLink, type Servicio } from "@/lib/proyectos/core";
import { portalPublico } from "@/lib/proyectos/gestion-lecturas.server";
import { marcaProductora } from "@/lib/proyectos/marca";
import { etapa2ActivaPara } from "@/lib/proyectos/etapa2.server";
import { ResponderPresentacion } from "./responder";

// Link del cliente: sin login, la llave es el token. No se indexa ni se cachea. Nunca costos, márgenes ni proveedores: la
// lectura selecciona campo por campo y acá no llega otra cosa.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tu evento", robots: { index: false, follow: false } };

const letra = Work_Sans({ subsets: ["latin"], weight: ["300", "400", "500", "600"], preload: false });

const ESTILOS = `
.mia-boton{min-height:48px;padding:0 20px;border:0;border-radius:999px;font:inherit;font-weight:500;cursor:pointer}
.mia-boton:disabled{opacity:.6;cursor:default}
.mia-boton-linea{background:transparent;color:inherit;border:1px solid currentColor}
.mia-campo{min-height:48px;width:100%;box-sizing:border-box;padding:0 12px;border:1px solid #1a1a1a55;border-radius:4px;background:#fff;color:#1a1a1a;font:inherit}`;

const ESTADO_PROPUESTA: Record<string, string> = { ENVIADO: "Esperando tu respuesta", APROBADO: "Aprobada", RECHAZADO: "Con cambios pedidos" };
const ESTADO_PIEZA: Record<string, string> = { ENVIADA: "Esperando tu respuesta", APROBADA: "Aprobada", CAMBIOS: "Con cambios pedidos", REEMPLAZADA: "Reemplazada" };

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await portalPublico(token).catch(() => null);
  if (!data) notFound();
  // Etapa 2: el portal existe sólo si el negocio dueño del token lo tiene prendido (apagado por defecto).
  if (!(await etapa2ActivaPara(data.tenantId, "portal"))) notFound();
  const { negocio, proyecto: p, propuesta, presentaciones, piezas, tokenEntregables, archivos } = data;
  const marca = marcaProductora(negocio.slug);
  const wa = waLink(negocio.whatsapp, `Hola! Consulto por "${p.nombre}".`);
  const titulo: React.CSSProperties = { margin: "0 0 12px", fontSize: 12, fontWeight: 500, letterSpacing: 3, textTransform: "uppercase" };
  const linea: React.CSSProperties = { display: "inline-flex", alignItems: "center", textDecoration: "none" };
  const fechas = p.fechaEvento && (p.fechaFin && fechaCorta(p.fechaFin) !== fechaCorta(p.fechaEvento) ? `${fechaCorta(p.fechaEvento)} al ${fechaCorta(p.fechaFin)}` : fechaCorta(p.fechaEvento));

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
          <span style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>Tu evento</span>
        </div>
      </header>

      <main style={{ maxWidth: 880, margin: "0 auto", padding: "40px 16px 64px", display: "grid", gap: 48 }}>
        <section>
          <p style={titulo}>{SERVICIO_LABEL[p.servicio as Servicio] ?? p.servicio} · Para {p.cliente}</p>
          <h1 style={{ margin: 0, fontSize: "clamp(32px, 7vw, 56px)", lineHeight: 1.05, fontWeight: 500 }}>{p.nombre}</h1>
          {(p.evento || p.tipoEvento) && <p style={{ margin: "14px 0 0", fontSize: 18, fontWeight: 300 }}>{[p.evento, p.tipoEvento].filter(Boolean).join(" · ")}</p>}
          {(p.lugar || p.ciudad || fechas) && <p style={{ margin: "8px 0 0", fontSize: 14 }}>{[p.lugar, p.ciudad, fechas].filter(Boolean).join(" · ")}</p>}
        </section>

        {propuesta && (
          <section aria-label="Propuesta" style={{ borderTop: `4px solid ${marca.acento}`, paddingTop: 24 }}>
            <h2 style={titulo}>Propuesta</h2>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>Versión {propuesta.version}</p>
            <p style={{ margin: "4px 0 16px", fontSize: 14 }}>
              {ESTADO_PROPUESTA[propuesta.estado] ?? propuesta.estado}
              {propuesta.estado === "APROBADO" && propuesta.respondidoPor && ` por ${propuesta.respondidoPor}`}
              {propuesta.enviadoEl && ` · Enviada el ${fechaCorta(propuesta.enviadoEl)}`}
              {propuesta.estado === "ENVIADO" && propuesta.validoHasta && ` · Válida hasta el ${fechaCorta(propuesta.validoHasta)}`}
            </p>
            <a href={`/propuesta/${propuesta.token}`} className="mia-boton" style={{ ...linea, background: marca.acento, color: "#fff" }}>Ver la propuesta</a>
          </section>
        )}

        {presentaciones.length > 0 && (
          <section aria-label="Presentaciones" style={{ display: "grid", gap: 32 }}>
            <h2 style={{ ...titulo, margin: 0 }}>Presentaciones</h2>
            {presentaciones.map((x) => (
              <article key={x.id} aria-label={x.nombre} style={{ borderTop: `4px solid ${marca.acento}`, paddingTop: 24, minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: 28, fontWeight: 500 }}>{x.nombre}</h3>
                <p style={{ margin: "4px 0 0", fontSize: 14 }}>{fechaCorta(x.createdAt)}</p>
                <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
                  {x.laminas.map((l, i) => (
                    <figure key={i} style={{ margin: 0, minWidth: 0 }}>
                      {l.imagen && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={l.imagen} alt={l.titulo || `Lámina ${i + 1}`} style={{ display: "block", width: "100%", height: "auto", borderRadius: 4 }} />
                      )}
                      {l.titulo && <figcaption style={{ marginTop: 8, fontSize: 18, fontWeight: 500 }}>{l.titulo}</figcaption>}
                      {l.texto && <p style={{ margin: "4px 0 0", fontSize: 16, whiteSpace: "pre-wrap" }}>{l.texto}</p>}
                    </figure>
                  ))}
                </div>
                {x.estado === "ENVIADA" && <ResponderPresentacion token={token} presentacionId={x.id} acento={marca.acento} />}
                {x.estado !== "ENVIADA" && x.respuesta && <p style={{ margin: "16px 0 0", fontSize: 16, fontWeight: 500 }}>{x.respuesta}</p>}
              </article>
            ))}
          </section>
        )}

        {piezas.length > 0 && (
          <section aria-label="Piezas" style={{ borderTop: `4px solid ${marca.acento}`, paddingTop: 24 }}>
            <h2 style={titulo}>Piezas</h2>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8, fontSize: 16 }}>
              {piezas.map((x) => <li key={x.id}><strong style={{ fontWeight: 500 }}>{x.nombre}</strong> · Versión {x.numero} · {ESTADO_PIEZA[x.estado] ?? x.estado}</li>)}
            </ul>
            {tokenEntregables && <a href={`/entregables/${tokenEntregables}`} className="mia-boton mia-boton-linea" style={{ ...linea, marginTop: 16 }}>Revisar las piezas</a>}
          </section>
        )}

        {archivos.length > 0 && (
          <section aria-label="Archivos" style={{ borderTop: `4px solid ${marca.acento}`, paddingTop: 24 }}>
            <h2 style={titulo}>Archivos</h2>
            <div style={{ display: "grid", gap: 16 }}>
              {archivos.map((x) => (
                <figure key={x.id} style={{ margin: 0, minWidth: 0 }}>
                  {x.imagen && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={x.imagen} alt={x.nombre} style={{ display: "block", width: "100%", height: "auto", borderRadius: 4 }} />
                  )}
                  <figcaption style={{ marginTop: 6, fontSize: 14 }}>
                    {x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", minHeight: 44, color: "inherit" }}>{x.nombre}</a> : x.nombre}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {!propuesta && presentaciones.length === 0 && piezas.length === 0 && archivos.length === 0 && <p style={{ margin: 0, fontSize: 18 }}>Todavía no hay nada para revisar. Te avisamos cuando esté listo.</p>}
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="mia-boton mia-boton-linea" style={{ ...linea, justifySelf: "start" }}>Consultar por WhatsApp</a>}
      </main>

      {marca.lema && <footer style={{ background: marca.acento, color: "#fff", padding: "16px", textAlign: "center", fontSize: 13, letterSpacing: 1 }}>{marca.lema}</footer>}
    </div>
  );
}
