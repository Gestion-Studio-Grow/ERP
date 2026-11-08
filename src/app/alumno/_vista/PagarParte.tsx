"use client";

// E7 · El alumno es INTEGRANTE de una grupal de otro titular: ve la clase y SU parte, y manda el
// comprobante de esa parte (no de la clase entera). El servidor vuelve a chequear que la parte sea
// de este alumno y se pueda pagar (subirComprobanteIntegrante).

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { subirComprobanteIntegrante } from "@/lib/padel/acciones-alumno";
import { alerta, botonPrincipal, listo } from "@/app/clases/_estilos";
import { plata } from "@/app/clases/cinta";
import { achicarFoto } from "./Pagar";
import { esPdf } from "./puro";

export function PagarParte({ token, integranteId, monto, enRevision, profe }: { token: string | null; integranteId: string; monto: number; enRevision: boolean; profe: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pendiente, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const elegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMsg(null);
    if (esPdf(file)) return setMsg({ ok: false, texto: "Es un PDF: sacale una captura de pantalla al PDF y subí la captura." });
    start(async () => {
      let dataUrl: string;
      try {
        dataUrl = await achicarFoto(file);
      } catch {
        setMsg({ ok: false, texto: "No pudimos leer esa imagen. Probá con una captura de pantalla." });
        return;
      }
      const r = await subirComprobanteIntegrante(token, integranteId, dataUrl);
      if (!r.ok) return setMsg({ ok: false, texto: r.error });
      setMsg({ ok: true, texto: `¡Recibido! Tu parte (${plata(r.monto)}) quedó con el comprobante por revisar. ${profe} lo valida y te avisa.` });
      router.refresh();
    });
  };
  return (
    <div className="grid gap-2" data-qa="pagar-parte">
      <input ref={input} type="file" accept="image/*,application/pdf" onChange={elegir} hidden aria-hidden tabIndex={-1} />
      <button type="button" className={botonPrincipal} disabled={pendiente} onClick={() => input.current?.click()}>
        {pendiente ? "Subiendo…" : enRevision ? "Mandar otro comprobante" : `Ya transferí mi parte (${plata(monto)}): subir comprobante`}
      </button>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? listo : alerta}>
          {msg.texto}
        </p>
      )}
    </div>
  );
}
