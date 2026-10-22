"use client";

// Los tres pasos del turnero: día → hora → nombre y celular. Todo en una pantalla, sin ir y
// volver al servidor hasta el "Pedir clase": los horarios libres ya vienen calculados.
// El nombre y el celular se recuerdan en este teléfono (para la próxima vez), nunca en otro lado.
// El link del alumno NO: lo recuerda una cookie httpOnly que escribe el servidor, y sólo se
// muestra si este dispositivo es el dueño (alumno nuevo, o el mismo teléfono de siempre). Si el
// celular es de un alumno conocido y el teléfono es otro, «Te confirmamos por WhatsApp».

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { pedirClase, pedirMiLink } from "@/lib/padel/acciones";
import type { DiaConLugar } from "@/lib/padel/datos.server";

type Marca = { cancha: string; vivo: string; texto: string; suave: string; linea: string };

const ZONA = "America/Argentina/Buenos_Aires";
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA });
const pesos = (n: number) => `$ ${n.toLocaleString("es-AR")}`;
const RECUERDO = "gsg-padel-alumno";

export default function Turnero({ dias, sinHorarios = false, hayGrupal, precioIndividual, precioGrupal, marca }: {
  dias: DiaConLugar[];
  /** El profe todavía no cargó ninguna franja en la que da clases. */
  sinHorarios?: boolean;
  hayGrupal: boolean;
  precioIndividual: number;
  precioGrupal: number;
  marca: Marca;
}) {
  const [fecha, setFecha] = useState(dias[0]?.fecha ?? "");
  const [elegida, setElegida] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"INDIVIDUAL" | "GRUPAL">("INDIVIDUAL");
  const [personas, setPersonas] = useState(2);
  const nombreRef = useRef<HTMLInputElement>(null);
  const telRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<{ token: string | null; waProfe: string | null; cuando: string } | null>(null);
  const [pendiente, start] = useTransition();

  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem(RECUERDO) ?? "{}") as { nombre?: string; telefono?: string };
      // Se completa en el DOM (no en el estado): el servidor no sabe qué guardó este teléfono.
      if (r.nombre && nombreRef.current && !nombreRef.current.value) nombreRef.current.value = r.nombre;
      if (r.telefono && telRef.current && !telRef.current.value) telRef.current.value = r.telefono;
    } catch {}
  }, []);

  const horas = useMemo(() => dias.find((d) => d.fecha === fecha)?.horas ?? [], [dias, fecha]);
  const precio = tipo === "GRUPAL" ? precioGrupal * personas : precioIndividual;

  const chip = (activo: boolean): React.CSSProperties => ({
    minHeight: 48,
    borderRadius: 12,
    border: `2px solid ${activo ? marca.cancha : marca.linea}`,
    background: activo ? marca.cancha : "#fff",
    color: activo ? "#fff" : marca.texto,
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    padding: "0 12px",
  });
  const caja: React.CSSProperties = { background: "#fff", border: `1px solid ${marca.linea}`, borderRadius: 16, padding: 16, marginBottom: 14 };
  const titulo: React.CSSProperties = { margin: "0 0 12px", fontSize: 18 };
  const campo: React.CSSProperties = { width: "100%", minHeight: 48, borderRadius: 12, border: `1px solid ${marca.linea}`, padding: "0 14px", fontSize: 16, boxSizing: "border-box", color: marca.texto, background: "#fff" };

  if (listo) {
    return (
      <section style={{ ...caja, borderTop: `5px solid ${marca.vivo}` }} aria-live="polite">
        <h2 style={{ margin: "0 0 6px", fontSize: 24 }}>¡Listo! Pediste tu clase</h2>
        <p style={{ margin: "0 0 16px", fontSize: 16 }}>
          <strong>{listo.cuando}</strong>. El profe te la confirma por WhatsApp.
        </p>
        {listo.waProfe && (
          <a
            href={listo.waProfe}
            target="_blank"
            rel="noopener noreferrer"
            data-qa="avisar-profe"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 56, borderRadius: 14, background: marca.cancha, color: "#fff", fontWeight: 700, fontSize: 17, textDecoration: "none", marginBottom: 12 }}
          >
            Avisarle por WhatsApp
          </a>
        )}
        {listo.token ? (
          <>
            <a
              href={`/alumno/${listo.token}`}
              data-qa="mi-link"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 52, borderRadius: 14, border: `2px solid ${marca.cancha}`, color: marca.cancha, fontWeight: 700, fontSize: 16, textDecoration: "none" }}
            >
              Ver mis clases y pagar
            </a>
            <p style={{ margin: "12px 0 0", fontSize: 14, color: marca.suave }}>
              Guardá ese link: desde ahí repetís la clase la semana que viene, mandás el comprobante o cancelás.
            </p>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 16 }} data-qa="confirmamos-por-wa">
            Te confirmamos por WhatsApp al número que pusiste.
          </p>
        )}
      </section>
    );
  }

  if (dias.length === 0 && sinHorarios) {
    return (
      <section style={caja}>
        <h2 style={titulo}>El profe todavía no publicó sus horarios</h2>
        <p style={{ margin: 0, color: marca.suave }}>Volvé a mirar en unos días o escribile al profe.</p>
        <YaSoyAlumno marca={marca} caja={caja} campo={campo} />
      </section>
    );
  }

  if (dias.length === 0) {
    return (
      <section style={caja}>
        <h2 style={titulo}>No quedan horarios libres por ahora</h2>
        <p style={{ margin: 0, color: marca.suave }}>Volvé a mirar en unos días o escribile al profe.</p>
        <YaSoyAlumno marca={marca} caja={caja} campo={campo} />
      </section>
    );
  }

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!elegida) return setError("Elegí un horario.");
    const nombre = nombreRef.current?.value ?? "";
    const telefono = telRef.current?.value ?? "";
    start(async () => {
      const r = await pedirClase({ hora: elegida, nombre, telefono, tipo, personas });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      try {
        localStorage.setItem(RECUERDO, JSON.stringify({ nombre, telefono }));
      } catch {}
      setListo({ token: r.token, waProfe: r.waProfe, cuando: r.cuando });
    });
  };

  return (
    <>
    <form onSubmit={enviar} noValidate>
      <section style={caja} aria-labelledby="paso-dia">
        <h2 id="paso-dia" style={titulo}>1 · ¿Qué día?</h2>
        <div role="group" aria-label="Días con lugar" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 8 }}>
          {dias.map((d) => (
            <button
              key={d.fecha}
              type="button"
              aria-pressed={d.fecha === fecha}
              data-qa="dia"
              data-fecha={d.fecha}
              onClick={() => {
                setFecha(d.fecha);
                setElegida(null);
              }}
              style={chip(d.fecha === fecha)}
            >
              {d.etiqueta}
            </button>
          ))}
        </div>
      </section>

      <section style={caja} aria-labelledby="paso-hora">
        <h2 id="paso-hora" style={titulo}>2 · ¿A qué hora?</h2>
        <div role="group" aria-label="Horarios libres" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8 }}>
          {horas.map((h) => (
            <button key={h} type="button" aria-pressed={h === elegida} data-qa="hora" data-hora={h} onClick={() => setElegida(h)} style={chip(h === elegida)}>
              {hora(h)}
            </button>
          ))}
        </div>
        {hayGrupal && (
          <div style={{ marginTop: 14 }}>
            <div role="group" aria-label="Tipo de clase" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button type="button" aria-pressed={tipo === "INDIVIDUAL"} onClick={() => setTipo("INDIVIDUAL")} style={chip(tipo === "INDIVIDUAL")}>
                Individual
              </button>
              <button type="button" aria-pressed={tipo === "GRUPAL"} onClick={() => setTipo("GRUPAL")} style={chip(tipo === "GRUPAL")}>
                Grupal
              </button>
            </div>
            {tipo === "GRUPAL" && (
              <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 16 }}>
                Somos
                <select value={personas} onChange={(e) => setPersonas(Number(e.target.value))} style={{ ...campo, width: 90 }}>
                  {[2, 3, 4].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        {precio > 0 && (
          <p style={{ margin: "12px 0 0", fontSize: 15, color: marca.suave }}>
            Valor: <strong style={{ color: marca.texto }}>{pesos(precio)}</strong>
          </p>
        )}
      </section>

      <section style={caja} aria-labelledby="paso-quien">
        <h2 id="paso-quien" style={titulo}>3 · ¿Quién sos?</h2>
        <label htmlFor="t-nombre" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Nombre</label>
        <input ref={nombreRef} id="t-nombre" name="nombre" autoComplete="name" style={{ ...campo, marginBottom: 12 }} />
        <label htmlFor="t-tel" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Celular (WhatsApp)</label>
        <input id="t-tel" name="telefono" type="tel" inputMode="tel" autoComplete="tel" placeholder="11 5555-1234" ref={telRef} style={campo} />
      </section>

      {error && (
        <p role="alert" style={{ margin: "0 0 12px", padding: 12, borderRadius: 12, background: "#f6e3de", color: "#b23b2b", fontWeight: 600 }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        data-qa="pedir"
        style={{ width: "100%", minHeight: 58, borderRadius: 14, border: 0, background: marca.cancha, color: "#fff", fontSize: 18, fontWeight: 700, cursor: pendiente ? "wait" : "pointer", opacity: pendiente ? 0.7 : 1 }}
      >
        {pendiente ? "Pidiendo…" : elegida ? `Pedir clase · ${dias.find((d) => d.fecha === fecha)?.etiqueta} ${hora(elegida)}` : "Pedir clase"}
      </button>
    </form>
    <YaSoyAlumno marca={marca} caja={caja} campo={campo} />
    </>
  );
}

/**
 * «¿Ya sos alumno? Pedí tu link»: el link viaja por WhatsApp al número registrado y nunca se
 * muestra acá. La respuesta es la misma exista o no el celular (no revela quién es alumno).
 */
function YaSoyAlumno({ marca, caja, campo }: { marca: Marca; caja: React.CSSProperties; campo: React.CSSProperties }) {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const tel = useRef<HTMLInputElement>(null);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        data-qa="ya-soy-alumno"
        style={{ display: "block", width: "100%", minHeight: 48, marginTop: 16, background: "none", border: 0, color: marca.suave, fontSize: 16, textDecoration: "underline", cursor: "pointer" }}
      >
        ¿Ya sos alumno? Pedí tu link
      </button>
    );
  }
  const pedir = () =>
    start(async () => {
      setMsg(null);
      const r = await pedirMiLink(tel.current?.value ?? "");
      setMsg(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error });
    });
  return (
    <section style={{ ...caja, marginTop: 16 }} aria-labelledby="ya-alumno">
      <h2 id="ya-alumno" style={{ margin: "0 0 8px", fontSize: 18 }}>Pedí tu link</h2>
      <p style={{ margin: "0 0 12px", fontSize: 16, color: marca.suave }}>Poné el celular con el que pediste clase. Te lo mandamos por WhatsApp a ese número.</p>
      <label htmlFor="t-tel-link" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Celular (WhatsApp)</label>
      <input ref={tel} id="t-tel-link" type="tel" inputMode="tel" autoComplete="tel" placeholder="11 5555-1234" style={campo} />
      <button
        type="button"
        disabled={pendiente}
        onClick={pedir}
        data-qa="pedir-link"
        style={{ width: "100%", minHeight: 52, marginTop: 12, borderRadius: 14, border: `2px solid ${marca.cancha}`, background: "none", color: marca.cancha, fontSize: 16, fontWeight: 700, cursor: pendiente ? "wait" : "pointer" }}
      >
        {pendiente ? "Mandando…" : "Mandarme mi link"}
      </button>
      {msg && (
        <p
          role={msg.ok ? "status" : "alert"}
          data-qa="respuesta-link"
          style={{ margin: "12px 0 0", fontSize: 16, fontWeight: 600, color: msg.ok ? marca.texto : "var(--danger)" }}
        >
          {msg.texto}
        </p>
      )}
    </section>
  );
}
