"use client";

// VOUCHERS · importar un CSV de OpenKey (la foto de disponibilidad o la liquidación) y mostrar
// la conciliación en criollo claro. Las columnas son PROVISIONALES a confirmar con una
// exportación real (voucher-core.ts); lo que no se entiende vuelve como «renglones que no se
// pudieron leer». La acción concilia en una transacción y deja la corrida registrada.

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { importarLiquidacion, importarOpenKey } from "@/lib/vouchers/voucher-actions";
import { lineasDeLaFoto, lineasDeLaLiquidacion, type LineaDeResultado } from "./vouchers-pantalla";
import { ResultadoDeConciliacion } from "./ResultadoDeConciliacion";

const TEXTOS = {
  foto: {
    ayuda: "La exportación de vouchers de OpenKey (CSV). Columnas: número, lote, estado y documento del vecino.",
    boton: "Importar y conciliar",
  },
  liquidacion: {
    ayuda: "Lo que OpenKey le pagó a CH por cada voucher (CSV). Columnas: número, monto, fecha y referencia.",
    boton: "Importar la liquidación",
  },
} as const;

export function ImportarCsv({ tipo }: { tipo: "foto" | "liquidacion" }) {
  const id = useId();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [lineas, setLineas] = useState<LineaDeResultado[] | null>(null);
  const [pendiente, empezar] = useTransition();
  const t = TEXTOS[tipo];

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pendiente) return;
    const fd = new FormData(e.currentTarget);
    const archivo = fd.get("csv");
    if (!(archivo instanceof File) || archivo.size === 0) {
      setError("Elegí el archivo CSV.");
      return;
    }
    setError("");
    setLineas(null);
    empezar(async () => {
      try {
        if (tipo === "foto") {
          const r = await importarOpenKey(fd);
          if (!r.ok) return setError(r.error);
          setLineas(lineasDeLaFoto(r.valor));
        } else {
          const r = await importarLiquidacion(fd);
          if (!r.ok) return setError(r.error);
          setLineas(lineasDeLaLiquidacion(r.valor));
        }
        form.current?.reset();
        router.refresh();
      } catch {
        setError("No se pudo importar y no quedó nada a medias. Probá de nuevo; si sigue, avisá.");
      }
    });
  };

  return (
    <form ref={form} onSubmit={enviar} className="space-y-3 pt-3" aria-busy={pendiente || undefined}>
      <div>
        <label htmlFor={`${id}-csv`} className="mb-1.5 block text-sm font-semibold text-strong">
          Archivo CSV
        </label>
        <input
          id={`${id}-csv`}
          name="csv"
          type="file"
          accept=".csv,text/csv,text/plain"
          required
          aria-describedby={`${id}-ayuda`}
          className="block w-full min-h-11 text-sm text-strong file:mr-3 file:min-h-11 file:rounded-md file:border file:border-line file:bg-surface-raised file:px-3 file:text-sm file:font-medium file:text-strong focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        <p id={`${id}-ayuda`} className="mt-1 text-xs text-muted">
          {t.ayuda} Máximo 2 MB.
        </p>
      </div>
      <Button type="submit" disabled={pendiente} estado={pendiente ? "cargando" : undefined} className="w-full sm:w-auto">
        {t.boton}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {lineas && <ResultadoDeConciliacion lineas={lineas} />}
    </form>
  );
}
