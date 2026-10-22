"use client";

// «Pagar» (F8, M-108…M-110): el alias a la vista con «Copiar alias» y «Copiar monto», y UN
// comprobante para todas las clases elegidas («Ya transferí → Subir comprobante»). La foto se achica
// en el teléfono (JPEG de 1024 px, ~100 KB) con `createImageBitmap`: sin librerías. Un PDF no se
// puede pasar a imagen sin una dependencia nueva (pide OK del dueño): se le pide una captura.
// El servidor vuelve a chequear todo con el token (o la cookie): que cada clase sea de este alumno
// y se pueda pagar.

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { subirComprobanteVarias } from "@/lib/padel/acciones-alumno";
import { alerta, botonBorde, botonPrincipal, foco, listo } from "@/app/clases/_estilos";
import { plata } from "@/app/clases/cinta";
import { esPdf, seleccionInicial, type ItemPago } from "./puro";

export type { ItemPago };

/** Achica la foto a JPEG de 1024 px de lado mayor en el teléfono. Devuelve un data URL. */
async function achicarFoto(file: File, lado = 1024, calidad = 0.62): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", calidad);
}

export function Pagar({ token, items, alias, titular, profe, waAlias }: { token: string | null; items: ItemPago[]; alias: string; titular: string; profe: string; waAlias: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [elegidas, setElegidas] = useState<string[]>(() => seleccionInicial(items));
  const [copiado, setCopiado] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const total = useMemo(() => items.filter((i) => elegidas.includes(i.id)).reduce((s, i) => s + i.precio, 0), [items, elegidas]);
  const todasEnRevision = items.length > 0 && items.filter((i) => elegidas.includes(i.id)).every((i) => i.enRevision);

  const copiar = async (texto: string, aviso: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(aviso);
    } catch {
      setCopiado(`No pudimos copiarlo: ${texto}`);
    }
  };

  const elegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMsg(null);
    if (esPdf(file)) {
      setMsg({ ok: false, texto: "Es un PDF: sacale una captura de pantalla al PDF y subí la captura." });
      return;
    }
    start(async () => {
      let dataUrl: string;
      try {
        dataUrl = await achicarFoto(file);
      } catch {
        setMsg({ ok: false, texto: "No pudimos leer esa imagen. Probá con una captura de pantalla." });
        return;
      }
      const r = await subirComprobanteVarias(token, elegidas, dataUrl);
      if (!r.ok) {
        setMsg({ ok: false, texto: r.error });
        return;
      }
      setMsg({ ok: true, texto: `¡Recibido! ${r.clases === 1 ? "Tu clase quedó" : `Tus ${r.clases} clases quedaron`} con el comprobante por revisar (${plata(r.total)}). ${profe} lo valida y te avisa.` });
      router.refresh();
    });
  };

  return (
    <div className="grid gap-3" data-qa="pagar">
      {alias ? (
        <div className="grid gap-2">
          <p className="text-base">
            Transferí al alias <strong className="select-all break-all text-lg" data-qa="alias">{alias}</strong>
            {titular && <span className="block text-sm text-[var(--padel-suave)]">Titular: {titular}</span>}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={botonBorde} onClick={() => copiar(alias, "Alias copiado")} data-qa="copiar-alias">
              Copiar alias
            </button>
            <button type="button" className={botonBorde} disabled={total <= 0} onClick={() => copiar(String(Math.round(total)), `Monto copiado: ${plata(total)}`)} data-qa="copiar-monto">
              Copiar monto
            </button>
          </div>
          {copiado && (
            <p role="status" className="text-sm font-semibold text-[var(--padel-cancha)]" data-qa="copiado">
              {copiado}
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-2" data-qa="sin-alias">
          <p className="text-base">{profe} te pasa el alias por WhatsApp. También le podés pagar en efectivo.</p>
          {waAlias && (
            <a href={waAlias} target="_blank" rel="noopener noreferrer" className={`${botonBorde} w-full`}>
              <span aria-hidden>💬</span> Pedirle el alias a {profe}
            </a>
          )}
        </div>
      )}

      {items.length > 1 ? (
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-semibold">¿Qué clases pagás?</legend>
          {items.map((i) => (
            <label key={i.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-[0.75rem] px-1 ${foco}`} data-qa="por-pagar">
              <input
                type="checkbox"
                className="size-5 shrink-0 accent-[var(--padel-cancha)]"
                checked={elegidas.includes(i.id)}
                onChange={(e) => setElegidas((v) => (e.target.checked ? [...v, i.id] : v.filter((x) => x !== i.id)))}
              />
              <span className="min-w-0 flex-1">
                {i.cuando} · <strong className="tabular-nums">{plata(i.precio)}</strong>
                {i.enRevision ? <span className="block text-sm text-[var(--padel-suave)]">Comprobante por revisar</span> : !i.deuda && <span className="block text-sm text-[var(--padel-suave)]">Podés pagarla ya</span>}
                {i.nota && <span role="alert" className="block text-sm font-semibold text-[var(--padel-peligro)]">{i.nota}</span>}
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        items[0] && (
          <p className="text-base" data-qa="por-pagar">
            {items[0].cuando} · <strong className="tabular-nums">{plata(items[0].precio)}</strong>
            {items[0].enRevision && <span className="block text-sm text-[var(--padel-suave)]">Comprobante por revisar · si te equivocaste, mandá otro</span>}
            {items[0].nota && <span role="alert" className="block text-sm font-semibold text-[var(--padel-peligro)]">{items[0].nota}</span>}
          </p>
        )
      )}

      <input ref={input} type="file" accept="image/*,application/pdf" onChange={elegir} hidden aria-hidden tabIndex={-1} data-qa="archivo-comprobante" />
      <button type="button" className={botonPrincipal} disabled={pendiente || elegidas.length === 0} onClick={() => input.current?.click()} data-qa="subir-comprobante">
        {pendiente ? "Subiendo…" : todasEnRevision ? "Mandar otro comprobante" : "Ya transferí: subir comprobante"}
      </button>
      <p className="text-sm text-[var(--padel-suave)]">
        {total > 0 && (
          <>
            Total <strong className="tabular-nums text-[var(--padel-texto)]" data-qa="total">{plata(total)}</strong> ·{" "}
          </>
        )}
        Una captura sirve para todas las clases que tildaste.
      </p>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? listo : alerta} data-qa="respuesta-comprobante">
          {msg.texto}
        </p>
      )}
    </div>
  );
}
