"use client";

// Piezas de cliente del sitio de la inmobiliaria: el formulario de consulta, la galería de
// fotos, la cuenta orientativa del crédito y el botón de copiar. Sólo importan reglas puras
// y la acción pública: nada que arrastre la base al navegador.

import { useState, useTransition } from "react";
import { cuotaFrancesa, precio } from "@/lib/inmobiliaria/core";
import { enviarConsulta } from "@/lib/inmobiliaria/acciones";
import s from "./sitio.module.css";

export function FormConsulta({
  propiedadId,
  tipo = "CONSULTA",
  titulo,
  bajada,
  mensajeInicial = "",
  conVisita,
  boton = "Enviar consulta",
}: {
  propiedadId?: string;
  tipo?: "CONSULTA" | "VISITA" | "TASACION";
  titulo: string;
  bajada?: string;
  mensajeInicial?: string;
  conVisita?: boolean;
  boton?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [enviando, iniciar] = useTransition();

  function enviar(form: FormData) {
    setError(null);
    iniciar(async () => {
      try {
        const r = await enviarConsulta({
          propiedadId,
          tipo: conVisita && form.get("visita") === "on" ? "VISITA" : tipo,
          nombre: String(form.get("nombre") ?? ""),
          telefono: String(form.get("telefono") ?? ""),
          email: String(form.get("email") ?? ""),
          mensaje: String(form.get("mensaje") ?? ""),
          web: String(form.get("web") ?? ""),
        });
        if (r.ok) setListo(true);
        else setError(r.error);
      } catch {
        setError("No se pudo enviar. Revisá tu conexión y probá de nuevo, o escribinos por WhatsApp.");
      }
    });
  }

  if (listo) {
    return (
      <div className={s.gracias} role="status">
        <strong>¡Listo! Ya nos llegó.</strong>
        <p style={{ margin: "6px 0 0" }}>Te respondemos a la brevedad por WhatsApp o por teléfono.</p>
      </div>
    );
  }
  return (
    <div>
      <h2 className={s.cajaTitulo}>{titulo}</h2>
      {bajada && <p className={s.nota}>{bajada}</p>}
      <form action={enviar} className={s.formulario}>
        <label className={s.campo}>
          <span>Nombre</span>
          <input name="nombre" autoComplete="name" required minLength={2} maxLength={80} />
        </label>
        <label className={s.campo}>
          <span>Teléfono (con característica)</span>
          <input name="telefono" type="tel" inputMode="tel" autoComplete="tel" required minLength={8} maxLength={20} placeholder="11 5555-5555" />
        </label>
        <label className={s.campo}>
          <span>Mail (opcional)</span>
          <input name="email" type="email" autoComplete="email" maxLength={120} />
        </label>
        <label className={s.campo}>
          <span>Mensaje</span>
          <textarea name="mensaje" maxLength={1000} defaultValue={mensajeInicial} />
        </label>
        {conVisita && (
          <label className={s.tilde}>
            <input type="checkbox" name="visita" />
            Quiero coordinar una visita
          </label>
        )}
        {/* Campo trampa: una persona no lo ve. */}
        <div className={s.trampa} aria-hidden>
          <label>
            No completar
            <input name="web" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={s.boton} disabled={enviando}>
          {enviando ? "Enviando…" : boton}
        </button>
        <p className={s.nota}>Usamos tus datos sólo para responderte esta consulta.</p>
      </form>
    </div>
  );
}

export function Galeria({ fotos, titulo }: { fotos: { id: string; src: string; alt: string }[]; titulo: string }) {
  const [i, setI] = useState(0);
  if (fotos.length === 0) {
    return (
      <div className={s.galeriaPrincipal}>
        <div className={s.sinFoto}>Fotos a pedido: escribinos y te las mandamos.</div>
      </div>
    );
  }
  const ir = (d: number) => setI((v) => (v + d + fotos.length) % fotos.length);
  const actual = fotos[i];
  return (
    <div
      className={s.galeria}
      role="group"
      aria-roledescription="galería de fotos"
      aria-label={`Fotos de ${titulo}`}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") ir(1);
        if (e.key === "ArrowLeft") ir(-1);
      }}
    >
      <div className={s.galeriaPrincipal}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={actual.src} alt={actual.alt || `${titulo} — foto ${i + 1} de ${fotos.length}`} fetchPriority="high" />
        {fotos.length > 1 && (
          <>
            <button type="button" className={s.galeriaFlecha} style={{ left: 14 }} onClick={() => ir(-1)} aria-label="Foto anterior">
              ‹
            </button>
            <button type="button" className={s.galeriaFlecha} style={{ right: 14 }} onClick={() => ir(1)} aria-label="Foto siguiente">
              ›
            </button>
            <span className={s.galeriaCuenta} aria-live="polite">
              {i + 1} / {fotos.length}
            </span>
          </>
        )}
      </div>
      {fotos.length > 1 && (
        <div className={s.miniaturas}>
          {fotos.map((f, n) => (
            <button key={f.id} type="button" className={s.miniatura} aria-current={n === i} aria-label={`Ver foto ${n + 1}`} onClick={() => setI(n)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Cuenta orientativa de la cuota de un crédito. No es una oferta de ningún banco. */
export function Credito({ valor, moneda }: { valor: number; moneda: string }) {
  const [financia, setFinancia] = useState(75);
  const [tasa, setTasa] = useState(6);
  const [anios, setAnios] = useState(20);
  const capital = (valor * financia) / 100;
  const cuota = cuotaFrancesa(capital, tasa, anios * 12);
  const numero = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Number(v.replace(",", ".")) || 0));
  return (
    <div className={s.credito}>
      <h2 className={s.cajaTitulo}>¿Y con crédito?</h2>
      <div className={s.creditoFila}>
        <label className={s.campo}>
          <span>Financiás (%)</span>
          <input inputMode="decimal" value={financia} onChange={(e) => setFinancia(numero(e.target.value, 0, 100))} />
        </label>
        <label className={s.campo}>
          <span>Tasa anual (%)</span>
          <input inputMode="decimal" value={tasa} onChange={(e) => setTasa(numero(e.target.value, 0, 100))} />
        </label>
        <label className={s.campo}>
          <span>Años</span>
          <input inputMode="numeric" value={anios} onChange={(e) => setAnios(Math.round(numero(e.target.value, 1, 40)))} />
        </label>
      </div>
      <div className={s.creditoCuota} aria-live="polite">
        <span className={s.nota}>
          Pedís {precio(capital, moneda)} y ponés {precio(valor - capital, moneda)}. Cuota inicial estimada:
        </span>
        <strong>{precio(cuota, moneda)} por mes</strong>
      </div>
      <p className={s.nota}>
        Cuenta orientativa (sistema francés, tasa fija sobre saldo). Los créditos UVA se ajustan por inflación y cada banco tiene sus condiciones: no es una oferta.
      </p>
    </div>
  );
}

export function Copiar({ texto, etiqueta = "Copiar" }: { texto: string; etiqueta?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className={s.botonLinea}
      style={{ minHeight: 44, padding: "0 16px" }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        } catch {
          window.prompt("Copiá:", texto);
        }
      }}
    >
      {copiado ? "¡Copiado!" : etiqueta}
    </button>
  );
}
