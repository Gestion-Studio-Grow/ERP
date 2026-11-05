"use client";

// «Qué puede hacer cada persona» — la matriz de permisos por usuario (PLAN.md §9).
//
// Una fila por persona, agrupadas por rol; ocho casillas. Cada casilla muestra lo que RIGE para esa
// persona; si difiere del rol, lleva la marca «excepción» y dice qué daría el rol. Tocarla graba la
// excepción (o la borra, si vuelve a lo del rol). Qué se puede tocar lo decide `matriz-core.ts`
// (puro, probado) y lo vuelve a chequear el servidor (`setUserPermission`): esto es la pantalla.
// En el celular la tabla se desliza de costado con el nombre y el grupo fijos a la izquierda; la página
// no: el contenedor es `relative` para que los textos `sr-only` de las celdas no la estiren (QA 390 px).

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUserPermission } from "@/lib/user-actions";
import { cn } from "@/components/ui/cn";
import { textoDelAviso, textoPorRol, type ColumnaMatriz, type Matriz } from "./matriz-core";

type Props = {
  matriz: Matriz;
  /** `false` = la tabla de excepciones todavía no está en la base: sólo se ve. */
  conTabla: boolean;
};

export default function MatrizDePermisos({ matriz, conTabla }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [tocando, setTocando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const idNota = useId();

  function cambiar(usuario: { id: string; name: string }, col: ColumnaMatriz, nuevo: boolean) {
    const clave = `${usuario.id}:${col.clave}`;
    setTocando(clave);
    setAviso(null);
    startTransition(async () => {
      try {
        // La acción del servidor decide sola si es excepción o vuelve al rol, y agrupa las tres
        // capacidades de stock de la casilla 6: alcanza con mandar la primera. La casilla 1 es
        // `booking:online`: no toca la ficha (sigue en la grilla y en «Dar turno»).
        const fd = new FormData();
        fd.set("userId", usuario.id);
        fd.set("capability", col.capacidades[0]);
        fd.set("allowed", String(nuevo));
        const r = await setUserPermission(fd);
        if (!r.ok) {
          setAviso({ ok: false, texto: r.error });
          return;
        }
        setAviso({ ok: true, texto: textoDelAviso(col.clave, usuario.name, nuevo) });
        router.refresh();
      } catch {
        setAviso({ ok: false, texto: `No se pudo guardar «${col.titulo}» para ${usuario.name}. Probá de nuevo; si sigue, avisale a GSG.` });
      } finally {
        setTocando(null);
      }
    });
  }

  return (
    <div className="relative min-w-0 max-w-full">
      <p id={idNota} className="mb-3 text-[13px] text-muted">
        Cada rol trae sus permisos. Acá se le suma o se le saca algo a una persona en particular: lo que
        quede distinto del rol se marca como <strong className="font-semibold text-strong">excepción</strong>.
        Tus propios permisos y los de otros socios no se cambian desde acá.
      </p>
      {!conTabla && (
        <p role="status" className="mb-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          Las excepciones por persona se activan con la próxima actualización del sistema. Por ahora rige
          lo de cada rol.
        </p>
      )}
      <p aria-live="polite" className={cn("mb-3 text-sm", !aviso && "sr-only", aviso?.ok ? "text-success" : "text-danger")}>
        {aviso?.texto ?? ""}
      </p>

      {/* El contenedor se desliza de costado en el celular; foco visible en cada casilla. A 1366 px el
          panel deja 846 px: 8 rem de nombre + 8 columnas de 5.5 rem = 52 rem (832 px) entran sin
          deslizar; los títulos van en dos líneas y el nombre se trunca (el completo, en `title`). */}
      <div className="relative max-w-full overflow-x-auto rounded-lg border border-line" tabIndex={0} role="region" aria-label="Permisos por persona (se desliza de costado)">
        <table className="w-full min-w-[52rem] table-fixed border-collapse text-sm">
          <caption className="sr-only">Qué puede hacer cada persona: una fila por persona, una columna por permiso.</caption>
          <thead className="sticky top-0 z-10 bg-surface-sunken">
            <tr className="border-b border-line-strong text-left">
              <th scope="col" className="sticky left-0 z-20 w-32 bg-surface-sunken px-3 py-2 text-[11.5px] font-semibold uppercase tracking-[.06em] text-muted">
                Persona
              </th>
              {matriz.columnas.map((c) => (
                <th key={c.clave} scope="col" title={c.titulo} className="w-[5.5rem] px-1.5 py-2 align-bottom text-[11.5px] font-semibold leading-tight text-muted [text-wrap:balance]">
                  <span aria-hidden="true">{c.corto}</span>
                  <span className="sr-only">{c.titulo}</span>
                </th>
              ))}
            </tr>
          </thead>
          {matriz.grupos.map((g) => (
            <tbody key={g.rol}>
              <tr className="border-b border-line bg-surface">
                {/* Una sola celda fija a la izquierda: con `colSpan` entero no se quedaría quieta al deslizar. */}
                <th scope="rowgroup" className="sticky left-0 z-[1] whitespace-nowrap bg-surface px-3 pb-1 pt-3 text-left text-[11.5px] font-semibold uppercase tracking-[.06em] text-muted">
                  {g.nombre}
                </th>
                <td colSpan={matriz.columnas.length} aria-hidden="true" />
              </tr>
              {g.filas.map((f) => (
                <tr key={f.usuario.id} className="border-b border-line align-top">
                  <th scope="row" title={f.usuario.name} className="sticky left-0 z-[1] truncate bg-surface-raised px-3 py-2 text-left font-medium text-strong">
                    {f.usuario.name}
                  </th>
                  {f.celdas.map((celda, i) => {
                    const col = matriz.columnas[i];
                    const porRol = textoPorRol(celda);
                    const sinTabla = !conTabla;
                    const bloqueo = celda.bloqueo ?? (sinTabla ? "Se activa con la próxima actualización del sistema." : null);
                    const ocupada = pendiente && tocando === `${f.usuario.id}:${col.clave}`;
                    const idDetalle = `${idNota}-${f.usuario.id}-${col.clave}`;
                    return (
                      <td key={col.clave} className={cn("px-1.5 py-2", bloqueo && "bg-surface-sunken/60")}>
                        <label className={cn("flex min-h-11 flex-col items-start gap-1", bloqueo ? "cursor-not-allowed" : "cursor-pointer")} title={bloqueo ?? porRol ?? undefined}>
                          <input
                            type="checkbox"
                            checked={celda.valor}
                            disabled={bloqueo !== null || ocupada}
                            aria-label={`${col.titulo}: ${f.usuario.name}`}
                            aria-describedby={idDetalle}
                            onChange={(e) => cambiar(f.usuario, col, e.currentTarget.checked)}
                            className="mt-0.5 size-5 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50"
                          />
                          <span id={idDetalle} className="min-w-0 text-[12px] leading-tight text-muted">
                            {ocupada ? (
                              "Guardando…"
                            ) : col.clave === "senias-mp" ? (
                              "Próximamente"
                            ) : celda.excepcion ? (
                              <>
                                <span className="inline-flex items-center gap-1 font-semibold text-accent-ink">
                                  <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-accent" />
                                  Excepción
                                </span>
                                <span className="block">{porRol.toLowerCase()}</span>
                              </>
                            ) : (
                              <span className="sr-only">{bloqueo ?? porRol}</span>
                            )}
                          </span>
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
