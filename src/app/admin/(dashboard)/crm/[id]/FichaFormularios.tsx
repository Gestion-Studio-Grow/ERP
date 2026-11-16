"use client";

// CRM COMERCIAL · los formularios de la ficha (GSG-CRM-011, diseño §4.3). Cada uno llama UNA acción del
// servidor; la página sólo monta los que le tocan a quien mira, y el servidor vuelve a comprobar todo.

import { useState } from "react";
import { Button, Input, Select, Textarea } from "@/components/ui";
import {
  actualizarDatosOportunidad,
  aprobarPasePropuesto,
  comprobarIdentidad,
  confirmarDestino,
  crearContacto,
  crearTarea,
  desvincularContacto,
  escribirBorrador,
  rechazarPasePropuesto,
  registrarPedidoDeDatos,
  registrarRespuesta,
  suprimirContacto,
  vincularContacto,
} from "@/lib/crm-comercial/acciones";
import type { OpcionPase } from "../crm-core";
import { Resultado, ROTULO } from "../Avisos";
import { FormularioPase, type Comercial } from "../FormularioPase";
import { useAccion } from "../useAccion";

const PAPELES = [
  { valor: "DECIDE", etiqueta: "Decide" },
  { valor: "PIDE", etiqueta: "Pide" },
  { valor: "PAGA", etiqueta: "Paga" },
] as const;

/** Un bloque plegable: el formulario no tapa la ficha hasta que se pide. */
function Plegable({ titulo, children, abierto = false }: { titulo: string; children: React.ReactNode; abierto?: boolean }) {
  return (
    <details className="rounded-lg border border-line bg-surface p-3" open={abierto}>
      <summary className="flex min-h-11 cursor-pointer items-center font-medium text-strong sm:min-h-0">{titulo}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

// ── Pases ───────────────────────────────────────────────────────────────────

export function PanelPases({ oportunidadId, version, opciones, comerciales }: { oportunidadId: string; version: number; opciones: readonly OpcionPase[]; comerciales: readonly Comercial[] }) {
  const [destino, setDestino] = useState<string | null>(null);
  const op = opciones.find((o) => o.destino === destino);
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {opciones.map((o) => (
          <Button key={o.destino} size="sm" variant={destino === o.destino ? "solid" : "outline"} onClick={() => setDestino(destino === o.destino ? null : o.destino)} aria-expanded={destino === o.destino}>
            {o.modo === "aplicar" ? "Pasar a" : "Proponer"} «{o.etiqueta}»
          </Button>
        ))}
      </div>
      {op && (
        <div className="mt-3">
          <FormularioPase key={op.destino} opcion={op} oportunidadId={oportunidadId} version={version} comerciales={comerciales} alCancelar={() => setDestino(null)} />
        </div>
      )}
    </div>
  );
}

export function DecidirPropuesta({ oportunidadId, version, destino, esAsignada, comerciales }: { oportunidadId: string; version: number; destino: string; esAsignada: boolean; comerciales: readonly Comercial[] }) {
  const { correr, pendiente, motivo, hecho } = useAccion();
  const [comercial, setComercial] = useState("");
  const [porque, setPorque] = useState("");
  const [rechazar, setRechazar] = useState(false);
  return (
    <div className="grid gap-3">
      {esAsignada && (
        <div>
          <label htmlFor="prop-comercial" className={ROTULO}>Comercial que la atiende</label>
          <Select id="prop-comercial" value={comercial} onChange={(e) => setComercial(e.target.value)}>
            <option value="">Elegí a quién</option>
            {comerciales.map((c) => <option key={c.userId} value={c.userId}>{c.nombre}</option>)}
          </Select>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pendiente} onClick={() => correr(() => aprobarPasePropuesto(oportunidadId, { version, ...(comercial ? { comercialUserId: comercial } : {}) }), { listo: `Listo: pasó a «${destino}».` })}>
          Aprobar
        </Button>
        <Button size="sm" variant="outline" disabled={pendiente} onClick={() => setRechazar(!rechazar)} aria-expanded={rechazar}>No aprobar…</Button>
      </div>
      {rechazar && (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            correr(() => rechazarPasePropuesto(oportunidadId, porque), { listo: "El pase no se aplicó; quedó el porqué." });
          }}
        >
          <label className="min-w-0 flex-1 text-sm">
            <span className={ROTULO}>Por qué no se aplica</span>
            <Input value={porque} onChange={(e) => setPorque(e.target.value)} required maxLength={500} />
          </label>
          <Button type="submit" size="sm" disabled={pendiente}>Confirmar</Button>
        </form>
      )}
      <Resultado motivo={motivo} hecho={hecho} />
    </div>
  );
}

export function ConfirmarDestino({ oportunidadId, actual }: { oportunidadId: string; actual: string | null }) {
  const { correr, pendiente, motivo, hecho } = useAccion();
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {(["AGENCIA", "TALLER"] as const).map((d) => (
          <Button key={d} size="sm" variant={actual === d ? "solid" : "outline"} disabled={pendiente} onClick={() => correr(() => confirmarDestino(oportunidadId, d), { listo: "Destino confirmado." })}>
            Confirmar {d === "AGENCIA" ? "Agencia" : "Taller"}
          </Button>
        ))}
      </div>
      <Resultado motivo={motivo} hecho={hecho} />
    </div>
  );
}

// ── Datos, brief, próximo paso y plata ──────────────────────────────────────

export interface DatosIniciales {
  fechaEvento: string;
  tipoTrabajo: string;
  presupuestoMin: string;
  presupuestoMax: string;
  quienDecide: string;
  encaje: "" | "si" | "no";
  objetivo: string;
  proximoPaso: string;
  proximoPasoEl: string;
  monto: string;
  moneda: string;
  cierreEsperadoEl: string;
  fuenteUrl: string;
}

export function FormularioDatos({ oportunidadId, version, inicial, puede }: { oportunidadId: string; version: number; inicial: DatosIniciales; puede: { puntuar: boolean; brief: boolean; persona: boolean } }) {
  const { correr, pendiente, motivo, hecho } = useAccion();
  const [f, setF] = useState(inicial);
  const set = (k: keyof DatosIniciales) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/\./g, "").replace(",", ".")));

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const d: Parameters<typeof actualizarDatosOportunidad>[1] = { version };
    if (puede.puntuar) {
      d.datos = {
        fechaEvento: f.fechaEvento || null,
        tipoTrabajo: f.tipoTrabajo.trim() || null,
        presupuestoMin: num(f.presupuestoMin),
        presupuestoMax: num(f.presupuestoMax),
        quienDecide: f.quienDecide.trim() || null,
        ...(f.encaje ? { encaje: f.encaje === "si" } : {}),
      };
      if (f.fuenteUrl.trim()) d.fuenteUrl = f.fuenteUrl.trim();
    }
    if (puede.brief) d.objetivo = f.objetivo;
    if (puede.persona) {
      if (f.proximoPaso.trim()) d.proximoPaso = f.proximoPaso.trim();
      if (f.proximoPasoEl) d.proximoPasoEl = f.proximoPasoEl;
      d.monto = num(f.monto);
      d.moneda = f.moneda || "ARS";
      d.cierreEsperadoEl = f.cierreEsperadoEl || null;
    }
    correr(() => actualizarDatosOportunidad(oportunidadId, d), { listo: "Datos guardados. El puntaje se recalculó." });
  }

  return (
    <Plegable titulo="Cargar o corregir datos">
      <form onSubmit={enviar} className="grid gap-3">
        {puede.puntuar && (
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm text-muted sm:col-span-2">Sólo datos vistos en una fuente o que dijo el cliente. Con esto se calcula el puntaje.</legend>
            <div>
              <label htmlFor="d-fecha" className={ROTULO}>Fecha del evento</label>
              <Input id="d-fecha" type="date" value={f.fechaEvento} onChange={set("fechaEvento")} />
            </div>
            <div>
              <label htmlFor="d-tipo" className={ROTULO}>Tipo de trabajo</label>
              <Input id="d-tipo" value={f.tipoTrabajo} onChange={set("tipoTrabajo")} maxLength={60} placeholder="stand_modular, experiencia, activacion…" />
            </div>
            <div>
              <label htmlFor="d-pmin" className={ROTULO}>Presupuesto desde</label>
              <Input id="d-pmin" inputMode="decimal" value={f.presupuestoMin} onChange={set("presupuestoMin")} />
            </div>
            <div>
              <label htmlFor="d-pmax" className={ROTULO}>Presupuesto hasta</label>
              <Input id="d-pmax" inputMode="decimal" value={f.presupuestoMax} onChange={set("presupuestoMax")} />
            </div>
            <div>
              <label htmlFor="d-quien" className={ROTULO}>Quién decide la compra (el puesto)</label>
              <Input id="d-quien" value={f.quienDecide} onChange={set("quienDecide")} maxLength={120} placeholder="Gerencia de marketing" />
            </div>
            <div>
              <label htmlFor="d-encaje" className={ROTULO}>¿Encaja con lo que vendemos?</label>
              <Select id="d-encaje" value={f.encaje} onChange={set("encaje")}>
                <option value="">Sin confirmar</option>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="d-fuente" className={ROTULO}>Link a la fuente (opcional)</label>
              <Input id="d-fuente" type="url" value={f.fuenteUrl} onChange={set("fuenteUrl")} placeholder="https://" />
            </div>
          </fieldset>
        )}
        {puede.brief && (
          <div>
            <label htmlFor="d-obj" className={ROTULO}>Objetivo de la marca en el evento</label>
            <Textarea id="d-obj" rows={2} value={f.objetivo} onChange={set("objetivo")} maxLength={2000} />
          </div>
        )}
        {puede.persona && (
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm text-muted sm:col-span-2">Próximo paso y plata (lo carga una persona).</legend>
            <div>
              <label htmlFor="d-paso" className={ROTULO}>Próximo paso</label>
              <Input id="d-paso" value={f.proximoPaso} onChange={set("proximoPaso")} maxLength={500} />
            </div>
            <div>
              <label htmlFor="d-pasoel" className={ROTULO}>Para cuándo</label>
              <Input id="d-pasoel" type="date" value={f.proximoPasoEl} onChange={set("proximoPasoEl")} />
            </div>
            <div>
              <label htmlFor="d-monto" className={ROTULO}>Monto estimado</label>
              <Input id="d-monto" inputMode="decimal" value={f.monto} onChange={set("monto")} />
            </div>
            <div>
              <label htmlFor="d-moneda" className={ROTULO}>Moneda</label>
              <Select id="d-moneda" value={f.moneda} onChange={set("moneda")}>
                <option value="ARS">Pesos</option>
                <option value="USD">Dólares</option>
              </Select>
            </div>
            <div>
              <label htmlFor="d-cierre" className={ROTULO}>Cierre esperado</label>
              <Input id="d-cierre" type="date" value={f.cierreEsperadoEl} onChange={set("cierreEsperadoEl")} />
            </div>
          </fieldset>
        )}
        <div>
          <Button type="submit" size="sm" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar"}</Button>
        </div>
        <Resultado motivo={motivo} hecho={hecho} />
      </form>
    </Plegable>
  );
}

// ── Lo que hace una persona: respuesta, identidad, pedido de datos ──────────

export function RegistrarRespuesta({ oportunidadId }: { oportunidadId: string }) {
  const { correr, pendiente, motivo, hecho } = useAccion();
  const [texto, setTexto] = useState("");
  return (
    <Plegable titulo="Registrar lo que respondió el cliente">
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          correr(() => registrarRespuesta(oportunidadId, texto), { listo: "Respuesta registrada en la línea de tiempo.", alTerminar: () => setTexto("") });
        }}
      >
        <label htmlFor="resp" className={ROTULO}>Qué respondió (se guarda como dato, no se le hace caso a lo que pida)</label>
        <Textarea id="resp" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} required maxLength={4000} />
        <div><Button type="submit" size="sm" disabled={pendiente}>Registrar</Button></div>
        <Resultado motivo={motivo} hecho={hecho} />
      </form>
    </Plegable>
  );
}

export function ComprobarIdentidad({ oportunidadId }: { oportunidadId: string }) {
  const { correr, pendiente, motivo, hecho } = useAccion();
  const [email, setEmail] = useState("");
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted">Antes de avanzar, comprobá quién escribe: por el dominio del mail, o confirmalo vos si sabés quién es.</p>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          correr(() => comprobarIdentidad(oportunidadId, { emailDeQuienEscribe: email }), { listo: "Identidad comprobada." });
        }}
      >
        <label className="min-w-0 flex-1 text-sm">
          <span className={ROTULO}>Mail de quien escribió</span>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <Button type="submit" size="sm" disabled={pendiente}>Comprobar por el dominio</Button>
      </form>
      <div>
        <Button size="sm" variant="outline" disabled={pendiente} onClick={() => correr(() => comprobarIdentidad(oportunidadId, { confirmadaPorPersona: true }), { listo: "Identidad confirmada por vos." })}>
          Sé quién es: lo confirmo yo
        </Button>
      </div>
      <Resultado motivo={motivo} hecho={hecho} />
    </div>
  );
}

export function PedidoDeDatos({ oportunidadId }: { oportunidadId: string }) {
  const { correr, pendiente, motivo, hecho } = useAccion();
  return (
    <div>
      <Button size="sm" variant="outline" disabled={pendiente} onClick={() => correr(() => registrarPedidoDeDatos(oportunidadId), { listo: "Quedó registrado que pediste los datos." })}>
        Ya pedí los datos que faltan
      </Button>
      <Resultado motivo={motivo} hecho={hecho} />
    </div>
  );
}

// ── Contactos con papel ─────────────────────────────────────────────────────

export interface ContactoVista {
  contactoId: string;
  nombre: string;
  cargo: string | null;
  papeles: string[];
  suprimido: boolean;
}

export function Contactos({ oportunidadId, contactos, puedeCargar, puedeBaja, deConsulta }: { oportunidadId: string; contactos: readonly ContactoVista[]; puedeCargar: boolean; puedeBaja: boolean; deConsulta: boolean }) {
  const { correr, pendiente, motivo, hecho } = useAccion();
  const [nuevo, setNuevo] = useState({ nombre: "", email: "", telefono: "", cargo: "", papel: "" });
  const [vinculo, setVinculo] = useState({ contactoId: "", papel: "DECIDE" });
  const set = (k: keyof typeof nuevo) => (e: { target: { value: string } }) => setNuevo((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="grid gap-3">
      {contactos.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay contactos con papel en esta oportunidad.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {contactos.map((c) => (
            <li key={c.contactoId} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0">
                <span className="block break-words font-medium text-strong">{c.nombre}{c.suprimido && " (pidió que no le escriban más)"}</span>
                {c.cargo && <span className="block text-sm text-muted">{c.cargo}</span>}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {c.papeles.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs">
                    {PAPELES.find((x) => x.valor === p)?.etiqueta ?? p}
                    {puedeCargar && (
                      <button type="button" disabled={pendiente} className="min-h-6 px-1 text-muted hover:text-strong" aria-label={`Sacarle el papel ${p} a ${c.nombre}`} onClick={() => correr(() => desvincularContacto({ oportunidadId, contactoId: c.contactoId, papel: p }), { listo: "Papel quitado." })}>
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {puedeBaja && !c.suprimido && (
                  <Button size="sm" variant="ghost" disabled={pendiente} onClick={() => window.confirm(`¿${c.nombre} pidió que no le escriban más? Se anonimiza y no se le vuelve a preparar ningún mensaje.`) && correr(() => suprimirContacto(c.contactoId), { listo: "Baja registrada." })}>
                    Pidió la baja
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {puedeCargar && contactos.length > 0 && (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            correr(() => vincularContacto({ oportunidadId, ...vinculo }), { listo: "Papel asignado." });
          }}
        >
          <label className="min-w-0 flex-1 text-sm">
            <span className={ROTULO}>Darle otro papel a</span>
            <Select value={vinculo.contactoId} onChange={(e) => setVinculo((v) => ({ ...v, contactoId: e.target.value }))} required>
              <option value="">Elegí el contacto</option>
              {contactos.filter((c) => !c.suprimido).map((c) => <option key={c.contactoId} value={c.contactoId}>{c.nombre}</option>)}
            </Select>
          </label>
          <label className="text-sm">
            <span className={ROTULO}>Papel</span>
            <Select value={vinculo.papel} onChange={(e) => setVinculo((v) => ({ ...v, papel: e.target.value }))}>
              {PAPELES.map((p) => <option key={p.valor} value={p.valor}>{p.etiqueta}</option>)}
            </Select>
          </label>
          <Button type="submit" size="sm" disabled={pendiente}>Asignar</Button>
        </form>
      )}
      {puedeCargar && (
        <Plegable titulo="Cargar un contacto">
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              correr(
                () => crearContacto({ oportunidadId, nombre: nuevo.nombre, email: nuevo.email || null, telefono: nuevo.telefono || null, cargo: nuevo.cargo || null, papel: nuevo.papel || null, deConsultaEntrante: deConsulta }),
                { listo: "Contacto cargado.", alTerminar: (r) => (setNuevo({ nombre: "", email: "", telefono: "", cargo: "", papel: "" }), r.suprimido && window.alert("Esa persona ya había pedido que no le escriban: no se le prepara ningún mensaje.")) },
              );
            }}
          >
            <div>
              <label htmlFor="c-nombre" className={ROTULO}>Nombre</label>
              <Input id="c-nombre" value={nuevo.nombre} onChange={set("nombre")} required maxLength={200} />
            </div>
            <div>
              <label htmlFor="c-cargo" className={ROTULO}>Cargo</label>
              <Input id="c-cargo" value={nuevo.cargo} onChange={set("cargo")} maxLength={200} />
            </div>
            <div>
              <label htmlFor="c-email" className={ROTULO}>Mail</label>
              <Input id="c-email" type="email" value={nuevo.email} onChange={set("email")} />
            </div>
            <div>
              <label htmlFor="c-tel" className={ROTULO}>Teléfono</label>
              <Input id="c-tel" type="tel" value={nuevo.telefono} onChange={set("telefono")} maxLength={40} />
            </div>
            <div>
              <label htmlFor="c-papel" className={ROTULO}>Papel</label>
              <Select id="c-papel" value={nuevo.papel} onChange={set("papel")}>
                <option value="">Sin papel por ahora</option>
                {PAPELES.map((p) => <option key={p.valor} value={p.valor}>{p.etiqueta}</option>)}
              </Select>
            </div>
            <div className="flex items-end"><Button type="submit" size="sm" disabled={pendiente}>Cargar contacto</Button></div>
          </form>
        </Plegable>
      )}
      <Resultado motivo={motivo} hecho={hecho} />
    </div>
  );
}

// ── Borrador nuevo y tarea al equipo ────────────────────────────────────────

export function NuevoBorrador({ oportunidadId, contactos }: { oportunidadId: string; contactos: readonly ContactoVista[] }) {
  const { correr, pendiente, motivo, hecho } = useAccion();
  const [f, setF] = useState({ canal: "MAIL", asunto: "", cuerpo: "", contactoId: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Plegable titulo="Escribir un borrador">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          correr(() => escribirBorrador({ oportunidadId, canal: f.canal, asunto: f.canal === "MAIL" ? f.asunto : null, cuerpo: f.cuerpo, contactoId: f.contactoId || null }), {
            listo: "Borrador guardado: queda para aprobar.",
            alTerminar: () => setF({ canal: f.canal, asunto: "", cuerpo: "", contactoId: "" }),
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="b-canal" className={ROTULO}>Por dónde</label>
            <Select id="b-canal" value={f.canal} onChange={set("canal")}>
              <option value="MAIL">Mail</option>
              <option value="WHATSAPP">WhatsApp</option>
            </Select>
          </div>
          {contactos.length > 0 && (
            <div>
              <label htmlFor="b-para" className={ROTULO}>Para</label>
              <Select id="b-para" value={f.contactoId} onChange={set("contactoId")}>
                <option value="">El contacto principal</option>
                {contactos.filter((c) => !c.suprimido).map((c) => <option key={c.contactoId} value={c.contactoId}>{c.nombre}</option>)}
              </Select>
            </div>
          )}
        </div>
        {f.canal === "MAIL" && (
          <div>
            <label htmlFor="b-asunto" className={ROTULO}>Asunto</label>
            <Input id="b-asunto" value={f.asunto} onChange={set("asunto")} maxLength={300} />
          </div>
        )}
        <div>
          <label htmlFor="b-cuerpo" className={ROTULO}>Texto</label>
          <Textarea id="b-cuerpo" rows={6} value={f.cuerpo} onChange={set("cuerpo")} required maxLength={10000} />
        </div>
        <div><Button type="submit" size="sm" disabled={pendiente}>Guardar borrador</Button></div>
        <Resultado motivo={motivo} hecho={hecho} />
      </form>
    </Plegable>
  );
}

export function NuevaTarea({ oportunidadId, colas, tipos }: { oportunidadId: string; colas: readonly { valor: string; etiqueta: string }[]; tipos: readonly { valor: string; etiqueta: string }[] }) {
  const { correr, pendiente, motivo, hecho } = useAccion();
  const [f, setF] = useState({ para: colas[0]?.valor ?? "", tipo: tipos[0]?.valor ?? "", venceEl: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Plegable titulo="Pedirle una tarea al equipo">
      <form
        className="grid gap-3 sm:grid-cols-3 sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          correr(() => crearTarea({ oportunidadId, para: f.para, tipo: f.tipo, venceEl: f.venceEl || null }), { listo: "Tarea en cola." });
        }}
      >
        <div>
          <label htmlFor="t-para" className={ROTULO}>Para</label>
          <Select id="t-para" value={f.para} onChange={set("para")}>
            {colas.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="t-tipo" className={ROTULO}>Qué</label>
          <Select id="t-tipo" value={f.tipo} onChange={set("tipo")}>
            {tipos.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="t-vence" className={ROTULO}>Vence</label>
          <Input id="t-vence" type="date" value={f.venceEl} onChange={set("venceEl")} />
        </div>
        <div className="sm:col-span-3"><Button type="submit" size="sm" disabled={pendiente}>Poner en cola</Button></div>
        <Resultado motivo={motivo} hecho={hecho} />
      </form>
    </Plegable>
  );
}
