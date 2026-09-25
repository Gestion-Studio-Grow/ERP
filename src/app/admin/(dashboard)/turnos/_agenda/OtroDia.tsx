"use client";

// «Otro día»: una tecla chica que abre el calendario del teléfono (o de la PC) y va a ese día al
// elegirlo. El campo de fecha queda escondido a la vista (no al lector de pantalla ni al teclado):
// en el celular, un `<input type="date">` a lo ancho con «Ir» al lado ocupaba dos renglones arriba
// de la agenda.

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { IconoApp } from "@/components/iconos-apps";

export default function OtroDia({ dia, base }: { dia: string; base: string }) {
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);
  const ir = (valor: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return;
    const p = new URLSearchParams(base);
    p.set("date", valor);
    router.push(`/admin/turnos?${p.toString()}`);
  };
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        data-ui="button"
        data-variant="ghost"
        data-size="sm"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-accent-ink lg:min-h-9"
        onClick={() => {
          const c = campo.current;
          if (!c) return;
          try {
            c.showPicker();
          } catch {
            c.focus();
          }
        }}
        aria-label="Ir a otro día"
      >
        <IconoApp nombre="agenda" className="size-4" />
        Otro día
      </button>
      <input
        ref={campo}
        type="date"
        defaultValue={dia}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        onChange={(e) => ir(e.target.value)}
      />
    </span>
  );
}
