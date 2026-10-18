"use client";

// VENDER — «Etiqueta de la balanza o código»: un campo propio, al lado del buscador.
//
// No toca BuscadorCombo (lo comparten nueve pantallas): el lector de código de barras "tipea" los
// dígitos y manda un Enter, y acá ese Enter carga el renglón (lectura-vender.ts) en vez de
// mandar el formulario. Lo que no se puede leer se avisa con role="status" y no frena nada: la
// venta sigue con el buscador o el precio a mano. El campo no tiene `name`: no viaja al servidor,
// que vuelve a decidir todo al cobrar con lo que llega de cada renglón.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui";
import { describirFormato, type FormatoBalanza } from "@/lib/supermercado/balanza";
import { indiceDeVender, lineaDesdeLectura, REGLA_DEL_PRECIO_DE_BALANZA, type ProductoDeVender } from "./lectura-vender";

export const ID_CAMPO_ETIQUETA = "vender-etiqueta";

export type BalanzaDeVender = {
  formato: FormatoBalanza;
  /** true = nadie lo configuró: es el formato de fábrica, provisional. */
  porDefecto: boolean;
  /** Adónde se cambia el formato (sólo si quien vende puede); null = no se ofrece. */
  configurar: string | null;
};

export default function CampoEtiqueta({
  productos,
  balanza,
  alLeer,
}: {
  productos: readonly ProductoDeVender[];
  balanza: BalanzaDeVender;
  /** Carga el renglón. `qtyText` vacío = falta el peso (el foco va a ese campo). */
  alLeer: (productId: string, qtyText: string) => void;
}) {
  const indice = useMemo(() => indiceDeVender(productos), [productos]);
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  function leer() {
    const r = lineaDesdeLectura(texto, indice, balanza.formato);
    if (!r.ok) {
      setAviso({ tipo: "error", texto: r.mensaje });
      return;
    }
    setTexto("");
    setAviso(r.aviso ? { tipo: "ok", texto: r.aviso } : null);
    alLeer(r.productId, r.qtyText);
  }

  return (
    <div data-vender="etiqueta" className="space-y-1">
      <label htmlFor={ID_CAMPO_ETIQUETA} className="block text-sm font-medium text-strong">
        Etiqueta de la balanza o código
      </label>
      <Input
        id={ID_CAMPO_ETIQUETA}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="Pasá la etiqueta por el lector"
        value={texto}
        aria-describedby={`${ID_CAMPO_ETIQUETA}-regla`}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          // Sin esto, el Enter del lector mandaría el formulario de la venta.
          e.preventDefault();
          leer();
        }}
      />
      <p role="status" className={aviso?.tipo === "error" ? "text-xs text-warning" : "text-xs text-body"}>
        {aviso?.texto ?? ""}
      </p>
      <p id={`${ID_CAMPO_ETIQUETA}-regla`} className="text-xs text-muted">
        {REGLA_DEL_PRECIO_DE_BALANZA} Formato: {describirFormato(balanza.formato)}
        {balanza.porDefecto && " (de fábrica, provisional a confirmar con la balanza real)"}
        {balanza.configurar && (
          <>
            {" "}
            <Link href={balanza.configurar} className="font-semibold text-accent-ink underline">
              Cambiar el formato
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
