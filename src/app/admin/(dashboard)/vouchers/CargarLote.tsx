"use client";

// VOUCHERS · cargar un lote: número, fecha, el vecino al que se le dieron y los números (uno por
// renglón, o separados por coma, punto y coma o espacio). [provisional a confirmar: un lote = un
// vecino, como `crearLote`]. El vecino se busca por nombre, teléfono o documento y se elige con
// un radio (teclado: flechas entre opciones).

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Textarea } from "@/components/ui";
import { crearLote } from "@/lib/vouchers/voucher-actions";
import { buscarVecino, type VecinoEncontrado } from "./buscar-vecino";
import { numerosDelTexto } from "./vouchers-pantalla";

const ROTULO = "mb-1.5 block text-sm font-semibold text-strong";

export function CargarLote({ hoy }: { hoy: string }) {
  const id = useId();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [busqueda, setBusqueda] = useState("");
  const [vecinos, setVecinos] = useState<VecinoEncontrado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [elegido, setElegido] = useState<VecinoEncontrado | null>(null);
  const [numeros, setNumeros] = useState("");
  const [error, setError] = useState("");
  const [listo, setListo] = useState("");
  const [pendiente, empezar] = useTransition();
  const cuenta = numerosDelTexto(numeros).length;
  const visibles = busqueda.trim().length < 3 ? [] : vecinos;

  // Busca a los 300 ms de dejar de escribir; descarta la respuesta de una búsqueda vieja.
  useEffect(() => {
    const texto = busqueda.trim();
    // Menos de 3 caracteres no busca: la lista se oculta abajo (`visibles`), sin tocar el estado acá.
    if (texto.length < 3) return;
    let vigente = true;
    const reloj = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await buscarVecino(texto);
        if (vigente) setVecinos(r);
      } catch {
        if (vigente) setVecinos([]);
      } finally {
        if (vigente) setBuscando(false);
      }
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(reloj);
    };
  }, [busqueda]);

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pendiente) return;
    if (!elegido) return setError("Elegí el vecino al que se le dieron los vouchers.");
    if (cuenta === 0) return setError("Escribí al menos un número de voucher.");
    const fd = new FormData(e.currentTarget);
    fd.set("clientId", elegido.id);
    setError("");
    setListo("");
    empezar(async () => {
      try {
        const r = await crearLote(fd);
        if (!r.ok) return setError(r.error);
        setListo(`Lote cargado: ${r.valor.creados} ${r.valor.creados === 1 ? "voucher" : "vouchers"} para ${elegido.nombre}.`);
        form.current?.reset();
        setNumeros("");
        setElegido(null);
        setBusqueda("");
        router.refresh();
      } catch {
        setError("No se pudo cargar el lote y no quedó nada a medias. Probá de nuevo; si sigue, avisá.");
      }
    });
  };

  return (
    <form ref={form} onSubmit={enviar} className="space-y-4 pt-3" aria-busy={pendiente || undefined}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-lote`} className={ROTULO}>
            Número de lote
          </label>
          <Input id={`${id}-lote`} name="lote" required autoComplete="off" maxLength={40} />
        </div>
        <div>
          <label htmlFor={`${id}-fecha`} className={ROTULO}>
            Fecha del lote
          </label>
          <Input id={`${id}-fecha`} name="fecha" type="date" defaultValue={hoy} />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className={ROTULO}>Vecino</legend>
        {elegido ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-semibold text-strong">{elegido.nombre}</span>
            {elegido.detalle && <span className="text-muted">{elegido.detalle}</span>}
            <Button type="button" variant="ghost" size="sm" onClick={() => setElegido(null)}>
              Cambiar
            </Button>
          </p>
        ) : (
          <>
            <label htmlFor={`${id}-buscar`} className="sr-only">
              Buscar vecino por nombre, teléfono o documento
            </label>
            <Input
              id={`${id}-buscar`}
              type="search"
              autoComplete="off"
              placeholder="Nombre, teléfono o documento"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              aria-describedby={`${id}-buscar-ayuda`}
            />
            <p id={`${id}-buscar-ayuda`} className="text-xs text-muted" aria-live="polite">
              {busqueda.trim().length < 3
                ? "Escribí al menos 3 letras o números."
                : buscando
                  ? "Buscando…"
                  : visibles.length === 0
                    ? "No aparece nadie con eso. Si es nuevo, dalo de alta en Clientes."
                    : `${visibles.length} ${visibles.length === 1 ? "ficha" : "fichas"}: elegí una.`}
            </p>
            {visibles.length > 0 && (
              <div className="divide-y divide-line rounded-md border border-line">
                {visibles.map((v) => (
                  <label key={v.id} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm focus-within:bg-surface-raised">
                    <input type="radio" name={`${id}-vecino`} value={v.id} onChange={() => setElegido(v)} className="size-4" />
                    <span className="font-medium text-strong">{v.nombre}</span>
                    {v.detalle && <span className="text-muted">{v.detalle}</span>}
                  </label>
                ))}
              </div>
            )}
          </>
        )}
      </fieldset>

      <div>
        <label htmlFor={`${id}-numeros`} className={ROTULO}>
          Números de voucher
        </label>
        <Textarea
          id={`${id}-numeros`}
          name="numeros"
          rows={5}
          value={numeros}
          onChange={(e) => setNumeros(e.target.value)}
          aria-describedby={`${id}-numeros-ayuda`}
          className="font-mono"
        />
        <p id={`${id}-numeros-ayuda`} className="mt-1 text-xs text-muted">
          Uno por renglón (también separados por coma o espacio).{" "}
          {cuenta > 0 && <strong className="text-strong">{cuenta === 1 ? "1 número" : `${cuenta} números`}.</strong>}
        </p>
      </div>

      <Button type="submit" disabled={pendiente} estado={pendiente ? "cargando" : undefined} className="w-full sm:w-auto">
        Cargar el lote
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {listo && (
        <p role="status" className="text-sm text-strong">
          {listo}
        </p>
      )}
    </form>
  );
}
