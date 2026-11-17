"use client";

// El formulario de un parámetro: guarda sin vaciar lo cargado y dice qué pasó, en el mismo lugar.

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import type { Resultado } from "@/lib/proyectos/acciones-parametros";

type Accion = (fd: FormData) => Promise<Resultado>;

export function FormParametro({ accion, clave, provisional, children }: { accion: Accion; clave: string; provisional: boolean; children: ReactNode }) {
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    iniciar(async () => {
      setAviso(null);
      try {
        const r = await accion(fd);
        if (!r.ok) return setAviso({ ok: false, texto: r.error });
        setAviso({ ok: true, texto: r.sinCambios ? "No había nada para cambiar." : "Guardado. Queda en el historial." });
        router.refresh();
      } catch {
        setAviso({ ok: false, texto: "No se pudo guardar. Probá de nuevo." });
      }
    });
  };
  return (
    <form onSubmit={enviar} className="grid gap-3">
      <input type="hidden" name="clave" value={clave} />
      {children}
      <label className="flex min-h-11 items-center gap-2 text-sm text-strong">
        <input type="checkbox" name="provisional" defaultChecked={provisional} className="h-5 w-5" />
        Valor provisional, a confirmar
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={ocupado} className={cn(buttonClasses("solid", "md"), "min-h-11")}>{ocupado ? "Guardando…" : "Guardar"}</button>
        {aviso && <p role={aviso.ok ? "status" : "alert"} className={cn("text-sm", aviso.ok ? "text-strong" : "text-danger")}>{aviso.texto}</p>}
      </div>
    </form>
  );
}

export function VolverAlRubro({ accion, clave }: { accion: Accion; clave: string }) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  const hacer = () =>
    iniciar(async () => {
      const fd = new FormData();
      fd.set("clave", clave);
      const r = await accion(fd).catch(() => ({ ok: false as const, error: "No se pudo. Probá de nuevo." }));
      if (!r.ok) return setError(r.error);
      setAbierto(false);
      router.refresh();
    });
  return (
    <div className="grid gap-1">
      {abierto ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-strong">¿Volver al valor del rubro?</span>
          <button type="button" disabled={ocupado} onClick={hacer} className={cn(buttonClasses("solid", "md"), "min-h-11")}>{ocupado ? "…" : "Sí"}</button>
          <button type="button" disabled={ocupado} onClick={() => setAbierto(false)} className={cn(buttonClasses("ghost", "md"), "min-h-11")}>No</button>
        </div>
      ) : (
        <button type="button" onClick={() => setAbierto(true)} className={cn(buttonClasses("ghost", "md"), "min-h-11 justify-self-start")}>Volver al valor del rubro</button>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
