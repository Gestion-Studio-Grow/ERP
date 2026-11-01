"use client";

// ============================================================================
// ENFRENTADAS — dos palas lado a lado, como se comparan en la mano.
// ============================================================================
//
// Dos selectores y la ficha de cada una en columnas, fila por fila. La pelota marca, en cada fila donde
// hay una diferencia OBJETIVA, cuál de las dos va para ese lado y lo dice con palabras: «más barata»,
// «más liviana», «más accesible» (nivel), «más control» (forma y balance). No hay «mejor» en abstracto:
// una diamante no es mejor que una redonda, es para otro juego. Sin dato en una de las dos, no se marca.
// La pelota se desliza entre columnas (transform). El estado vive en el front y en la URL (?vs=a,b).

import { plata } from "../vidriera/catalogo-core";
import type { Item } from "./catalogo";
import { NOMBRE_FORMA, NOMBRE_JUEGO, NOMBRE_NIVEL, ORDEN_NIVEL, type FichaDePala, type Forma } from "./palas";
import { Pala, Pelota } from "./Siluetas";

type Lado = 0 | 1;
type Fila = { rotulo: string; valor: (p: Item) => string; marca?: (a: Item, b: Item) => { lado: Lado; texto: string } | null };

const CONTROL_FORMA: Record<Forma, number> = { redonda: 2, lagrima: 1, diamante: 0 };
const controlBalance = (b: string) => (/bajo/i.test(b) ? 2 : /medio/i.test(b) ? 1 : /alto/i.test(b) ? 0 : null);
const pesoMin = (s: string) => {
  const n = Number(s.match(/\d+/)?.[0]);
  return Number.isFinite(n) ? n : null;
};
const fichaO = (p: Item, campo: keyof FichaDePala) => (p.vista.ficha ? String(p.vista.ficha[campo]) : "A confirmar");

/** Marca el lado que gana con `mejor(x) > mejor(y)`; empate o sin dato → nada. */
function ganador(a: number | null, b: number | null, texto: string): { lado: Lado; texto: string } | null {
  if (a === null || b === null || a === b) return null;
  return { lado: a > b ? 0 : 1, texto };
}

export const FILAS: readonly Fila[] = [
  {
    rotulo: "Forma",
    valor: (p) => (p.vista.ficha ? NOMBRE_FORMA[p.vista.ficha.forma] : "A confirmar"),
    marca: (a, b) => ganador(a.vista.ficha ? CONTROL_FORMA[a.vista.ficha.forma] : null, b.vista.ficha ? CONTROL_FORMA[b.vista.ficha.forma] : null, "más control"),
  },
  {
    rotulo: "Balance",
    valor: (p) => fichaO(p, "balance"),
    marca: (a, b) => ganador(a.vista.ficha ? controlBalance(a.vista.ficha.balance) : null, b.vista.ficha ? controlBalance(b.vista.ficha.balance) : null, "más control"),
  },
  {
    rotulo: "Peso",
    valor: (p) => fichaO(p, "peso"),
    marca: (a, b) => {
      const x = a.vista.ficha ? pesoMin(a.vista.ficha.peso) : null;
      const y = b.vista.ficha ? pesoMin(b.vista.ficha.peso) : null;
      return ganador(x === null ? null : -x, y === null ? null : -y, "más liviana");
    },
  },
  { rotulo: "Núcleo", valor: (p) => fichaO(p, "nucleo") },
  { rotulo: "Cara", valor: (p) => fichaO(p, "cara") },
  {
    rotulo: "Nivel",
    valor: (p) => (p.vista.ficha ? NOMBRE_NIVEL[p.vista.ficha.nivel] : "A confirmar"),
    marca: (a, b) => ganador(a.vista.ficha ? -ORDEN_NIVEL[a.vista.ficha.nivel] : null, b.vista.ficha ? -ORDEN_NIVEL[b.vista.ficha.nivel] : null, "más accesible"),
  },
  { rotulo: "Juego", valor: (p) => (p.vista.ficha ? NOMBRE_JUEGO[p.vista.ficha.juego] : "A confirmar") },
  {
    rotulo: "Precio",
    valor: (p) => plata(p.precio),
    marca: (a, b) => ganador(a.precio > 0 ? -a.precio : null, b.precio > 0 ? -b.precio : null, "más barata"),
  },
];

export default function Enfrentadas({
  palas,
  vs,
  hidratado,
  alCambiar,
  alSumar,
  alAbrir,
}: {
  palas: readonly Item[];
  vs: readonly [string | null, string | null];
  hidratado: boolean;
  alCambiar: (lado: Lado, id: string | null) => void;
  alSumar: (p: Item) => void;
  alAbrir: (id: string) => void;
}) {
  const a = palas.find((p) => p.id === vs[0]) ?? null;
  const b = palas.find((p) => p.id === vs[1]) ?? null;
  const columnas: [Item | null, Item | null] = [a, b];

  return (
    <section className="am-sec am-vs" id="enfrentadas" aria-labelledby="am-t-vs">
      <div className="am-sec-cab">
        <p className="am-kicker">Como en la mano</p>
        <h2 className="am-h2" id="am-t-vs">
          Enfrentadas
        </h2>
        <p className="am-cuerpo">Elegí dos palas y miralas fila por fila. La pelota marca qué cambia de una a otra.</p>
      </div>

      <div className="am-vs-tabla" role="table" aria-label="Comparación de dos palas">
        <div className="am-vs-fila am-vs-cabeza" role="row">
          <span role="columnheader">
            <span className="am-sr">Dato</span>
          </span>
          {columnas.map((p, lado) => (
            <div key={lado} role="columnheader" className="am-vs-col">
              <label className="am-vs-elegir">
                <span className="am-sr">{lado === 0 ? "Primera pala" : "Segunda pala"}</span>
                <select value={p?.id ?? ""} onChange={(e) => alCambiar(lado as Lado, e.target.value || null)}>
                  <option value="">Elegí una pala</option>
                  {palas.map((x) => (
                    <option key={x.id} value={x.id} disabled={x.id === columnas[lado === 0 ? 1 : 0]?.id}>
                      {x.name.replace(/^Pala\s+/i, "")}
                    </option>
                  ))}
                </select>
              </label>
              {p && (
                <button type="button" className="am-vs-sil" onClick={() => alAbrir(p.id)} aria-label={`Ver ficha de ${p.name}`}>
                  <Pala forma={p.vista.forma ?? "lagrima"} marca={p.vista.marca} />
                </button>
              )}
            </div>
          ))}
        </div>

        {FILAS.map((f) => {
          const m = a && b && f.marca ? f.marca(a, b) : null;
          return (
            <div key={f.rotulo} className="am-vs-fila" role="row">
              <span role="rowheader" className="am-vs-rotulo">
                {f.rotulo}
              </span>
              {columnas.map((p, lado) => (
                <span key={lado} role="cell" className={`am-vs-dato${m?.lado === lado ? " gana" : ""}`}>
                  {p ? f.valor(p) : "—"}
                  {m?.lado === lado && <span className="am-sr"> ({m.texto})</span>}
                </span>
              ))}
              <span className={`am-vs-pelota${m ? " ver" : ""}`} style={{ ["--lado" as string]: m?.lado ?? 0 }} aria-hidden="true">
                <Pelota />
                <span>{m?.texto ?? ""}</span>
              </span>
            </div>
          );
        })}

        <div className="am-vs-fila am-vs-acciones" role="row">
          <span role="cell">
            <span className="am-sr">Sumar</span>
          </span>
          {columnas.map((p, lado) => (
            <span key={lado} role="cell">
              {p &&
                (p.disponibilidad === "sin-stock" ? (
                  <span className="am-dispo">Sin stock</span>
                ) : (
                  <button type="button" className="am-btn am-btn-pelota" onClick={() => alSumar(p)} disabled={!hidratado}>
                    Sumar esta
                  </button>
                ))}
            </span>
          ))}
        </div>
      </div>
      {(a && !a.vista.ficha) || (b && !b.vista.ficha) ? <p className="am-nota">Lo que dice «a confirmar» no tiene ficha técnica con fuente todavía: consultanos.</p> : null}
      <p className="am-nota am-vs-fuente">Datos de referencia de tiendas especializadas, con su fuente en cada ficha. Confirmá la versión antes de pedir.</p>
    </section>
  );
}
