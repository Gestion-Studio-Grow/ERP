import type { Metadata } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { entregablesPublicos } from "@/lib/proyectos/datos.server";
import { marcaProductora } from "@/lib/proyectos/marca";
import { fechaCorta, SERVICIO_LABEL, waLink, type Servicio } from "@/lib/proyectos/core";
import { ResponderPieza } from "./piezas";

// Link del cliente: sin login, la llave es el token. No se indexa ni se cachea.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Piezas para revisar", robots: { index: false, follow: false } };

const letra = localFont({ src: [{ path: "../../../fonts/work-sans/work-sans-latin-300-normal.woff2", weight: "300", style: "normal" }, { path: "../../../fonts/work-sans/work-sans-latin-400-normal.woff2", weight: "400", style: "normal" }, { path: "../../../fonts/work-sans/work-sans-latin-500-normal.woff2", weight: "500", style: "normal" }, { path: "../../../fonts/work-sans/work-sans-latin-600-normal.woff2", weight: "600", style: "normal" }], preload: false });

const ESTILOS = `
.mia-boton{min-height:48px;padding:0 20px;border:0;border-radius:999px;font:inherit;font-weight:500;cursor:pointer}
.mia-boton:disabled{opacity:.6;cursor:default}
.mia-boton-linea{background:transparent;color:inherit;border:1px solid currentColor}
.mia-campo{min-height:48px;width:100%;box-sizing:border-box;padding:0 12px;border:1px solid #1a1a1a55;border-radius:4px;background:#fff;color:#1a1a1a;font:inherit}`;

export default async function EntregablesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await entregablesPublicos(token).catch(() => null);
  if (!data) notFound();
  const { negocio, proyecto: p, piezas } = data;
  const marca = marcaProductora(negocio.slug);
  const pendientes = piezas.filter((x) => x.actual.estado === "ENVIADA").length;
  const wa = waLink(negocio.whatsapp, `Hola! Consulto por las piezas de "${p.nombre}".`);
  const titulo: React.CSSProperties = { margin: "0 0 12px", fontSize: 12, fontWeight: 500, letterSpacing: 3, textTransform: "uppercase" };

  return (
    <div className={letra.className} style={{ minHeight: "100dvh", background: marca.papel, color: marca.tinta }}>
      <style>{ESTILOS}</style>
      <header style={{ background: marca.tinta, color: marca.papel }}>
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          {marca.logoClaro ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={marca.logoClaro} alt={negocio.nombre} style={{ height: 30 }} />
          ) : (
            <strong style={{ fontSize: 20 }}>{negocio.nombre}</strong>
          )}
          <span style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>Piezas para revisar</span>
        </div>
      </header>

      <main style={{ maxWidth: 880, margin: "0 auto", padding: "40px 16px 64px", display: "grid", gap: 48 }}>
        <section>
          <p style={titulo}>{SERVICIO_LABEL[p.servicio as Servicio] ?? p.servicio} · Para {p.cliente}</p>
          <h1 style={{ margin: 0, fontSize: "clamp(32px, 7vw, 56px)", lineHeight: 1.05, fontWeight: 500 }}>{p.nombre}</h1>
          {p.evento && <p style={{ margin: "14px 0 0", fontSize: 18, fontWeight: 300 }}>{p.evento}</p>}
          <p style={{ margin: "16px 0 0", fontSize: 18 }}>
            {pendientes > 0 ? `${pendientes === 1 ? "Hay 1 pieza" : `Hay ${pendientes} piezas`} esperando tu respuesta.` : "No hay piezas esperando tu respuesta."}
          </p>
        </section>

        {piezas.map(({ id, nombre, actual: v, anteriores }) => (
          <article key={id} aria-label={nombre} style={{ borderTop: `4px solid ${marca.acento}`, paddingTop: 24, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 500 }}>{nombre}</h2>
            <p style={{ margin: "4px 0 0", fontSize: 14 }}>Versión {v.numero}{v.especificacion && ` · ${v.especificacion}`}</p>
            {v.nota && <p style={{ margin: "12px 0 0", fontSize: 16, whiteSpace: "pre-wrap" }}>{v.nota}</p>}
            {v.datos && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.datos} alt={`${nombre}, versión ${v.numero}`} style={{ display: "block", width: "100%", height: "auto", marginTop: 16, borderRadius: 4 }} />
            )}
            {v.url && (
              <a href={v.url} target="_blank" rel="noopener noreferrer" className="mia-boton mia-boton-linea" style={{ display: "inline-flex", alignItems: "center", marginTop: 16, textDecoration: "none" }}>Abrir la pieza</a>
            )}
            {v.estado === "ENVIADA" && <ResponderPieza token={token} versionId={v.id} acento={marca.acento} />}
            {v.estado === "APROBADA" && <p style={{ margin: "16px 0 0", fontSize: 18, fontWeight: 500 }}>Aprobada por {v.respondidoPor} el {fechaCorta(v.respondidaEl)}.</p>}
            {v.estado === "CAMBIOS" && (
              <p style={{ margin: "16px 0 0", fontSize: 16 }}>Recibimos tus cambios del {fechaCorta(v.respondidaEl)}: «{v.comentario}». Te mandamos la versión corregida por acá.</p>
            )}
            {anteriores.length > 0 && (
              <ul style={{ margin: "16px 0 0", padding: 0, listStyle: "none", fontSize: 14 }}>
                {anteriores.map((a) => (
                  <li key={a.id} style={{ paddingTop: 6 }}>
                    Versión {a.numero}: {a.respondidoPor ? `${a.estado === "APROBADA" ? "aprobada" : "cambios pedidos"} por ${a.respondidoPor} el ${fechaCorta(a.respondidaEl)}${a.comentario ? `, «${a.comentario}»` : ""}` : "reemplazada sin respuesta"}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}

        {piezas.length === 0 && <p style={{ margin: 0, fontSize: 18 }}>Todavía no hay piezas para mostrar.</p>}
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="mia-boton mia-boton-linea" style={{ display: "inline-flex", alignItems: "center", justifySelf: "start", textDecoration: "none" }}>Consultar por WhatsApp</a>}
      </main>

      {marca.lema && (
        <footer style={{ background: marca.acento, color: "#fff", padding: "16px", textAlign: "center", fontSize: 13, letterSpacing: 1 }}>{marca.lema}</footer>
      )}
    </div>
  );
}
