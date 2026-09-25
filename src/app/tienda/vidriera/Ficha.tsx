"use client";

// ============================================================================
// LA FICHA DEL PRODUCTO — sube como hoja en el celular, entra por la derecha en la PC.
// ============================================================================
//
// Sólo lo que es cierto: el nombre, el precio, cómo se vende, si quedan pocas, y lo que la marca
// dice de toda la sección ("Envasado al vacío", la bajada del copy). El catálogo no tiene
// descripción ni fotos por producto (salvo las de MAGRA): no se inventa una ni otra. La cantidad
// se elige acá sin tocar la bolsa, y recién «Sumar al pedido» la cambia.
//
// `<dialog>` nativo: foco atrapado y devuelto por el navegador, Esc cierra, «atrás» también (la
// ficha vive en `?producto=`, ver Vidriera.tsx).

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import s from "./vidriera.module.css";
import { esPorPeso, pasoDe, plata, precioDe, textoCantidad, type ProductoVidriera } from "./catalogo-core";
import { etiquetaDeDisponibilidad } from "../reglas-tienda";
import { buildWhatsAppHref } from "@/lib/whatsapp-cta";
import type { SeccionVista } from "./Vidriera";
import { IconoCerrar, IconoWhatsApp } from "./Iconos";

const PESOS_RAPIDOS = [0.5, 1, 1.5, 2];

export function Ficha({
  p,
  sec,
  marca,
  imagen,
  enBolsa,
  whatsapp,
  onFijar,
  onCerrar,
  parecidos,
  puesto,
  onAbrir,
}: {
  /** Los de la misma sección con precio parecido, para comparar sin cerrar la ficha. */
  parecidos: ProductoVidriera[];
  /** El puesto de su precio en la sección, de menor a mayor. */
  puesto: { puesto: number; de: number };
  onAbrir: (id: string) => void;
  p: ProductoVidriera;
  sec: SeccionVista | null;
  marca: string | null;
  imagen: string | null;
  enBolsa: number;
  whatsapp: string;
  onFijar: (q: number) => void;
  onCerrar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const peso = esPorPeso(p);
  const sinStock = p.disponibilidad === "sin-stock";
  const [q, setQ] = useState(enBolsa > 0 ? enBolsa : peso ? 1 : 1);
  const disp = etiquetaDeDisponibilidad(p.disponibilidad ?? null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const importe = Math.round(q * precioDe(p) * 100) / 100;
  const mover = (dir: 1 | -1) => setQ((x) => Math.max(pasoDe(p), Math.round((x + dir * pasoDe(p)) * 1000) / 1000));

  return (
    <dialog
      ref={ref}
      className={s.ficha}
      aria-labelledby="ficha-t"
      onCancel={(e) => {
        e.preventDefault();
        onCerrar();
      }}
      onClick={(e) => {
        // Un toque en el velo (fuera de la hoja) cierra.
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div className={s.fichaIn}>
        <div className={s.fichaCab}>
          <span className={s.kicker}>{[sec?.titulo, marca].filter(Boolean).join(" · ")}</span>
          <button type="button" className={s.cerrar} onClick={onCerrar} aria-label="Cerrar la ficha">
            <IconoCerrar />
          </button>
        </div>
        {imagen && (
          <Image
            src={imagen}
            alt={p.name}
            width={686}
            height={858}
            sizes="(max-width: 719px) 100vw, 440px"
            className={s.fichaFoto}
          />
        )}
        <h2 id="ficha-t" className={s.fichaNom}>
          {p.name}
        </h2>
        <p className={s.fichaPrecio}>
          <span className={s.renPrecio}>{plata(precioDe(p))}</span> {peso ? "el kilo" : "la unidad"}
        </p>
        {disp && (
          <p className={s.estado} data-estado={p.disponibilidad}>
            {disp}
          </p>
        )}

        <dl className={s.hechos}>
          <div>
            <dt>Cómo se vende</dt>
            <dd>
              {peso
                ? "Por kilo. Pedís una cantidad aproximada; se pesa al envasar y el total se ajusta al peso real."
                : "Por unidad."}
            </dd>
          </div>
          {sec?.hechos.map((h) => (
            <div key={h}>
              <dt className={s.srOnly}>Sobre {sec.titulo}</dt>
              <dd>{h}</dd>
            </div>
          ))}
        </dl>

        {!sinStock && (
          <div className={s.fichaCant}>
            <span className={s.kicker} id="ficha-cant">
              Cuánto
            </span>
            {peso && (
              <div className={s.chips} role="group" aria-labelledby="ficha-cant">
                {PESOS_RAPIDOS.map((kg) => (
                  <button key={kg} type="button" className={s.chip} aria-pressed={q === kg} onClick={() => setQ(kg)}>
                    {textoCantidad(p, kg)}
                  </button>
                ))}
              </div>
            )}
            <div className={s.fichaFila}>
              <span className={s.paso} role="group" aria-label={`Cantidad de ${p.name}`}>
                <button
                  type="button"
                  className={s.pasoBtn}
                  onClick={() => mover(-1)}
                  disabled={q <= pasoDe(p)}
                  aria-label="Menos"
                >
                  −
                </button>
                <span className={s.pasoQ} aria-live="polite">
                  {textoCantidad(p, q)}
                </span>
                <button type="button" className={`${s.pasoBtn} ${s.pasoMas}`} onClick={() => mover(1)} aria-label="Más">
                  +
                </button>
              </span>
              <span className={s.fichaImporte}>
                {peso ? "≈ " : ""}
                {plata(importe)}
              </span>
            </div>
          </div>
        )}

        {parecidos.length > 0 && sec && (
          <div className={s.compara}>
            <span className={s.kicker}>
              {puesto.puesto === 1
                ? `Precio más bajo de ${sec.titulo} (${puesto.de})`
                : puesto.puesto === puesto.de
                  ? `Precio más alto de ${sec.titulo} (${puesto.de})`
                  : `${puesto.puesto}.º precio de ${puesto.de} en ${sec.titulo}, de menor a mayor`}
            </span>
            <ul>
              {parecidos.map((x) => {
                const dif = precioDe(x) - precioDe(p);
                return (
                  <li key={x.id}>
                    <button type="button" className={s.comparaNom} onClick={() => onAbrir(x.id)}>
                      {x.name}
                    </button>
                    <span className={s.comparaDif}>
                      {dif === 0 ? "mismo precio" : `${dif > 0 ? "+" : "−"}${plata(Math.abs(dif))}`}
                    </span>
                    <span className={s.renPrecio}>{plata(precioDe(x))}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className={s.fichaAcc}>
          {sinStock ? (
            <p className={s.nota}>
              Se agotó. {whatsapp ? "Escribinos y te avisamos cuando vuelva." : "Volvé a mirar en unos días."}
            </p>
          ) : (
            <button
              type="button"
              className={`${s.btn} ${s.btnPri}`}
              onClick={() => {
                onFijar(q);
                onCerrar();
              }}
            >
              {enBolsa > 0
                ? q === enBolsa
                  ? "Seguir comprando"
                  : `Cambiar a ${textoCantidad(p, q)} · ${plata(importe)}`
                : `Sumar al pedido · ${plata(importe)}`}
            </button>
          )}
          {enBolsa > 0 && (
            <button
              type="button"
              className={`${s.btn} ${s.btnTer}`}
              onClick={() => {
                onFijar(0);
                onCerrar();
              }}
            >
              Sacar del pedido
            </button>
          )}
          {whatsapp && (
            <a
              className={`${s.btn} ${s.btnSec}`}
              href={buildWhatsAppHref(whatsapp, `¡Hola! Quería consultar por ${p.name}.`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconoWhatsApp /> Preguntar por WhatsApp
            </a>
          )}
        </div>
      </div>
    </dialog>
  );
}
