"use client";

// «Detectar con una etiqueta»: no hace falta saber la marca ni el modelo. Se pasa una etiqueta
// que imprimió la balanza, se escribe el peso (o el importe) que mostró al imprimirla, y el
// sistema propone el formato que cierra (balanza-deteccion.ts). Si quedan varios, una segunda
// etiqueta de otro producto desempata. No guarda nada: «Usar este» rellena el formulario.

import { useId, useState } from "react";
import { Button, Field, Input, Segmented } from "@/components/ui";
import { describirFormato, type FormatoBalanza } from "@/lib/supermercado/balanza";
import { detectarConVariasEtiquetas, type FormatoDetectado } from "@/lib/supermercado/balanza-deteccion";
import { leerCantidad } from "@/lib/pos-peso";
import { leerImporte } from "@/lib/dinero/leer";

type Que = "peso" | "importe";
interface Etiqueta {
  texto: string;
  que: Que;
  valor: string;
  plu: string;
}

const VACIA: Etiqueta = { texto: "", que: "peso", valor: "", plu: "" };

function numero(e: Etiqueta): number | null {
  const l = e.que === "peso" ? leerCantidad(e.valor) : leerImporte(e.valor);
  return l.estado === "ok" ? l.valor : null;
}

export default function DetectarConEtiqueta({ alElegir }: { alElegir: (f: FormatoBalanza) => void }) {
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([VACIA]);
  const [probado, setProbado] = useState(false);
  const tituloId = useId();
  const completas = etiquetas.filter((e) => e.texto.trim() && numero(e) != null);
  const resultado = probado && completas.length
    ? detectarConVariasEtiquetas(
        completas.map((e) => ({ texto: e.texto, marco: { ...(e.que === "peso" ? { peso: numero(e) } : { importe: numero(e) }), plu: e.plu || null } })),
      )
    : null;
  const cambiar = (i: number, cambio: Partial<Etiqueta>) => {
    setEtiquetas(etiquetas.map((e, j) => (j === i ? { ...e, ...cambio } : e)));
    setProbado(false);
  };

  return (
    <section aria-labelledby={tituloId} className="space-y-4 rounded-md border border-line bg-surface-raised p-4">
      <h3 id={tituloId} className="text-base font-semibold text-strong">
        Detectar con una etiqueta
      </h3>
      <p className="text-sm text-muted">
        No hace falta saber la marca. Pesá algo en tu balanza, imprimí la etiqueta y anotá el peso que mostró la pantalla
        de la balanza (o el importe impreso). Después pasá la etiqueta por el lector acá abajo.
      </p>
      {etiquetas.map((e, i) => (
        <div key={i} className="space-y-3 rounded-md border border-line p-3">
          {etiquetas.length > 1 && <p className="text-sm font-medium text-strong">Etiqueta {i + 1}</p>}
          <Field label="Números de la etiqueta" htmlFor={`detectar-codigo-${i}`}>
            <Input
              id={`detectar-codigo-${i}`}
              value={e.texto}
              onChange={(ev) => cambiar(i, { texto: ev.target.value })}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") ev.preventDefault();
              }}
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              placeholder="Pasala por el lector"
              className="font-mono"
            />
          </Field>
          <Segmented
            name={`detectar-que-${i}`}
            leyenda="Qué anotaste"
            leyendaVisible
            value={e.que}
            opciones={[
              { valor: "peso", etiqueta: "El peso" },
              { valor: "importe", etiqueta: "El importe" },
            ]}
            onChange={(ev) => cambiar(i, { que: ((ev.nativeEvent.target as HTMLInputElement | null)?.value ?? "peso") as Que })}
          />
          <Field label={e.que === "peso" ? "Peso que marcó la balanza (kg)" : "Importe impreso ($)"} htmlFor={`detectar-valor-${i}`}>
            <Input
              id={`detectar-valor-${i}`}
              value={e.valor}
              onChange={(ev) => cambiar(i, { valor: ev.target.value })}
              inputMode="decimal"
              autoComplete="off"
              placeholder={e.que === "peso" ? "1,250" : "4520"}
            />
          </Field>
          <Field
            label="Número del producto en la balanza (si lo sabés)"
            htmlFor={`detectar-plu-${i}`}
            hint="Es el que tecleás en la balanza para pesar ese producto. Con él no hay dudas."
          >
            <Input
              id={`detectar-plu-${i}`}
              value={e.plu}
              onChange={(ev) => cambiar(i, { plu: ev.target.value.replace(/\D/g, "") })}
              inputMode="numeric"
              autoComplete="off"
              className="w-36 font-mono"
            />
          </Field>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setProbado(true)} disabled={completas.length === 0}>
          Detectar el formato
        </Button>
        {etiquetas.length < 3 && (
          <Button type="button" variant="outline" onClick={() => setEtiquetas([...etiquetas, VACIA])}>
            Sumar otra etiqueta
          </Button>
        )}
      </div>

      <div role="status" aria-live="polite">
        {resultado && !resultado.ok && <p className="text-sm text-danger">{resultado.mensaje}</p>}
        {resultado?.ok && (
          <Candidatos
            candidatos={resultado.candidatos}
            hayVarias={etiquetas.length > 1}
            alElegir={alElegir}
          />
        )}
      </div>
    </section>
  );
}

function Candidatos({ candidatos, hayVarias, alElegir }: { candidatos: FormatoDetectado[]; hayVarias: boolean; alElegir: (f: FormatoBalanza) => void }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium text-success">
        {candidatos.length === 1 ? "Encontramos el formato de tu balanza." : `Hay ${candidatos.length} formas de leerla. La primera es la más probable.`}
      </p>
      {candidatos.length > 1 && !hayVarias && (
        <p className="text-body">Para quedarte con una sola, sumá otra etiqueta de un producto distinto o escribí el número del producto en la balanza.</p>
      )}
      <ul className="space-y-2">
        {candidatos.slice(0, 5).map((c, i) => (
          <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line p-2">
            <span>
              {c.marca && <span className="font-medium text-strong">{c.marca}. </span>}
              <span className="text-body">{describirFormato(c.formato)}</span>
              <span className="text-muted"> Producto en la balanza: {c.plu}.</span>
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => alElegir(c.formato)} aria-label={`Usar este formato: ${describirFormato(c.formato)}`}>
              Usar este
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
