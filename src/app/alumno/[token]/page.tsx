import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { alumnoPublico } from "@/lib/padel/datos.server";
import { marcaProfe } from "@/lib/padel/marca";
import { ESTADO_PARA_ALUMNO, PAGO_LABEL, diaHumano, esDeuda, esEnRevision, esPagable, horaHumana, linkWhatsApp, pesos, proximaSemana, puedeCancelarAlumno } from "@/lib/padel/core";
import { Piel } from "@/app/clases/_piel";
import { CabeceraPublica } from "@/app/clases/_cabecera";
import { BotonCancelar, BotonRepetir, RecordarSesion, SubirComprobante } from "./AccionesAlumno";

// Link del alumno: sin login, la llave es el token. No se indexa ni se cachea.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mis clases", robots: { index: false, follow: false }, generator: "Gestión Studio Grow" };

export default async function AlumnoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await alumnoPublico(token).catch(() => null);
  if (!data) notFound();
  const { alumno, config, negocio } = data;
  const m = marcaProfe(negocio.slug);
  const ahora = new Date();
  const nombre = alumno.client.name.split(" ")[0];

  const vivas = alumno.clases.filter((c) => ["PEDIDA", "CONFIRMADA"].includes(c.estado) && c.terminaEn > ahora).sort((a, b) => +a.empiezaEn - +b.empiezaEn);
  const proxima = vivas[0] ?? null;
  // Una sola regla (core.ts): se paga lo DADO sin pagar y lo CONFIRMADO por adelantado. Un pedido
  // que el profe todavía no confirmó (o que venció sin respuesta) nunca aparece acá.
  // (Una clase con el comprobante ya enviado sigue a la vista: puede mandar otro.)
  const porPagar = alumno.clases
    .filter((c) => esPagable(c) || esEnRevision(c))
    .sort((a, b) => +a.empiezaEn - +b.empiezaEn);
  // «Debés» no cuenta lo que ya mandó y espera que el profe valide: va aparte, «en revisión» (O-5).
  const deudas = alumno.clases.filter(esDeuda);
  const enRevision = alumno.clases.filter(esEnRevision);
  // Pedidos que vencieron sin respuesta en las últimas 48 h: se le dice, con salida.
  const sinRespuesta = alumno.clases.filter((c) => c.estado === "SIN_RESPUESTA" && ahora.getTime() - c.empiezaEn.getTime() < 48 * 3_600_000);
  // "La semana que viene a la misma hora" sale de la última clase dada o confirmada.
  const base = alumno.clases.find((c) => ["DADA", "CONFIRMADA"].includes(c.estado));
  const repetir = base ? proximaSemana(base.empiezaEn) : null;
  const yaTieneEsa = repetir ? alumno.clases.some((c) => +c.empiezaEn === +repetir && ["PEDIDA", "CONFIRMADA"].includes(c.estado)) : false;
  const wa = linkWhatsApp(negocio.whatsapp, `Hola ${negocio.profe}! Soy ${alumno.client.name}.`);

  const caja: React.CSSProperties = { background: "var(--padel-superficie)", border: `1px solid var(--padel-linea)`, borderRadius: 16, padding: 16 };
  const h2: React.CSSProperties = { margin: "0 0 10px", fontSize: 18 };

  return (
    <Piel marca={m}>
      <CabeceraPublica antetitulo={negocio.nombre} titulo={`Hola ${nombre}`} />

      <main style={{ maxWidth: 560, margin: "0 auto", padding: "16px 16px 48px", display: "grid", gap: 14 }}>
        <RecordarSesion token={token} />
        {alumno.saldoAFavor > 0 && (
          <section style={{ ...caja, borderTop: `5px solid var(--padel-vivo)` }} aria-label="Saldo a favor" data-qa="saldo-a-favor">
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              Tenés <strong className="tabular-nums">{pesos(alumno.saldoAFavor)}</strong> a favor: tu próxima clase se paga con eso.
            </p>
          </section>
        )}
        {sinRespuesta.map((c) => (
          <section key={c.id} style={caja} aria-label="Pedido sin respuesta" data-qa="sin-respuesta">
            <p style={{ margin: "0 0 10px", fontSize: 16 }}>
              <span style={{ textTransform: "capitalize" }}>{diaHumano(c.empiezaEn)}</span> {horaHumana(c.empiezaEn)} · {negocio.profe} no llegó a confirmarte.
            </p>
            <a href="/clases" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 48, borderRadius: 14, border: `2px solid var(--padel-cancha)`, color: "var(--padel-cancha)", fontWeight: 700, textDecoration: "none" }}>
              Elegí otro horario
            </a>
          </section>
        ))}
        <section style={{ ...caja, borderTop: `5px solid ${proxima?.estado === "CONFIRMADA" ? "var(--padel-vivo)" : "var(--padel-linea)"}` }} aria-label="Tu próxima clase">
          <p style={{ margin: 0, fontSize: 14, color: "var(--padel-suave)" }}>Tu próxima clase</p>
          {proxima ? (
            <>
              <h2 style={{ margin: "4px 0 6px", fontSize: 24, textTransform: "capitalize" }} data-qa="proxima">
                {diaHumano(proxima.empiezaEn)} · {horaHumana(proxima.empiezaEn)}
              </h2>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }} data-qa="estado">{ESTADO_PARA_ALUMNO[proxima.estado]}</p>
              {proxima.estado === "PEDIDA" && proxima.precio > 0 && (
                <p style={{ margin: "4px 0 0", fontSize: 16, color: "var(--padel-suave)" }} data-qa="a-pagar-al-confirmar">{pesos(proxima.precio)} · a pagar cuando {negocio.profe} confirme</p>
              )}
              {proxima.pagoMedio === "SALDO_A_FAVOR" && proxima.pagoEstado === "PAGADO" && (
                <p style={{ margin: "4px 0 0", fontSize: 16, color: "var(--padel-suave)" }}>Ya está pagada con tu saldo a favor.</p>
              )}
              {puedeCancelarAlumno(proxima.estado, proxima.empiezaEn, ahora, config.anticipacionMin) && (
                <div style={{ marginTop: 12 }}>
                  <BotonCancelar token={token} claseId={proxima.id} color="var(--padel-suave)" />
                </div>
              )}
            </>
          ) : (
            <h2 style={{ margin: "4px 0 0", fontSize: 20 }}>No tenés clases agendadas</h2>
          )}
          {vivas.length > 1 && (
            <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", fontSize: 16, color: "var(--padel-suave)" }}>
              {vivas.slice(1).map((c) => (
                <li key={c.id} style={{ textTransform: "capitalize" }}>
                  {diaHumano(c.empiezaEn)} {horaHumana(c.empiezaEn)} · {ESTADO_PARA_ALUMNO[c.estado].split(" · ")[0]}
                </li>
              ))}
            </ul>
          )}
        </section>

        {repetir && !yaTieneEsa && base && (
          <section style={caja} aria-label="Repetir la clase">
            <h2 style={h2}>¿La semana que viene igual?</h2>
            <BotonRepetir token={token} horaIso={repetir.toISOString()} repiteDe={base.id} etiqueta={`${diaHumano(repetir)} a las ${horaHumana(repetir)}`} color="var(--padel-cancha)" />
          </section>
        )}

        {porPagar.length > 0 && (
          <section style={caja} aria-label="Pagar">
            <h2 style={h2}>Pagar</h2>
            {deudas.length > 0 && (
              <p style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 700 }} data-qa="debes">
                Debés <span className="tabular-nums">{pesos(alumno.debe)}</span> · {deudas.length} clase{deudas.length === 1 ? "" : "s"}
              </p>
            )}
            {enRevision.length > 0 && (
              <p style={{ margin: "0 0 12px", fontSize: 16, color: "var(--padel-suave)" }} data-qa="en-revision">
                <span className="tabular-nums">{pesos(alumno.enRevision)}</span> en revisión · {enRevision.length} comprobante{enRevision.length === 1 ? "" : "s"} esperando que {negocio.profe} lo{enRevision.length === 1 ? "" : "s"} valide
              </p>
            )}
            {config.aliasCbu ? (
              <p style={{ margin: "0 0 12px", fontSize: 16 }}>
                Transferí al alias <strong style={{ userSelect: "all", fontSize: 18 }} data-qa="alias">{config.aliasCbu}</strong>
                {config.titularCuenta && <> ({config.titularCuenta})</>} y subí la captura del comprobante. El profe la valida.
              </p>
            ) : (
              <p style={{ margin: "0 0 12px", fontSize: 16 }}>Pagale al profe en efectivo o pedile el alias, y subí acá la captura del comprobante.</p>
            )}
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
              {porPagar.map((c) => (
                <li key={c.id} style={{ borderTop: `1px solid var(--padel-linea)`, paddingTop: 12 }} data-qa="por-pagar">
                  <p style={{ margin: "0 0 8px", fontSize: 16 }}>
                    <span style={{ textTransform: "capitalize" }}>{diaHumano(c.empiezaEn)}</span> {horaHumana(c.empiezaEn)} · <strong>{pesos(c.precio)}</strong> · <span data-qa="pago-estado">{PAGO_LABEL[c.pagoEstado]}</span>
                    {c.estado === "CONFIRMADA" && <> · podés pagarla ya</>}
                  </p>
                  {c.pagoNota && c.pagoEstado === "PENDIENTE" && <p role="alert" style={{ margin: "0 0 8px", fontSize: 14, color: "var(--padel-peligro)" }}>{c.pagoNota}</p>}
                  {c.pagoEstado === "EN_REVISION" ? (
                    <p style={{ margin: 0, fontSize: 14, color: "var(--padel-suave)" }}>Comprobante enviado. Si te equivocaste, podés mandar otro.</p>
                  ) : null}
                  <SubirComprobante token={token} claseId={c.id} color="var(--padel-cancha)" otra={c.pagoEstado === "EN_REVISION"} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section style={caja} aria-label="Otro horario">
          <h2 style={h2}>¿Otro día u horario?</h2>
          <a href="/clases" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 52, borderRadius: 14, border: `2px solid var(--padel-cancha)`, color: "var(--padel-cancha)", fontWeight: 700, textDecoration: "none" }}>
            Ver horarios libres
          </a>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 12, textAlign: "center", color: "var(--padel-suave)", fontSize: 16 }}>
              Escribirle al profe por WhatsApp
            </a>
          )}
        </section>

        {alumno.clases.some((c) => c.estado === "DADA") && (
          <section style={caja} aria-label="Tus clases">
            <h2 style={h2}>Tus últimas clases</h2>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 16, display: "grid", gap: 6 }}>
              {alumno.clases.filter((c) => c.estado === "DADA").slice(0, 5).map((c) => (
                <li key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, textTransform: "capitalize" }}>
                  <span>{diaHumano(c.empiezaEn)}</span>
                  <span style={{ color: c.pagoEstado === "PAGADO" ? "var(--padel-cancha)" : "var(--padel-suave)" }}>{PAGO_LABEL[c.pagoEstado]}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </Piel>
  );
}
