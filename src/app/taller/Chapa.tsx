"use client";

// La chapa del hero: un form GET a /taller/turno que funciona igual sin JS (manda lo escrito tal cual). Con JS,
// formatea en vivo como la chapa real, cambia el texto del botón y avisa —sin bloquear— si no parece una patente.
import { useRef, useState, useSyncExternalStore } from "react";
import { formatoPatente, mostrarPatente, normalizarPatente } from "@/lib/taller/core";
import { avisoPatente, patenteEnVivo } from "./patente";

const nada = () => () => {};

export default function Chapa() {
  const [valor, setValor] = useState("");
  // true sólo en el navegador ya hidratado (en el HTML del servidor, false): sin efecto ni doble render.
  const hidratado = useSyncExternalStore(nada, () => true, () => false);
  const tic = useRef<"a" | "b">("b");
  const [marca, setMarca] = useState<"a" | "b" | undefined>(undefined);

  const norm = normalizarPatente(valor);
  const valida = formatoPatente(norm) !== null;
  const aviso = avisoPatente(norm);

  return (
    <form action="/taller/turno" method="get" className="agr-chapa">
      <label htmlFor="agr-patente" className="agr-chapa__label">Tu patente</label>
      <div className="agr-chapa__placa" data-valida={valida ? "si" : undefined}>
        <div className="agr-chapa__banda" aria-hidden="true">Argentina</div>
        <input
          id="agr-patente"
          // Sin JS el campo viaja con su nombre; con JS viaja la versión normalizada (input oculto de abajo).
          name={hidratado ? undefined : "patente"}
          className="agr-chapa__input"
          value={valor}
          onChange={(e) => {
            const nuevo = patenteEnVivo(e.target.value);
            if (normalizarPatente(nuevo).length > norm.length) {
              tic.current = tic.current === "a" ? "b" : "a";
              setMarca(tic.current);
            }
            setValor(nuevo);
          }}
          data-tic={marca}
          placeholder="AB 123 CD"
          aria-label="Tu patente"
          aria-describedby="agr-patente-aviso"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={9}
        />
      </div>
      {hidratado && norm && <input type="hidden" name="patente" value={norm} />}
      <button type="submit" className="agr-btn agr-btn--ancho">
        {valida ? `Sacar turno para ${mostrarPatente(norm)}` : "Sacar turno"}
      </button>
      <p id="agr-patente-aviso" className="agr-chapa__aviso" role="status">{aviso ?? ""}</p>
    </form>
  );
}
