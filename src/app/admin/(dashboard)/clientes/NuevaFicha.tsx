"use client";

// "Nueva ficha" y "Compraron sin ficha" (Inicio por apps). En un mostrador la venta no crea la
// ficha: sin esto la base de clientes de una carnicería queda vacía para siempre. Crear la
// ficha ata sus pedidos anteriores (mismo número) en la misma operación (`crearFicha`).
//
// Un error deja el formulario abierto con lo tipeado y dice qué pasó; si el teléfono ya es de
// otra ficha, ofrece ir a ella.

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { crearFicha } from "@/lib/client-actions";
import { Field, Input, Textarea, buttonClasses } from "@/components/ui";
import { fmtShortDate } from "@/lib/datetime";

export type CompradorSinFichaVista = { clave: string; nombre: string; telefono: string; pedidos: number; ultimo: string };

export default function NuevaFicha({ sinFicha }: { sinFicha: CompradorSinFichaVista[] }) {
  const [abierta, setAbierta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<{ texto: string; existenteId?: string } | null>(null);
  const [prefill, setPrefill] = useState<{ nombre: string; telefono: string; n: number }>({ nombre: "", telefono: "", n: 0 });
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function abrirCon(nombre: string, telefono: string) {
    setError(null);
    // `n` cambia la key del formulario: vuelve a montar los campos con los valores nuevos.
    setPrefill((p) => ({ nombre, telefono, n: p.n + 1 }));
    setAbierta(true);
    requestAnimationFrame(() => form.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }

  return (
    <section className="mb-6 space-y-3" aria-label="Cargar una ficha">
      {!abierta && (
        <button type="button" onClick={() => abrirCon("", "")} className={buttonClasses("outline", "md")}>
          Nueva ficha
        </button>
      )}

      {abierta && (
        <form
          key={prefill.n}
          ref={form}
          // `onSubmit` y no `action`: React 19 resetea el formulario al terminar CUALQUIER action
          // (requestFormReset en startHostTransition, react-dom 19.2.4), y un error ("ese teléfono
          // ya es de otra ficha") borraría lo tipeado.
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setGuardando(true);
            setError(null);
            try {
              const r = await crearFicha(fd);
              if (r.ok) {
                router.push(`/admin/clientes/${r.id}`);
                return;
              }
              setError({ texto: r.error, existenteId: r.existenteId });
            } catch {
              setError({ texto: "No se pudo guardar la ficha. Revisá la conexión y probá de nuevo." });
            } finally {
              setGuardando(false);
            }
          }}
          className="space-y-4 rounded-lg border border-line bg-surface-raised p-4"
        >
          <p className="text-sm font-medium text-strong">Nueva ficha</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre y apellido" htmlFor="nf-name" required>
              <Input id="nf-name" name="name" defaultValue={prefill.nombre} required maxLength={120} autoComplete="off" />
            </Field>
            <Field label="Teléfono" htmlFor="nf-phone" required hint="Es por donde se le escribe por WhatsApp.">
              <Input id="nf-phone" name="phone" type="tel" inputMode="tel" defaultValue={prefill.telefono} required autoComplete="off" />
            </Field>
            <Field label="Cumpleaños" htmlFor="nf-birth" hint="Opcional. Sirve para saludar el día del cumpleaños.">
              <Input id="nf-birth" name="birthDate" type="date" />
            </Field>
            <Field label="Email" htmlFor="nf-email" hint="Opcional.">
              <Input id="nf-email" name="email" type="email" autoComplete="off" />
            </Field>
          </div>
          <Field label="Notas internas" htmlFor="nf-notes" hint="No las ve el cliente.">
            <Textarea id="nf-notes" name="notes" rows={2} maxLength={2000} />
          </Field>
          {error && (
            <div role="alert" className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-strong">
              {error.texto}{" "}
              {error.existenteId && (
                <Link href={`/admin/clientes/${error.existenteId}`} className="font-medium underline">
                  Ver esa ficha
                </Link>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={guardando} className={buttonClasses("solid", "md")}>
              {guardando ? "Guardando…" : "Crear ficha"}
            </button>
            <button type="button" disabled={guardando} onClick={() => setAbierta(false)} className={buttonClasses("ghost", "md")}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {sinFicha.length > 0 && (
        <details className="rounded-lg border border-line bg-surface-raised">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium text-strong">
            Compraron sin ficha ({sinFicha.length})
          </summary>
          <p className="px-4 text-sm text-muted">
            Dejaron su teléfono en un pedido pero no tienen ficha. Al crearla, esos pedidos pasan a su historial.
          </p>
          <ul className="divide-y divide-line/60">
            {sinFicha.map((c) => (
              <li key={c.clave} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-strong">{c.nombre || "Sin nombre"}</p>
                  <p className="text-muted">
                    {c.telefono} · {c.pedidos} {c.pedidos === 1 ? "pedido" : "pedidos"} · último el {fmtShortDate(c.ultimo)}
                  </p>
                </div>
                <button type="button" onClick={() => abrirCon(c.nombre, c.telefono)} className={buttonClasses("outline", "md")}>
                  Crear ficha
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
