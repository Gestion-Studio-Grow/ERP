"use client";

// «Sin avisar» (M-034/M-085): los WhatsApp que quedaron armados y el profe no mandó (tocó
// «Después» o se fue). Un toque abre WhatsApp con el texto listo y lo marca como avisado
// (marcarAvisado): al volver, ya no está en la lista.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarAvisado } from "@/lib/padel/acciones";
import { horaHumana, diaHumano } from "@/lib/padel/core";
import { useToast } from "../../ToastProvider";

const TIPO: Record<string, string> = {
  confirmada: "Confirmación",
  rechazada: "No puedo",
  proxima: "Próxima clase",
  recordatorio: "Recordatorio",
  "recordatorio-deuda": "Lo que debe",
  movida: "Cambio de horario",
  suspendida: "Se suspende",
  "pago-ok": "Pago recibido",
  "pago-no": "Comprobante no válido",
};

export type ItemSinAvisar = { avisoId: string; tipo: string; nombre: string; wa: string | null; creadoEl: string };

export function SinAvisar({ items }: { items: ItemSinAvisar[] }) {
  const router = useRouter();
  const { showSuccess } = useToast();
  const [hechos, setHechos] = useState<Set<string>>(new Set());
  const [, start] = useTransition();
  const avisar = (it: ItemSinAvisar) => {
    setHechos((s) => new Set(s).add(it.avisoId));
    start(async () => {
      const r = await marcarAvisado(it.avisoId).catch(() => null);
      if (r?.ok) showSuccess(`Le avisaste a ${it.nombre.split(" ")[0] || "el alumno"}`);
      router.refresh();
    });
  };
  const visibles = items.filter((i) => !hechos.has(i.avisoId));
  if (!visibles.length) return <p className="text-sm text-muted">No te quedó ningún WhatsApp sin mandar.</p>;
  return (
    <ul className="grid gap-2">
      {visibles.map((it) => {
        const cuando = new Date(it.creadoEl);
        return (
          <li key={it.avisoId} className="grid gap-2 rounded-2xl border border-line bg-surface-raised p-3" data-qa="sin-avisar">
            <p className="text-sm text-strong">
              <span className="font-semibold">{it.nombre || "Alumno"}</span> · {TIPO[it.tipo] ?? "Aviso"}
              <span className="text-muted"> · armado el <span className="capitalize">{diaHumano(cuando)}</span> {horaHumana(cuando)}</span>
            </p>
            {it.wa ? (
              <a
                href={it.wa}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setTimeout(() => avisar(it), 0)}
                className="flex h-12 items-center justify-center rounded-xl bg-success px-3 text-base font-bold text-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                data-qa="avisar-sin-avisar"
              >
                Avisarle por WhatsApp
              </a>
            ) : (
              <p className="text-sm text-muted">No tiene celular cargado: cargáselo en su ficha.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
