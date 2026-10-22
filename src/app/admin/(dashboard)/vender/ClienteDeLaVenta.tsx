"use client";

// BLOQUE «CLIENTE» DE VENDER (Magra, tanda 1 · 1D; lo integra 1B detrás del interruptor
// `mostrador-boutique`). Nombre, teléfono y CUIT/DNI; escribir 3 caracteres en cualquiera de los
// tres busca la ficha del negocio por nombre, teléfono o documento (hasta 8). Al elegirla trae los
// datos para facturar, lo que debe, la última dirección y los últimos 3 pedidos. Los datos para
// facturar se dan de alta o se corrigen acá mismo, con el CUIT por dígito verificador (MG-015,
// MG-016, MG-019), y el tilde «Facturar al cobrar» sólo se deja tildar cuando la factura puede
// salir a su nombre (factura-del-mostrador.ts).
//
// CONTRATO con el formulario que lo contiene (lo lee `createOrder`/1B):
//   customerName · customerPhone        (los de siempre: el nombre y el teléfono de la venta)
//   clientId                            (la ficha elegida o recién guardada; vacío si no hay)
//   clienteDocumento                    (lo escrito en «CUIT/DNI», sólo informativo)
//   facturarAlCobrar=1                  (si el tilde está puesto y se puede)
// Y `onCambio` avisa cada cambio, para la zona de envío (última dirección) o «Repetir».

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Field, Input, Select, buttonClasses, cn, fmtCuit, fmtMoneyARS } from "@/components/ui";
import {
  buscarClientesParaVenta,
  consultarPadronParaVenta,
  guardarClienteDeLaVenta,
  traerClienteDeLaVenta,
  type ClienteElegido,
} from "@/lib/clientes/buscar-para-venta";
import {
  MINIMO_PARA_BUSCAR,
  leerDocumento,
  type CampoDelCliente,
  type ClienteEncontrado,
  type DocumentoEscrito,
} from "@/lib/clientes/buscar-para-venta-core";
import { OPCIONES_CONDICION_IVA, OPCIONES_DOCUMENTO } from "@/lib/fiscal/ficha-fiscal";
import { estadoFacturarAlCobrar, type DocumentoDeLaVenta } from "./factura-del-mostrador";

export type { ClienteElegido };

export interface ValorDelCliente {
  cliente: ClienteElegido | null;
  nombre: string;
  telefono: string;
  documento: DocumentoEscrito;
  facturarAlCobrar: boolean;
}

export interface ClienteDeLaVentaProps {
  /** «cliente» o, en una estética, «clienta». */
  quien?: "cliente" | "clienta";
  /** La regla de «Facturar» (app Facturación para este negocio y este rol). */
  puedeFacturar: boolean;
  /** ¿El rol tiene `billing:manage`? Sin él, la factura la hace el dueño (MG-018). */
  rolFactura: boolean;
  /** ¿Puede dar de alta o corregir fichas (`clients:manage`)? */
  puedeEditarFicha?: boolean;
  /** En un pedido el nombre es obligatorio. */
  nombreObligatorio?: boolean;
  inicial?: ClienteElegido | null;
  onCambio?(v: ValorDelCliente): void;
}

const NOMBRE_DOC: Readonly<Record<number, "CUIT" | "CUIL" | "DNI">> = { 80: "CUIT", 86: "CUIL", 96: "DNI" };
const ETIQUETA_CONDICION = new Map(OPCIONES_CONDICION_IVA.map((o) => [o.valor, o.etiqueta]));
const ESPERA_BUSQUEDA_MS = 250;

function isNextRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function documentoDeFicha(c: Pick<ClienteElegido, "docTipo" | "docNro">): string | null {
  if (!c.docNro || c.docTipo == null) return null;
  const nombre = NOMBRE_DOC[c.docTipo] ?? "Doc.";
  return nombre === "DNI" ? `DNI ${Number(c.docNro).toLocaleString("es-AR")}` : `${nombre} ${fmtCuit(c.docNro)}`;
}

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

type Campo = "nombre" | "telefono" | "documento";
type Busqueda = { estado: "nada" } | { estado: "buscando" } | { estado: "listo"; desde: Campo; filas: ClienteEncontrado[] } | { estado: "error" };

export default function ClienteDeLaVenta({
  quien = "cliente",
  puedeFacturar,
  rolFactura,
  puedeEditarFicha = false,
  nombreObligatorio = false,
  inicial = null,
  onCambio,
}: ClienteDeLaVentaProps) {
  const id = useId();
  const Rotulo = quien === "clienta" ? "Clienta" : "Cliente";
  const [elegido, setElegido] = useState<ClienteElegido | null>(inicial);
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [telefono, setTelefono] = useState(inicial?.telefono ?? "");
  const [docTexto, setDocTexto] = useState("");
  const [docTocado, setDocTocado] = useState(false);
  const [busqueda, setBusqueda] = useState<Busqueda>({ estado: "nada" });
  const [activa, setActiva] = useState(-1);
  const [trayendo, setTrayendo] = useState(false);
  const [editando, setEditando] = useState(false);
  const [facturar, setFacturar] = useState(false);
  const pedidoVigente = useRef(0);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  // El documento de la venta: el de la ficha elegida (guardado) o lo escrito (todavía no).
  const documento: DocumentoEscrito = useMemo(() => {
    if (elegido?.docNro && elegido.docTipo != null) {
      return { estado: "valido", docTipo: elegido.docTipo, docNro: elegido.docNro, texto: documentoDeFicha(elegido) ?? "" };
    }
    return leerDocumento(docTexto);
  }, [elegido, docTexto]);
  const docDeLaVenta: DocumentoDeLaVenta =
    documento.estado === "valido"
      ? { estado: "valido", enFicha: Boolean(elegido?.docNro), nombre: NOMBRE_DOC[documento.docTipo] }
      : documento.estado === "invalido"
        ? { estado: "invalido", motivo: documento.motivo }
        : { estado: "vacio" };
  const tilde = estadoFacturarAlCobrar({ puedeFacturar, rolFactura, documento: docDeLaVenta });
  const facturarAlCobrar = facturar && tilde.habilitado;

  useEffect(() => {
    onCambio?.({ cliente: elegido, nombre, telefono, documento, facturarAlCobrar });
    // `onCambio` puede cambiar en cada render del padre: se avisa por los datos, no por la función.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegido, nombre, telefono, documento, facturarAlCobrar]);

  useEffect(() => () => {
    if (espera.current) clearTimeout(espera.current);
  }, []);

  function buscar(desde: Campo, texto: string) {
    if (espera.current) clearTimeout(espera.current);
    const pedido = ++pedidoVigente.current;
    if (texto.replace(/\s/g, "").length < MINIMO_PARA_BUSCAR) {
      setBusqueda({ estado: "nada" });
      return;
    }
    espera.current = setTimeout(async () => {
      setBusqueda({ estado: "buscando" });
      try {
        const filas = await buscarClientesParaVenta(texto);
        if (pedido !== pedidoVigente.current) return; // llegó una respuesta vieja
        setBusqueda({ estado: "listo", desde, filas });
        setActiva(-1);
      } catch (e) {
        if (isNextRedirect(e)) throw e;
        if (pedido === pedidoVigente.current) setBusqueda({ estado: "error" });
      }
    }, ESPERA_BUSQUEDA_MS);
  }

  async function elegir(clientId: string) {
    pedidoVigente.current++;
    setTrayendo(true);
    try {
      const c = await traerClienteDeLaVenta(clientId);
      if (c) {
        setElegido(c);
        setNombre(c.nombre);
        setTelefono(c.telefono ?? "");
        setDocTexto("");
        setBusqueda({ estado: "nada" });
      } else {
        setBusqueda({ estado: "error" });
      }
    } catch (e) {
      if (isNextRedirect(e)) throw e;
      setBusqueda({ estado: "error" });
    } finally {
      setTrayendo(false);
    }
  }

  function otroCliente() {
    setElegido(null);
    setNombre("");
    setTelefono("");
    setDocTexto("");
    setDocTocado(false);
    setEditando(false);
    setFacturar(false);
    setBusqueda({ estado: "nada" });
  }

  const filas = busqueda.estado === "listo" ? busqueda.filas : [];
  const listaId = `${id}-lista`;
  const abierta = busqueda.estado === "listo" && !elegido;

  function teclado(campo: Campo) {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!abierta || busqueda.desde !== campo || filas.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiva((i) => (i + 1) % filas.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiva((i) => (i <= 0 ? filas.length - 1 : i - 1));
      } else if (e.key === "Enter" && activa >= 0) {
        e.preventDefault();
        void elegir(filas[activa].id);
      } else if (e.key === "Escape") {
        setBusqueda({ estado: "nada" });
      }
    };
  }

  const combo = (campo: Campo) => ({
    role: "combobox" as const,
    "aria-autocomplete": "list" as const,
    "aria-expanded": abierta && busqueda.desde === campo && filas.length > 0,
    "aria-controls": listaId,
    "aria-activedescendant": abierta && busqueda.desde === campo && activa >= 0 ? `${listaId}-${activa}` : undefined,
    onKeyDown: teclado(campo),
    autoComplete: "off",
  });

  const docError = !elegido && docTocado && documento.estado === "invalido" ? documento.motivo : undefined;

  return (
    <fieldset className="space-y-3 border-t border-line pt-4">
      <legend className="sr-only">{Rotulo}</legend>
      <input type="hidden" name="clientId" value={elegido?.id ?? ""} />

      {elegido ? (
        <>
          <input type="hidden" name="customerName" value={nombre} />
          <input type="hidden" name="customerPhone" value={telefono} />
          <FichaElegida c={elegido} Rotulo={Rotulo} />
          <div className="flex flex-wrap gap-2">
            {puedeEditarFicha && (
              <button type="button" className="chip-btn h-11 text-sm" aria-expanded={editando} onClick={() => setEditando((v) => !v)}>
                {elegido.docNro ? "Corregir datos para facturar" : "Cargar CUIT o DNI"}
              </button>
            )}
            <button type="button" className="chip-btn h-11 text-sm" onClick={otroCliente}>
              Otro {quien}
            </button>
          </div>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={`Nombre${nombreObligatorio ? "" : " (opcional)"}`} htmlFor={`${id}-nombre`} required={nombreObligatorio}>
            <Input
              id={`${id}-nombre`}
              name="customerName"
              required={nombreObligatorio}
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                buscar("nombre", e.target.value);
              }}
              placeholder="Nombre y apellido"
              className="min-h-11"
              {...combo("nombre")}
            />
          </Field>
          <Field label="Teléfono / WhatsApp" htmlFor={`${id}-tel`}>
            <Input
              id={`${id}-tel`}
              name="customerPhone"
              inputMode="tel"
              value={telefono}
              onChange={(e) => {
                setTelefono(e.target.value);
                buscar("telefono", e.target.value);
              }}
              placeholder="11…"
              className="min-h-11"
              {...combo("telefono")}
            />
          </Field>
          <Field
            label="CUIT o DNI"
            htmlFor={`${id}-doc`}
            error={docError}
            hint={documento.estado === "valido" ? documento.texto : "Sólo si pide factura a su nombre."}
          >
            <Input
              id={`${id}-doc`}
              name="clienteDocumento"
              inputMode="numeric"
              value={docTexto}
              aria-invalid={docError ? true : undefined}
              onChange={(e) => {
                setDocTexto(e.target.value);
                buscar("documento", e.target.value);
              }}
              onBlur={() => setDocTocado(true)}
              placeholder="27-12345678-0"
              className="min-h-11"
              {...combo("documento")}
            />
          </Field>
        </div>
      )}

      {!elegido && (
        <div aria-live="polite">
          {busqueda.estado === "buscando" && <p className="text-xs text-muted">Buscando…</p>}
          {trayendo && <p className="text-xs text-muted">Trayendo la ficha…</p>}
          {busqueda.estado === "error" && (
            <p role="alert" className="text-xs text-warning">
              No se pudo buscar ahora. Podés seguir: la venta se registra igual.
            </p>
          )}
          {busqueda.estado === "listo" && filas.length === 0 && (
            <p className="text-xs text-muted">
              No hay una ficha con eso.{puedeEditarFicha ? " Si querés, guardala con los datos de arriba." : ""}
            </p>
          )}
        </div>
      )}

      <ul id={listaId} role="listbox" aria-label="Fichas encontradas" hidden={!abierta || filas.length === 0} className="divide-y divide-line rounded-md border border-line bg-surface-raised">
        {filas.map((f, i) => {
          const doc = documentoDeFicha(f);
          return (
            <li
              key={f.id}
              id={`${listaId}-${i}`}
              role="option"
              aria-selected={i === activa}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void elegir(f.id)}
              className={cn("flex min-h-11 cursor-pointer flex-col justify-center px-3 py-2 text-sm", i === activa ? "bg-accent-soft" : "hover:bg-accent-soft")}
            >
              <span className="font-medium text-strong">{f.nombre}</span>
              <span className="text-xs text-muted">
                {[f.telefono, doc, f.razonSocial && f.razonSocial !== f.nombre ? f.razonSocial : null, f.condicionIva ? ETIQUETA_CONDICION.get(f.condicionIva) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          );
        })}
      </ul>

      {puedeEditarFicha &&
        (editando ||
          (!elegido && (documento.estado === "valido" || (busqueda.estado === "listo" && filas.length === 0 && nombre.trim() !== "")))) && (
        <DatosParaFacturar
          key={elegido?.id ?? `nuevo-${documento.estado === "valido" ? documento.docNro : ""}`}
          elegido={elegido}
          nombre={nombre}
          telefono={telefono}
          docInicial={elegido ? null : documento}
          abierto={editando}
          onAbrir={() => setEditando(true)}
          onElegirExistente={(cid) => {
            setEditando(false);
            void elegir(cid);
          }}
          onGuardado={(c) => {
            setElegido(c);
            setNombre(c.nombre);
            setTelefono(c.telefono ?? "");
            setDocTexto("");
            setEditando(false);
          }}
        />
      )}

      {tilde.habilitado || rolFactura ? (
        <div className="space-y-1">
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="facturarAlCobrar"
              value="1"
              className="size-5 accent-accent"
              checked={facturarAlCobrar}
              disabled={!tilde.habilitado}
              onChange={(e) => setFacturar(e.target.checked)}
              aria-describedby={tilde.motivo ? `${id}-tilde` : undefined}
            />
            <span className={tilde.habilitado ? "text-strong" : "text-muted"}>Facturar al cobrar</span>
          </label>
          {tilde.motivo && (
            <p id={`${id}-tilde`} className="text-xs text-muted">
              {tilde.motivo}
            </p>
          )}
        </div>
      ) : (
        // El Mostrador no factura: se le dice quién y que el CUIT ya quedó (MG-018).
        tilde.motivo && <p className="text-xs text-muted">{tilde.motivo}</p>
      )}
    </fieldset>
  );
}

function FichaElegida({ c, Rotulo }: { c: ClienteElegido; Rotulo: string }) {
  const doc = documentoDeFicha(c);
  return (
    <div role="status" className="space-y-1 rounded-md border border-line bg-surface-raised p-3 text-sm">
      <p className="font-medium text-strong">
        {Rotulo}: {c.nombre}
        {c.saldo != null && c.saldo > 0 && <span className="text-warning"> · debe {fmtMoneyARS(c.saldo)}</span>}
      </p>
      {(doc || c.condicionIva) && (
        <p className="text-muted">
          {[doc, c.razonSocial && c.razonSocial !== c.nombre ? c.razonSocial : null, c.condicionIva ? ETIQUETA_CONDICION.get(c.condicionIva) : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {c.telefono && <p className="text-muted">Tel. {c.telefono}</p>}
      {c.ultimaDireccion && <p className="text-muted">Última entrega: {c.ultimaDireccion}</p>}
      {c.ultimosPedidos.length > 0 && (
        <ul aria-label="Últimos pedidos" className="flex flex-wrap gap-2 pt-1">
          {c.ultimosPedidos.map((p) => (
            <li key={p.id} className="rounded-md border border-line px-2 py-1 text-xs text-muted">
              #{p.code} · {fechaCorta(p.fecha)} · {fmtMoneyARS(p.total)}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">La venta queda en su ficha.</p>
    </div>
  );
}

function DatosParaFacturar({
  elegido,
  nombre,
  telefono,
  docInicial,
  abierto,
  onAbrir,
  onGuardado,
  onElegirExistente,
}: {
  elegido: ClienteElegido | null;
  nombre: string;
  telefono: string;
  docInicial: DocumentoEscrito | null;
  abierto: boolean;
  onAbrir(): void;
  onGuardado(c: ClienteElegido): void;
  onElegirExistente(clientId: string): void;
}) {
  const id = useId();
  const tipoInicial = elegido?.docTipo ?? (docInicial?.estado === "valido" ? docInicial.docTipo : null);
  const nroInicial = elegido?.docNro ?? (docInicial?.estado === "valido" ? docInicial.docNro : "");
  const [docTipo, setDocTipo] = useState(tipoInicial == null ? "" : String(tipoInicial));
  const [docNro, setDocNro] = useState(nroInicial);
  const [razonSocial, setRazonSocial] = useState(elegido?.razonSocial ?? "");
  const [condicionIva, setCondicionIva] = useState(elegido?.condicionIva ?? "");
  const [domicilio, setDomicilio] = useState(elegido?.domicilio ?? "");
  const [padron, setPadron] = useState<"sin-consultar" | "consultando" | "sin-datos" | "completado">("sin-consultar");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<{ campo?: CampoDelCliente; texto: string; existenteId?: string } | null>(null);

  // Con un CUIT válido se consulta el padrón (gancho: hoy no trae nada y se completa a mano).
  const cuitParaPadron = (docTipo === "80" || docTipo === "86") && leerDocumento(docNro, Number(docTipo)).estado === "valido" ? docNro : null;
  useEffect(() => {
    if (!abierto || !cuitParaPadron || razonSocial) return;
    let vigente = true;
    setPadron("consultando");
    consultarPadronParaVenta(cuitParaPadron)
      .then((d) => {
        if (!vigente) return;
        if (!d) return setPadron("sin-datos");
        setRazonSocial(d.razonSocial);
        if (d.condicionIva) setCondicionIva(d.condicionIva);
        if (d.domicilio) setDomicilio(d.domicilio);
        setPadron("completado");
      })
      .catch((e) => {
        if (isNextRedirect(e)) throw e;
        if (vigente) setPadron("sin-datos");
      });
    return () => {
      vigente = false;
    };
    // Sólo cuando cambia el CUIT o se abre: completar la razón social no vuelve a consultar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, cuitParaPadron]);

  if (!abierto) {
    return (
      <button type="button" className={buttonClasses("outline", "sm")} onClick={onAbrir}>
        {docInicial?.estado === "valido" ? "Guardar ficha con este documento" : "Guardar ficha"}
      </button>
    );
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const r = await guardarClienteDeLaVenta({
        id: elegido?.id ?? null,
        nombre: elegido ? elegido.nombre : nombre,
        telefono: elegido ? elegido.telefono : telefono,
        docTipo,
        docNro,
        razonSocial,
        condicionIva,
        domicilio,
      });
      if (r.ok) onGuardado(r.cliente);
      else setError({ campo: r.campo, texto: r.error, existenteId: r.existenteId });
    } catch (e) {
      if (isNextRedirect(e)) throw e;
      setError({ texto: "No se pudo guardar. Revisá la conexión y probá de nuevo: lo que cargaste sigue acá." });
    } finally {
      setGuardando(false);
    }
  }

  const err = (campo: CampoDelCliente) => (error?.campo === campo ? error.texto : undefined);
  const tipoEsCuit = docTipo === "80" || docTipo === "86";

  return (
    <div role="group" aria-labelledby={`${id}-titulo`} className="space-y-3 rounded-md border border-line bg-surface-raised p-3">
      <p id={`${id}-titulo`} className="text-sm font-medium text-strong">
        Datos para facturar{elegido ? ` a ${elegido.nombre}` : nombre.trim() ? ` a ${nombre.trim()}` : ""}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Documento" htmlFor={`${id}-tipo`} error={err("docTipo")}>
          <Select id={`${id}-tipo`} value={docTipo} onChange={(e) => setDocTipo(e.target.value)} className="min-h-11">
            {OPCIONES_DOCUMENTO.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Número" htmlFor={`${id}-nro`} error={err("docNro")} hint="Con o sin guiones.">
          <Input id={`${id}-nro`} value={docNro} onChange={(e) => setDocNro(e.target.value)} inputMode="numeric" autoComplete="off" className="min-h-11" aria-invalid={err("docNro") ? true : undefined} />
        </Field>
        <Field
          label="Razón social"
          htmlFor={`${id}-razon`}
          error={err("razonSocial")}
          hint={
            padron === "consultando"
              ? "Consultando el padrón de ARCA…"
              : padron === "sin-datos" && tipoEsCuit
                ? "Sin consulta al padrón de ARCA todavía: copiala de la constancia de CUIT."
                : "Tal como figura en la constancia de CUIT."
          }
        >
          <Input id={`${id}-razon`} value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} maxLength={120} autoComplete="off" className="min-h-11" aria-invalid={err("razonSocial") ? true : undefined} />
        </Field>
        <Field label="Condición frente al IVA" htmlFor={`${id}-condicion`} error={err("condicionIva")}>
          <Select id={`${id}-condicion`} value={condicionIva} onChange={(e) => setCondicionIva(e.target.value)} className="min-h-11">
            {OPCIONES_CONDICION_IVA.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Domicilio fiscal" htmlFor={`${id}-domicilio`} error={err("domicilio")} hint="La Factura A lo lleva impreso: inscriptos y monotributistas lo necesitan.">
        <Input id={`${id}-domicilio`} value={domicilio} onChange={(e) => setDomicilio(e.target.value)} maxLength={200} autoComplete="off" className="min-h-11" />
      </Field>
      {error && !["docTipo", "docNro", "razonSocial", "condicionIva", "domicilio"].includes(error.campo ?? "") && (
        <p role="alert" className="text-xs text-danger">
          {error.texto}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClasses("solid", "md")} disabled={guardando} onClick={() => void guardar()}>
          {guardando ? "Guardando…" : "Guardar datos para facturar"}
        </button>
        {error?.existenteId && (
          <button type="button" className={buttonClasses("outline", "md")} onClick={() => onElegirExistente(error.existenteId!)}>
            Elegir esa ficha
          </button>
        )}
      </div>
    </div>
  );
}
