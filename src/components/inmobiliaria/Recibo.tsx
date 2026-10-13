// El recibo de alquiler como hoja: lo que ve el inquilino en su link, lo que imprime la
// inmobiliaria y la vista previa del configurador. De servidor y sin estado: todo viene armado
// en `ReciboDatos` (src/lib/inmobiliaria/datos.server.ts). Los botones viven en recibo-piezas.tsx.

import type { CSSProperties } from "react";
import { diaCorto, enLetras, MEDIO_LABEL, nombrePeriodo, pesos, type MedioPago } from "@/lib/inmobiliaria/core";
import type { ReciboDatos } from "@/lib/inmobiliaria/datos.server";
import type { MarcaInmo } from "@/lib/inmobiliaria/marca";
import r from "./recibo.module.css";

export const estilosRecibo = r;

export function Recibo({ d, marca, vistaPrevia }: { d: ReciboDatos; marca: MarcaInmo; vistaPrevia?: boolean }) {
  const c = d.config;
  const variables = { "--acento": marca.acento, "--tinta": marca.tinta } as CSSProperties;
  const contacto = [d.negocio.direccion, d.negocio.whatsapp ? `WhatsApp ${d.negocio.whatsapp.replace(/^549/, "")}` : "", d.negocio.email ?? ""].filter(Boolean).join("\n");
  return (
    <article className={`${r.hoja} ${vistaPrevia ? r.vistaPrevia : ""}`} style={variables} aria-label={`Recibo ${d.numero}`}>
      <header className={r.cabecera}>
        <div className={r.marca}>
          {marca.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={marca.logo} alt={d.emisor} />
          ) : (
            <span className={r.emisor}>{d.emisor}</span>
          )}
          {marca.logo && d.emisor !== d.negocio.nombre && <span className={r.emisor}>{d.emisor}</span>}
          {c.cuit && <p className={r.contacto}>CUIT {c.cuit}</p>}
          {d.matricula && <p className={r.contacto}>{d.matricula}</p>}
          {c.contacto && contacto && <p className={r.contacto}>{contacto}</p>}
        </div>
        <div className={r.numero}>
          <strong>{d.numero}</strong>
          <span>Fecha: {diaCorto(d.fecha)}</span>
          <span>Contrato Nº {d.contratoNumero}</span>
        </div>
      </header>

      <h1 className={r.titulo}>
        {c.titulo}
        {d.anulado && <span className={r.estado}>Anulado</span>}
      </h1>
      <p className={r.texto}>
        Recibimos de <strong>{d.inquilino}</strong> la suma de <strong>{pesos(d.monto)}</strong>
        {c.enLetras && <span className={r.letras}> (son pesos {enLetras(d.monto)})</span>} en concepto de alquiler de <strong>{d.propiedad}</strong>, período{" "}
        <strong>{nombrePeriodo(d.periodo)}</strong>, por <strong>{MEDIO_LABEL[d.medio as MedioPago] ?? d.medio}</strong>.
        {d.nota && <> Nota: {d.nota}.</>}
      </p>

      <div className={r.importe}>
        <strong>{pesos(d.monto)}</strong>
        <span>
          {d.cuota.saldoDespues > 0.005
            ? `Pago a cuenta · queda un saldo de ${pesos(d.cuota.saldoDespues)}`
            : d.cuota.cobradoHasta > d.monto + 0.005
              ? "Completa el pago del período"
              : "Pago total del período"}
        </span>
      </div>

      {c.detalle && (
        <table className={r.detalle}>
          <thead>
            <tr>
              <th scope="col">Detalle del período</th>
              <th scope="col">Importe</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Alquiler</td>
              <td>{pesos(d.cuota.alquiler)}</td>
            </tr>
            {d.cuota.extras.map((e, i) => (
              <tr key={i}>
                <td>{e.concepto}</td>
                <td>{pesos(e.monto)}</td>
              </tr>
            ))}
            {d.cuota.punitorios > 0 && (
              <tr>
                <td>Interés por pago fuera de término</td>
                <td>{pesos(d.cuota.punitorios)}</td>
              </tr>
            )}
            <tr className={r.total}>
              <td>Total del período</td>
              <td>{pesos(d.cuota.total)}</td>
            </tr>
            {d.cuota.cobradoHasta !== d.monto && (
              <tr>
                <td>Cobrado hasta este recibo</td>
                <td>{pesos(d.cuota.cobradoHasta)}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {c.saldo && d.cuota.saldoDespues > 0.005 && <p className={r.saldo}>Saldo pendiente del período después de este pago: {pesos(d.cuota.saldoDespues)}.</p>}

      <div className={r.firmas}>
        <div className={r.firma}>{c.firma || "Por la administración"}{d.cobradoPor ? ` · ${d.cobradoPor}` : ""}</div>
        <div className={r.firma}>Recibí conforme</div>
      </div>

      {c.gracias && <p className={r.gracias}>{c.gracias}</p>}
      {c.pie && <p className={r.pie}>{c.pie}</p>}
    </article>
  );
}
