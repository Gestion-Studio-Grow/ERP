import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ordenPublica } from "@/lib/taller/datos.server";
import { ESTADOS, ESTADO_PARA_CLIENTE, fechaCorta, mostrarPatente, pesos, waLink, yaPaso, type EstadoOrden } from "@/lib/taller/core";
import { marcaTaller } from "@/lib/taller/marca";
import AprobarPresupuesto from "./AprobarPresupuesto";

// Link del cliente: sin login, la llave es el token. No se indexa ni se cachea.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seguí tu auto", robots: { index: false, follow: false } };

export default async function SeguimientoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await ordenPublica(token).catch(() => null);
  if (!data) notFound();
  const { orden, negocio, config, totales: t, pagado, saldo } = data;
  const marca = marcaTaller(negocio.slug);
  const estado = orden.estado as EstadoOrden;
  const paso = ESTADOS.indexOf(estado);
  const vencido = yaPaso(orden.presupuestoValidoHasta);
  const puedeResponder = !!orden.presupuestoEnviadoEl && !vencido && !["LISTO", "ENTREGADO"].includes(estado);
  const vehiculo = `${orden.vehiculo.marca} ${orden.vehiculo.modelo}`.trim();
  const wa = waLink(negocio.whatsapp, `Hola! Consulto por mi ${vehiculo || "auto"} (${orden.vehiculo.patente}), orden #${orden.numero}.`);
  const caja: React.CSSProperties = { background: "#fff", border: "1px solid #e5e5e5", borderRadius: 16, padding: 18 };

  return (
    <div style={{ minHeight: "100dvh", background: "#f4f4f5", color: marca.tinta, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <header style={{ background: marca.tinta, borderBottom: `4px solid ${marca.rojo}`, padding: "14px 16px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          {marca.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={marca.logo} alt={negocio.nombre} style={{ height: 48 }} />
          ) : (
            <strong style={{ color: "#fff", fontSize: 18 }}>{negocio.nombre}</strong>
          )}
          <span style={{ color: "#fff", fontSize: 14, opacity: 0.85 }}>Seguimiento de tu auto</span>
        </div>
      </header>

      <main style={{ maxWidth: 560, margin: "0 auto", padding: "16px 16px 40px", display: "grid", gap: 14 }}>
        <section style={{ ...caja, borderTop: `5px solid ${estado === "LISTO" ? "#15803d" : marca.rojo}` }}>
          <p style={{ margin: 0, fontSize: 13, color: "#555" }}>
            Hola {orden.client.name.split(" ")[0]} · {vehiculo} · <strong style={{ fontFamily: "ui-monospace, monospace", letterSpacing: 1 }}>{mostrarPatente(orden.vehiculo.patente)}</strong>
          </p>
          <h1 style={{ margin: "6px 0 14px", fontSize: 24, lineHeight: 1.2 }}>{ESTADO_PARA_CLIENTE[estado]}</h1>
          <ol aria-label="Etapas" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: `repeat(${ESTADOS.length}, 1fr)`, gap: 4 }}>
            {ESTADOS.map((e, i) => (
              <li key={e} aria-current={i === paso ? "step" : undefined} style={{ height: 8, borderRadius: 4, background: i <= paso ? marca.rojo : "#ddd" }}>
                <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{ESTADO_PARA_CLIENTE[e]}{i <= paso ? " (hecho)" : ""}</span>
              </li>
            ))}
          </ol>
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "#555" }}>Orden #{orden.numero} · ingresó el {fechaCorta(orden.createdAt)}</p>
        </section>

        {orden.diagnostico && (
          <section style={caja}>
            <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>Lo que encontramos</h2>
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{orden.diagnostico}</p>
          </section>
        )}

        {orden.items.length > 0 && orden.presupuestoEnviadoEl && (
          <section style={caja}>
            <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Presupuesto</h2>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: vencido ? "#b91c1c" : "#555" }}>
              {vencido
                ? `Venció el ${fechaCorta(orden.presupuestoValidoHasta)}. Escribinos y te lo actualizamos.`
                : `Vale hasta el ${fechaCorta(orden.presupuestoValidoHasta)}. No hacemos nada sin tu OK.`}
            </p>
            <AprobarPresupuesto
              token={token}
              color={marca.rojo}
              editable={puedeResponder}
              items={orden.items.map((i) => ({
                id: i.id,
                descripcion: i.descripcion,
                tipo: i.tipo === "MANO_OBRA" ? "Mano de obra" : "Repuesto",
                importe: i.traidoPorCliente ? 0 : i.cantidad * i.precio,
                gratis: i.traidoPorCliente,
                decision: i.decision,
              }))}
            />
          </section>
        )}

        {(pagado > 0 || estado === "LISTO" || estado === "ENTREGADO") && t.aprobado > 0 && (
          <section style={caja}>
            <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Pagos</h2>
            <p style={{ margin: 0, display: "flex", justifyContent: "space-between" }}><span>Total aprobado</span><span>{pesos(t.aprobado)}</span></p>
            <p style={{ margin: "4px 0", display: "flex", justifyContent: "space-between" }}><span>Pagado</span><span>{pesos(pagado)}</span></p>
            {saldo > 0.5 && (
              <>
                <p style={{ margin: 0, display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18 }}><span>Saldo</span><span>{pesos(saldo)}</span></p>
                {config.aliasCbu && <p style={{ margin: "10px 0 0", fontSize: 14 }}>Podés transferir al alias <strong style={{ userSelect: "all" }}>{config.aliasCbu}</strong>.</p>}
                {config.linkMercadoPago && <p style={{ margin: "6px 0 0", fontSize: 14 }}><a href={config.linkMercadoPago} style={{ color: marca.rojo, fontWeight: 700 }}>Pagar con Mercado Pago</a></p>}
              </>
            )}
          </section>
        )}

        {orden.garantiaHasta && (
          <section style={{ ...caja, border: `2px solid ${marca.rojo}` }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Garantía</h2>
            <p style={{ margin: 0 }}>Tu trabajo está en garantía hasta el <strong>{fechaCorta(orden.garantiaHasta)}</strong>. {orden.garantiaDetalle}</p>
          </section>
        )}

        {orden.fotos.length > 0 && (
          <section style={caja}>
            <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Fotos</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {orden.fotos.map((f) => (
                <a key={f.id} href={f.datos} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.datos} alt={f.momento === "INGRESO" ? "Tu auto al ingresar" : "Foto del trabajo"} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10 }} />
                </a>
              ))}
            </div>
          </section>
        )}

        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 54, borderRadius: 14, background: "#128c4a", color: "#fff", fontWeight: 700, fontSize: 17, textDecoration: "none" }}>
            Escribirnos por WhatsApp
          </a>
        )}
        <p style={{ margin: 0, textAlign: "center", fontSize: 13, color: "#555" }}>
          {negocio.nombre} · {negocio.direccion}<br />{negocio.horario}
        </p>
      </main>
    </div>
  );
}
