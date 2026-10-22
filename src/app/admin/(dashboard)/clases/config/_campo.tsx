"use client";

// Los campos de Ajustes que se guardan SOLOS (M-077): el profe escribe, sale del campo (o toca
// Enter) y queda guardado — «$ 25.000 · guardado» al lado y el aviso «Guardado» —, sin un botón
// al pie de un formulario largo. Los chips (duración, anticipación…) guardan con el toque.
// Todo pasa por `guardarCampoConfig(clave, valor)`, que sólo acepta las claves de su lista blanca.

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/components/ui";
import { guardarCampoConfig } from "@/lib/padel/acciones-config";
import { pesos } from "@/lib/padel/core";
import { useToast } from "../../ToastProvider";
import { campo, chipEleccion, rotulo } from "./_estilos";

type Formato = "texto" | "pesos" | "celular";

function mostrar(formato: Formato, v: string): string {
  if (formato === "pesos") return pesos(Number(v) || 0);
  if (formato === "celular" && /^\d{10}$/.test(v)) return v.startsWith("11") ? `11 ${v.slice(2, 6)}-${v.slice(6)}` : v;
  return v;
}

/** Guardar un ajuste desde un componente de cliente: estado, error y el aviso «Guardado». */
export function useGuardarCampo() {
  const router = useRouter();
  const { showSuccess } = useToast();
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const guardar = (clave: string, valor: unknown, alGuardar?: (valor: unknown) => void, alFallar?: () => void) =>
    start(async () => {
      setError(null);
      try {
        const r = await guardarCampoConfig(clave, valor);
        if (!r.ok) {
          setError(r.error);
          alFallar?.();
          return;
        }
        alGuardar?.(r.valor);
        showSuccess("Guardado");
        router.refresh();
      } catch {
        setError("No pudimos guardar. Revisá la conexión y probá de nuevo.");
        alFallar?.();
      }
    });
  return { pendiente, error, guardar };
}

export function CampoAuto({
  clave,
  etiqueta,
  inicial,
  formato = "texto",
  ayuda,
  placeholder,
  tipo = "text",
  inputMode,
  maxLength,
  qa,
}: {
  clave: string;
  etiqueta: string;
  inicial: string;
  formato?: Formato;
  ayuda?: string;
  placeholder?: string;
  tipo?: "text" | "tel";
  inputMode?: "text" | "numeric" | "tel";
  maxLength?: number;
  qa?: string;
}) {
  const id = useId();
  const [valor, setValor] = useState(inicial);
  const [guardado, setGuardado] = useState(inicial);
  const [listo, setListo] = useState(false);
  const { pendiente, error, guardar } = useGuardarCampo();
  const idAyuda = `${id}-ayuda`;
  const idEstado = `${id}-estado`;

  const alSalir = () => {
    if (valor.trim() === guardado.trim()) return;
    setListo(false);
    guardar(clave, valor, (v) => {
      const s = v === null || v === undefined || v === 0 ? "" : String(v);
      setValor(s);
      setGuardado(s);
      setListo(true);
    });
  };

  return (
    <div>
      <label htmlFor={id} className={rotulo}>{etiqueta}</label>
      <input
        id={id}
        type={tipo}
        inputMode={inputMode}
        value={valor}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        onChange={(e) => {
          setValor(e.target.value);
          setListo(false);
        }}
        onBlur={alSalir}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={cn(ayuda && idAyuda, idEstado)}
        className={campo}
        data-qa={qa}
      />
      {ayuda && <p id={idAyuda} className="mt-1 text-sm text-muted">{ayuda}</p>}
      <p id={idEstado} role={error ? "alert" : "status"} className={cn("mt-1 min-h-5 text-sm", error ? "font-semibold text-danger" : "text-success")} data-qa={qa ? `${qa}-estado` : undefined}>
        {error ? error : pendiente ? <span className="text-muted">Guardando…</span> : listo ? `${guardado ? mostrar(formato, guardado) : "Vacío"} · guardado` : ""}
      </p>
    </div>
  );
}

export type OpcionChip = { valor: number; rotulo: string };

/** Una elección en chips que se guarda con el toque (duración, anticipación, días, pedidos). */
export function ChipsAuto({ clave, leyenda, ayuda, opciones, inicial, qa }: { clave: string; leyenda: string; ayuda?: string; opciones: OpcionChip[]; inicial: number; qa?: string }) {
  const id = useId();
  const [valor, setValor] = useState(inicial);
  const { pendiente, error, guardar } = useGuardarCampo();
  // Si el valor guardado no está entre los chips (venía del formulario viejo), se muestra igual.
  const todas = opciones.some((o) => o.valor === inicial) ? opciones : [...opciones, { valor: inicial, rotulo: `${inicial}` }];
  const elegir = (v: number) => {
    if (v === valor) return;
    const antes = valor;
    setValor(v);
    // Si falló, vuelve a lo de antes (el error queda a la vista).
    guardar(clave, v, undefined, () => setValor(antes));
  };
  return (
    <fieldset aria-describedby={ayuda ? `${id}-ayuda` : undefined} aria-busy={pendiente}>
      <legend className={rotulo}>{leyenda}</legend>
      {ayuda && <p id={`${id}-ayuda`} className="-mt-0.5 mb-2 text-sm text-muted">{ayuda}</p>}
      <div role="radiogroup" aria-label={leyenda} className="flex flex-wrap gap-2">
        {todas.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={valor === o.valor}
            onClick={() => elegir(o.valor)}
            className={chipEleccion}
            data-qa={qa ? `${qa}-${o.valor}` : undefined}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-1 text-sm font-semibold text-danger">{error}</p>}
    </fieldset>
  );
}
