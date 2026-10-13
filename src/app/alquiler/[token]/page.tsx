import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { diaCorto, ESTADO_CUOTA_LABEL, INDICE_LABEL, MEDIO_LABEL, nombrePeriodo, pesos, variacion, waLink, type IndiceAjuste, type MedioPago } from "@/lib/inmobiliaria/core";
import { cuentaDelInquilino } from "@/lib/inmobiliaria/datos.server";
import { marcaInmo } from "@/lib/inmobiliaria/marca";
import { estilos as s, Marco } from "@/components/inmobiliaria/Sitio";
import { Copiar } from "@/components/inmobiliaria/piezas";

// Link del inquilino: sin login, la llave es el token. Ve qué debe, cuándo vence, cómo pagar
// y sus últimos pagos. No se indexa ni se cachea.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tu alquiler", robots: { index: false, follow: false } };

export default async function CuentaDelInquilino({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await cuentaDelInquilino(token).catch(() => null);
  if (!c) notFound();
  const marca = marcaInmo(c.negocio.slug);
  // Sólo lo asentado: la mora que el panel sugiere no es deuda hasta que la inmobiliaria la carga.
  const debe = c.pendientes.reduce((t, q) => t + q.saldo, 0);
  const wa = waLink(c.negocio.whatsapp, `Hola ${c.negocio.nombre}! Soy ${c.inquilino}, del alquiler de ${c.propiedad}. Les mando el comprobante de pago.`);

  return (
    <Marco negocio={c.negocio} marca={marca} mensajeWhatsApp={`Hola ${c.negocio.nombre}! Soy ${c.inquilino}, del alquiler de ${c.propiedad}.`}>
      <div className={`${s.ancho} ${s.papel}`}>
        <p className={s.sobre} style={{ color: "var(--gris)" }}>
          Contrato Nº {c.numero} · {c.propiedad}
        </p>
        <h1 className={s.h1}>Hola, {c.inquilino.split(" ")[0]}.</h1>
        <p className={s.contador}>
          {debe > 0.005 ? (
            <>
              Tenés <strong>{pesos(debe)}</strong> para pagar.
            </>
          ) : (
            "Estás al día. ¡Gracias!"
          )}
        </p>

        {c.pendientes.map((q) => (
          <section key={q.id} className={s.caja} style={{ marginTop: 22 }} aria-label={`Alquiler de ${nombrePeriodo(q.periodo)}`}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <h2 className={`${s.cajaTitulo} ${s.inicial}`} style={{ margin: 0 }}>
                {nombrePeriodo(q.periodo)}
              </h2>
              <span className={`${s.estado} ${q.estado === "VENCIDA" ? s.estadoMal : ""}`}>
                {ESTADO_CUOTA_LABEL[q.estado]} · vence {diaCorto(q.vence)}
              </span>
            </div>
            <table className={s.renglones}>
              <tbody>
                <tr>
                  <td>Alquiler{q.ajustePendiente ? " (falta aplicar la actualización)" : ""}</td>
                  <td>{pesos(q.alquiler)}</td>
                </tr>
                {q.extras.map((e, i) => (
                  <tr key={i}>
                    <td>{e.concepto}</td>
                    <td>{pesos(e.monto)}</td>
                  </tr>
                ))}
                {q.punitorios > 0 && (
                  <tr>
                    <td>Interés por pago fuera de término</td>
                    <td>{pesos(q.punitorios)}</td>
                  </tr>
                )}
                {q.pagado > 0 && (
                  <tr>
                    <td>Ya pagaste</td>
                    <td>− {pesos(q.pagado)}</td>
                  </tr>
                )}
                <tr className={s.total}>
                  <td>Para pagar</td>
                  <td>{pesos(q.saldo)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        ))}

        {debe > 0.005 && (c.aliasCbu || c.linkMercadoPago) && (
          <section className={s.caja} style={{ marginTop: 22 }} aria-label="Cómo pagar">
            <h2 className={s.cajaTitulo}>Cómo pagar</h2>
            {c.aliasCbu && (
              <>
                <p className={s.nota} style={{ margin: "8px 0" }}>
                  Transferí al alias y mandanos el comprobante por WhatsApp:
                </p>
                <div className={s.copiar}>
                  <span>{c.aliasCbu}</span>
                  <Copiar texto={c.aliasCbu} etiqueta="Copiar alias" />
                </div>
              </>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
              {c.linkMercadoPago && (
                <a href={c.linkMercadoPago} target="_blank" rel="noopener noreferrer" className={s.boton}>
                  Pagar con Mercado Pago
                </a>
              )}
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className={`${s.boton} ${s.whatsapp}`}>
                  Mandar el comprobante
                </a>
              )}
            </div>
          </section>
        )}

        {c.proxima && (
          <p className={s.contador} style={{ marginTop: 26 }}>
            Próximo vencimiento: <strong>{diaCorto(c.proxima.vence)}</strong> · {pesos(c.proxima.alquiler)}
            {c.proxima.ajustePendiente ? " (se actualiza por contrato antes de esa fecha)" : ""}.
          </p>
        )}
        {c.proximoAjuste && (
          <p className={s.aviso} style={{ marginTop: 16 }}>
            Según el contrato, el {diaCorto(c.proximoAjuste.dia)} el alquiler se actualiza por {INDICE_LABEL[c.indice as IndiceAjuste] ?? c.indice}. Te avisamos el monto nuevo apenas esté el índice.
          </p>
        )}

        {c.pagadas.length > 0 && (
          <>
            <h2 className={s.h3}>Tus últimos pagos</h2>
            <table className={s.renglones}>
              <thead>
                <tr>
                  <th scope="col">Mes</th>
                  <th scope="col">Pago</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {c.pagadas.map((q) => (
                  <tr key={q.id}>
                    <td className={s.inicial}>{nombrePeriodo(q.periodo)}</td>
                    <td>
                      {q.pagos.map((p, i) => (
                        <span key={p.id}>
                          {i > 0 && " / "}
                          {p.recibo != null ? (
                            <a href={`/alquiler/${token}/recibo/${p.id}`}>
                              {diaCorto(p.fecha)} · {MEDIO_LABEL[p.medio as MedioPago] ?? p.medio} · recibo
                            </a>
                          ) : (
                            `${diaCorto(p.fecha)} · ${MEDIO_LABEL[p.medio as MedioPago] ?? p.medio}`
                          )}
                        </span>
                      ))}
                    </td>
                    <td>{pesos(q.pagado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {c.ajustes.length > 0 && (
          <>
            <h2 className={s.h3}>Actualizaciones del alquiler</h2>
            <table className={s.renglones}>
              <tbody>
                {c.ajustes.map((a) => (
                  <tr key={a.desde}>
                    <td>
                      Desde el {diaCorto(a.desde)} · {INDICE_LABEL[a.indice as IndiceAjuste] ?? a.indice} ({variacion(a.coeficiente)})
                    </td>
                    <td>{pesos(a.montoNuevo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <p className={s.nota} style={{ marginTop: 28 }}>
          Contrato del {diaCorto(c.inicio)} al {diaCorto(c.fin)}. Este link es personal: no lo compartas. Si ves algo que no coincide, escribinos y lo revisamos.
        </p>
      </div>
    </Marco>
  );
}
