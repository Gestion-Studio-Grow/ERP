// Panel del contador — SCAFFOLD (ADR-025 §12.2/§12.3). Plano de operación
// cross-tenant: un contador ve su cartera de clientes monotributistas — cuánto
// cobró cada uno por Mercado Pago, el desglose de conciliación (facturado / no
// facturable / a revisar / rechazado), y quién se acerca al tope de su categoría
// (alerta de recategorización). Datos SIMULADOS por el pipeline end-to-end; en
// producción salen de la conciliación real por tenant (Gate 2).

import { getCarteraSimulada } from "@/lib/contador-panel";

const ars = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function ContadorPage() {
  const { filas, resumen } = await getCarteraSimulada();
  const conRevisar = filas.filter((f) => f.itemsRevisar.length > 0);

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "2rem 1.25rem", fontFamily: "system-ui, sans-serif", color: "#0f172a" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <p style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#64748b", margin: 0 }}>
          arca · panel del contador
        </p>
        <h1 style={{ fontSize: 26, margin: "4px 0 2px" }}>Mi cartera</h1>
        <p style={{ color: "#64748b", margin: 0, fontSize: 14 }}>
          Facturación automática de Mercado Pago por cliente.{" "}
          <span style={{ background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 4, fontSize: 12 }}>
            datos simulados
          </span>
        </p>
      </header>

      {resumen.enAlerta > 0 && (
        <div style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 14 }}>
          ⚠ <strong>{resumen.enAlerta}</strong> cliente(s) cerca o por encima del tope de facturación de su categoría de monotributo. Revisá recategorización.
        </div>
      )}

      {/* Tarjetas resumen */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { k: "Clientes", v: String(resumen.clientes) },
          { k: "Cobrado por MP", v: ars(resumen.cobradoMP) },
          { k: "Facturas emitidas", v: String(resumen.facturadas) },
          { k: "A revisar", v: String(resumen.aRevisar) },
          { k: "Rechazadas", v: String(resumen.rechazados) },
          { k: "En alerta de tope", v: String(resumen.enAlerta) },
        ].map((c) => (
          <div key={c.k} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px", background: "#fff" }}>
            <div style={{ fontSize: 12, color: "#64748b" }}>{c.k}</div>
            <div style={{ fontSize: 20, fontWeight: 600, marginTop: 2 }}>{c.v}</div>
          </div>
        ))}
      </section>

      {/* Tabla de cartera */}
      <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 860 }}>
          <thead>
            <tr style={{ background: "#f8fafc", textAlign: "left", color: "#475569" }}>
              <th style={{ padding: "10px 12px" }}>Cliente</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>Cobrado MP</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>Ops</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>Facturadas</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>No fact.</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>A revisar</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>Rechaz.</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>Facturado</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>% tope</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const alerta = f.pctTope >= 0.8;
              return (
                <tr key={f.clienteId} style={{ borderTop: "1px solid #e2e8f0", background: alerta ? "#fef2f2" : undefined }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{f.nombre}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>{ars(f.cobradoMP)}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>{f.operaciones}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>{f.facturadas}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#64748b" }}>{f.noFacturables}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: f.aRevisar ? "#b45309" : "#64748b" }}>{f.aRevisar}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: f.rechazados ? "#dc2626" : "#64748b" }}>{f.rechazados}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>{ars(f.montoFacturado)}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: alerta ? 700 : 400, color: alerta ? "#dc2626" : "#0f172a" }}>
                    {pct(f.pctTope)}{alerta ? " ⚠" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pendientes de revisión + acción en lote (scaffold) */}
      {conRevisar.length > 0 && (
        <section style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>Pendientes de revisión</h2>
          <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 12px" }}>
            Operaciones que el clasificador no pudo decidir solo. El contador aprueba (facturar) o descarta, en lote.
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {conRevisar.map((f) => (
              <div key={f.clienteId} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px", background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <strong>{f.nombre}</strong>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button disabled style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #86efac", background: "#f0fdf4", color: "#15803d", cursor: "not-allowed" }}>
                      Facturar en lote ({f.itemsRevisar.length})
                    </button>
                    <button disabled style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#94a3b8", cursor: "not-allowed" }}>
                      Descartar
                    </button>
                  </div>
                </div>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#475569", fontSize: 13 }}>
                  {f.itemsRevisar.slice(0, 5).map((it) => (
                    <li key={it.paymentId}>
                      <code>{it.paymentId}</code> — {it.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <p style={{ marginTop: 18, fontSize: 12, color: "#94a3b8" }}>
        ⚠ = cerca del tope de recategorización de monotributo (≥ 80%). Acciones en lote: scaffold (requieren la conciliación en DB, Gate 2).
      </p>
    </main>
  );
}
