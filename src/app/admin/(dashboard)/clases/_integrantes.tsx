"use client";

// E7 · El cobro por persona de una grupal, adentro de la tarjeta de la clase (Hoy, Semana, Bandeja).
// Una fila por persona: el titular (su pago es el de la clase: «Cobré» de siempre, más abajo) y cada
// integrante con su parte y sus botones: Cobré (medio en un toque), el comprobante por revisar,
// WhatsApp con su monto, Quitar (sólo si no pagó) y «Le devolví» si su parte quedó a favor.
// La clase dice «pagada» sólo cuando pagaron todos (cobroDeLaClase, core.ts).

import { useId, useState } from "react";
import { Chip, buttonClasses, cn } from "@/components/ui";
import {
  agregarIntegrante,
  avisarIntegrante,
  cobrarIntegrante,
  devolverParteIntegrante,
  quitarIntegrante,
  revisarComprobanteIntegrante,
} from "@/lib/padel/acciones-grupal";
import {
  MAX_INTEGRANTES,
  MEDIOS_COBRO,
  MEDIO_LABEL,
  MOTIVOS_COMPROBANTE,
  MOTIVO_COMPROBANTE_LABEL,
  PAGO_LABEL,
  cobroDeLaClase,
  esEstadoPago,
  parteDeIntegrante,
  puedeCobrarProfe,
  puedeQuitarIntegrante,
  type MedioCobro,
} from "@/lib/padel/core";
import { plataTexto } from "./_plata";
import { ErrorAccion, chip48, useAccion } from "./_hojas/comun";
import type { ClaseAcciones, IntegranteAcciones } from "./_hojas/tipos";

const ligero = "min-h-12 text-sm font-semibold text-muted underline underline-offset-2 hover:text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const campo =
  "h-12 w-full rounded-xl border border-line-strong bg-surface-raised px-3 text-base text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

const etiquetaPago = (p: string) => (esEstadoPago(p) ? PAGO_LABEL[p] : p);
const primero = (n: string) => n.split(/\s+/)[0];

/** Abre el WhatsApp en otra pestaña (el link ya viene armado del servidor). */
const abrir = (wa: string | null) => {
  if (wa) window.open(wa, "_blank", "noopener,noreferrer");
};

export function IntegrantesClase({ c }: { c: ClaseAcciones }) {
  const integrantes = c.integrantes ?? [];
  const sumable = ["PEDIDA", "CONFIRMADA", "DADA"].includes(c.estado) && integrantes.length < MAX_INTEGRANTES;
  if (c.tipo !== "GRUPAL" || (!integrantes.length && !sumable)) return null;
  const cobro = cobroDeLaClase({ pagoEstado: c.pagoEstado, precio: c.precio }, integrantes);
  return (
    <section className="grid gap-2 rounded-xl border border-line p-2" aria-label="Quiénes vienen y cuánto paga cada uno" data-qa="integrantes-clase">
      {integrantes.length > 0 && (
        <p className="text-sm font-semibold text-strong" data-qa="cobro-grupal">
          {cobro.pagada ? "✓ Pagaron todos" : `Pagaron ${cobro.pagaron} de ${cobro.personas}`} · {plataTexto(cobro.cobrado)} de {plataTexto(cobro.total)}
        </p>
      )}
      <ul className="grid gap-2">
        <li className="flex min-h-12 items-center justify-between gap-2 px-1 text-sm">
          <span className="text-strong">
            {c.nombre} <span className="text-muted">(titular)</span>
          </span>
          <span className="tabular-nums text-muted">
            {plataTexto(c.precio)} · {etiquetaPago(c.pagoEstado)}
          </span>
        </li>
        {integrantes.map((i) => (
          <FilaIntegrante key={i.id} i={i} clase={c} />
        ))}
      </ul>
      {sumable && <SumarIntegrante claseId={c.id} />}
    </section>
  );
}

function FilaIntegrante({ i, clase }: { i: IntegranteAcciones; clase: ClaseAcciones }) {
  const { pendiente, error, ejecutar, mostrar } = useAccion(i.nombre);
  const [modo, setModo] = useState<"cobrar" | "motivos" | "ver" | null>(null);
  const parte = parteDeIntegrante({ estado: clase.estado, motivoCancel: clase.motivoCancel ?? null }, i);
  const cobrable = puedeCobrarProfe(parte) && i.pagoEstado !== "EN_REVISION";
  const listo = (texto: string, wa?: string | null) => mostrar({ texto, nombre: i.nombre, wa: wa ?? null, enviado: false, avisoId: null });

  return (
    <li className="grid gap-2 rounded-lg bg-surface-raised p-2" data-qa="fila-integrante">
      <div className="flex min-h-12 items-center justify-between gap-2 text-sm">
        <span className="text-strong">{i.nombre}</span>
        <span className="tabular-nums text-muted">
          {plataTexto(i.monto)} · {etiquetaPago(i.pagoEstado)}
        </span>
      </div>
      {i.pagoNota && i.pagoEstado === "PENDIENTE" && <p className="text-sm text-muted">{i.pagoNota}</p>}

      {i.pagoEstado === "EN_REVISION" && (
        <div className="grid gap-2 rounded-lg bg-warning-soft p-2">
          {["CANCELADA", "RECHAZADA"].includes(clase.estado) && (
            <p className="text-sm text-strong" data-qa="comprobante-integrante-clase-caida">
              La clase se canceló pero {primero(i.nombre)} mandó el comprobante. Si está bien, le queda a favor (o se lo devolvés).
            </p>
          )}
          {i.comprobante && (
            <button type="button" className="min-h-12 text-left text-sm font-semibold text-strong underline" aria-expanded={modo === "ver"} onClick={() => setModo(modo === "ver" ? null : "ver")}>
              {modo === "ver" ? "Ocultar comprobante" : "Ver comprobante"}
            </button>
          )}
          {i.comprobante && modo === "ver" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={i.comprobante} alt={`Comprobante de ${i.nombre}`} className="max-h-96 w-full rounded-lg bg-surface-raised object-contain" />
          )}
          {modo === "motivos" ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Por qué no es válido">
              {MOTIVOS_COMPROBANTE.map((m) => (
                <Chip
                  key={m}
                  disabled={pendiente}
                  className={chip48}
                  onClick={() =>
                    ejecutar(async () => {
                      const r = await revisarComprobanteIntegrante(i.id, "noValido", m);
                      if (!r.ok) return r.error;
                      listo(`Le pediste otro comprobante a ${primero(i.nombre)}`, r.wa);
                    })
                  }
                >
                  {MOTIVO_COMPROBANTE_LABEL[m]}
                </Chip>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={pendiente}
                className={cn(buttonClasses("solid", "sm"), "min-h-12")}
                onClick={() =>
                  ejecutar(async () => {
                    const r = await revisarComprobanteIntegrante(i.id, "validar");
                    if (!r.ok) return r.error;
                    listo(`Pago de ${primero(i.nombre)} validado`, r.wa);
                  })
                }
              >
                Está bien
              </button>
              <button type="button" disabled={pendiente} className={cn(buttonClasses("outline", "sm"), "min-h-12")} onClick={() => setModo("motivos")}>
                No es válido
              </button>
            </div>
          )}
        </div>
      )}

      {modo === "cobrar" && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={`Cómo te pagó ${primero(i.nombre)}`}>
          {MEDIOS_COBRO.map((m: MedioCobro) => (
            <Chip
              key={m}
              disabled={pendiente}
              className={chip48}
              onClick={() =>
                ejecutar(async () => {
                  const r = await cobrarIntegrante(i.id, m);
                  if (!r.ok) return r.error;
                  setModo(null);
                  listo(`Cobraste ${plataTexto(r.monto)} a ${primero(i.nombre)}`);
                })
              }
            >
              {MEDIO_LABEL[m]}
            </Chip>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4">
        {cobrable && modo !== "cobrar" && (
          <button type="button" disabled={pendiente} className={ligero} onClick={() => setModo("cobrar")} data-qa="cobre-integrante">
            Cobré
          </button>
        )}
        {i.telefono && (
          <button
            type="button"
            disabled={pendiente}
            className={ligero}
            onClick={() =>
              ejecutar(async () => {
                const r = await avisarIntegrante(i.id);
                if (!r.ok) return r.error;
                abrir(r.wa);
              })
            }
          >
            WhatsApp
          </button>
        )}
        {puedeQuitarIntegrante(i) && (
          <button
            type="button"
            disabled={pendiente}
            className={ligero}
            onClick={() =>
              ejecutar(async () => {
                const r = await quitarIntegrante(i.id);
                if (!r.ok) return r.error;
                listo(`Quitaste a ${primero(i.nombre)}`);
              })
            }
          >
            Quitar
          </button>
        )}
        {i.pagoEstado === "ACREDITADO" && (
          <button
            type="button"
            disabled={pendiente}
            className={ligero}
            onClick={() =>
              ejecutar(async () => {
                const r = await devolverParteIntegrante(i.id);
                if (!r.ok) return r.error;
                listo(`Le devolviste ${plataTexto(i.monto)} a ${primero(i.nombre)}`);
              })
            }
          >
            Le devolví
          </button>
        )}
      </div>
      <ErrorAccion texto={error} />
    </li>
  );
}

function SumarIntegrante({ claseId }: { claseId: string }) {
  const { pendiente, error, ejecutar, mostrar } = useAccion("");
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const idNombre = useId();
  const idTel = useId();
  if (!abierto) {
    return (
      <button type="button" className={ligero} onClick={() => setAbierto(true)} data-qa="sumar-integrante">
        + Integrante
      </button>
    );
  }
  const listo = nombre.trim().length >= 2 && (telefono.trim() === "" || telefono.replace(/\D/g, "").length >= 8);
  return (
    <div className="grid gap-2">
      <div>
        <label htmlFor={idNombre} className="mb-1 block text-sm text-strong">Nombre</label>
        <input id={idNombre} className={campo} autoComplete="off" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      <div>
        <label htmlFor={idTel} className="mb-1 block text-sm text-strong">Celular (opcional: si ya es tu alumno, queda vinculado)</label>
        <input id={idTel} type="tel" inputMode="tel" placeholder="11 5555-1234" className={campo} value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!listo || pendiente}
          className={cn(buttonClasses("solid", "sm"), "min-h-12")}
          onClick={() =>
            ejecutar(async () => {
              const r = await agregarIntegrante(claseId, { nombre: nombre.trim(), telefono: telefono.trim() });
              if (!r.ok) return r.error;
              setAbierto(false);
              setNombre("");
              setTelefono("");
              mostrar({ texto: `Sumaste a ${primero(r.nombre)} · su parte ${plataTexto(r.monto)}`, nombre: r.nombre, wa: r.wa, enviado: false, avisoId: null });
            })
          }
        >
          Sumar
        </button>
        <button type="button" className={cn(buttonClasses("outline", "sm"), "min-h-12")} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
      <ErrorAccion texto={error} />
    </div>
  );
}
