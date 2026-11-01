// FACTURITA · La hoja de la factura de EJEMPLO (la pieza visual del talonario). Presentacional y
// pura (sin hooks ni imports de servidor): la usan el simulador del héroe (cliente) y «Así sale»
// (servidor).
//
// Honestidad fiscal (DISENO.md §10): datos declaradamente inventados, rótulo fijo «Sin validez
// fiscal», SIN número de CAE (un CAE de 14 dígitos inventado podría pasar por real), sin CUIT ni
// emisor, y un QR esquemático que no es un QR (no se puede escanear).

import type { ReactNode } from "react";

export const EJEMPLO = {
  letra: "C",
  numero: "00002-00000015",
  detalle: "Corte y peinado",
  total: "18500",
  destinatario: "cf" as Destinatario,
};

export type Destinatario = "cf" | "cuit";

export const DESTINATARIOS: Record<Destinatario, string> = {
  cf: "Consumidor final",
  cuit: "Cliente con CUIT",
};

/** «18500» → «$18.500»; «1234,5» → «$1.234,50». Sin valor → «$0». */
export function plata(total: string): string {
  const [ent = "", dec] = total.split(",");
  const entero = Number(ent || "0");
  const centavos = dec ? Number(`0.${dec}`) : 0;
  const conDecimales = Boolean(dec && dec.length > 0);
  return `$${(entero + centavos).toLocaleString("es-AR", {
    minimumFractionDigits: conDecimales ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Cuadrícula gris con forma de QR. NO es un QR: no codifica nada y no se puede escanear. */
function QrEsquema() {
  const celdas = [
    "1110101", "1010011", "1110110", "0001010", "1101101", "0110010", "1011101",
  ];
  return (
    <svg viewBox="0 0 29 29" aria-hidden="true" focusable="false">
      <rect width="29" height="29" rx="2" fill="#fff" />
      {[
        [2, 2],
        [20, 2],
        [2, 20],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="7" height="7" fill="#8a8170" />
          <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
          <rect x={x + 2} y={y + 2} width="3" height="3" fill="#8a8170" />
        </g>
      ))}
      {celdas.flatMap((fila, i) =>
        fila.split("").map((c, j) =>
          c === "1" ? <rect key={`${i}-${j}`} x={11 + j * 2} y={11 + i * 2} width="2" height="2" fill="#b3aa98" /> : null,
        ),
      )}
    </svg>
  );
}

function Marca({ n, marcas, children }: { n: number; marcas: boolean; children: ReactNode }) {
  if (!marcas) return <>{children}</>;
  return (
    <span className="fx-con-marca">
      <span className="fx-marca-n" aria-hidden="true">
        {n}
      </span>
      {children}
    </span>
  );
}

export default function Hoja({
  detalle,
  total,
  destinatario,
  emitida,
  grande = false,
  conQr = false,
}: {
  detalle: string;
  total: string;
  destinatario: Destinatario;
  /** true = «Autorizada · CAE» (simulado); false = borrador mientras el visitante edita. */
  emitida: boolean;
  grande?: boolean;
  /** Muestra el QR esquemático y los números de las partes (sección «Así sale»). */
  conQr?: boolean;
}) {
  const marcas = conQr;
  return (
    <>
      <div className="fx-hoja-cabeza">
        <div className="fx-hoja-tipo">
          <Marca n={1} marcas={marcas}>
            <span className="fx-letra" aria-hidden="true">
              {EJEMPLO.letra}
            </span>
          </Marca>
          <div>
            <p className="fx-cap">Factura {EJEMPLO.letra}</p>
            <p className="fx-numero">
              <Marca n={2} marcas={marcas}>
                <span>N.º {EJEMPLO.numero}</span>
              </Marca>
            </p>
          </div>
        </div>
        <span className="fx-rotulo">Ejemplo</span>
      </div>
      <dl>
        <div>
          <dt>{marcas ? <Marca n={3} marcas>A</Marca> : "A"}</dt>
          <dd>{DESTINATARIOS[destinatario]}</dd>
        </div>
        <div>
          <dt>Detalle</dt>
          <dd>{detalle.trim() || "—"}</dd>
        </div>
      </dl>
      <div className="fx-hoja-total">
        <span className="fx-tenue">Total</span>
        <strong>{plata(total)}</strong>
      </div>
      {/* QA 29/10: «Sin validez fiscal» va pegado al sello, en la misma fila: donde se lee «Autorizada · CAE»
          se lee que es un ejemplo (en el celular la barra fija puede tapar el descargo de abajo). */}
      <div className="fx-hoja-pie">
        {emitida ? (
          <Marca n={4} marcas={marcas}>
            <span className="fx-sello">
              <Check />
              Autorizada · CAE
            </span>
          </Marca>
        ) : (
          <span className="fx-sello fx-sello--borrador">Sin emitir</span>
        )}
        <span className="fx-sin-validez">Sin validez fiscal</span>
      </div>
      {/* Lo que pasa después en la app, dicho como texto: no es un botón (QA 29/10). */}
      <p className="fx-pdf">Sale en PDF para tu cliente</p>
      {conQr && (
        <div className="fx-qr" style={{ marginTop: grande ? 20 : 14 }}>
          <Marca n={5} marcas={marcas}>
            <QrEsquema />
          </Marca>
          <span className="fx-chico">QR de ARCA (dibujo ilustrativo, no se escanea)</span>
        </div>
      )}
      <p className="fx-descargo">
        Ejemplo ilustrativo, con datos inventados. <strong>Sin validez fiscal.</strong>
      </p>
    </>
  );
}
