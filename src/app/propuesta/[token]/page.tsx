import type { Metadata } from "next";
import { Work_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { propuestaPublica } from "@/lib/proyectos/datos.server";
import { cambioDeVenta, ventaEn } from "@/lib/proyectos/gestion-core";
import { marcaProductora } from "@/lib/proyectos/marca";
import { clientePuedeResponder, fechaCorta, porRubro, SERVICIO_LABEL, waLink, yaVencio, type Servicio } from "@/lib/proyectos/core";
import { BotonImprimir, Responder, VisorStand } from "./piezas";
import { etapa2ActivaPara } from "@/lib/proyectos/etapa2.server";

// Link del cliente: sin login, la llave es el token. No se indexa ni se cachea.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Propuesta", robots: { index: false, follow: false } };

// La letra de la marca (MIA usa Work Sans en su sitio). Sólo la baja quien abre una propuesta.
const letra = Work_Sans({ subsets: ["latin"], weight: ["300", "400", "500", "600"], preload: false });

const ESTILOS = `
.mia-boton{min-height:48px;padding:0 20px;border:0;border-radius:999px;font:inherit;font-weight:500;cursor:pointer}
.mia-boton:disabled{opacity:.6;cursor:default}
.mia-boton-linea{background:transparent;color:inherit;border:1px solid currentColor}
.mia-campo{min-height:48px;width:100%;box-sizing:border-box;padding:0 12px;border:1px solid #1a1a1a55;border-radius:4px;background:#fff;color:#1a1a1a;font:inherit}
.mia-tabla{width:100%;border-collapse:collapse;font-size:15px}
.mia-tabla td,.mia-tabla th{padding:8px 0;border-top:1px solid #1a1a1a22;text-align:left;vertical-align:top;font-weight:400}
.mia-tabla .num{text-align:right;white-space:nowrap;padding-left:12px}
@media print{
  @page{margin:14mm}
  .mia-solo-pantalla{display:none!important}
  html,body,.mia-hoja{background:#fff!important}
  .mia-tabla tr,figure{break-inside:avoid}
  .mia-tabla tfoot{display:table-row-group}
  .mia-hoja h2,.mia-hoja h3{break-after:avoid}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}`;

export default async function PropuestaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await propuestaPublica(token).catch(() => null);
  if (!data) notFound();
  const { presupuesto: b, negocio, totales: t } = data;
  const cambio = cambioDeVenta(b.proyecto.moneda, b.tcVenta, {});
  const pesos = (n: number) => ventaEn(n, b.proyecto.moneda, cambio);
  const p = b.proyecto;
  // Etapa 2: el visor 3D sale sólo si el negocio DUEÑO del token lo tiene prendido (nunca el de la sesión).
  const con3d = await etapa2ActivaPara(b.tenantId, "armador3d");
  const marca = marcaProductora(negocio.slug);
  const puede = clientePuedeResponder(b);
  const vencida = b.estado === "ENVIADO" && yaVencio(b.validoHasta);
  const wa = waLink(negocio.whatsapp, `Hola! Consulto por la propuesta de "${p.nombre}".`);
  const titulo: React.CSSProperties = { margin: "0 0 12px", fontSize: 12, fontWeight: 500, letterSpacing: 3, textTransform: "uppercase" };

  return (
    <div className={`mia-hoja ${letra.className}`} style={{ minHeight: "100dvh", background: marca.papel, color: marca.tinta }}>
      <style>{ESTILOS}</style>
      <header style={{ background: marca.tinta, color: marca.papel }}>
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          {marca.logoClaro ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={marca.logoClaro} alt={negocio.nombre} style={{ height: 30 }} />
          ) : (
            <strong style={{ fontSize: 20 }}>{negocio.nombre}</strong>
          )}
          <span style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>Propuesta · versión {b.version}</span>
        </div>
      </header>

      <main style={{ maxWidth: 880, margin: "0 auto", padding: "40px 16px 64px", display: "grid", gap: 48 }}>
        <section>
          <p style={titulo}>{SERVICIO_LABEL[p.servicio as Servicio] ?? p.servicio} · Para {p.client.name}</p>
          <h1 style={{ margin: 0, fontSize: "clamp(32px, 7vw, 56px)", lineHeight: 1.05, fontWeight: 500 }}>{p.nombre}</h1>
          {(p.evento || p.lugar) && <p style={{ margin: "14px 0 0", fontSize: 18, fontWeight: 300 }}>{[p.evento, p.lugar].filter(Boolean).join(" · ")}</p>}
          {(p.fechaArmado || p.fechaEvento || p.fechaDesarme) && (
            <p style={{ margin: "8px 0 0", fontSize: 14 }}>
              {[p.fechaArmado && `Armado: ${fechaCorta(p.fechaArmado)}`, p.fechaEvento && `Evento: ${fechaCorta(p.fechaEvento)}`, p.fechaDesarme && `Desarme: ${fechaCorta(p.fechaDesarme)}`].filter(Boolean).join("   ·   ")}
            </p>
          )}
          {b.presentacion && <p style={{ margin: "24px 0 0", fontSize: 18, lineHeight: 1.5, whiteSpace: "pre-wrap", maxWidth: 680 }}>{b.presentacion}</p>}
        </section>

        {p.archivos.length > 0 && (
          <section aria-label="Diseño">
            <h2 style={titulo}>El diseño</h2>
            <div style={{ display: "grid", gap: 16 }}>
              {p.archivos.map((a) => (
                <figure key={a.id} style={{ margin: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.datos ?? ""} alt={a.nombre} style={{ display: "block", width: "100%", height: "auto", borderRadius: 4 }} />
                  <figcaption style={{ marginTop: 6, fontSize: 13 }}>{a.nombre}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {con3d && p.stands.length > 0 && (
          <section className="mia-solo-pantalla" aria-label="Stand en 3D">
            <h2 style={titulo}>Recorrelo en 3D</h2>
            <p style={{ margin: "0 0 12px", fontSize: 14 }}>Es una maqueta de volúmenes y distribución. Los acabados son los de las imágenes.</p>
            <div style={{ display: "grid", gap: 12 }}>
              {p.stands.map((s) => <VisorStand key={s.id} diseno={s.diseno} nombre={s.nombre} acento={marca.acento} />)}
            </div>
          </section>
        )}

        <section aria-label="Presupuesto">
          <h2 style={titulo}>Presupuesto</h2>
          <table className="mia-tabla">
            {porRubro(b.items).map((g) => (
              <tbody key={g.rubro}>
                <tr><th colSpan={3} style={{ paddingTop: 20, fontWeight: 600 }}>{g.rubro}</th></tr>
                {g.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.descripcion}</td>
                    <td className="num">{i.cantidad.toLocaleString("es-AR")} {i.unidad}</td>
                    <td className="num">{pesos(i.cantidad * i.precio)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
            <tfoot>
              <tr><td colSpan={2} style={{ paddingTop: 20 }}>Subtotal</td><td className="num" style={{ paddingTop: 20 }}>{pesos(t.neto)}</td></tr>
              <tr><td colSpan={2}>IVA {b.ivaPct}%</td><td className="num">{pesos(t.iva)}</td></tr>
              <tr style={{ fontSize: 24, fontWeight: 600 }}><td colSpan={2}>Total</td><td className="num">{pesos(t.total)}</td></tr>
            </tfoot>
          </table>
          {b.validoHasta && <p style={{ margin: "16px 0 0", fontSize: 14 }}>Propuesta válida hasta el {fechaCorta(b.validoHasta)}.</p>}
          {b.condiciones && (
            <>
              <h3 style={{ ...titulo, marginTop: 28 }}>Condiciones</h3>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{b.condiciones}</p>
            </>
          )}
        </section>

        <section aria-label="Tu respuesta" style={{ borderTop: `4px solid ${marca.acento}`, paddingTop: 24 }}>
          {b.estado === "APROBADO" && <p style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>Propuesta aprobada por {b.respondidoPor} el {fechaCorta(b.respondidoEl)}. ¡Gracias!</p>}
          {b.estado === "RECHAZADO" && <p style={{ margin: 0, fontSize: 18 }}>Recibimos tu respuesta del {fechaCorta(b.respondidoEl)}. Te vamos a escribir para ajustarla.</p>}
          {b.estado === "REEMPLAZADO" && <p style={{ margin: 0, fontSize: 18 }}>Esta versión fue reemplazada por una más nueva. Pedinos el link actualizado.</p>}
          {vencida && <p style={{ margin: 0, fontSize: 18 }}>Esta propuesta venció el {fechaCorta(b.validoHasta)}. Escribinos y la actualizamos.</p>}
          {puede && <Responder token={token} acento={marca.acento} />}
          <div className="mia-solo-pantalla" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            <BotonImprimir />
            <a href={`/propuesta/${token}/pdf`} className="mia-boton mia-boton-linea" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Descargar PDF</a>
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="mia-boton mia-boton-linea" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Consultar por WhatsApp</a>}
          </div>
        </section>
      </main>

      {marca.lema && (
        <footer style={{ background: marca.acento, color: "#fff", padding: "16px", textAlign: "center", fontSize: 13, letterSpacing: 1 }}>{marca.lema}</footer>
      )}
    </div>
  );
}
