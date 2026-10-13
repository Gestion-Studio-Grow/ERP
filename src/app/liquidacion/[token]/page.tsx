import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { diaCorto, MEDIO_LABEL, nombrePeriodo, pesos, type MedioPago } from "@/lib/inmobiliaria/core";
import { liquidacionPublica } from "@/lib/inmobiliaria/datos.server";
import { marcaInmo } from "@/lib/inmobiliaria/marca";
import { estilos as s, Marco } from "@/components/inmobiliaria/Sitio";

// Link del propietario: sin login, la llave es el token. Ve qué se cobró por sus propiedades,
// qué se descontó y cuánto le toca. Se puede imprimir o guardar como PDF desde el navegador.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tu liquidación", robots: { index: false, follow: false } };

export default async function LiquidacionDelPropietario({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const datos = await liquidacionPublica(token).catch(() => null);
  if (!datos) notFound();
  const { negocio, liquidacion: l } = datos;
  const t = l.totales;
  const pagada = l.estado === "PAGADA";

  return (
    <Marco negocio={negocio} marca={marcaInmo(negocio.slug)} mensajeWhatsApp={`Hola ${negocio.nombre}! Soy ${l.propietario}, consulto por la liquidación Nº ${l.numero}.`}>
      <div className={`${s.ancho} ${s.papel}`}>
        <p className={s.sobre} style={{ color: "var(--gris)" }}>
          Liquidación Nº {l.numero} · emitida el {diaCorto(l.emitida)}
        </p>
        <h1 className={s.h1}>
          {l.propietario.split(" ")[0]}, te {pagada ? "transferimos" : "corresponden"} {pesos(t.neto)}.
        </h1>
        <p className={s.contador}>
          <span className={`${s.estado} ${pagada ? s.estadoBien : ""}`}>
            {pagada ? `Pagada el ${diaCorto(l.pagadaEl)} · ${MEDIO_LABEL[l.medio as MedioPago] ?? l.medio}` : "Lista para pagar"}
          </span>
        </p>

        <section className={s.caja} style={{ marginTop: 22 }} aria-label="Detalle de la liquidación">
          <h2 className={s.cajaTitulo}>Lo que se cobró</h2>
          <table className={s.renglones}>
            <thead>
              <tr>
                <th scope="col">Propiedad y mes</th>
                <th scope="col">Importe</th>
              </tr>
            </thead>
            <tbody>
              {l.cobros.map((c, i) => (
                <tr key={i}>
                  <td>
                    {c.concepto.replace(/(\d{4}-\d{2})$/, (m) => nombrePeriodo(m))}
                    {(c.extras > 0 || c.punitorios > 0) && (
                      <span className={s.nota} style={{ display: "block" }}>
                        Alquiler {pesos(c.alquiler)}
                        {c.extras > 0 ? ` · otros conceptos ${pesos(c.extras)}` : ""}
                        {c.punitorios > 0 ? ` · interés por mora ${pesos(c.punitorios)}` : ""}
                      </span>
                    )}
                  </td>
                  <td>{pesos(c.alquiler + c.extras + c.punitorios)}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Total cobrado</strong>
                </td>
                <td>
                  <strong>{pesos(t.cobrado)}</strong>
                </td>
              </tr>
            </tbody>
          </table>

          <h2 className={s.cajaTitulo} style={{ marginTop: 26 }}>
            Lo que se descuenta
          </h2>
          <table className={s.renglones}>
            <tbody>
              <tr>
                <td>Comisión por administración</td>
                <td>− {pesos(t.comision)}</td>
              </tr>
              {t.ivaComision > 0 && (
                <tr>
                  <td>IVA de la comisión</td>
                  <td>− {pesos(t.ivaComision)}</td>
                </tr>
              )}
              {l.gastos.map((g, i) => (
                <tr key={i}>
                  <td>{g.concepto}</td>
                  <td>− {pesos(g.monto)}</td>
                </tr>
              ))}
              {t.cobrado - t.comision - t.ivaComision - t.gastos - t.neto > 0.005 && (
                <tr>
                  <td>Interés por mora (queda para la administración)</td>
                  <td>− {pesos(t.cobrado - t.comision - t.ivaComision - t.gastos - t.neto)}</td>
                </tr>
              )}
              <tr className={s.total}>
                <td>{pagada ? "Te transferimos" : "Te corresponde"}</td>
                <td>{pesos(t.neto)}</td>
              </tr>
            </tbody>
          </table>
          {l.nota && <p className={s.nota} style={{ marginTop: 12 }}>{l.nota}</p>}
        </section>

        <p className={s.nota} style={{ marginTop: 22 }}>
          Documento informativo, no válido como factura. Para guardarlo, usá «Imprimir» y elegí «Guardar como PDF». Este link es personal: no lo compartas.
        </p>
      </div>
    </Marco>
  );
}
