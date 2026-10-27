"use client";

// ============================================================================
// NUEVO PEDIDO DE WHATSAPP (Magra, tanda 2 · 2B · E08 · MG-051, MG-052, MG-053).
// ============================================================================
//
// Pegar el chat de la clienta → el lector (src/lib/pedidos/interpretar-whatsapp.ts, sin IA)
// propone el teléfono, el nombre, la franja y los renglones → quien atiende confirma CADA renglón
// (o lo corrige, o lo quita) → «Registrar pedido» → «Confirmar por WhatsApp».
//
// NADA SE REGISTRA SIN CONFIRMAR: el botón de registrar no se habilita mientras quede un renglón
// sin mirar, y dice qué falta. El pedido se graba con `createOrder` (el MISMO alta del mostrador:
// canal ONLINE, sin cobrar, clave de idempotencia, precios y stock decididos por el servidor). Los
// totales de esta pantalla son ESTIMADOS para mostrar; el que vale vuelve del servidor y es el que
// va en el WhatsApp.
//
// «Confirmar por WhatsApp» abre wa.me con el «te anotamos» (sin API paga, 1 a 1 desde el teléfono
// del que atiende) y deja constancia en la auditoría del pedido.
//
// Toques del caso de Ana (MG-051): abrir · pegar · «Está bien» ×2 · Registrar · Confirmar por
// WhatsApp = 6 (la franja ya viene elegida del chat).

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Badge, Field, Input, Select, Textarea, atributosBoton, buttonClasses, cn } from "@/components/ui";
import { createOrder, type OrderActionState } from "@/lib/order-actions";
import { buscarClientesParaVenta } from "@/lib/clientes/buscar-para-venta";
import { normalizarTelefono } from "@/lib/clientes/telefono";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { cantidadParaFormulario, leerCantidad } from "@/lib/pos-peso";
import type { ConfigEnvios } from "@/lib/envios/config";
import type { PosStockInfo } from "@/lib/stock/pos-stock-rules";
import {
  faltanteDelRenglon,
  franjaElegidaDeLaPropuesta,
  franjasParaElegir,
  horarioParaElFormulario,
  interpretarPedidoDeWhatsApp,
  mensajeDeConfirmacion,
  notaDelPedidoDeWhatsApp,
  pesos,
  textoDeCantidad,
  totalDelRenglon,
  type FranjaParaElegir,
  type ProductoDelCatalogo,
  type PropuestaDePedido,
  type RenglonPropuesto,
} from "@/lib/pedidos/interpretar-whatsapp";
import { registrarConfirmacionDeWhatsApp } from "./acciones-pedido-whatsapp";

export interface PedidoDesdeWhatsAppProps {
  productos: readonly ProductoDelCatalogo[];
  stockById: Readonly<Record<string, PosStockInfo>>;
  /** YYYY-MM-DD de hoy en el negocio (lo da el servidor). */
  hoy: string;
  negocio: string;
  /** La configuración de Envíos (franjas de retiro, zonas); null = sin zonas ni franjas. */
  envios: ConfigEnvios | null;
  /** ¿El negocio tiene el mostrador boutique? (decide si el faltante a futuro avisa o frena). */
  boutique: boolean;
  /** Montado por un toque en el botón (carga diferida, boutique/WhatsAppDiferido): arranca abierto. */
  abrirAlMontar?: boolean;
}

/** Un renglón en pantalla: lo que propuso el lector y lo que corrigió quien atiende. */
type Renglon = {
  key: string;
  propuesto: RenglonPropuesto | null;
  productId: string;
  cantidadTexto: string;
  confirmado: boolean;
  quitado: boolean;
};

type Ficha = { id: string; nombre: string };
type Resultado = { id: string; code: number; total: number; mensaje: string; wa: string | null };

const ABRIR_CON_HASH = "#whatsapp";

function suscribirHash(avisar: () => void): () => void {
  window.addEventListener("hashchange", avisar);
  return () => window.removeEventListener("hashchange", avisar);
}

function nuevaClave(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `w-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** «1155551234» → «11 5555-1234»; otra área, los diez dígitos con un espacio. */
function telefonoLindo(clave: string): string {
  if (clave.length !== 10) return clave;
  return clave.startsWith("11") ? `11 ${clave.slice(2, 6)}-${clave.slice(6)}` : `${clave.slice(0, 4)} ${clave.slice(4)}`;
}

function ahoraEnElNegocio(): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  } catch {
    return "00:00";
  }
}

function cantidadInicial(r: RenglonPropuesto): string {
  return r.cantidad === null ? "" : String(r.cantidad).replace(".", ",");
}

export default function PedidoDesdeWhatsApp({ productos, stockById, hoy, negocio, envios, boutique, abrirAlMontar = false }: PedidoDesdeWhatsAppProps) {
  const id = useId();
  // «Nuevo pedido de WhatsApp» desde la bandeja llega con #whatsapp: se abre solo. Lo que toque
  // la persona («Cerrar», la tecla) manda sobre el #.
  const porHash = useSyncExternalStore(suscribirHash, () => window.location.hash === ABRIR_CON_HASH, () => false);
  const [abiertoAMano, setAbierto] = useState<boolean | null>(abrirAlMontar ? true : null);
  const abierto = abiertoAMano ?? porHash;
  const [texto, setTexto] = useState("");
  const [propuesta, setPropuesta] = useState<PropuestaDePedido | null>(null);
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [telefono, setTelefono] = useState("");
  const [nombre, setNombre] = useState("");
  const [fichaLeida, setFichaLeida] = useState<{ clave: string; ficha: Ficha | null } | null>(null);
  const [fichaDescartada, setFichaDescartada] = useState<string | null>(null);
  const [entrega, setEntrega] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [zonaId, setZonaId] = useState("");
  const [direccion, setDireccion] = useState("");
  const [franjaId, setFranjaId] = useState<string | null>(null);
  const [otroHorario, setOtroHorario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const clave = useRef<string | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // El control del design system no reenvía `ref`: se enfoca por su id.
    if (abierto && !resultado) document.getElementById(`${id}-chat`)?.focus();
  }, [abierto, resultado, id]);

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const franjas = useMemo(
    () => franjasParaElegir({ hoy, ahoraHHmm: ahoraEnElNegocio(), franjasRetiro: envios?.franjasRetiro ?? [], propuesta: propuesta?.franja ?? null }),
    [hoy, envios, propuesta],
  );
  const zonas = envios?.zonas ?? [];

  function leerChat(t: string) {
    setTexto(t);
    setError(null);
    const p = t.trim() ? interpretarPedidoDeWhatsApp(t, productos, { hoy, negocio }) : null;
    setPropuesta(p);
    setRenglones(
      (p?.renglones ?? []).map((r) => ({
        key: r.id,
        propuesto: r,
        productId: r.productId ?? "",
        cantidadTexto: cantidadInicial(r),
        confirmado: false,
        quitado: false,
      })),
    );
    if (p?.telefono) setTelefono(telefonoLindo(p.telefono.clave));
    if (p?.nombre) setNombre(p.nombre);
    if (p?.entrega) setEntrega(p.entrega === "envio" ? "DELIVERY" : "PICKUP");
    if (p?.direccion) setDireccion(p.direccion);
    const chips = franjasParaElegir({ hoy, ahoraHHmm: ahoraEnElNegocio(), franjasRetiro: envios?.franjasRetiro ?? [], propuesta: p?.franja ?? null });
    const elegida = franjaElegidaDeLaPropuesta(chips, p?.franja ?? null);
    if (elegida) {
      setFranjaId(elegida.id);
      setOtroHorario("");
    }
  }

  // La ficha por el teléfono (MG-051 «propone la ficha de Ana»): una sola coincidencia por
  // teléfono se propone; «No es ella» la suelta. Nada se guarda en la ficha desde acá.
  const claveTel = normalizarTelefono(telefono);
  useEffect(() => {
    if (claveTel.length !== 10 || claveTel === fichaDescartada) return;
    let vigente = true;
    const t = setTimeout(() => {
      buscarClientesParaVenta(claveTel)
        .then((filas) => {
          if (!vigente) return;
          const porTel = filas.filter((f) => f.coincide === "telefono");
          setFichaLeida({ clave: claveTel, ficha: porTel.length === 1 ? { id: porTel[0].id, nombre: porTel[0].nombre } : null });
        })
        .catch(() => vigente && setFichaLeida({ clave: claveTel, ficha: null }));
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [claveTel, fichaDescartada]);
  // La ficha vale sólo para el teléfono que está escrito ahora y si no se dijo «No es ella».
  const ficha = fichaLeida && fichaLeida.clave === claveTel && claveTel !== fichaDescartada ? fichaLeida.ficha : null;

  const franja: FranjaParaElegir | null = franjas.find((f) => f.id === franjaId) ?? null;
  const horario = franja ? horarioParaElFormulario(franja.dia, franja.desde) : otroHorario;
  const diaDelPedido = horario ? horario.slice(0, 10) : null;
  const aFuturo = diaDelPedido !== null && diaDelPedido > hoy;
  const cuando = franja
    ? `${franja.texto} (${franja.horas})`
    : otroHorario
      ? `el ${otroHorario.slice(8, 10)}/${otroHorario.slice(5, 7)} a las ${otroHorario.slice(11, 16)}`
      : null;

  /** Lo que vale de cada renglón ahora (producto, cantidad leída, total, faltante). */
  const vista = renglones.map((r) => {
    const p = porId.get(r.productId) ?? null;
    const porPeso = p?.saleUnit === "WEIGHT";
    const lectura = leerCantidad(r.cantidadTexto);
    const cantidad = lectura.estado === "ok" && lectura.valor > 0 && (porPeso || Number.isInteger(lectura.valor)) ? lectura.valor : null;
    const precio = p ? (porPeso ? p.pricePerKg : p.price) : null;
    const faltante = p
      ? faltanteDelRenglon({ stock: stockById[p.id], cantidad, porPeso, nombre: p.name, aFuturo, prendido: boutique })
      : null;
    const problema = !p
      ? "Elegí el producto."
      : cantidad === null
        ? porPeso
          ? "Poné los kilos (por ejemplo 1,5)."
          : "Poné cuántas unidades (un número entero)."
        : faltante?.bloquea
          ? faltante.texto
          : null;
    return { r, p, porPeso, cantidad, precio, total: totalDelRenglon(cantidad, precio), faltante, problema };
  });
  const activos = vista.filter((v) => !v.r.quitado);
  const sinConfirmar = activos.filter((v) => !v.r.confirmado).length;
  const totalEstimado = activos.reduce((s, v) => s + (v.total ?? 0), 0);
  const zona = zonas.find((z) => z.id === zonaId) ?? null;

  const falta: string | null =
    activos.length === 0
      ? "Pegá el chat o agregá un producto."
      : sinConfirmar > 0
        ? sinConfirmar === 1
          ? "Confirmá el renglón que falta."
          : `Confirmá los ${sinConfirmar} renglones que faltan.`
        : claveTel.length !== 10
          ? "Falta el teléfono de la clienta (con característica)."
          : !nombre.trim() && !ficha
            ? "Falta el nombre."
            : !horario
              ? "Elegí para cuándo."
              : entrega === "DELIVERY" && zonas.length > 0 && !zona
                ? "Elegí la zona del envío."
                : entrega === "DELIVERY" && !direccion.trim()
                  ? "Falta la dirección del envío."
                  : null;

  function cambiar(key: string, cambio: Partial<Renglon>) {
    setRenglones((rs) => rs.map((r) => (r.key === key ? { ...r, confirmado: false, ...cambio } : r)));
  }

  function agregar(productId: string) {
    if (!productId) return;
    setRenglones((rs) => [...rs, { key: `m${Date.now()}`, propuesto: null, productId, cantidadTexto: "", confirmado: false, quitado: false }]);
  }

  async function registrar() {
    if (falta || enviando) return;
    setEnviando(true);
    setError(null);
    if (!clave.current) clave.current = nuevaClave();
    const confirmados = activos.filter((v) => v.p && v.cantidad !== null);
    const fd = new FormData();
    fd.set("channel", "ONLINE");
    fd.set("fulfillment", entrega);
    fd.set("customerName", (nombre.trim() || ficha?.nombre || "").slice(0, 120));
    fd.set("customerPhone", telefono.trim());
    if (ficha) fd.set("clientId", ficha.id);
    fd.set("scheduledFor", horario);
    if (entrega === "DELIVERY") {
      if (zona) fd.set("envioZona", zona.id);
      fd.set("address", direccion.trim());
    }
    fd.set(
      "notes",
      notaDelPedidoDeWhatsApp({
        franja: cuando,
        renglones: confirmados.map((v) => ({
          nombre: v.p!.name,
          aAjustar: Boolean(v.r.propuesto?.aAjustar && v.r.propuesto.productId === v.r.productId && v.porPeso),
          pidio: v.r.propuesto?.pidio ?? null,
          detalle: v.r.propuesto?.detalle ?? null,
        })),
      }),
    );
    for (const v of confirmados) {
      fd.append("productId", v.p!.id);
      fd.append("quantity", cantidadParaFormulario(v.cantidad!));
    }
    fd.set("idempotencyKey", clave.current);
    fd.set("conTicket", "1");
    let r: OrderActionState;
    try {
      r = await createOrder(fd);
    } catch {
      r = { ok: false, tipo: "sin-confirmar", error: "No pudimos confirmar si el pedido se registró. Tocá «Registrar pedido» de nuevo: con la misma carga no se anota dos veces." };
    }
    setEnviando(false);
    if (!r) return;
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const venta = r.venta;
    if (!venta) {
      setError("El pedido quedó registrado. Buscalo en Pedidos para preparar.");
      return;
    }
    // El mensaje con lo que QUEDÓ grabado (los renglones y el total de la base).
    const mensaje = mensajeDeConfirmacion({
      nombre: venta.cliente ?? (nombre.trim() || null),
      negocio,
      codigo: venta.code,
      cuando,
      entrega: entrega === "DELIVERY" ? "envio" : "retiro",
      // El renglón del envío no va en la lista (su costo sí va en el total).
      renglones: venta.lineas
        .filter((l) => !l.envio)
        .map((l) => {
          const v = confirmados.find((x) => x.p!.name === l.nombre);
          return {
            nombre: l.nombre,
            cantidad: l.cantidad,
            unidad: l.porPeso ? ("kg" as const) : ("u" as const),
            aAjustar: Boolean(v && v.porPeso && v.r.propuesto?.aAjustar && v.r.propuesto.productId === v.r.productId),
            pidio: v?.r.propuesto?.pidio ?? null,
          };
        }),
      total: venta.total,
    });
    setResultado({ id: venta.id, code: venta.code, total: venta.total, mensaje, wa: waLinkClienta(telefono, mensaje) });
    clave.current = null;
    requestAnimationFrame(() => titulo.current?.focus());
  }

  function empezarOtro() {
    setTexto("");
    setPropuesta(null);
    setRenglones([]);
    setTelefono("");
    setNombre("");
    setFichaLeida(null);
    setFichaDescartada(null);
    setEntrega("PICKUP");
    setZonaId("");
    setDireccion("");
    setFranjaId(null);
    setOtroHorario("");
    setError(null);
    setResultado(null);
    setConfirmado(false);
    clave.current = null;
  }

  if (!abierto) {
    return (
      <div id="whatsapp" className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setAbierto(true)} className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
          Nuevo pedido de WhatsApp
        </button>
        <span className="text-sm text-muted">Pegá el chat de la clienta y lo armamos.</span>
      </div>
    );
  }

  if (resultado) {
    return (
      <section id="whatsapp" aria-labelledby={`${id}-ok`} className="rounded-lg border border-line bg-surface-raised p-4">
        <h2 id={`${id}-ok`} ref={titulo} tabIndex={-1} className="text-lg font-semibold text-strong focus:outline-none">
          Pedido #{resultado.code} anotado
        </h2>
        <p role="status" className="mt-1 text-sm text-body">
          Total estimado <strong className="text-strong">{pesos(resultado.total)}</strong>
          {cuando ? ` · ${cuando}` : ""}. Se ajusta cuando lo pesás al armarlo.
        </p>
        <p className="mt-3 rounded-md bg-surface-sunken p-3 text-sm text-body">{resultado.mensaje}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {resultado.wa ? (
            <a
              href={resultado.wa}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setConfirmado(true);
                void registrarConfirmacionDeWhatsApp(resultado.id).catch(() => undefined);
              }}
              className={cn(buttonClasses(confirmado ? "outline" : "solid", "md"), "max-sm:h-12 max-sm:w-full max-sm:text-base")}
              {...atributosBoton(confirmado ? "outline" : "solid", "md")}
            >
              {confirmado ? "Confirmar por WhatsApp de nuevo" : "Confirmar por WhatsApp"}
            </a>
          ) : (
            <p role="alert" className="text-sm text-danger">
              El teléfono no es un celular argentino de 10 cifras: no se puede abrir WhatsApp. Avisale por otro lado.
            </p>
          )}
          <Link href="/admin/pedidos" className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
            Ver en Pedidos
          </Link>
          <button type="button" onClick={empezarOtro} className={buttonClasses("ghost", "md")} {...atributosBoton("ghost", "md")}>
            Otro pedido de WhatsApp
          </button>
        </div>
      </section>
    );
  }

  return (
    <section id="whatsapp" aria-labelledby={`${id}-titulo`} className="space-y-4 rounded-lg border border-line bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-titulo`} className="text-lg font-semibold text-strong">
            Nuevo pedido de WhatsApp
          </h2>
          <p className="text-sm text-muted">Nada se anota hasta que confirmes cada renglón y toques «Registrar pedido».</p>
        </div>
        <button type="button" onClick={() => setAbierto(false)} className={buttonClasses("ghost", "sm")} {...atributosBoton("ghost", "sm")}>
          Cerrar
        </button>
      </div>

      <Field label="Pegá el mensaje de la clienta" htmlFor={`${id}-chat`}>
        <Textarea
          id={`${id}-chat`}
          value={texto}
          onChange={(e) => leerChat(e.target.value)}
          rows={4}
          placeholder="hola, soy Ana 11 5555-1234, para mañana a la tarde 2 kg de vacío y 6 chorizos"
        />
      </Field>

      {(propuesta || renglones.length > 0) && (
        <>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-strong">Clienta</legend>
            <Field label="Teléfono" htmlFor={`${id}-tel`} hint={propuesta?.telefono?.conAreaSupuesta ? "Vino sin característica: le puse 11. Revisalo." : undefined}>
              <Input id={`${id}-tel`} type="tel" inputMode="tel" autoComplete="off" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="11 5555-1234" />
            </Field>
            <Field label="Nombre" htmlFor={`${id}-nombre`}>
              <Input id={`${id}-nombre`} autoComplete="off" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={ficha?.nombre ?? "Ana"} />
            </Field>
            {ficha && (
              <p role="status" className="text-sm text-body sm:col-span-2">
                Es <strong className="text-strong">{ficha.nombre}</strong>: ya tiene ficha y el pedido queda en su historial.{" "}
                <button type="button" className="font-medium text-accent-ink underline" onClick={() => setFichaDescartada(claveTel)}>
                  No es ella
                </button>
              </p>
            )}
          </fieldset>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-strong">Lo que pidió</h3>
            {renglones.length === 0 && <p className="text-sm text-muted">No reconocí ningún producto en el chat. Agregalos abajo.</p>}
            <ul className="space-y-3">
              {vista.map((v) => (
                <RenglonEditable
                  key={v.r.key}
                  idBase={`${id}-${v.r.key}`}
                  v={v}
                  productos={productos}
                  onProducto={(productId) => cambiar(v.r.key, { productId })}
                  onCantidad={(cantidadTexto) => cambiar(v.r.key, { cantidadTexto })}
                  onConfirmar={() => setRenglones((rs) => rs.map((r) => (r.key === v.r.key ? { ...r, confirmado: true } : r)))}
                  onQuitar={() => setRenglones((rs) => rs.map((r) => (r.key === v.r.key ? { ...r, quitado: !r.quitado, confirmado: false } : r)))}
                />
              ))}
            </ul>
            {propuesta && propuesta.sinReconocer.length > 0 && (
              <p className="rounded-md border border-warning/40 bg-warning-soft/40 p-3 text-sm text-body">
                No lo reconocí: {propuesta.sinReconocer.map((s) => `«${s}»`).join(", ")}. Si lo vendés, agregalo abajo.
              </p>
            )}
            <Field label="Agregar un producto" htmlFor={`${id}-agregar`}>
              <Select
                id={`${id}-agregar`}
                value=""
                onChange={(e) => {
                  agregar(e.target.value);
                  e.target.value = "";
                }}
              >
                <option value="">Elegí para sumar un renglón…</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-strong">¿Para cuándo?</legend>
            <div className="flex flex-wrap gap-2">
              {franjas.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={franjaId === f.id}
                  onClick={() => {
                    setFranjaId(f.id);
                    setOtroHorario("");
                  }}
                  className={cn(buttonClasses(franjaId === f.id ? "solid" : "outline", "sm"), "flex-col gap-0 py-1 sm:h-auto")}
                >
                  <span>{f.texto}</span>
                  <span className="text-xs font-normal opacity-80">{f.horas}</span>
                </button>
              ))}
            </div>
            <Field label="Otro día y hora" htmlFor={`${id}-otro`} className="mt-3 max-w-xs">
              <Input
                id={`${id}-otro`}
                type="datetime-local"
                min={`${hoy}T00:00`}
                value={otroHorario}
                onChange={(e) => {
                  setOtroHorario(e.target.value);
                  if (e.target.value) setFranjaId(null);
                }}
              />
            </Field>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold text-strong">Entrega</legend>
            <div className="flex flex-wrap gap-2">
              {(["PICKUP", "DELIVERY"] as const).map((e) => (
                <button key={e} type="button" aria-pressed={entrega === e} onClick={() => setEntrega(e)} className={buttonClasses(entrega === e ? "solid" : "outline", "sm")}>
                  {e === "PICKUP" ? "Retira en el local" : "Envío a domicilio"}
                </button>
              ))}
            </div>
            {entrega === "DELIVERY" && (
              <div className="grid gap-3 sm:grid-cols-2">
                {zonas.length > 0 && (
                  <Field label="Zona del envío" htmlFor={`${id}-zona`} hint="El costo lo suma el sistema según la zona.">
                    <Select id={`${id}-zona`} value={zonaId} onChange={(e) => setZonaId(e.target.value)}>
                      <option value="">Elegí la zona…</option>
                      {zonas.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.nombre}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field label="Dirección" htmlFor={`${id}-dir`}>
                  <Input id={`${id}-dir`} autoComplete="off" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle, número, barrio" />
                </Field>
              </div>
            )}
          </fieldset>

          <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-body">
              Total estimado <strong className="text-lg text-strong">{pesos(Math.round(totalEstimado * 100) / 100)}</strong>
              {entrega === "DELIVERY" && zona ? " + envío" : ""}
            </p>
            <div className="flex flex-col items-stretch gap-1 sm:items-end">
              <button
                type="button"
                onClick={registrar}
                disabled={Boolean(falta) || enviando}
                aria-describedby={falta ? `${id}-falta` : undefined}
                className={cn(buttonClasses("solid", "lg"), "max-sm:w-full")}
                {...atributosBoton("solid", "lg")}
              >
                {enviando ? "Registrando…" : "Registrar pedido"}
              </button>
              {falta && (
                <p id={`${id}-falta`} className="text-sm text-muted">
                  {falta}
                </p>
              )}
            </div>
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-danger/40 bg-danger-soft/40 p-3 text-sm text-danger">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}

type Vista = {
  r: Renglon;
  p: ProductoDelCatalogo | null;
  porPeso: boolean;
  cantidad: number | null;
  precio: number | null;
  total: number | null;
  faltante: { bloquea: boolean; texto: string } | null;
  problema: string | null;
};

function RenglonEditable({
  idBase,
  v,
  productos,
  onProducto,
  onCantidad,
  onConfirmar,
  onQuitar,
}: {
  idBase: string;
  v: Vista;
  productos: readonly ProductoDelCatalogo[];
  onProducto(id: string): void;
  onCantidad(t: string): void;
  onConfirmar(): void;
  onQuitar(): void;
}) {
  const { r, p, porPeso } = v;
  const prop = r.propuesto;
  const mismaPropuesta = prop && prop.productId === r.productId;
  const aAjustar = Boolean(mismaPropuesta && prop.aAjustar && porPeso);
  if (r.quitado) {
    return (
      <li className="flex items-center justify-between gap-3 rounded-md border border-dashed border-line p-3 text-sm text-muted">
        <span>
          Quitado{prop ? `: «${prop.texto}»` : p ? `: ${p.name}` : ""}
        </span>
        <button type="button" onClick={onQuitar} className={buttonClasses("ghost", "sm")}>
          Volver a poner
        </button>
      </li>
    );
  }
  return (
    <li className={cn("rounded-md border p-3", r.confirmado ? "border-success/50 bg-success-soft/30" : "border-line-strong")}>
      {prop && (
        <p className="mb-2 text-sm text-muted">
          Escribió: <q className="text-body">{prop.texto}</q>
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <Field label="Producto" htmlFor={`${idBase}-p`}>
          <Select id={`${idBase}-p`} value={r.productId} onChange={(e) => onProducto(e.target.value)}>
            <option value="">Elegí…</option>
            {productos.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={porPeso ? "Kilos" : "Unidades"} htmlFor={`${idBase}-c`}>
          <Input
            id={`${idBase}-c`}
            inputMode="decimal"
            autoComplete="off"
            value={r.cantidadTexto}
            onChange={(e) => onCantidad(e.target.value)}
            aria-invalid={v.cantidad === null && r.cantidadTexto !== "" ? true : undefined}
          />
        </Field>
        <p className="text-sm text-body sm:pb-3">
          {v.total !== null ? (
            <>
              {aAjustar ? "≈ " : ""}
              <strong className="text-strong">{pesos(v.total)}</strong>
            </>
          ) : (
            "—"
          )}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {aAjustar && <Badge tone="warning">A ajustar al pesar{prop?.pidio ? ` · pidió ${prop.pidio}` : ""}</Badge>}
        {v.cantidad !== null && p && (
          <span className="text-xs text-muted">
            {textoDeCantidad(v.cantidad, porPeso ? "kg" : "u")} × {v.precio ? pesos(v.precio) : "sin precio"}
            {porPeso ? "/kg" : ""}
          </span>
        )}
        {prop?.detalle && <span className="text-xs text-muted">· {prop.detalle}</span>}
      </div>
      {mismaPropuesta && prop.dudas.length > 0 && !r.confirmado && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-warning">
          {prop.dudas.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      {v.faltante && (
        <p role={v.faltante.bloquea ? "alert" : "status"} className={cn("mt-2 text-sm", v.faltante.bloquea ? "text-danger" : "text-warning")}>
          {v.faltante.texto}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {r.confirmado ? (
          <p className="text-sm font-medium text-success" role="status">
            ✓ Confirmado
          </p>
        ) : (
          <button
            type="button"
            onClick={onConfirmar}
            disabled={v.problema !== null}
            aria-describedby={v.problema ? `${idBase}-falta` : undefined}
            className={buttonClasses("solid", "sm")}
            {...atributosBoton("solid", "sm")}
          >
            Está bien
          </button>
        )}
        <button type="button" onClick={onQuitar} className={buttonClasses("ghost", "sm")} {...atributosBoton("ghost", "sm")}>
          Quitar
        </button>
        {v.problema && !r.confirmado && (
          <span id={`${idBase}-falta`} className="self-center text-sm text-muted">
            {v.problema}
          </span>
        )}
      </div>
    </li>
  );
}
