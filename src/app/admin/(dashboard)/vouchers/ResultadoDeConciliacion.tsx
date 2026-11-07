// VOUCHERS · el resultado de una conciliación, renglón por renglón (presentacional).
import { Marca } from "@/components/ui";
import type { LineaDeResultado, TonoLinea } from "./vouchers-pantalla";

const MARCA: Record<TonoLinea, { tipo: "hecho" | "pendiente" | "atencion"; texto: string }> = {
  ok: { tipo: "hecho", texto: "Listo" },
  aviso: { tipo: "pendiente", texto: "Para hacer" },
  alerta: { tipo: "atencion", texto: "Revisar" },
};

export function ResultadoDeConciliacion({ lineas }: { lineas: readonly LineaDeResultado[] }) {
  return (
    <ul role="status" aria-live="polite" className="divide-y divide-line rounded-md border border-line">
      {lineas.map((l, i) => (
        <li key={i} className="space-y-1 px-3 py-2.5 text-sm">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <Marca tipo={MARCA[l.tono].tipo}>{MARCA[l.tono].texto}</Marca>
            <span className="text-strong">{l.texto}</span>
          </p>
          {l.numeros.length > 0 && <p className="break-words font-mono text-xs text-muted">{l.numeros.join(" · ")}</p>}
        </li>
      ))}
    </ul>
  );
}
