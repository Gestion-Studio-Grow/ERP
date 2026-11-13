"use client";

// Cómo paga el cliente: los medios que publica el local (`cfg.medios`), con lo que cada uno pide.
//   · Efectivo → «¿Con cuánto pagás?» (opcional), y el vuelto que lleva el repartidor.
//   · Transferencia → alias, titular y banco, con «Copiar alias». El local confirma al ver la plata.
//   · Link de Mercado Pago → el local lo manda por WhatsApp.
// La plataforma no cobra ni toca la plata: es una preferencia que viaja en `medioPreferido`/`pagaCon`.

import { useState } from "react";
import { NOMBRE_MEDIO, vueltoALlevar, type MedioPreferido } from "@/lib/delivery-local/pago";
import { leerImporte } from "@/lib/dinero/leer";
import s from "./local.module.css";

const plata = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export default function PagoDelPedido({
  medios,
  transferencia,
  total,
  medio,
  setMedio,
  pagaCon,
  setPagaCon,
  errorDe,
}: {
  medios: readonly MedioPreferido[];
  transferencia: { alias: string; titular: string; banco: string } | null;
  total: number;
  medio: string;
  setMedio: (m: string) => void;
  pagaCon: string;
  setPagaCon: (v: string) => void;
  /** El error del control del formulario para un campo, o null. */
  errorDe: (campo: "medioPreferido" | "pagaCon") => string | null;
}) {
  const [copiado, setCopiado] = useState<"si" | "no" | null>(null);
  const errorMedio = errorDe("medioPreferido");
  const errorPagaCon = errorDe("pagaCon");
  const lectura = leerImporte(pagaCon);
  const vuelto = lectura.estado === "ok" ? vueltoALlevar(total, lectura.valor) : null;

  async function copiar(alias: string) {
    try {
      await navigator.clipboard.writeText(alias);
      setCopiado("si");
    } catch {
      setCopiado("no");
    }
  }

  return (
    <fieldset className={s.grupo} aria-describedby={errorMedio ? "pl-medio-error" : undefined}>
      <legend className={s.leyenda}>¿Cómo pagás? *</legend>
      <div className={s.opciones}>
        {medios.map((m) => (
          <label key={m} className={s.opcion}>
            <input
              type="radio"
              name="medioPreferido"
              value={m}
              checked={medio === m}
              onChange={() => setMedio(m)}
            />
            {NOMBRE_MEDIO[m]}
          </label>
        ))}
      </div>
      {errorMedio && (
        <p id="pl-medio-error" className={s.ayuda} role="alert">
          {errorMedio}
        </p>
      )}

      {medio === "efectivo" && (
        <label className={s.campo}>
          <span className={s.rotulo}>¿Con cuánto pagás?</span>
          <input
            id="pl-pagaCon"
            name="pagaCon"
            className={s.control}
            inputMode="decimal"
            autoComplete="off"
            placeholder="Por ejemplo 20.000 (vacío si pagás justo)"
            value={pagaCon}
            onChange={(e) => setPagaCon(e.target.value)}
            aria-invalid={errorPagaCon ? true : undefined}
            aria-describedby="pl-pagaCon-ayuda"
          />
          <span id="pl-pagaCon-ayuda" className={s.ayuda} aria-live="polite">
            {errorPagaCon ?? (vuelto !== null ? `El repartidor lleva ${plata.format(vuelto)} de vuelto.` : "Así el repartidor sale con el vuelto justo.")}
          </span>
        </label>
      )}

      {medio === "transferencia" &&
        (transferencia ? (
          <div className={s.caja}>
            <p>Transferí {plata.format(total)} a:</p>
            <p className={s.alias}>{transferencia.alias}</p>
            <p className={s.ayuda}>
              {transferencia.titular} · {transferencia.banco}
            </p>
            <div className={s.opciones}>
              <button type="button" className={s.boton} onClick={() => void copiar(transferencia.alias)}>
                Copiar alias
              </button>
            </div>
            <p className={s.ayuda} aria-live="polite">
              {copiado === "si" ? "✓ Alias copiado." : copiado === "no" ? "No se pudo copiar: mantené apretado el alias para copiarlo." : ""}
            </p>
            <p className={s.ayuda}>El local confirma tu pedido cuando ve la transferencia en su cuenta.</p>
          </div>
        ) : (
          <p className={s.ayuda}>El local te pasa el alias por WhatsApp al confirmar.</p>
        ))}

      {medio === "mercadopago" && <p className={s.ayuda}>El local te manda el link de pago de Mercado Pago por WhatsApp al confirmar.</p>}
    </fieldset>
  );
}
