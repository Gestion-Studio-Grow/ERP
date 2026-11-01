"use client";

// LA FICHA DE UNA VELA — `<dialog>` nativo (foco atrapado, Escape y fondo inerte los pone el navegador),
// dos columnas en la compu y pantalla completa en el celular. Es también la «hoja de aroma»: cuando se
// abre desde el «+» sin un aroma que le sirva, el foco cae en los chips.
//
// Lo que dice sale del catálogo oficial (catalogo.ts) y del ERP (nombre, precio, stock). Sin carta de
// aromas en el catálogo, no se inventa una: se invita a consultar.

import { useHoja } from "@/components/vidriera/useHoja";
import Image from "next/image";
import { useLayoutEffect, useRef, useState } from "react";
import { etiquetaDeDisponibilidad, type Disponibilidad } from "../reglas-tienda";
import { ChipsDeAroma } from "./Aromas";
import { nombreDeFamilia, type Vista } from "./catalogo";

export type ProductoFicha = { id: string; name: string; precio: number; disponibilidad?: Disponibilidad; vista: Vista };

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export default function Ficha({
  p,
  aromaInicial,
  focoEnAromas,
  enBolsa,
  hayWhatsApp,
  alCerrar,
  alAgregar,
  alConsultar,
}: {
  p: ProductoFicha;
  aromaInicial: string | null;
  focoEnAromas: boolean;
  enBolsa: number;
  hayWhatsApp: boolean;
  alCerrar: () => void;
  alAgregar: (aroma: string | null, cantidad: number) => void;
  alConsultar: (mensaje: string) => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const chips = useRef<HTMLDivElement>(null);
  const v = p.vista;
  const [aroma, setAroma] = useState<string | null>(aromaInicial && v.aromas.includes(aromaInicial) ? aromaInicial : null);
  const [cantidad, setCantidad] = useState(1);
  const [foto, setFoto] = useState(0);
  const sinStock = p.disponibilidad === "sin-stock";
  const etiqueta = etiquetaDeDisponibilidad(p.disponibilidad ?? null);
  const faltaAroma = v.aromas.length > 0 && !aroma;

  // La hoja compartida (ronda 2). La ficha ya escribe su URL (?p=) y ShineFront maneja «atrás»: sin historial propio.
  useHoja(dialogo, true, alCerrar, { historial: false });
  useLayoutEffect(() => {
    if (focoEnAromas) chips.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [focoEnAromas]);

  return (
    <dialog
      ref={dialogo}
      className="sh-hoja shf"
      aria-labelledby="shf-nombre"
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <div className="sh-hoja-caja shf-caja">
        <button type="button" className="sh-cerrar shf-cerrar" onClick={alCerrar}>
          Cerrar
        </button>

        <div className="shf-fotos">
          <div className="shf-foto">
            {v.fotos.length > 0 ? (
              <Image src={v.fotos[foto]} alt={v.alt} fill sizes="(max-width: 820px) 100vw, 52vw" className="shf-img" />
            ) : (
              <span className="sh-sinfoto" aria-hidden="true" />
            )}
            {v.ilustrativa && <span className="sh-rotulo">Foto ilustrativa · a confirmar</span>}
          </div>
          {v.fotos.length > 1 && (
            <div className="shf-minis" role="group" aria-label="Fotos">
              {v.fotos.map((f, i) => (
                <button key={f} type="button" aria-pressed={foto === i} aria-label={`Foto ${i + 1} de ${v.fotos.length}`} onClick={() => setFoto(i)}>
                  <Image src={f} alt="" width={64} height={80} sizes="64px" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="shf-texto">
          <p className="sh-eyebrow">{nombreDeFamilia(v.familia)}</p>
          <h2 id="shf-nombre" className="shf-nombre">
            {p.name}
          </h2>
          <p className="shf-precio sh-num">
            {v.desde ? "Desde " : ""}
            {money.format(p.precio)}
          </p>
          {v.detalle && <p className="shf-detalle">{v.detalle}</p>}
          {etiqueta && <p className={`sh-dispo${sinStock ? " off" : ""}`}>{etiqueta}</p>}

          {v.aromas.length > 0 ? (
            <div className="shf-aromas" ref={chips}>
              <p className="shf-sub" id="shf-aroma-t">
                Elegí el aroma {aroma ? <b>· {aroma}</b> : <span>· todavía ninguno</span>}
              </p>
              <ChipsDeAroma aromas={v.aromas} elegido={aroma} alElegir={setAroma} rotulo={`Aroma de ${p.name}`} />
              <p className="sha-nota">Color ilustrativo.</p>
            </div>
          ) : (
            <p className="shf-detalle">Consultanos por el aroma de este producto.</p>
          )}

          {v.conAnticipacion && <p className="shf-nota">Hecha a pedido · se encarga con anticipación.</p>}
          {enBolsa > 0 && <p className="shf-nota">Ya tenés {enBolsa} en la bolsa.</p>}

          <div className="shf-acciones">
            <div className="sh-stepper" role="group" aria-label="Cantidad">
              <button type="button" onClick={() => setCantidad((c) => Math.max(1, c - 1))} disabled={cantidad <= 1} aria-label="Una menos">
                −
              </button>
              <span className="sh-num" aria-live="polite">
                {cantidad}
              </span>
              <button type="button" onClick={() => setCantidad((c) => Math.min(20, c + 1))} aria-label="Una más">
                +
              </button>
            </div>
            <button
              type="button"
              className="sh-btn sh-btn-vino shf-agregar"
              disabled={sinStock || faltaAroma}
              aria-describedby={faltaAroma ? "shf-aroma-t" : undefined}
              onClick={() => alAgregar(aroma, cantidad)}
            >
              {sinStock ? "Sin stock por ahora" : faltaAroma ? "Elegí un aroma" : "Agregar a la bolsa"}
            </button>
          </div>
          {hayWhatsApp && (
            <button type="button" className="sh-link" onClick={() => alConsultar(`¡Hola Shine! Quería consultar otros aromas para «${p.name}».`)}>
              {sinStock ? "Avisame por WhatsApp cuando haya" : "Consultá otros aromas por WhatsApp"}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
