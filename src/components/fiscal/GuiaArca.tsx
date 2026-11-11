"use client";
// La guía de lo que la persona hace ELLA MISMA en ARCA: un subpaso por vez («Paso 2 de 5»), con el
// botón exacto que va a ver, tilde al terminar cada uno, «Abrir ARCA» en otra pestaña, el alias con
// «Copiar» y la ayuda por WhatsApp que dice dónde se trabó. Textos y lógica: src/lib/fiscal/guia-arca.ts.
// Lo tildado se recuerda en esta pestaña (sessionStorage): ARCA va en otra y al volver sigue donde estaba.
import { useEffect, useId, useState } from "react";
import { Button, ButtonLink } from "@/components/ui";
import { linkCanal, type CanalGsg } from "@/app/facturita/contacto";
import {
  ALIAS_ARCA,
  SUBPASOS_ARCA,
  TOTAL_SUBPASOS,
  URL_LOGIN_ARCA,
  botonesEnTexto,
  mensajeDeAyudaArca,
  primeroSinTildar,
  progresoGuia,
  subpaso,
  tildadosValidos,
} from "@/lib/fiscal/guia-arca";
import { CopiarTexto } from "./PiezasArca";

const GUARDADO = "guia-arca-tildados";

export function GuiaArca({ cuit, canal }: { cuit: string; canal: CanalGsg | null }) {
  const [tildados, setTildados] = useState<number[]>([]);
  const [actual, setActual] = useState(1);
  const uid = useId();

  useEffect(() => {
    try {
      const t = tildadosValidos(JSON.parse(sessionStorage.getItem(`${GUARDADO}-${cuit}`) ?? "[]"));
      if (t.length === 0) return;
      queueMicrotask(() => {
        setTildados(t);
        setActual(primeroSinTildar(t) ?? TOTAL_SUBPASOS);
      });
    } catch {
      // sin almacenamiento: la guía anda igual, sólo no recuerda lo tildado
    }
  }, [cuit]);

  const recordar = (t: number[]) => {
    setTildados(t);
    try {
      sessionStorage.setItem(`${GUARDADO}-${cuit}`, JSON.stringify(t));
    } catch {
      // idem
    }
  };

  const s = subpaso(actual);
  const hecho = tildados.includes(s.numero);
  const listo = () => {
    const t = tildadosValidos([...tildados, s.numero]);
    recordar(t);
    if (s.numero < TOTAL_SUBPASOS) setActual(s.numero + 1);
  };
  const ayuda = canal ? linkCanal(canal, "Me trabé conectando ARCA", mensajeDeAyudaArca(s.numero, { cuit })) : null;

  return (
    <section aria-labelledby={`${uid}-titulo`} className="space-y-3 rounded-md border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={`${uid}-titulo`} className="font-semibold text-strong">
          En ARCA, con tu clave fiscal nivel 3 y desde una computadora
        </p>
        <ButtonLink href={URL_LOGIN_ARCA} target="_blank" rel="noopener noreferrer" variant="outline" size="sm">
          Abrir ARCA<span className="sr-only"> (se abre en otra pestaña)</span>
        </ButtonLink>
      </div>

      {/* El progreso: cada subpaso con su tilde; tocarlo vuelve a él. */}
      <ol className="flex flex-wrap gap-2" aria-label="Pasos en ARCA">
        {SUBPASOS_ARCA.map((p) => {
          const t = tildados.includes(p.numero);
          return (
            <li key={p.numero}>
              <button
                type="button"
                onClick={() => setActual(p.numero)}
                aria-current={p.numero === actual ? "step" : undefined}
                aria-label={`${progresoGuia(p.numero)}: ${p.titulo}${t ? " (hecho)" : ""}`}
                className={`inline-flex h-11 min-w-11 items-center justify-center rounded-full border px-3 text-sm font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                  p.numero === actual ? "border-accent bg-accent-soft text-strong" : t ? "border-line text-success" : "border-line text-muted"
                }`}
              >
                {t ? "✓" : p.numero}
              </button>
            </li>
          );
        })}
      </ol>

      <div aria-live="polite" className="space-y-2">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">{progresoGuia(s.numero)}</p>
        <h4 className="font-semibold text-strong">
          {s.titulo}
          {hecho && <span className="ml-2 text-success">✓ Hecho</span>}
        </h4>
        <p>{s.texto}</p>
        {s.conAlias && (
          <p className="flex flex-wrap items-center gap-2">
            Alias: <code className="rounded bg-surface-sunken px-2 py-1 font-mono text-strong">{ALIAS_ARCA}</code>
            <CopiarTexto texto={ALIAS_ARCA} etiqueta="Copiar" />
          </p>
        )}
        <p className="text-muted">
          {s.botones.length > 1 ? "Los botones que vas a ver: " : "El botón que vas a ver: "}
          <span className="font-medium text-strong">{botonesEnTexto(s.botones)}</span>
        </p>
        {s.siTeTrabas && <p className="text-muted">Si te trabás: {s.siTeTrabas}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {s.numero > 1 && (
          <Button type="button" variant="ghost" onClick={() => setActual(s.numero - 1)}>
            Anterior
          </Button>
        )}
        <Button type="button" onClick={listo} disabled={hecho && s.numero === TOTAL_SUBPASOS}>
          {s.numero < TOTAL_SUBPASOS ? "Listo, sigo" : hecho ? "Hecho" : "Listo"}
        </Button>
        {ayuda && (
          <ButtonLink href={ayuda} target="_blank" rel="noopener noreferrer" variant="outline">
            {canal?.tipo === "whatsapp" ? "Me trabé: pedir ayuda por WhatsApp" : "Me trabé: pedir ayuda por mail"}
          </ButtonLink>
        )}
      </div>
    </section>
  );
}
