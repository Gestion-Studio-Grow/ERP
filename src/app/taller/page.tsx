import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { getPublishedReviews } from "@/lib/reviews-actions";
import { datosDelNegocio } from "@/lib/taller/datos.server";
import { pesos, waLink } from "@/lib/taller/core";
import { marcaTaller } from "@/lib/taller/marca";

// Página pública del taller: marca, qué hace, reseñas, dónde queda, WhatsApp y turno.
// Sólo existe para negocios del rubro `taller`; el resto recibe la "no encontrada" de siempre.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const identity = await getTenantIdentity();
  if (identity.blueprintId !== "taller") return {};
  const n = await datosDelNegocio(await getCurrentTenantId());
  return {
    title: `${n.nombre} — Taller mecánico en ${n.direccion.split(",").pop()?.trim() || "tu barrio"}`,
    description: `Mecánica general, frenos, suspensión, inyección y diagnóstico computarizado. ${n.direccion}. Sacá turno online o escribinos por WhatsApp.`,
    manifest: "/taller/app.webmanifest",
  };
}

export default async function TallerLanding() {
  const identity = await getTenantIdentity();
  if (identity.blueprintId !== "taller") notFound();
  const tenantId = await getCurrentTenantId();
  const [negocio, servicios, resenas] = await Promise.all([
    datosDelNegocio(tenantId),
    prisma.service.findMany({ where: { tenantId, active: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, price: true }, take: 12 }),
    getPublishedReviews(),
  ]);
  const m = marcaTaller(negocio.slug);
  const wa = waLink(negocio.whatsapp, `Hola ${negocio.nombre}! Quiero consultar por mi auto.`);
  const mapa = negocio.direccion ? `https://www.google.com/maps?q=${encodeURIComponent(`${negocio.nombre}, ${negocio.direccion}`)}&output=embed` : null;

  const ancho: React.CSSProperties = { maxWidth: 1040, margin: "0 auto", padding: "0 20px" };
  const cta = (fondo: string, color: string, borde = fondo): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 54, padding: "0 26px", borderRadius: 12,
    background: fondo, color, border: `2px solid ${borde}`, fontWeight: 800, fontSize: 17, textDecoration: "none",
  });
  const h2: React.CSSProperties = { margin: "0 0 20px", fontSize: "clamp(1.6rem, 4vw, 2.2rem)", fontWeight: 900, letterSpacing: "-.02em", textTransform: "uppercase" };

  return (
    <div style={{ background: m.papel, color: m.tinta, fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", lineHeight: 1.5 }}>
      {/* Barra */}
      <header style={{ background: m.tinta, position: "sticky", top: 0, zIndex: 10, borderBottom: `4px solid ${m.rojo}` }}>
        <div style={{ ...ancho, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 10, paddingBottom: 10 }}>
          <a href="#inicio" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "#fff" }}>
            {m.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.logo} alt={negocio.nombre} style={{ height: 46 }} />
            ) : (
              <strong style={{ fontSize: 18 }}>{negocio.nombre}</strong>
            )}
          </a>
          <a href="/reserva" style={{ ...cta(m.rojo, "#fff"), minHeight: 44, padding: "0 18px", fontSize: 15 }}>Sacar turno</a>
        </div>
      </header>

      {/* Hero */}
      <section id="inicio" style={{ background: m.tinta, color: "#fff", padding: "56px 0 64px", backgroundImage: `repeating-linear-gradient(135deg, transparent 0 22px, rgba(255,255,255,.035) 22px 44px)` }}>
        <div style={{ ...ancho, display: "grid", gap: 28, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", alignItems: "center" }}>
          <div>
            <p style={{ margin: "0 0 10px", color: "#fff", opacity: 0.8, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", fontSize: 13 }}>
              Taller mecánico · {negocio.direccion.split(",").pop()?.trim() || "tu barrio"}
            </p>
            <h1 style={{ margin: 0, fontSize: "clamp(2.2rem, 7vw, 3.8rem)", lineHeight: 1.02, fontWeight: 900, letterSpacing: "-.03em", textTransform: "uppercase" }}>
              {m.lema.replace(/\.$/, "")}
              <span style={{ color: m.rojo }}>.</span>
            </h1>
            <p style={{ margin: "16px 0 26px", fontSize: 18, maxWidth: 520, opacity: 0.9 }}>
              Te decimos qué tiene tu auto, cuánto sale y cuándo está. Seguís el arreglo desde el celular y no hacemos nada sin tu OK.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <a href="/reserva" style={cta(m.rojo, "#fff")}>Sacar turno</a>
              {wa && <a href={wa} target="_blank" rel="noopener noreferrer" style={cta("transparent", "#fff", "#fff")}>WhatsApp</a>}
            </div>
            {m.google && (
              <p style={{ margin: "22px 0 0", fontSize: 15 }}>
                <a href={m.google.url} target="_blank" rel="noopener noreferrer" style={{ color: "#fff" }}>
                  <strong style={{ fontSize: 18 }}>★ {m.google.puntaje}</strong> en Google
                </a>
              </p>
            )}
          </div>
          {m.logo && (
            <div style={{ display: "grid", placeItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.logo} alt="" style={{ width: "min(360px, 80%)", filter: "drop-shadow(0 12px 30px rgba(0,0,0,.5))" }} />
            </div>
          )}
        </div>
      </section>

      {/* Servicios */}
      <section id="servicios" style={{ padding: "56px 0" }}>
        <div style={ancho}>
          <h2 style={h2}>Qué hacemos</h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {m.servicios.map((s) => (
              <li key={s} style={{ border: `2px solid ${m.tinta}`, borderRadius: 12, padding: "16px 18px", fontWeight: 800, fontSize: 17, borderLeft: `8px solid ${m.rojo}` }}>{s}</li>
            ))}
          </ul>
          {servicios.length > 0 && (
            <>
              <h3 style={{ margin: "36px 0 12px", fontSize: 18, fontWeight: 800 }}>Trabajos más pedidos</h3>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0 32px", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                {servicios.map((s) => (
                  <li key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid #ddd" }}>
                    <span>{s.name}</span>
                    <span style={{ whiteSpace: "nowrap", color: "#444" }}>{s.price > 0 ? `desde ${pesos(s.price).replace(",00", "")}` : "consultar"}</span>
                  </li>
                ))}
              </ul>
              <p style={{ margin: "12px 0 0", fontSize: 13, color: "#555" }}>Mano de obra de referencia. El presupuesto final se confirma al revisar el auto y tiene validez por escrito.</p>
            </>
          )}
        </div>
      </section>

      {/* Cómo trabajamos */}
      <section style={{ background: "#f4f4f5", padding: "56px 0" }}>
        <div style={ancho}>
          <h2 style={h2}>Así trabajamos</h2>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {[
              ["Traés el auto", "Anotamos qué le pasa y sacamos fotos de cómo llega, para que estés tranquilo."],
              ["Te pasamos el presupuesto", "Por WhatsApp, con el detalle. Aprobás lo que querés hacer, ítem por ítem."],
              ["Seguís el arreglo", "Con un link ves en qué está tu auto, sin llamar ni preguntar."],
              ["Lo retirás con garantía", "Te avisamos cuando está listo y cada trabajo sale con garantía por escrito."],
            ].map(([t, d], i) => (
              <li key={t} style={{ background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #e5e5e5" }}>
                <span aria-hidden style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: "50%", background: m.rojo, color: "#fff", fontWeight: 900, fontSize: 18 }}>{i + 1}</span>
                <h3 style={{ margin: "12px 0 4px", fontSize: 18, fontWeight: 800 }}>{t}</h3>
                <p style={{ margin: 0, color: "#444" }}>{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Reseñas */}
      {(resenas.length > 0 || m.google) && (
        <section id="resenas" style={{ padding: "56px 0" }}>
          <div style={ancho}>
            <h2 style={h2}>Lo que dicen los vecinos</h2>
            {resenas.length > 0 && (
              <ul style={{ listStyle: "none", margin: "0 0 20px", padding: 0, display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                {resenas.map((r) => (
                  <li key={r.id} style={{ border: "1px solid #ddd", borderRadius: 14, padding: 18 }}>
                    <p aria-label={`${r.rating} de 5 estrellas`} style={{ margin: 0, color: m.rojo, fontSize: 18, letterSpacing: 2 }}>{"★".repeat(r.rating)}<span style={{ color: "#ccc" }}>{"★".repeat(5 - r.rating)}</span></p>
                    {r.comment && <p style={{ margin: "8px 0" }}>“{r.comment}”</p>}
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{r.clientName}</p>
                  </li>
                ))}
              </ul>
            )}
            {m.google && (
              <a href={m.google.url} target="_blank" rel="noopener noreferrer" style={cta("#fff", m.tinta, m.tinta)}>
                ★ {m.google.puntaje} en Google — ver reseñas
              </a>
            )}
          </div>
        </section>
      )}

      {/* Dónde */}
      <section id="donde" style={{ background: m.tinta, color: "#fff", padding: "56px 0" }}>
        <div style={{ ...ancho, display: "grid", gap: 28, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div>
            <h2 style={h2}>Dónde estamos</h2>
            <p style={{ margin: "0 0 6px", fontSize: 19, fontWeight: 700 }}>{negocio.direccion || "Dirección a confirmar"}</p>
            <p style={{ margin: "0 0 18px", opacity: 0.9 }}>{negocio.horario}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {wa && <a href={wa} target="_blank" rel="noopener noreferrer" style={cta(m.rojo, "#fff")}>Escribinos por WhatsApp</a>}
              <a href={m.google?.url ?? negocio.mapsUrl} target="_blank" rel="noopener noreferrer" style={cta("transparent", "#fff", "#fff")}>Cómo llegar</a>
            </div>
            {negocio.instagramUrl && (
              <p style={{ margin: "18px 0 0" }}>
                Seguinos en <a href={negocio.instagramUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#fff", fontWeight: 700 }}>{negocio.instagramLabel}</a>
              </p>
            )}
          </div>
          {mapa && (
            <iframe title={`Mapa: ${negocio.direccion}`} src={mapa} loading="lazy" referrerPolicy="no-referrer-when-downgrade" style={{ width: "100%", minHeight: 300, border: 0, borderRadius: 14 }} />
          )}
        </div>
      </section>

      <footer style={{ background: "#000", color: "#fff", padding: "22px 0", fontSize: 14 }}>
        <div style={{ ...ancho, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
          <span>© {new Date().getFullYear()} {negocio.nombre}</span>
          <a href="/admin" style={{ color: "#fff", opacity: 0.8, minHeight: 44, display: "inline-flex", alignItems: "center" }}>Ingreso del taller</a>
        </div>
      </footer>

      {/* WhatsApp siempre a mano en el celular */}
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="Escribinos por WhatsApp" style={{ position: "fixed", right: 16, bottom: 16, zIndex: 20, display: "grid", placeItems: "center", width: 60, height: 60, borderRadius: "50%", background: "#128c4a", color: "#fff", fontWeight: 900, fontSize: 13, textDecoration: "none", boxShadow: "0 6px 20px rgba(0,0,0,.35)" }}>
          WA
        </a>
      )}
    </div>
  );
}
