import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { ordenCompleta } from "@/lib/taller/datos.server";
import { dentroDe, fechaCorta, MEDIO_LABEL, mostrarPatente, pesos, type MedioPago } from "@/lib/taller/core";
import { marcaTaller } from "@/lib/taller/marca";
import BotonImprimir from "./BotonImprimir";

export const dynamic = "force-dynamic";
export const metadata = { title: "Taller · Imprimir" };

const TITULO = { presupuesto: "Presupuesto", orden: "Orden de trabajo", comprobante: "Comprobante" } as const;
const NIVEL = ["Reserva", "", "1/4", "", "1/2", "", "3/4", "", "Lleno"];

// Papel A4 con la marca del taller. "Guardar como PDF" lo hace el propio teléfono o la PC desde
// Imprimir: sale idéntico y no hay que mantener un generador de PDF aparte.
export default async function ImprimirPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string }> }) {
  await requireApp("taller");
  const [{ id }, { doc }] = await Promise.all([params, searchParams]);
  const tipo = (doc && doc in TITULO ? doc : "presupuesto") as keyof typeof TITULO;
  const data = await ordenCompleta(id);
  if (!data || !data.conPlata) notFound();
  const { orden, negocio, config, totales: t, pagado, saldo } = data;
  const marca = marcaTaller(negocio.slug);
  const items = orden.items.filter((i) => (tipo === "comprobante" ? i.decision === "APROBADO" : i.decision !== "RECHAZADO"));
  const total = tipo === "comprobante" ? t.aprobado : t.presupuestado;
  const letra = config.condicionIva === "MONOTRIBUTO" ? "C" : "B";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #papel, #papel * { visibility: visible !important; }
          #papel { position: absolute; inset: 0; margin: 0; border: 0 !important; box-shadow: none !important; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>
      <BotonImprimir volver={`/admin/taller/orden/${orden.id}`} />

      {/* En el celular el papel no se achica: se desliza de costado, así se ve como va a salir. */}
      <div style={{ overflowX: "auto" }}>
      <article id="papel" style={{ minWidth: 680, background: "#fff", color: "#111", border: "1px solid #ddd", borderRadius: 8, padding: 28, fontFamily: "system-ui, sans-serif", fontSize: 13, lineHeight: 1.45 }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 16, borderBottom: `3px solid ${marca.rojo}`, paddingBottom: 14 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            {marca.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={marca.logo} alt={negocio.nombre} style={{ height: 64 }} />
            ) : (
              <strong style={{ fontSize: 22 }}>{negocio.nombre}</strong>
            )}
            <div style={{ fontSize: 12 }}>
              <strong style={{ fontSize: 14 }}>{negocio.nombre}</strong>
              <div>{negocio.direccion}</div>
              <div>{negocio.horario}</div>
              {negocio.whatsapp && <div>WhatsApp {negocio.whatsapp}</div>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>{TITULO[tipo]}</div>
            <div>N.º {String(orden.numero).padStart(6, "0")}</div>
            <div>{fechaCorta(tipo === "comprobante" ? (orden.entregadoEl ?? new Date()) : (orden.presupuestoEnviadoEl ?? new Date()))}</div>
            {tipo === "presupuesto" && <div>Válido hasta el {fechaCorta(orden.presupuestoValidoHasta ?? dentroDe(config.validezDias))}</div>}
          </div>
        </header>

        {tipo === "comprobante" && (
          <p style={{ margin: "12px 0 0", padding: "8px 10px", border: "1px solid #111", fontWeight: 700, textAlign: "center", textTransform: "uppercase", fontSize: 12 }}>
            Documento no válido como factura
          </p>
        )}

        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, margin: "16px 0" }}>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", color: "#666" }}>Cliente</div>
            <strong>{orden.client.razonSocial || orden.client.name}</strong>
            <div>Tel. {orden.client.phone}</div>
            {orden.client.docNro && <div>CUIT/DNI {orden.client.docNro}</div>}
            {tipo === "comprobante" && <div>Condición frente al IVA: {orden.client.condicionIva ?? "Consumidor final"}</div>}
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", color: "#666" }}>Vehículo</div>
            <strong>{`${orden.vehiculo.marca} ${orden.vehiculo.modelo}`.trim()}{orden.vehiculo.anio ? ` (${orden.vehiculo.anio})` : ""}</strong>
            <div>Patente {mostrarPatente(orden.vehiculo.patente)}</div>
            <div>
              {orden.km != null && `${orden.km.toLocaleString("es-AR")} km`}
              {orden.combustible != null && NIVEL[orden.combustible] && ` · Combustible ${NIVEL[orden.combustible]}`}
            </div>
          </div>
        </section>

        {tipo !== "comprobante" && orden.problema && <p style={{ margin: "0 0 6px" }}><strong>Motivo del ingreso:</strong> {orden.problema}</p>}
        {orden.diagnostico && <p style={{ margin: "0 0 12px" }}><strong>Diagnóstico:</strong> {orden.diagnostico}</p>}

        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
          <thead>
            <tr style={{ background: "#111", color: "#fff", textAlign: "left" }}>
              <th style={{ padding: "6px 8px" }}>Detalle</th>
              <th style={{ padding: "6px 8px", width: 60, textAlign: "right" }}>Cant.</th>
              <th style={{ padding: "6px 8px", width: 110, textAlign: "right" }}>Unitario</th>
              <th style={{ padding: "6px 8px", width: 120, textAlign: "right" }}>Importe</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 12, textAlign: "center", color: "#666" }}>Sin ítems cargados.</td></tr>
            )}
            {items.map((i) => (
              <tr key={i.id} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "6px 8px" }}>
                  {i.descripcion}
                  <span style={{ color: "#666", fontSize: 11 }}> · {i.tipo === "MANO_OBRA" ? "Mano de obra" : "Repuesto"}</span>
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{String(i.cantidad).replace(".", ",")}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{i.traidoPorCliente ? "—" : pesos(i.precio)}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{i.traidoPorCliente ? "—" : pesos(i.cantidad * i.precio)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {tipo !== "orden" && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <table style={{ minWidth: 260 }}>
              <tbody>
                <tr><td>Mano de obra</td><td style={{ textAlign: "right" }}>{pesos(tipo === "comprobante" ? items.filter((i) => i.tipo === "MANO_OBRA").reduce((s, i) => s + i.cantidad * i.precio, 0) : t.manoDeObra)}</td></tr>
                <tr><td>Repuestos</td><td style={{ textAlign: "right" }}>{pesos(tipo === "comprobante" ? items.filter((i) => i.tipo !== "MANO_OBRA" && !i.traidoPorCliente).reduce((s, i) => s + i.cantidad * i.precio, 0) : t.repuestos)}</td></tr>
                <tr style={{ fontSize: 17, fontWeight: 800 }}><td style={{ paddingTop: 6 }}>TOTAL</td><td style={{ textAlign: "right", paddingTop: 6 }}>{pesos(total)}</td></tr>
                {tipo === "comprobante" && (
                  <>
                    <tr><td>Pagado</td><td style={{ textAlign: "right" }}>{pesos(pagado)}</td></tr>
                    {saldo > 0.5 && <tr style={{ fontWeight: 700 }}><td>Saldo</td><td style={{ textAlign: "right" }}>{pesos(saldo)}</td></tr>}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tipo === "comprobante" && orden.pagos.some((p) => !p.anuladoEl) && (
          <p style={{ marginTop: 10, fontSize: 12 }}>
            <strong>Pagos:</strong> {orden.pagos.filter((p) => !p.anuladoEl).map((p) => `${fechaCorta(p.createdAt)} ${MEDIO_LABEL[p.medio as MedioPago] ?? p.medio} ${pesos(p.monto)}`).join(" · ")}
          </p>
        )}

        {tipo === "presupuesto" && (
          <p style={{ marginTop: 16, fontSize: 12, color: "#444" }}>
            Los precios pueden cambiar pasada la fecha de validez. Al desarmar pueden aparecer trabajos adicionales: no se hace nada sin tu aprobación.
            {config.aliasCbu && <> Transferencias al alias <strong>{config.aliasCbu}</strong>.</>}
          </p>
        )}
        {tipo === "comprobante" && orden.garantiaHasta && (
          <p style={{ marginTop: 16, padding: 10, border: `2px solid ${marca.rojo}`, borderRadius: 6 }}>
            <strong>Garantía hasta el {fechaCorta(orden.garantiaHasta)}.</strong> {orden.garantiaDetalle ?? "Cubre la mano de obra y los repuestos colocados por el taller."}
          </p>
        )}
        {tipo === "comprobante" && (
          <p style={{ marginTop: 10, fontSize: 11, color: "#666" }}>
            Comprobante interno. La factura electrónica tipo {letra} se emite por separado.
          </p>
        )}

        {tipo === "orden" && (
          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 28 }}>
            <div>
              {orden.firmaIngreso ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={orden.firmaIngreso} alt="Firma del cliente" style={{ height: 70 }} />
              ) : (
                <div style={{ height: 70 }} />
              )}
              <div style={{ borderTop: "1px solid #111", paddingTop: 4, fontSize: 12 }}>
                Firma del cliente{orden.firmaNombre ? ` — ${orden.firmaNombre}` : ""}. Conforme con el estado en que deja el vehículo.
              </div>
            </div>
            <div>
              <div style={{ height: 70 }} />
              <div style={{ borderTop: "1px solid #111", paddingTop: 4, fontSize: 12 }}>Por {negocio.nombre}{orden.mecanicoNombre ? ` — ${orden.mecanicoNombre}` : ""}</div>
            </div>
          </section>
        )}

        <footer style={{ marginTop: 22, paddingTop: 10, borderTop: "1px solid #ddd", fontSize: 11, color: "#666", textAlign: "center" }}>
          {negocio.nombre} · {negocio.direccion}{negocio.instagramLabel ? ` · ${negocio.instagramLabel}` : ""}
        </footer>
      </article>
      </div>
    </main>
  );
}
