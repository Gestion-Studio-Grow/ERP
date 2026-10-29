"use client";

// «TU AROMA» — la decisión central de la compra en Shine («Todas nuestras velitas son aromáticas y podés
// elegir su fragancia», catálogo p2). Se elige una vez y queda prendida en toda la visita: el chip de la
// barra, la cera de la vela 3D y cada «+» del catálogo, que la lleva a la nota del pedido.
//
// · El aroma elegido vive en un store chico (useSyncExternalStore): el servidor dibuja «—» y el navegador
//   lo corrige en su primer render, sin efecto ni render extra; `localStorage` lo recuerda entre visitas
//   (con try/catch: en una ventana privada o con el almacenamiento bloqueado, simplemente no recuerda).
// · Los chips son botones con `aria-pressed`; el color es ilustrativo y lo dice.

import { useEffect, useRef, useSyncExternalStore } from "react";
import { AROMAS_DIFUSOR, AROMAS_VELA, TODOS_LOS_AROMAS } from "./catalogo";
import { tinteDeAroma } from "./vela-reglas";

const CLAVE = "shine:aroma";
const oyentes = new Set<() => void>();
let enMemoria: string | null | undefined;

function leer(): string | null {
  if (enMemoria !== undefined) return enMemoria;
  let v: string | null = null;
  try {
    v = window.localStorage.getItem(CLAVE);
  } catch {
    v = null;
  }
  enMemoria = v && TODOS_LOS_AROMAS.includes(v) ? v : null;
  return enMemoria;
}

function suscribir(cb: () => void): () => void {
  oyentes.add(cb);
  const alGuardarOtraPestana = (e: StorageEvent) => {
    if (e.key !== CLAVE) return;
    enMemoria = undefined;
    cb();
  };
  window.addEventListener("storage", alGuardarOtraPestana);
  return () => {
    oyentes.delete(cb);
    window.removeEventListener("storage", alGuardarOtraPestana);
  };
}

export function elegirAroma(a: string | null) {
  enMemoria = a;
  try {
    if (a) window.localStorage.setItem(CLAVE, a);
    else window.localStorage.removeItem(CLAVE);
  } catch {
    // sin almacenamiento: vale para esta visita
  }
  for (const f of oyentes) f();
}

/** El aroma elegido (null = todavía ninguno). En el servidor y en la hidratación, null. */
export function useAromaElegido(): string | null {
  return useSyncExternalStore(suscribir, leer, () => null);
}

/** Un grupo de chips de aroma. `elegido` marca el presionado; tocar el presionado lo deja como está (no se «des-elige» por accidente). */
export function ChipsDeAroma({
  aromas,
  elegido,
  alElegir,
  rotulo,
  id,
  chico = false,
}: {
  aromas: readonly string[];
  elegido: string | null;
  alElegir: (a: string) => void;
  /** Nombre accesible del grupo. */
  rotulo: string;
  id?: string;
  chico?: boolean;
}) {
  return (
    <div className={`sha-chips${chico ? " sha-chips-chicos" : ""}`} role="group" aria-label={rotulo} id={id}>
      {aromas.map((a) => (
        <button key={a} type="button" className="sha-chip" aria-pressed={elegido === a} onClick={() => alElegir(a)}>
          <span className="sha-gota" style={{ background: tinteDeAroma(a) }} aria-hidden="true" />
          {a}
        </button>
      ))}
    </div>
  );
}

/** Las dos cartas del catálogo, con su rótulo. La usan la sección «Elegí tu aroma» y la hoja del celular. */
function DosCartas({ elegido, idBase }: { elegido: string | null; idBase: string }) {
  return (
    <div className="sha-cartas">
      <div className="sha-carta">
        <h3 className="sha-carta-t" id={`${idBase}-velas`}>
          Para velas <span>· 9 aromas</span>
        </h3>
        <ChipsDeAroma aromas={AROMAS_VELA} elegido={elegido} alElegir={elegirAroma} rotulo="Aromas para velas" />
      </div>
      <div className="sha-carta">
        <h3 className="sha-carta-t" id={`${idBase}-difu`}>
          Para difusores y home spray <span>· 6 aromas</span>
        </h3>
        <ChipsDeAroma aromas={AROMAS_DIFUSOR} elegido={elegido} alElegir={elegirAroma} rotulo="Aromas para difusores y home spray" />
      </div>
      <p className="sha-nota">La gota muestra un color ilustrativo: la cera puede ser de otro tono.</p>
    </div>
  );
}

/** La carta de aromas de la portada (`#aromas`). */
export function CartaDeAromas({ elegido }: { elegido: string | null }) {
  return (
    <section className="sh-sec sha" id="aromas" aria-labelledby="sha-titulo">
      <div className="sh-cab">
        <p className="sh-eyebrow">Paso uno</p>
        <h2 className="sh-h2" id="sha-titulo">
          Elegí tu aroma
        </h2>
        <p className="sh-lede">
          Todas las velitas son aromáticas. Elegí la fragancia acá y la llevan todas las que sumes a la bolsa; después la podés cambiar en cada una.
        </p>
      </div>
      <DosCartas elegido={elegido} idBase="sha" />
      <p className="sha-estado" aria-live="polite">
        {elegido ? (
          <>
            Tu aroma: <b>{elegido}</b>
          </>
        ) : (
          "Todavía no elegiste aroma."
        )}
      </p>
    </section>
  );
}

/** La carta en una hoja (celular): se abre desde el chip «Tu aroma» de la barra de abajo. */
export function HojaDeAroma({ abierta, elegido, alCerrar }: { abierta: boolean; elegido: string | null; alCerrar: () => void }) {
  const d = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = d.current;
    if (!el) return;
    if (abierta && !el.open) el.showModal();
    else if (!abierta && el.open) el.close();
  }, [abierta]);
  return (
    <dialog
      ref={d}
      className="sh-hoja sha-hoja"
      aria-labelledby="sha-hoja-t"
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <div className="sh-hoja-caja">
        <div className="sh-hoja-cab">
          <h2 id="sha-hoja-t" className="sh-h3">
            Elegí tu aroma
          </h2>
          <button type="button" className="sh-cerrar" onClick={alCerrar}>
            Cerrar
          </button>
        </div>
        <DosCartas elegido={elegido} idBase="sha-hoja" />
        <div className="sh-hoja-pie">
          <button type="button" className="sh-btn sh-btn-vino sh-btn-ancho" onClick={alCerrar}>
            {elegido ? `Listo · ${elegido}` : "Listo"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
