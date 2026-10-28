"use client";

// EL NÚCLEO DE LA VENTA (Magra · tanda practicidad, V-6): el estado, las reglas, la firma, la
// idempotencia y la duda sin señal del mostrador, en UN hook que comparten las dos vistas:
//   · VenderForm.tsx — las vistas de siempre (CH y todo negocio con el interruptor apagado);
//   · boutique/VenderBoutique.tsx — el mostrador boutique (interruptor `mostrador-boutique`).
// Partido así, el JS del boutique no lleva las vistas de siempre y el de CH no lleva el boutique.
// Es el MISMO código que vivía en VenderForm (movido, no reescrito): la venta no cambia.
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import { createOrder, facturarVenta } from "@/lib/order-actions";
import { AvisoError, Input, buttonClasses, cn, fmtMoneyARS, type OpcionBuscador } from "@/components/ui";
import { useDiseno } from "@/lib/diseno/DisenoProvider";
import { faltanteDeLinea, type PosStockInfo } from "@/lib/stock/pos-stock-rules";
import { MEDIOS_DE_COBRO, leerMedioDeCobro, type MedioDeCobro } from "@/lib/caja/medio-cobro";
import type { VentaYaGrabada } from "@/lib/reintento-de-venta";
import { leerCantidad, confirmacionDePeso, pesoPorConfirmar, motivoDePesoSinConfirmar, formatearCantidad, importeOCero, importeParaFormulario, leerImporte } from "@/lib/pos-peso";
import { textoDelFaltante, type Faltante } from "@/lib/reintento-de-venta";
import { round2 } from "@/lib/round";
import TicketVenta from "./TicketVenta";
import type { ClienteElegido, ValorDelCliente } from "./ClienteDeLaVenta";
import { useLlamadaEstable, usePrecargaDelCliente } from "./boutique/perezosos";
import type { RepetirPedido } from "@/lib/clientes/fiado";
import { ID_CAMPO_UNICO } from "@/components/lector/CampoUnico";
import { cotizarEnvioDelMostrador, tieneZonas } from "@/lib/envios/tarifa";
import type { ConfigEnvios } from "@/lib/envios/modelo";
import { usePerfilSiHayTerminal, type TerminalDelEquipo } from "@/lib/terminal/usar-perfil";
import { enCampoDeTexto, enCampoEditable, esCampoDeCantidad, motivoParaNoSumar } from "@/lib/terminal/lector-core";
import { useLectorDeRafaga, type OrigenDeLaLectura } from "@/lib/terminal/usar-lector";
import { avisar } from "@/lib/terminal/senal";
import { indexarPorCodigo, resolverCodigo } from "@/lib/supermercado/lectura";
import FacturarVenta from "../ventas/FacturarVenta";
import { SIN_FACTURA, type FacturaDeVenta } from "../ventas/factura";
import { useCuponDePedido } from "@/app/tienda/pedido-online";
import { aplicarDescuento, controlarPrecioAMano, descuentoDelFormulario, lineaSinCantidad as primeraLineaSinCantidad, motivoDeLineaSinCantidad, validarLineaAMano, type ResultadoDescuento, type TipoDescuento, type TopePrecioAMano, type VentaTicket, sumarUnaUnidad, teclaDeProducto, vueltoDelTicket, type BalanzaDeVender, DESHACER_MS, MOTIVOS_PRECIO_A_MANO, avisoDeCambioDePrecio, cambiosDePrecio, gondolasDelMostrador, teclasPrincipales, lineasDesdeLaFicha, avisoDeRepetir, type CambioDePrecio, type RenglonQuitado } from "./reglas-venta";
import { cobrarDelMostrador, fijarTeclasDelMostrador, preciosVigentesDelTicket, type PrecioVigente } from "./acciones-del-mostrador";
import { avisoDePrecioAlSumar, camposDePreciosVistos, debeControlarPrecio, sinLosQueNoSeVenden } from "./boutique/precio-del-renglon";
import type { TeclasDelMostrador } from "./teclas.server";
import { almacenDeSesion, antesDeCobrar, avisoDelCobro, avisoDeYaGrabada, borrarCobroSinConfirmar, cambioDespuesDelCorte, claveParaCobrar, conTiempoMaximo, avisoAntesDeEmpezarDeNuevo, avisoDeDudaDeOtraPersona, avisoDeDudaIlegible, avisoDeGrabadaAhoraPorOtroTotal, cuandoDelEnvio, ETIQUETA_DEJARLA_ASI, ETIQUETA_VOLVER_A_CONSULTAR, etiquetaDeCobrarAparte, etiquetaDeOtraVenta, etiquetaDeVerGrabada, firmaDelCobro, guardarCobroSinConfirmar, leerCobroSinConfirmar, recordarEnvioSinRespuesta, renovarClaveTrasRechazo, TIEMPO_MAXIMO_DEL_COBRO_MS, type CargadoDelCobro, type EnvioSinRespuesta } from "./cobro-sin-conexion";


export type SellableProduct = {
  id: string;
  name: string;
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
  unit: string;
  /** Código de barras o PLU de la balanza; sólo viaja con el módulo `terminal` o la balanza configurada. */
  codigo?: string | null;
};

/** Una línea del ticket: el producto y lo TIPEADO (texto, no número: ver PosForm). */
export type Line = {
  key: number;
  productId: string;
  qtyText: string;
  /**
   * Mostrador boutique (MG-023): el importe que IMPRIMIÓ la balanza en la etiqueta, si no coincide
   * con el del sistema. El renglón cobra el del sistema y lo deja escrito; al tocar el peso a mano
   * se borra (ya no es la etiqueta).
   */
  etiqueta?: number;
};

/** La preferencia del teclado grande en este navegador (sólo comodidad: si falta, cerrado). */
export const PREF_TECLADO = "vender:teclado-grande";
export function prefiereTeclado(): boolean {
  try {
    return window.localStorage.getItem(PREF_TECLADO) === "1";
  } catch {
    return false;
  }
}

/**
 * La pregunta del peso implausible, con sus dos respuestas (UAT MAGRA 16/10). Mientras está
 * `pendiente`, el cobro está frenado; respondida, queda la constancia de lo confirmado.
 */
export function ConfirmarPeso({
  confirmacion,
  pendiente,
  alConfirmar,
  alCorregir,
  className,
  "data-parte": parte,
}: {
  confirmacion: { pregunta: string; confirmar: string; corregir: string };
  pendiente: boolean;
  alConfirmar: () => void;
  alCorregir: () => void;
  className?: string;
  "data-parte"?: string;
}) {
  if (!pendiente) {
    return (
      <p data-parte={parte} data-vender="peso-confirmado" className={cn("text-xs text-muted", className)}>
        {confirmacion.confirmar}: confirmado.
      </p>
    );
  }
  return (
    <div
      role="alert"
      data-parte={parte}
      data-vender="confirmar-peso"
      className={cn("grid gap-2 rounded-md border border-warning bg-warning-soft p-2 text-sm text-strong", className)}
    >
      <p className="font-semibold">{confirmacion.pregunta}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClasses("solid", "md")} onClick={alCorregir}>
          {confirmacion.corregir}
        </button>
        <button type="button" className={buttonClasses("outline", "md")} onClick={alConfirmar}>
          {confirmacion.confirmar}
        </button>
      </div>
    </div>
  );
}

export const ID_CAMPO_ETIQUETA = "vender-etiqueta";

/** Lo que suma el mostrador boutique (interruptor `mostrador-boutique`); lo arma MostradorDeVenta. */
export type BoutiqueDeVender = {
  /** Zonas de envío del negocio (src/lib/envios); null = no se pudo leer: el pedido sigue sin zonas. */
  envios: ConfigEnvios | null;
  /** Hasta qué día está cerrada la caja, si hoy está cerrado; null = hoy se cobra. */
  diaCerrado: string | null;
  /** ¿El rol tiene `billing:manage`? Sin él, la factura la hace el dueño (MG-018). */
  rolFactura: boolean;
  /** ¿Puede dar de alta o corregir fichas (`clients:manage`)? */
  puedeEditarFicha: boolean;
  /**
   * Tanda 2 · 2A: las teclas que fijó el dueño, si puede fijarlas y la góndola explícita de cada
   * producto (`cargarTeclasDelMostrador`, teclas.server.ts). Sin esto, las teclas de siempre en la
   * pestaña principal y las góndolas sacadas del nombre.
   */
  teclas?: TeclasDelMostrador | null;
  /**
   * Tanda 2 · 2D: «Venderle» / «Repetir» desde la ficha (`pedidoDeVentaDesdeLaFicha`). El ticket
   * arranca con el cliente elegido y, con `repetir`, sus renglones (lo por kilo sin peso). Un cobro
   * sin confirmar en la pestaña gana: se restaura ése y esto no se aplica.
   */
  desdeLaFicha?: { cliente: ClienteElegido; repetir: RepetirPedido | null } | null;
  /**
   * Tanda practicidad (V-1): la fila de atajos (caja, cuaderno, pedido de WhatsApp) que arma
   * MostradorBoutique; va debajo del buscador y las teclas.
   */
  atajos?: ReactNode;
};

/** Una línea con precio a mano: nombre, importe tipeado y motivo. */
export type LineaManual = { key: number; nombre: string; importeText: string; motivo: string };

export function nuevaClaveDeTicket(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function precioDe(p: SellableProduct): number {
  return (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0;
}

// El redirect de sesión vencida llega como excepción con digest NEXT_REDIRECT: tragarlo
// dejaría a la persona sin login (el mismo helper que PosForm y los formularios de la bandeja).
export function isNextRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/** Lo que no salió en el último intento de cobro. El texto se arma al mostrarlo (según la señal de AHORA). */
// Lo que se mandó sin respuesta (su firma y su total) NO va acá: se guarda aparte, porque el
// intento siguiente pisa la falla y la duda sigue (cobro-sin-conexion.ts, "Lo que se mandó y no
// tuvo respuesta").
export type Falla = { tipo: "sin-senal" } | { tipo: "red" } | { tipo: "rechazo"; error: string };

export type PropsDeVender = {
  products: SellableProduct[];
  stockById: Record<string, PosStockInfo>;
  /** Ids de los más vendidos (hasta 8), ya filtrados a lo que hoy se puede vender. */
  rapidos: string[];
  /** Rótulo de las teclas en el diseño nuevo («Tus productos» mientras se completan con el catálogo). */
  rotuloRapidos?: string;
  /** Nombre del negocio para el encabezado del ticket. */
  negocio: string;
  /** Tope de descuento de quien vende, en %. null = sin tope (la dueña o el dueño). */
  topeDescuentoPct: number | null;
  /** Abrir en «Pedido» (el «Tomar un pedido» de la bandeja vacía llega con `?modo=pedido`). */
  pedidoInicial?: boolean;
  /**
   * ¿Se ofrece «A cuenta»? Sólo con cuentas corrientes encendidas y la app Cuentas a cobrar
   * habilitada para quien vende (lo decide la página; el servidor lo vuelve a exigir).
   */
  aCuentaDisponible?: boolean;
  /** ¿Se ofrece «Facturar» en la venta recién cobrada? (billing:manage y la app Facturación). */
  puedeFacturar?: boolean;
  /**
   * Lo que se dice de la factura debajo de la venta cobrada: a quién sale por defecto, o por qué no
   * se ofrece «Facturar» (factura-del-mostrador.ts). Sin esto, como siempre.
   */
  factura?: { receptor: string; sinFactura: string | null };
  /** Tope del precio a mano de quien vende (null = sin tope). La misma regla que el servidor. */
  topePrecioAMano?: TopePrecioAMano | null;
  /** El negocio (su id): separa en el almacén de la pestaña el cobro sin confirmar de cada uno. */
  negocioId?: string;
  /** Quién vende (su id): la duda guardada de otra persona no se restaura. */
  usuarioId?: string;
  /** Diseño nuevo: el nombre de quien vende, en la cabeza del ticket. */
  vendedor?: string;
  /** Diseño nuevo: cómo llama el rubro a lo que vende («corte» en una carnicería), para el buscador. */
  sustantivo?: string;
  /** Cómo se nombra a quien compra: «cliente» o, en una estética, «clienta». */
  quienCompra?: "cliente" | "clienta";
  /** Un negocio que no vende por peso (servicios y reventa) no ofrece «Tomar peso». */
  conPeso?: boolean;
  /**
   * El campo «Etiqueta de la balanza o código» y el formato de la balanza del negocio. Sólo lo
   * manda la página en un negocio de mostrador; sin esto (CH), la pantalla de siempre.
   */
  balanza?: BalanzaDeVender | null;
  /** El equipo y la persona, si el negocio tiene el módulo `terminal` (lo decide el servidor). */
  terminal?: TerminalDelEquipo | null;
  /**
   * El MOSTRADOR BOUTIQUE (interruptor `mostrador-boutique`, Magra): pie de cobro único, campo
   * único, teclas con precio y stock, cliente con CUIT, zona de envío y banda del día cerrado. Sin
   * esto (CH y todo negocio con el interruptor apagado), la pantalla de siempre.
   */
  boutique?: BoutiqueDeVender | null;
  /**
   * Las zonas de envío del negocio para el Vender de siempre (comercio sin el interruptor). Con
   * zonas, el pedido con envío pide la zona (el servidor la exige). Sin esto, como siempre.
   */
  envios?: ConfigEnvios | null;
};

export const sinSuscripcion = () => () => {};

/**
 * Las líneas con las que arranca el formulario: las de un cobro sin confirmar, las del pedido que
 * se repite desde la ficha (boutique), o una vacía.
 */
export function lineasIniciales(
  k: CargadoDelCobro | undefined,
  repetidas: readonly { productId: string; qtyText: string }[] = [],
): { lines: Line[]; manuales: LineaManual[]; nextKey: number } {
  let n = 1;
  const desde = k?.lineas?.length ? k.lineas : k ? [] : repetidas;
  const lines: Line[] = desde.map((l) => ({ key: n++, productId: l.productId, qtyText: l.qtyText }));
  if (lines.length === 0) lines.push({ key: n++, productId: "", qtyText: "" });
  const manuales = (k?.manuales ?? []).map((m) => ({ key: n++, nombre: m.nombre, importeText: m.importeText, motivo: m.motivo }));
  return { lines, manuales, nextKey: n };
}

export function useNucleoDeVenta({ products: productosDeLaPagina,
  stockById,
  rapidos,
  rotuloRapidos = "Más vendidos",
  negocio,
  topeDescuentoPct,
  pedidoInicial = false,
  aCuentaDisponible = false,
  puedeFacturar = false,
  factura,
  topePrecioAMano = null,
  negocioId = "",
  usuarioId = "",
  vendedor,
  sustantivo = "producto",
  quienCompra = "cliente",
  conPeso = true,
  balanza = null,
  terminal = null,
  boutique = null,
  envios = null,
  enNavegador, }: PropsDeVender & { enNavegador: boolean }) {
  // «Subió a $X recién» (MG-048, sólo el boutique): el precio de HOY de los productos cuyo precio
  // cambió con el ticket abierto (lo leyó el control al sumar el renglón, o lo devolvió el cobro). Pisa al de la página en
  // TODA la pantalla (renglones, teclas, total): lo que se ve es lo que se cobra.
  const [preciosNuevos, setPreciosNuevos] = useState<Record<string, PrecioVigente>>({});
  const products = useMemo(
    () =>
      Object.keys(preciosNuevos).length === 0
        ? productosDeLaPagina
        : productosDeLaPagina.map((p) => (preciosNuevos[p.id] ? { ...p, ...preciosNuevos[p.id] } : p)),
    [productosDeLaPagina, preciosNuevos],
  );
  // El perfil de este equipo, o `null` sin el módulo `terminal`: entonces todo es como siempre.
  const perfil = usePerfilSiHayTerminal(terminal);
  // Diseño nuevo («Renglón»): la MISMA venta (estado, reglas, envío) dibujada como el ticket que
  // crece (vistaTicket, abajo). Apagado, la pantalla de siempre.
  const nuevo = useDiseno();
  // Un cobro que quedó sin confirmar en esta pestaña (se recargó, se volvió de otra pantalla, el
  // celular descartó la pestaña al ir a la app de MP): el formulario arranca con lo cargado, su
  // clave y el aviso. Se lee una sola vez, al armar el formulario.
  const almacen = negocioId || negocio;
  const [lectura] = useState(() =>
    enNavegador ? leerCobroSinConfirmar(almacenDeSesion(), almacen, { usuario: usuarioId, ahora: Date.now() }) : null,
  );
  const arranque = lectura?.tipo === "propia" ? lectura.cobro : null;
  // La duda que dejó OTRA persona en esta pestaña: no se restaura (ni su cliente ni lo cargado);
  // sólo se avisa, con la fecha, hasta que se toque «Entendido».
  const [dudaAjena, setDudaAjena] = useState(lectura?.tipo === "de-otra-persona" ? lectura.desde : null);
  // Una duda guardada que no se puede leer entera: no se inventa lo cargado, pero se avisa.
  const [dudaIlegible, setDudaIlegible] = useState(lectura?.tipo === "ilegible" ? { desde: lectura.desde } : null);
  const k = arranque?.cargado;
  // Los nombres de los productos de la duda, para mostrar una línea cuyo producto salió del
  // catálogo entre el corte y la recarga (ver `huerfana`).
  const [nombresDeLaDuda] = useState<Record<string, string>>(() =>
    Object.fromEntries((k?.lineas ?? []).map((l) => [l.productId, l.nombre ?? "Un producto"])),
  );
  // «Venderle» / «Repetir» desde la ficha (boutique): sólo si no hay un cobro sin confirmar que restaurar.
  const desdeLaFicha = !arranque && boutique?.desdeLaFicha ? boutique.desdeLaFicha : null;
  const [deLaFicha] = useState(() =>
    lineasDesdeLaFicha(desdeLaFicha?.repetir ?? null, new Set(productosDeLaPagina.map((p) => p.id))),
  );
  const [avisoDeLaFicha, setAvisoDeLaFicha] = useState(() =>
    desdeLaFicha?.repetir
      ? avisoDeRepetir({
          code: desdeLaFicha.repetir.code,
          cliente: desdeLaFicha.cliente.nombre,
          porPeso: deLaFicha.lineas.some((l) => l.qtyText === ""),
          omitidos: deLaFicha.omitidos,
        })
      : null,
  );
  const [inicial] = useState(() => lineasIniciales(k, deLaFicha.lineas));

  const [isOrder, setIsOrder] = useState(k ? k.esPedido : pedidoInicial);
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">(k?.entrega.tipo ?? "PICKUP");
  const [paid, setPaid] = useState(k ? k.paid : !pedidoInicial);
  const [medio, setMedio] = useState<MedioDeCobro | "">(k ? (leerMedioDeCobro(k.medio) ?? "") : "");
  // «A cuenta» no es un medio de cobro: no entra plata. Va aparte del medio para que nunca viaje
  // como `paymentMethod`.
  const [aCuenta, setACuenta] = useState(k?.aCuenta ?? false);
  const [lines, setLines] = useState<Line[]>(inicial.lines);
  const [manuales, setManuales] = useState<LineaManual[]>(inicial.manuales);
  const [nextKey, setNextKey] = useState(inicial.nextKey);
  // El peso implausible que la persona confirmó, por línea («Sí, son 1.500 kg»): si cambia el
  // peso, la pregunta vuelve (pesoPorConfirmar, pos-peso.ts).
  const [pesosConfirmados, setPesosConfirmados] = useState<Record<number, number>>({});
  // El teclado grande (guantes, etiqueta de la balanza en la mano): en qué línea está abierto.
  // Quien lo abre una vez lo encuentra abierto en el próximo corte por kilo (preferencia de este
  // navegador; si el almacenamiento no anda, arranca cerrado y nada más).
  const [tecladoDe, setTecladoDe] = useState<number | null>(null);
  function usarTeclado(key: number | null) {
    setTecladoDe(key);
    try {
      window.localStorage.setItem(PREF_TECLADO, key !== null ? "1" : "0");
    } catch {
      // sin almacenamiento: vale para esta pantalla
    }
  }
  const ticketKey = useRef(arranque?.clave ?? "");
  // El cobro está en vuelo (se mandó y no volvió): el lector no suma nada hasta que termine.
  const cobrandoAhora = useRef(false);
  // El último cobro del boutique volvió frenado porque cambió un precio (no se grabó nada).
  const cobroFrenadoPorPrecio = useRef(false);

  // MOSTRADOR BOUTIQUE (interruptor). Todo esto existe sólo con `boutique`; apagado, nada cambia.
  const enBoutique = boutique !== null;
  // Lo que dice el bloque Cliente (ClienteDeLaVenta): la ficha elegida, el CUIT y el tilde «Facturar
  // al cobrar». `clienteKey` lo vuelve a armar vacío al limpiar el ticket.
  const [clienteVenta, setClienteVenta] = useState<ValorDelCliente | null>(null);
  const [clienteKey, setClienteKey] = useState(0);
  const [zonaId, setZonaId] = useState(k?.entrega.zona ?? "");
  // Lo escrito en el campo único que no es un código: los productos que coinciden, como teclas.
  const [coincidencias, setCoincidencias] = useState<{ texto: string; ids: string[] } | null>(null);
  const [avisoBoutique, setAvisoBoutique] = useState<string | null>(null);
  // Registrar sin cobrar / a cuenta / reintentar: el envío en curso (frena el doble toque).
  const [enviandoBoutique, setEnviandoBoutique] = useState(false);
  // «Reintentar cobro»: los campos del pie del intento que quedó en duda, para mandar LO MISMO.
  const [reintentando, setReintentando] = useState(false);
  const camposDelUltimoPie = useRef<[string, string][] | null>(null);
  // Lo que entregó en efectivo (el pie), para el vuelto del ticket. No se guarda.
  const pagoConDelPie = useRef<number | null>(null);
  // El cobro del pie termina cuando termina `submit` (no cuando se manda): así el pie queda
  // «enviando» todo el cobro y un doble toque no arma otra venta (MG-005).
  const finDelCobro = useRef<(() => void) | null>(null);
  // ── Tanda 2 · 2A: el ticket que crece y las teclas por góndola (sólo el boutique) ──
  // Lo último que se quitó, con «Deshacer» 5 s (sin modal, sin animación).
  const [quitado, setQuitado] = useState<{ tipo: "producto"; q: RenglonQuitado<Line>; nombre: string } | { tipo: "manual"; q: RenglonQuitado<LineaManual>; nombre: string } | null>(null);
  useEffect(() => {
    if (!quitado) return;
    const t = setTimeout(() => setQuitado(null), DESHACER_MS);
    return () => clearTimeout(t);
  }, [quitado]);
  // El renglón que recibe el peso (teclado grande, balanza por cable): el último que entró o el tocado.
  const [activoKey, setActivoKey] = useState<number | null>(null);
  // Cuántas veces cambió el peso de cada renglón DESDE AFUERA del teclado (−/+, balanza): rearma el teclado.
  const [versionDelPeso, setVersionDelPeso] = useState<Record<number, number>>({});
  // Los precios que cambiaron con el ticket abierto (MG-048), por producto: el chip del renglón.
  const [cambios, setCambios] = useState<Record<string, CambioDePrecio>>({});
  // Rearma el pie de cobro cuando un cobro se frenó por un precio que cambió (su vuelto era del total viejo).
  const [pieKey, setPieKey] = useState(0);
  // Las teclas fijadas por el dueño (la página las trae; al guardar se actualizan acá sin recargar).
  const [fijadas, setFijadas] = useState<{ ids: string[]; version: string | null }>(() => ({
    ids: boutique?.teclas?.fijadas ?? [],
    version: boutique?.teclas?.version ?? null,
  }));
  // Una tecla por kilo «agotada» que se tocó: ¿lo tiene en la mano? (MAG-4: se vende igual si sí).
  const [agotadoEnLaMano, setAgotadoEnLaMano] = useState<string | null>(null);

  // Opcionales, cerrados hasta que alguien los abre (ninguno suma un paso al camino feliz).
  const Quien = quienCompra === "clienta" ? "Clienta" : "Cliente";
  const alQuien = quienCompra === "clienta" ? "a la clienta" : "al cliente";
  const [conCliente, setConCliente] = useState(k?.conCliente ?? Boolean(desdeLaFicha));
  const [telefono, setTelefono] = useState(k?.telefono ?? "");
  const [nombreCliente, setNombreCliente] = useState(k?.nombre ?? "");
  const [busqueda, setBusqueda] = useState<"nada" | "buscando" | "encontrado" | "sin-ficha" | "error">(
    k?.fichaEncontrada ? "encontrado" : "nada",
  );
  const [conDescuento, setConDescuento] = useState(k?.descuento.abierto ?? false);
  // El cupón es la tercera forma del descuento: uno o el otro, nunca los dos (lo mismo exige el
  // servidor).
  const [tipoDescuento, setTipoDescuento] = useState<TipoDescuento | "cupon">(k?.descuento.tipo ?? "porcentaje");
  const [descuentoText, setDescuentoText] = useState(k?.descuento.texto ?? "");
  const [pagoConText, setPagoConText] = useState("");
  // Los datos del pedido van CONTROLADOS, como todo lo demás del formulario. Sueltos, el reset
  // automático del <form action> de React 19 los borraba también cuando el servidor rechazaba
  // (sin stock, un descuento de más): había que volver a escribir horario, dirección y nota.
  const [horario, setHorario] = useState(k?.entrega.horario ?? "");
  const [direccion, setDireccion] = useState(k?.entrega.direccion ?? "");
  const [nota, setNota] = useState(k?.entrega.nota ?? "");

  // Lo que no salió en el último intento, a la vista hasta que se resuelva (ver arriba), y si el
  // navegador tiene señal ahora: cambia el "cuando vuelva la señal" por "tocá Reintentar".
  const [falla, setFalla] = useState<Falla | null>(arranque ? { tipo: "red" } : null);
  // El envío que salió y no tuvo respuesta (puede haberse grabado con la clave de este ticket).
  // Sólo se borra cuando la duda se resuelve: cobro confirmado, «ya grabada», «Es otra venta».
  const [sinRespuesta, setSinRespuesta] = useState<EnvioSinRespuesta | null>(
    arranque ? { firma: arranque.firma, total: arranque.total, desde: arranque.desde, restaurado: true } : null,
  );
  // El servidor contestó que la clave ya estaba grabada con OTRA cosa (o anulada): cuál quedó y
  // qué no se registró. Frena el botón hasta que el cajero elija cómo seguir.
  const [yaGrabada, setYaGrabada] = useState<VentaYaGrabada | null>(null);
  const [verGrabada, setVerGrabada] = useState(false);
  // «Empezar de nuevo» con un envío en duda: primero se pregunta (revisar Ventas del día).
  const [confirmarEmpezar, setConfirmarEmpezar] = useState(false);
  // Se cargó SÓLO lo que faltaba de una venta ya grabada: se dice arriba del botón.
  const [soloLoQueFalta, setSoloLoQueFalta] = useState<{ code: number; texto: string } | null>(null);
  const formulario = useRef<HTMLFormElement | null>(null);
  const [enLinea, setEnLinea] = useState(true);
  useEffect(() => {
    const leer = () => setEnLinea(navigator.onLine);
    leer();
    window.addEventListener("online", leer);
    window.addEventListener("offline", leer);
    return () => {
      window.removeEventListener("online", leer);
      window.removeEventListener("offline", leer);
    };
  }, []);

  // La última venta cobrada, con su ticket. No frena la próxima: el formulario ya está limpio.
  // `factura`/`facturando`: sólo con «Facturar al cobrar» del boutique.
  const [ultima, setUltima] = useState<{
    venta: VentaTicket;
    pagoCon: number | null;
    factura?: FacturaDeVenta;
    facturando?: boolean;
  } | null>(null);

  function facturarAlCobrar(orderId: string) {
    const fd = new FormData();
    fd.set("id", orderId);
    const poner = (cambio: { factura?: FacturaDeVenta; facturando: boolean }) =>
      setUltima((u) => (u && u.venta.id === orderId ? { ...u, ...cambio } : u));
    poner({ facturando: true });
    facturarVenta(null, fd).then(
      (e) => poner({ factura: e?.factura, facturando: false }),
      (e) => {
        if (isNextRedirect(e)) throw e;
        const motivo = "No se pudo facturar ahora. Reintentá con «Facturar»: si ya se había emitido, no se emite dos veces.";
        poner({ factura: { estado: "sin-factura", texto: `Sin factura: ${motivo}` }, facturando: false });
      },
    );
  }
  // Lo que salió sin ticket (un pedido, una venta sin cobrar, el reintento que ya estaba
  // registrado), escrito arriba del formulario. No en el aviso flotante: en el celular tapaba el
  // botón de cobrar de la venta siguiente.
  const [confirmacion, setConfirmacion] = useState<string | null>(null);

  const [focusPedido, setFocusPedido] = useState<{ id: string; n: number } | null>(null);
  const focusN = useRef(0);
  const pedirFoco = (id: string) => setFocusPedido({ id, n: ++focusN.current });
  useEffect(() => {
    if (!focusPedido) return;
    // En el ticket no hay renglones vacíos con su buscador: el foco que iba a uno va al buscador.
    const el = document.getElementById(focusPedido.id) ?? (nuevo ? document.getElementById("vender-buscar") : null);
    if (nuevo && el) {
      // El campo recién sumado (el peso) se trae a la vista con su `scroll-margin` (la hoja lo fija
      // por encima de la tecla de cobrar y la cápsula): así no queda escondido detrás del pie fijo.
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest" });
    } else el?.focus();
    if (nuevo && el instanceof HTMLInputElement && el.value) el.select();
  }, [focusPedido, nuevo]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const opciones = useMemo<OpcionBuscador[]>(
    () =>
      products.map((prod) => {
        const info = stockById[prod.id];
        const esPeso = prod.saleUnit === "WEIGHT";
        const precio = esPeso ? `${fmtMoneyARS(prod.pricePerKg ?? 0)}/kg` : `${fmtMoneyARS(prod.price ?? 0)}/u`;
        const quedan = info?.trackStock ? ` · quedan ${formatearCantidad(info.stock)} ${esPeso ? "kg" : "u"}` : "";
        return { id: prod.id, etiqueta: prod.name, detalle: `${precio}${quedan}` };
      }),
    [products, stockById],
  );
  const botonesRapidos = useMemo(
    () => rapidos.map((id) => byId.get(id)).filter((p): p is SellableProduct => !!p),
    [rapidos, byId],
  );
  // TANDA PERF (P-3, sólo el boutique): las teclas no cambian al tocar una. Sus listas se memorizan
  // y el toque y el «fijar» pasan con identidad fija (`useLlamadaEstable`, abajo), así
  // `TeclasMemorizadas` no se vuelve a dibujar en cada toque (era el grueso de los 224 ms por
  // tecla). Apagado (CH) no se calcula nada.
  const teclasBoutique = useMemo(() => {
    if (!boutique) return null;
    const vendibles = new Set(products.map((p) => p.id));
    return {
      principal: teclasPrincipales(fijadas.ids, vendibles, { ids: botonesRapidos.map((p) => p.id), rotulo: rotuloRapidos }),
      gondolas: gondolasDelMostrador(products, { explicitas: boutique.teclas?.gondolas, primero: rapidos }),
    };
  }, [boutique, products, fijadas.ids, botonesRapidos, rotuloRapidos, rapidos]);
  usePrecargaDelCliente(Boolean(boutique));

  function setLine(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine(productId = "") {
    const key = nextKey;
    setLines((ls) => [...ls, { key, productId, qtyText: "" }]);
    setNextKey((k) => k + 1);
    return key;
  }
  function removeLine(key: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [{ ...ls[0], productId: "", qtyText: "", etiqueta: undefined }]));
  }
  function setManual(key: number, patch: Partial<LineaManual>) {
    setManuales((ms) => ms.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  }
  function addManual() {
    const key = nextKey;
    setManuales((ms) => [...ms, { key, nombre: "", importeText: "", motivo: "" }]);
    setNextKey((k) => k + 1);
    pedirFoco(`manual-nombre-${key}`);
  }

  // Botón rápido: usa la línea vacía si hay una (no deja renglones en blanco en el medio) y
  // salta directo al peso o la cantidad.
  // Diseño nuevo: lo que se vende por unidad entra con 1 (y el campo seleccionado, para pisarlo);
  // por kilo queda vacío, esperando la balanza.
  function elegirRapido(productId: string) {
    const qtyText = nuevo && byId.get(productId)?.saleUnit === "UNIT" ? "1" : "";
    const vacia = lines.find((l) => !l.productId);
    const key = vacia ? vacia.key : addLine(productId);
    if (vacia) setLine(key, { productId, qtyText });
    else if (qtyText) setLine(key, { qtyText });
    if (prefiereTeclado() && byId.get(productId)?.saleUnit === "WEIGHT") setTecladoDe(key);
    pedirFoco(`qty-${key}`);
  }
  const productosConCodigo = useMemo(
    () => products.map((p) => ({ id: p.id, name: p.name, codigo: p.codigo ?? null, saleUnit: p.saleUnit, price: p.price, pricePerKg: p.pricePerKg })),
    [products],
  );
  // EL LECTOR (módulo `terminal`): el catálogo de la pantalla indexado por código, y lo que dijo
  // la última lectura. Sin el perfil no hay índice ni aviso.
  const conLector = perfil !== null;
  const indiceDeCodigos = useMemo(
    () =>
      conLector
        ? indexarPorCodigo(
            products.map((p) => ({
              id: p.id,
              name: p.name,
              codigo: p.codigo ?? null,
              saleUnit: p.saleUnit,
              price: p.price,
              pricePerKg: p.pricePerKg,
              seccion: "",
              presentacion: null,
            })),
          )
        : null,
    [products, conLector],
  );
  const [avisoLector, setAvisoLector] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  // Con el lector, el foco NO se lleva a un buscador después de cobrar o de cargar un peso: en un
  // campo de texto el teclado es de la persona, y la lectura siguiente se escribía como texto en el
  // buscador (la línea no entraba; docs/producto/PERFORMANCE-TERMINALES.md). Se suelta el campo y el
  // foco queda en la página, donde el lector lee. Para buscar por nombre, se toca el buscador.
  function soltarFocoParaElLector() {
    const el = document.activeElement;
    if (el instanceof HTMLElement && enCampoDeTexto(el)) el.blur();
  }
  function errorDelLector(texto: string) {
    setAvisoLector({ tono: "error", texto });
    avisar("error", perfil);
  }

  // Un código leído: se suma la línea como desde el buscador. Por unidad entra 1 (o suma 1 a la
  // línea que ya tiene ese producto) y el foco NO se mueve, así el próximo código también se lee;
  // por peso, el cursor va al peso (lo da la balanza, como con el buscador). Si el lector escribió
  // adentro del peso o la cantidad de una línea (el foco había quedado ahí), ese campo vuelve a lo
  // que tenía: eran los números del código, no un peso. Con el cobro en vuelo o en duda no se toca
  // el ticket (`motivoParaNoSumar`): lo sumado se borraría al limpiar y se entregaría sin cobrar.
  function agregarLeido(codigo: string, origen: OrigenDeLaLectura) {
    if (!indiceDeCodigos) return;
    let base = lines;
    const campo = origen.objetivo;
    if (campo instanceof HTMLInputElement && esCampoDeCantidad(campo) && /^qty-\d+$/.test(campo.id)) {
      const key = Number(campo.id.slice(4));
      const qtyText = origen.antes ?? "";
      setLine(key, { qtyText });
      base = lines.map((l) => (l.key === key ? { ...l, qtyText } : l));
    }
    const motivo = motivoParaNoSumar({ cobrando: cobrandoAhora.current, cobroEnDuda: sinRespuesta !== null || yaGrabada !== null });
    if (motivo) {
      errorDelLector(motivo);
      return;
    }
    const r = resolverCodigo(codigo, indiceDeCodigos, null, null);
    if (!r.ok) {
      errorDelLector(r.mensaje);
      return;
    }
    const p = r.producto;
    if (p.saleUnit === "WEIGHT") {
      elegirRapido(p.id);
      setAvisoLector({ tono: "ok", texto: `Entró ${p.name}: cargá el peso.` });
    } else {
      const misma = base.find((l) => l.productId === p.id);
      const actual = misma ? leerCantidad(misma.qtyText) : null;
      if (misma && (actual?.estado === "vacio" || (actual?.estado === "ok" && Number.isInteger(actual.valor)))) {
        setLine(misma.key, { qtyText: String((actual?.estado === "ok" ? actual.valor : 0) + 1) });
      } else {
        const vacia = base.find((l) => !l.productId);
        if (vacia) setLine(vacia.key, { productId: p.id, qtyText: "1" });
        else setLine(addLine(p.id), { qtyText: "1" });
      }
      setAvisoLector({ tono: "ok", texto: `Entró ${p.name}.` });
    }
    avisar("ok", perfil);
  }

  useLectorDeRafaga({
    // En el boutique la ráfaga la lee el campo único (con el lector de este equipo): una sola vez.
    lector: enBoutique ? null : (perfil?.lector ?? null),
    // Fuera de un campo de texto (una casilla o un medio de pago tocado no cuentan) o en el peso o
    // la cantidad de una línea, y sin un diálogo abierto. En el buscador, el teclado es de la persona.
    acepta: (e) => {
      const t = e.target as HTMLElement | null;
      return (!enCampoDeTexto(t) || esCampoDeCantidad(t)) && !document.querySelector("dialog[open]");
    },
    alLeer: agregarLeido,
  });

  const leidas = useMemo(
    () =>
      lines.map((l) => {
        const lectura = leerCantidad(l.qtyText);
        return { ...l, qty: lectura.estado === "ok" ? lectura.valor : 0, invalida: lectura.estado === "invalida" };
      }),
    [lines],
  );
  // Total de línea redondeado igual que el servidor (`buildOrderLines`): la pantalla y el
  // ticket dicen el mismo número al centavo.
  const totalDeLinea = (l: { productId: string; qty: number }) => {
    const p = byId.get(l.productId);
    return p && l.qty > 0 ? round2(l.qty * precioDe(p)) : 0;
  };
  const manualesLeidas = manuales.map((m) => {
    const tocada = m.nombre.trim() !== "" || m.importeText.trim() !== "" || m.motivo.trim() !== "";
    const v = validarLineaAMano({ nombre: m.nombre, importe: m.importeText, motivo: m.motivo });
    // El tope de quien vende, con la MISMA regla que el alta aplica en la transacción: la
    // pantalla avisa antes de cobrar y el servidor decide (con el catálogo entero de la base).
    const t = v.ok ? controlarPrecioAMano({ linea: v.linea, catalogo: products, tope: topePrecioAMano }) : null;
    const error = tocada && !v.ok ? v.error : t && !t.ok ? t.error : null;
    return { ...m, importe: importeOCero(m.importeText), error, valida: v.ok && (t?.ok ?? true) };
  });

  const subtotal = round2(
    leidas.reduce((s, l) => s + totalDeLinea(l), 0) + manualesLeidas.reduce((s, m) => s + (m.valida ? m.importe : 0), 0),
  );

  // Cupón: la vista previa sale de la regla del alta (`montoDeCupon`); el servidor lo vuelve a
  // decidir y lo consume en la transacción. Sin «Aplicar», no se cobra: el total que dice el
  // botón tiene que ser el que se cobra.
  const cupon = useCuponDePedido(subtotal, k ? { codigo: k.descuento.cuponTexto, aplicado: k.descuento.cupon } : undefined);
  const usaCupon = conDescuento && tipoDescuento === "cupon";
  const cuponSinAplicar = usaCupon && cupon.codigo.trim() !== "" && !cupon.aplicado;
  const pedidoDescuento =
    conDescuento && tipoDescuento !== "cupon"
      ? descuentoDelFormulario(tipoDescuento, descuentoText)
      : { ok: true as const, pedido: null };
  const descuento: ResultadoDescuento = usaCupon
    ? { ok: true, descuento: cupon.descuento, total: round2(subtotal - cupon.descuento), porcentaje: 0 }
    : pedidoDescuento.ok
      ? aplicarDescuento({ subtotal, pedido: pedidoDescuento.pedido, topePct: topeDescuentoPct })
      : { ok: false, error: pedidoDescuento.error };
  const total = descuento.ok ? descuento.total : subtotal;

  // EL ENVÍO DEL PEDIDO (mostrador boutique, negocio con zonas de Envíos). La vista previa con la
  // MISMA regla que decide el servidor (`cotizarEnvioDelMostrador`, sobre lo que suman los
  // productos ANTES del descuento: el descuento no toca el envío). Entra al total que se muestra
  // y al que cobra el pie: un pago dividido tiene que sumar el total CON el envío, que es el que
  // graba el alta. El servidor lo vuelve a calcular: lo de acá sólo se muestra.
  // Las zonas vienen del boutique o, en el Vender de siempre de un comercio con zonas, de `envios`
  // (O-2: el servidor exige la zona en todo pedido con envío de un negocio con zonas; la pantalla la
  // ofrece en las tres vistas para que nunca quede un callejón).
  const configEnvios = boutique?.envios ?? envios;
  const zonasDelEnvio = configEnvios && tieneZonas(configEnvios) ? configEnvios.zonas : [];
  const conZona = isOrder && fulfillment === "DELIVERY" && zonasDelEnvio.length > 0;
  const cotizacionEnvio =
    conZona && configEnvios ? cotizarEnvioDelMostrador(configEnvios, { subtotal, zonaId: zonaId || null }) : null;
  const envioPrevisto = cotizacionEnvio?.ok ? cotizacionEnvio.costo : 0;
  const totalACobrar = round2(total + envioPrevisto);

  const contextoStock = isOrder ? "ONLINE" : "COUNTER";
  const faltanteDe = (l: { productId: string; qty: number }) => {
    const p = byId.get(l.productId);
    return p ? faltanteDeLinea(stockById[l.productId], l.qty, { saleUnit: p.saleUnit, contexto: contextoStock }) : null;
  };

  // Con un envío en duda, una línea cuyo producto ya no está en el catálogo (lo sacaron entre el
  // corte y la recarga) SIGUE en el ticket, en la firma y en el envío: el reintento tiene que
  // viajar igual que la cortada. El servidor busca la clave antes de validar: si estaba grabada,
  // la devuelve. Sin duda de por medio, esa línea no se vende (no hay precio).
  const huerfana = (productId: string) => sinRespuesta !== null && productId !== "" && !byId.has(productId);
  const enviable = (l: { productId: string; qty: number }) => (byId.has(l.productId) || huerfana(l.productId)) && l.qty > 0;
  const hayLineaValida = leidas.some(enviable) || manualesLeidas.some((m) => m.valida);
  const hayFaltante = leidas.some((l) => faltanteDe(l)?.bloquea === true);
  const hayCantidadInvalida = leidas.some((l) => l.productId && l.invalida);
  // Una línea con producto y SIN cantidad frena el cobro, en las DOS vistas (antes, sólo con
  // «Diseño nuevo»; en la de siempre esa línea no viajaba —no es `enviable`— y el ticket salía
  // sin ella, cobrado de menos). La regla es una sola: `lineaSinCantidad` (reglas-venta.ts).
  const lineaSinCantidad = primeraLineaSinCantidad(leidas);
  // Un peso implausible («1500» por 1,500) frena el cobro hasta que se confirma o se corrige.
  const confirmacionDe = (l: { productId: string; qty: number; invalida: boolean }) => {
    const p = byId.get(l.productId);
    return p && !l.invalida ? confirmacionDePeso({ valor: l.qty, saleUnit: p.saleUnit }) : null;
  };
  const sinConfirmar = (l: { key: number; productId: string; qty: number; invalida: boolean }) => {
    const p = byId.get(l.productId);
    return !!p && !l.invalida && pesoPorConfirmar({ valor: l.qty, saleUnit: p.saleUnit, confirmado: pesosConfirmados[l.key] });
  };
  const lineaConPesoSinConfirmar = leidas.find(sinConfirmar);
  // Una línea a mano abierta y a medio llenar frena el cobro: si se dejara pasar, se cobraría
  // de menos sin que nadie se entere. Vacía del todo, se ignora.
  const hayManualInvalida = manualesLeidas.some((m) => m.error !== null);
  // A cuenta: la deuda es de ALGUIEN. Sin la ficha encontrada por teléfono no hay a quién.
  const aCuentaActivo = aCuentaDisponible && !isOrder && paid && aCuenta;
  const faltaFichaACuenta = aCuentaActivo && (enBoutique ? !clienteVenta?.cliente : busqueda !== "encontrado");
  // En el boutique el medio se elige en el pie, al cobrar: no falta antes.
  const faltaMedio = paid && !medio && !aCuentaActivo && !enBoutique;

  // Lo que define este cobro —TODO lo que el servidor compara con lo grabado—, para saber si un
  // reintento es la misma venta. Cliente y entrega van como viajan: sin la sección abierta no se
  // mandan, y la firma no los cuenta.
  const conDatosDeCliente = isOrder || conCliente;
  // Lo mismo que viaja en el formulario, firmado con la función del servidor (`firmaDelPedido`):
  // sin precios, sin total, sin el nombre de la ficha. Recargar con otro precio de catálogo ya
  // no cambia la firma.
  const firma = firmaDelCobro({
    lineas: leidas.filter(enviable).map((l) => ({ productId: l.productId, cantidad: l.qty })),
    manuales: manualesLeidas.filter((m) => m.valida).map((m) => ({ nombre: m.nombre, importe: m.importe })),
    medio: aCuentaActivo ? "A_CUENTA" : paid ? medio : "SIN_COBRAR",
    esPedido: isOrder,
    telefono: conDatosDeCliente ? telefono : "",
    cupon: usaCupon ? (cupon.aplicado?.codigo ?? cupon.codigo) : null,
    descuento: conDescuento && !usaCupon && pedidoDescuento.ok ? pedidoDescuento.pedido : null,
    entrega: isOrder
      ? { tipo: fulfillment, direccion: fulfillment === "DELIVERY" ? direccion : "", horario, nota, zona: conZona ? zonaId : "" }
      : null,
  });
  const cambioTrasCorte = sinRespuesta !== null && cambioDespuesDelCorte(sinRespuesta.firma, firma);
  // El reintento de LA MISMA venta en duda. El stock que muestra la pantalla puede ya tener
  // descontada esa venta (si se grabó): no frena el reintento. Decide el servidor: si está
  // grabada, la devuelve; si no, valida el stock él, en su transacción.
  const reintentoDeLaMisma = sinRespuesta !== null && !cambioTrasCorte;

  // Lo cargado, lo justo para volver a mostrarlo igual si la pantalla se recarga con un cobro en
  // duda (cobro-sin-conexion.ts, "La duda sobrevive a recargar la pantalla").
  function cargadoActual(): CargadoDelCobro {
    return {
      esPedido: isOrder,
      lineas: lines
        .filter((l) => l.productId)
        .map((l) => ({ productId: l.productId, qtyText: l.qtyText, nombre: byId.get(l.productId)?.name ?? nombresDeLaDuda[l.productId] })),
      manuales: manuales.map((m) => ({ nombre: m.nombre, importeText: m.importeText, motivo: m.motivo })),
      paid,
      medio,
      aCuenta,
      conCliente,
      telefono,
      nombre: nombreCliente,
      fichaEncontrada: busqueda === "encontrado",
      descuento: {
        abierto: conDescuento,
        tipo: tipoDescuento,
        texto: descuentoText,
        cupon: cupon.aplicado,
        cuponTexto: cupon.codigo,
      },
      entrega: { tipo: fulfillment, horario, direccion, nota, ...(conZona && zonaId ? { zona: zonaId } : {}) },
    };
  }


  const motivoBloqueo = !hayLineaValida
    ? null
    : yaGrabada
      ? yaGrabada.esPedido
        ? `Revisá el pedido #${yaGrabada.code}`
        : `Revisá la venta #${yaGrabada.code}`
      : cambioTrasCorte
      ? isOrder
        ? "Revisá el pedido cortado"
        : "Revisá la venta cortada"
      : lineaSinCantidad
      ? motivoDeLineaSinCantidad(byId.get(lineaSinCantidad.productId))
      : lineaConPesoSinConfirmar
      ? motivoDePesoSinConfirmar(byId.get(lineaConPesoSinConfirmar.productId))
      : !descuento.ok
      ? "Revisá el descuento"
      : cuponSinAplicar
        ? "Aplicá el cupón"
        : faltaMedio
          ? "Elegí cómo pagó"
          : faltaFichaACuenta
            ? `Buscá ${alQuien}`
            : null;

  function limpiar() {
    // El foco vuelve al buscador: el próximo cliente se atiende sin tocar el mouse. Con el lector,
    // el próximo cliente se atiende con el lector: el foco queda en la página (ver `soltarFoco…`).
    // En el boutique vuelve al campo único, que lee la etiqueta, el código y el nombre.
    if (enBoutique) pedirFoco(ID_CAMPO_UNICO);
    else if (conLector) soltarFocoParaElLector();
    else pedirFoco(`prod-${nextKey}`);
    if (enBoutique) {
      setClienteKey((n) => n + 1);
      setClienteVenta(null);
      setZonaId("");
      setCoincidencias(null);
      setAvisoBoutique(null);
      setAvisoDeLaFicha(null);
      camposDelUltimoPie.current = null;
      pagoConDelPie.current = null;
      setQuitado(null);
      setActivoKey(null);
      setCambios({});
      setAgotadoEnLaMano(null);
    }
    setLines([{ key: nextKey, productId: "", qtyText: "" }]);
    setManuales([]);
    setNextKey((k) => k + 1);
    setMedio("");
    setACuenta(false);
    setPaid(!isOrder);
    setConDescuento(false);
    setDescuentoText("");
    cupon.limpiar();
    setPagoConText("");
    setConCliente(false);
    setTelefono("");
    setNombreCliente("");
    setBusqueda("nada");
    setHorario("");
    setDireccion("");
    setNota("");
    setFalla(null);
    setSinRespuesta(null);
    setYaGrabada(null);
    setVerGrabada(false);
    setConfirmarEmpezar(false);
    setSoloLoQueFalta(null);
    borrarCobroSinConfirmar(almacenDeSesion(), almacen);
    ticketKey.current = "";
  }

  // «Es otra venta» / «Cobrar lo que falta como otra venta»: el cajero revisó y lo cargado NO es
  // la venta cortada o la ya grabada (o ya sacó lo que se había grabado). Viaja con otra clave;
  // lo cargado queda como está. La duda (o la grabada) queda resuelta: se borra de la pestaña.
  function esOtraVenta() {
    ticketKey.current = "";
    setFalla(null);
    setSinRespuesta(null);
    setYaGrabada(null);
    setVerGrabada(false);
    setConfirmarEmpezar(false);
    borrarCobroSinConfirmar(almacenDeSesion(), almacen);
  }

  // «Cobrar sólo lo que falta»: la venta #N ya está grabada y lo cargado trae DE MÁS (el servidor
  // calculó qué: `faltante`). El ticket queda con SÓLO eso —mismo medio y mismo cliente, sin
  // descuento (con descuento el servidor no ofrece esta salida)— y viaja con otra clave. Antes
  // este botón dejaba el carrito entero y cobraba todo otra vez (refutador R-A).
  function cargarSoloLoQueFalta(g: VentaYaGrabada, f: Faltante) {
    let n = nextKey;
    const nuevas: Line[] = f.productos.map((l) => ({ key: n++, productId: l.productId, qtyText: formatearCantidad(l.cantidad) }));
    const nuevasAMano: LineaManual[] = f.aMano.map((m) => {
      // El motivo es de la pantalla (el servidor no lo compara): el de la línea igual que ya estaba.
      const igual = manuales.find((x) => x.nombre.trim().toLowerCase() === m.nombre.trim().toLowerCase() && importeOCero(x.importeText) === m.importe);
      return { key: n++, nombre: m.nombre, importeText: importeParaFormulario(m.importe), motivo: igual?.motivo ?? "" };
    });
    if (nuevas.length === 0) nuevas.push({ key: n++, productId: "", qtyText: "" });
    setLines(nuevas);
    setManuales(nuevasAMano);
    setNextKey(n);
    setConDescuento(false);
    setDescuentoText("");
    // «Pagó con» era de la venta entera: con él, el vuelto de lo que falta salía de más.
    setPagoConText("");
    cupon.limpiar();
    esOtraVenta();
    setSoloLoQueFalta({ code: g.code, texto: textoDelFaltante(f) });
  }

  // «Ya la anulé: volver a consultar»: la misma clave, lo mismo cargado. El servidor contesta
  // cómo está AHORA la #N (si la anularon, ofrece cobrarla como otra venta).
  function volverAConsultar() {
    setYaGrabada(null);
    setVerGrabada(false);
    formulario.current?.requestSubmit();
  }

  // El cobro en vuelo se marca de punta a punta (también si falla o tira): mientras tanto, lo que
  // pase el lector se rechaza en vez de sumarse a un ticket que `limpiar()` va a borrar.
  async function submit(fd: FormData) {
    cobrandoAhora.current = true;
    try {
      await enviarCobro(fd);
    } finally {
      cobrandoAhora.current = false;
      const fin = finDelCobro.current;
      finDelCobro.current = null;
      fin?.();
    }
  }

  async function enviarCobro(fd: FormData) {
    // Sin señal no se manda: el envío quedaría colgado y el cajero no sabría qué pasó.
    if (antesDeCobrar(navigator.onLine)) {
      setFalla({ tipo: "sin-senal" });
      return;
    }
    // Un reintento es la MISMA venta: misma clave (cobro-sin-conexion.ts).
    ticketKey.current = claveParaCobrar(ticketKey.current, nuevaClaveDeTicket);
    const clave = ticketKey.current;
    fd.set("idempotencyKey", clave);
    setConfirmacion(null);
    fd.set("conTicket", "1");
    const pagoCon = medio === "EFECTIVO" ? leerImporte(pagoConText) : null;
    // Lo que viaja, por si la respuesta no vuelve: queda en duda, en memoria y en la pestaña.
    const enviado: EnvioSinRespuesta = { firma, total: totalACobrar, desde: new Date().toISOString() };
    // La duda con la que sale este envío (si es un reintento): su total es lo que se había mandado.
    const enDuda = sinRespuesta;
    const cargado = cargadoActual();
    const quedaEnDuda = () => {
      setFalla({ tipo: "red" });
      setSinRespuesta((previo) => recordarEnvioSinRespuesta(previo, enviado));
      // Se guarda el PRIMER envío en duda (un reintento sólo sale si lo cargado es igual).
      if (!sinRespuesta) {
        guardarCobroSinConfirmar(almacenDeSesion(), almacen, {
          v: 3,
          clave,
          firma,
          total: totalACobrar,
          desde: enviado.desde!,
          usuario: usuarioId,
          cargado,
        });
      }
    };
    // Boutique (MG-048 en un viaje): la venta cobrada lleva el precio que se VE de cada producto y el
    // servidor lo controla antes de grabar. No en el reintento: ése manda lo mismo que el cortado.
    if (enBoutique && paid && !reintentando) {
      const enTicket = [...new Set(leidas.filter((l) => l.qty > 0 && byId.has(l.productId)).map((l) => l.productId))];
      for (const [campo, valor] of camposDePreciosVistos(enTicket.map((id) => byId.get(id)!))) fd.append(campo, valor);
    }
    let espera;
    try {
      espera = await conTiempoMaximo(enBoutique ? cobrarDelMostrador(fd) : createOrder(fd), TIEMPO_MAXIMO_DEL_COBRO_MS);
    } catch (e) {
      if (isNextRedirect(e)) throw e;
      quedaEnDuda();
      return;
    }
    // El servidor no contestó a tiempo: no sabemos si se grabó (lo mismo que un corte).
    if (espera.tipo === "sin-respuesta") {
      quedaEnDuda();
      return;
    }
    const r = espera.valor;
    // El precio que se veía ya no es el de la base: no se grabó nada. La pantalla pasa al precio de
    // ahora («Subió a $X recién») y se cobra con el próximo toque, con el total a la vista.
    if (r && !r.ok && r.tipo === "precio-cambio") {
      aplicarPreciosVigentes(r.cambios.map((c) => byId.get(c.id)!).filter(Boolean), r.vigentes, "al-cobrar");
      // Lo que ya no se vende (pausado, borrado, sin precio) sale del ticket y se dice: no se cobra
      // una venta sin ese renglón a escondidas.
      if (r.noSeVenden?.length) {
        const ids = new Set(r.noSeVenden.map((p) => p.id));
        const keyVacia = nextKey;
        setLines((ls) => sinLosQueNoSeVenden(ls, ids, keyVacia).lineas);
        setNextKey((k) => Math.max(k, keyVacia) + 1);
        setActivoKey(null);
        setAvisoBoutique(r.error);
        setPieKey((k) => k + 1);
      }
      cobroFrenadoPorPrecio.current = true;
      return;
    }
    if (r && !r.ok) {
      // Falló algo que no es un rechazo de negocio (la base, la transacción al confirmarse): no
      // prueba que no se grabó. Se trata como un corte: misma clave para reintentar.
      if (r.tipo === "sin-confirmar") {
        quedaEnDuda();
        return;
      }
      // La clave ya estaba grabada con OTRA cosa (o anulada). No se grabó nada nuevo; la duda
      // quedó resuelta (sabemos cuál quedó). El botón se frena hasta que el cajero elija.
      if (r.tipo === "ya-grabada-distinta") {
        setFalla(null);
        setSinRespuesta(null);
        borrarCobroSinConfirmar(almacenDeSesion(), almacen);
        setYaGrabada(r.grabada);
        setVerGrabada(false);
        return;
      }
      // El servidor sabe que con esta clave NO hay nada grabado (la buscó al rechazar): la duda
      // queda resuelta —la cortada no se había grabado— y el rechazo se dice como es: "no se
      // cobró", sin el "puede ser que ya se grabó" que mandaba a buscar una venta que no existe.
      if (r.claveLibre && sinRespuesta) {
        setSinRespuesta(null);
        borrarCobroSinConfirmar(almacenDeSesion(), almacen);
      }
      setFalla({ tipo: "rechazo", error: r.error });
      // Rechazo de negocio sin nada en duda: con esta clave no hay nada grabado, así que lo que se
      // corrija viaja con otra (el porqué, en `renovarClaveTrasRechazo`).
      if (renovarClaveTrasRechazo(sinRespuesta !== null && !r.claveLibre)) ticketKey.current = "";
      return;
    }
    // La venta a cuenta también lleva su ticket (dice "Queda a cuenta"): el cliente se lleva
    // la mercadería y la constancia de lo que quedó debiendo.
    if (r?.venta && (r.venta.medio || r.venta.aCuenta)) {
      // Con ticket, la confirmación es el bloque «Última venta», que queda a la vista. El aviso
      // flotante de 4 s, en el celular, tapaba el botón de cobrar de la venta siguiente (medido
      // a 412 px: 138 × 44 px encima del botón).
      setUltima({
        venta: r.venta,
        pagoCon: enBoutique ? pagoConDelPie.current : pagoCon?.estado === "ok" ? pagoCon.valor : null,
      });
      // «Facturar al cobrar» (boutique): la factura sale DESPUÉS de grabar la venta, con la misma
      // acción que «Facturar» (que no emite dos veces). No frena el ticket siguiente: se espera
      // aparte y el resultado aparece en la venta cobrada.
      if (enBoutique && clienteVenta?.facturarAlCobrar && r.venta.medio && !r.venta.anulada) {
        facturarAlCobrar(r.venta.id);
      }
      // El reintento de una venta que ya estaba grabada vuelve con su ticket Y con el aviso de
      // que no se cobró dos veces (order-actions.ts, rama `dedup`): se dicen las dos cosas.
      if (r.mensaje) setConfirmacion(r.mensaje);
    } else {
      // El mensaje dice lo que pasó: una venta que quedó sin cobrar no es "Venta cobrada".
      setConfirmacion(
        r?.mensaje ??
          (isOrder
            ? "Pedido registrado."
            : paid
              ? "Venta cobrada."
              : "Venta registrada sin cobrar: queda en Pedidos para preparar hasta que se cobre."),
      );
    }
    // Era un reintento y la cortada NO estaba grabada: se grabó AHORA, con los precios y el
    // catálogo de hoy. Si el total no es el que se había mandado (y quizá cobrado), se dice.
    if (enDuda && r?.ok && !r.yaEstaba && r.venta && round2(r.venta.total) !== round2(enDuda.total)) {
      setConfirmacion(avisoDeGrabadaAhoraPorOtroTotal({ code: r.venta.code, esPedido: isOrder, mandado: enDuda.total, grabado: r.venta.total }));
    }
    limpiar();
  }

  // Lo que falta incluye un producto que ya no está en el catálogo: no se ofrece cargarlo solo.
  const fueraDelCatalogo = yaGrabada?.faltante?.productos.filter((l) => !byId.has(l.productId)).map((l) => l.nombre) ?? [];
  const cobrarAparte = yaGrabada && fueraDelCatalogo.length === 0 ? etiquetaDeCobrarAparte(yaGrabada) : null;
  const aviso = yaGrabada
    ? avisoDeYaGrabada(yaGrabada, fueraDelCatalogo)
    : avisoDelCobro({
        falla,
        sinRespuesta: sinRespuesta
          ? {
              cambio: cambioTrasCorte,
              totalMandado: fmtMoneyARS(sinRespuesta.total),
              restaurado: sinRespuesta.restaurado ? cuandoDelEnvio(sinRespuesta.desde) : null,
            }
          : null,
        enLinea,
        esPedido: isOrder,
      });

  // Los bloques de la pantalla: los mismos en la vista de siempre y en el ticket del diseño nuevo.
  const bloqueUltima = (
    <>
      {ultima && (
        <section
          aria-label="Última venta"
          aria-live="polite"
          className="rounded-lg border border-success/40 bg-success-soft/40 p-3 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-strong">
              Venta #{ultima.venta.code} {ultima.venta.anulada ? "ANULADA" : ultima.venta.aCuenta ? "a cuenta" : "cobrada"} ·{" "}
              {fmtMoneyARS(ultima.venta.total)}
              {vueltoDelTicket(ultima.venta, ultima.pagoCon) !== null && (
                <> · vuelto {fmtMoneyARS(vueltoDelTicket(ultima.venta, ultima.pagoCon)!)}</>
              )}
            </p>
            <button
              type="button"
              onClick={() => setUltima(null)}
              className="h-11 px-3 text-sm text-muted hover:underline"
            >
              Cerrar
            </button>
          </div>
          {puedeFacturar && ultima.facturando && (
            <p role="status" className="text-sm text-muted">
              Facturando…
            </p>
          )}
          {puedeFacturar && !ultima.facturando && (
            <FacturarVenta
              key={ultima.factura ? `${ultima.venta.id}-${ultima.factura.estado}` : ultima.venta.id}
              orderId={ultima.venta.id}
              inicial={ultima.factura ?? SIN_FACTURA}
            />
          )}
          {factura && !ultima.venta.anulada && (
            <p data-vender="factura" className="text-xs text-muted">
              {puedeFacturar ? factura.receptor : factura.sinFactura}
            </p>
          )}
          <TicketVenta venta={ultima.venta} negocio={negocio} pagoCon={ultima.pagoCon} terminal={terminal} imprimirAlCobrar />
        </section>
      )}
    </>
  );

  const bloqueGrabada = (
    <>
      {yaGrabada?.ticket && verGrabada && (
        <section
          aria-label={yaGrabada.esPedido ? `Pedido #${yaGrabada.code} ya registrado` : `Venta #${yaGrabada.code} ya grabada`}
          className="rounded-lg border border-line-strong p-3 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="venta-ya-grabada" tabIndex={-1} className="text-sm font-medium text-strong">
              {yaGrabada.esPedido ? "Pedido" : "Venta"} #{yaGrabada.code} {yaGrabada.anulada ? "ANULADA" : yaGrabada.como} ·{" "}
              {fmtMoneyARS(yaGrabada.total)}
            </h2>
            <button type="button" onClick={() => setVerGrabada(false)} className="h-11 px-3 text-sm text-muted hover:underline">
              Cerrar
            </button>
          </div>
          <TicketVenta venta={yaGrabada.ticket} negocio={negocio} terminal={terminal} />
        </section>
      )}
    </>
  );

  const bloqueConfirmacion = (
    <>
      {confirmacion && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-lg border border-success/40 bg-success-soft/40 pl-3 text-sm text-strong"
        >
          <p className="py-2">{confirmacion}</p>
          <button type="button" onClick={() => setConfirmacion(null)} className="h-11 shrink-0 px-3 text-sm text-muted hover:underline">
            Cerrar
          </button>
        </div>
      )}
    </>
  );

  const bloqueDudas = (
    <>
      {dudaIlegible && (
        <AvisoError
          tono="aviso"
          titulo={avisoDeDudaIlegible(dudaIlegible.desde).titulo}
          comoSeguir={avisoDeDudaIlegible(dudaIlegible.desde).comoSeguir}
          accion={
            <button
              type="button"
              onClick={() => {
                borrarCobroSinConfirmar(almacenDeSesion(), almacen);
                setDudaIlegible(null);
              }}
              className="h-11 px-2 text-sm text-muted hover:underline"
            >
              Ya revisé
            </button>
          }
        />
      )}

      {dudaAjena && (
        <AvisoError
          tono="aviso"
          titulo={avisoDeDudaDeOtraPersona(dudaAjena).titulo}
          comoSeguir={avisoDeDudaDeOtraPersona(dudaAjena).comoSeguir}
          accion={
            <button
              type="button"
              onClick={() => {
                borrarCobroSinConfirmar(almacenDeSesion(), almacen);
                setDudaAjena(null);
              }}
              className="h-11 px-2 text-sm text-muted hover:underline"
            >
              Entendido
            </button>
          }
        />
      )}
    </>
  );

  const bloqueManuales = (
    <>
          {/* Líneas con precio a mano: sin producto, no mueven stock, con motivo. */}
          {manualesLeidas.map((m) => (
            <fieldset key={m.key} className="rounded-md border border-dashed border-line-strong p-2 space-y-2">
              <legend className="px-1 text-xs text-muted">Precio a mano · no descuenta stock</legend>
              <div className="grid grid-cols-[1fr_auto] gap-2 @md:grid-cols-[1fr_128px_auto]">
                <label className="col-span-2 @md:col-span-1">
                  <span className="sr-only">Qué se vende</span>
                  <Input
                    id={`manual-nombre-${m.key}`}
                    value={m.nombre}
                    onChange={(e) => setManual(m.key, { nombre: e.target.value })}
                    placeholder="Qué se vende (ej.: Bondiola)"
                    maxLength={80}
                  />
                </label>
                <label>
                  <span className="sr-only">Importe</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={m.importeText}
                    onChange={(e) => setManual(m.key, { importeText: e.target.value })}
                    placeholder="$ Importe"
                    className="text-right tabular-nums"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => (enBoutique ? quitarManual(m.key) : setManuales((ms) => ms.filter((x) => x.key !== m.key)))}
                  aria-label="Quitar la línea con precio a mano"
                  className="inline-flex h-11 w-11 items-center justify-center text-lg leading-none text-muted hover:text-danger"
                >
                  ×
                </button>
                <label className="col-span-2 @md:col-span-3">
                  <span className="sr-only">Motivo</span>
                  <Input
                    id={enBoutique ? `manual-motivo-${m.key}` : undefined}
                    value={m.motivo}
                    onChange={(e) => setManual(m.key, { motivo: e.target.value })}
                    placeholder="Motivo (obligatorio): ej. no tiene precio cargado"
                    maxLength={200}
                    aria-invalid={m.error ? true : undefined}
                  />
                </label>
                {/* Mostrador boutique (2A): los motivos frecuentes en chips; «Otro…» va a escribirlo. */}
                {enBoutique && (
                  <div role="group" aria-label="Motivos frecuentes" data-vender="motivos-a-mano" className="col-span-2 flex flex-wrap gap-2 @md:col-span-3">
                    {MOTIVOS_PRECIO_A_MANO.map((motivo) => (
                      <button
                        key={motivo}
                        type="button"
                        aria-pressed={m.motivo === motivo}
                        onClick={() => setManual(m.key, { motivo })}
                        className={cn("chip-btn h-11 text-sm", m.motivo === motivo && "!border-accent !bg-accent !text-on-accent")}
                      >
                        {motivo}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        if ((MOTIVOS_PRECIO_A_MANO as readonly string[]).includes(m.motivo)) setManual(m.key, { motivo: "" });
                        pedirFoco(`manual-motivo-${m.key}`);
                      }}
                      className="chip-btn h-11 text-sm"
                    >
                      Otro…
                    </button>
                  </div>
                )}
              </div>
              {m.error && (
                <p role="alert" className="text-xs text-danger">
                  {m.error}
                </p>
              )}
              {m.valida && (
                <>
                  <input type="hidden" name="manualNombre" value={m.nombre} />
                  <input type="hidden" name="manualImporte" value={importeParaFormulario(m.importe)} />
                  <input type="hidden" name="manualMotivo" value={m.motivo} />
                </>
              )}
            </fieldset>
          ))}
    </>
  );

  const bloqueDescuento = (
    <>
        {/* Descuento: un botón, no un campo más en el camino. */}
        {conDescuento && (
          <div className="space-y-2 border-t border-line pt-4">
            <div className="flex flex-wrap items-end gap-2">
              <div role="radiogroup" aria-label="Tipo de descuento" className="flex gap-1">
                {(
                  [
                    ["porcentaje", "%"],
                    ["monto", "$"],
                    ["cupon", "Cupón"],
                  ] as const
                ).map(([valor, etiqueta]) => (
                  <button
                    key={valor}
                    type="button"
                    role="radio"
                    aria-checked={tipoDescuento === valor}
                    onClick={() => setTipoDescuento(valor)}
                    className={cn(
                      "chip-btn h-11 justify-center text-sm",
                      valor === "cupon" ? "px-3" : "w-11",
                      tipoDescuento === valor && "bg-accent text-on-accent",
                    )}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
              {usaCupon ? (
                <>
                  <label className="text-sm">
                    <span className="mb-1 block text-muted">Código del cupón</span>
                    <Input
                      id="descuento-valor"
                      type="text"
                      autoComplete="off"
                      value={cupon.codigo}
                      onChange={(e) => cupon.cambiar(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void cupon.aplicar();
                        }
                      }}
                      className="w-40 uppercase"
                      aria-invalid={cupon.error ? true : undefined}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void cupon.aplicar()}
                    disabled={cupon.probando}
                    className="chip-btn h-11 text-sm"
                  >
                    {cupon.probando ? "Revisando…" : "Aplicar"}
                  </button>
                </>
              ) : (
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Descuento {tipoDescuento === "porcentaje" ? "(%)" : "($)"}</span>
                  <Input
                    id="descuento-valor"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={descuentoText}
                    onChange={(e) => setDescuentoText(e.target.value)}
                    className="w-32 text-right tabular-nums"
                    aria-invalid={!descuento.ok ? true : undefined}
                  />
                </label>
              )}
              <button
                type="button"
                onClick={() => {
                  setConDescuento(false);
                  setDescuentoText("");
                  cupon.limpiar();
                }}
                className="h-11 px-2 text-sm text-muted hover:underline"
              >
                Sin descuento
              </button>
            </div>
            {usaCupon ? (
              <>
                {cupon.aplicado && (
                  <p role="status" className="text-xs text-success">
                    Cupón {cupon.aplicado.codigo}: −{fmtMoneyARS(cupon.descuento)}. Lo cargó la dueña: no tiene el tope del descuento a mano.
                  </p>
                )}
                {cupon.error && (
                  <p role="alert" className="text-xs text-danger">
                    {cupon.error}
                  </p>
                )}
                <input type="hidden" name="cupon" value={cupon.aplicado?.codigo ?? cupon.codigo} />
              </>
            ) : (
              <>
                {topeDescuentoPct != null && (
                  <p className="text-xs text-faint">Con tu usuario, hasta el {topeDescuentoPct} % de la venta.</p>
                )}
                {!descuento.ok && (
                  <p role="alert" className="text-xs text-danger">
                    {descuento.error}
                  </p>
                )}
                <input type="hidden" name="descuentoTipo" value={tipoDescuento} />
                <input type="hidden" name="descuentoValor" value={descuentoText} />
              </>
            )}
          </div>
        )}
    </>
  );

  const bloqueAviso = (
    <>
          {aviso && (
            <AvisoError
              titulo={aviso.titulo}
              comoSeguir={aviso.comoSeguir}
              accion={
                yaGrabada ? (
                  <>
                    {cobrarAparte && (
                      <button
                        type="button"
                        onClick={() => (yaGrabada.faltante && !yaGrabada.anulada ? cargarSoloLoQueFalta(yaGrabada, yaGrabada.faltante) : esOtraVenta())}
                        className="h-11 px-2 text-sm font-medium text-strong underline"
                      >
                        {cobrarAparte}
                      </button>
                    )}
                    {yaGrabada.ticket && (
                      <button
                        type="button"
                        onClick={() => {
                          setVerGrabada(true);
                          pedirFoco("venta-ya-grabada");
                        }}
                        className="h-11 px-2 text-sm text-strong underline"
                      >
                        {etiquetaDeVerGrabada(yaGrabada)}
                      </button>
                    )}
                    {!etiquetaDeCobrarAparte(yaGrabada) && fueraDelCatalogo.length === 0 && (
                      <>
                        <a
                          href={yaGrabada.esPedido ? "/admin/pedidos" : "/admin/ventas"}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex h-11 items-center px-2 text-sm text-strong underline"
                        >
                          {yaGrabada.esPedido ? "Abrir Pedidos para preparar" : "Abrir Ventas del día"}
                        </a>
                        <button type="button" onClick={volverAConsultar} className="h-11 px-2 text-sm text-strong underline">
                          {ETIQUETA_VOLVER_A_CONSULTAR}
                        </button>
                      </>
                    )}
                    <button type="button" onClick={limpiar} className="h-11 px-2 text-sm text-muted hover:underline">
                      {ETIQUETA_DEJARLA_ASI}
                    </button>
                  </>
                ) : confirmarEmpezar ? (
                  <>
                    <p className="w-full text-sm text-body">{avisoAntesDeEmpezarDeNuevo(isOrder)}</p>
                    <button type="button" onClick={limpiar} className="h-11 px-2 text-sm font-medium text-strong underline">
                      Sí, empezar de nuevo
                    </button>
                    <button type="button" onClick={() => setConfirmarEmpezar(false)} className="h-11 px-2 text-sm text-muted hover:underline">
                      Cancelar
                    </button>
                  </>
                ) : !aviso.reintentar || sinRespuesta ? (
                  <>
                    {cambioTrasCorte ? (
                      <button type="button" onClick={esOtraVenta} className="h-11 px-2 text-sm font-medium text-strong underline">
                        {etiquetaDeOtraVenta(isOrder)}
                      </button>
                    ) : !aviso.reintentar ? (
                      <button type="button" onClick={() => setFalla(null)} className="h-11 px-2 text-sm text-muted hover:underline">
                        Entendido
                      </button>
                    ) : null}
                    {/* Con un envío en duda, siempre hay salida: empezar de nuevo, después de revisar. */}
                    {sinRespuesta && (
                      <button type="button" onClick={() => setConfirmarEmpezar(true)} className="h-11 px-2 text-sm text-muted hover:underline">
                        Empezar de nuevo
                      </button>
                    )}
                  </>
                ) : undefined
              }
            />
          )}
          {soloLoQueFalta && !aviso && (
            <p role="status" className="text-sm text-body">
              Cargado sólo lo que faltaba de la venta #{soloLoQueFalta.code}: {soloLoQueFalta.texto}. Total a cobrar aparte:{" "}
              <strong className="tabular-nums text-strong">{fmtMoneyARS(total)}</strong>.
            </p>
          )}
    </>
  );

  // Todo lo que frena el botón de cobrar (la misma regla para las dos vistas).
  const cobrarBloqueado =
    !hayLineaValida ||
    (hayFaltante && !reintentoDeLaMisma) ||
    hayCantidadInvalida ||
    lineaSinCantidad !== undefined ||
    lineaConPesoSinConfirmar !== undefined ||
    hayManualInvalida ||
    faltaMedio ||
    !descuento.ok ||
    cuponSinAplicar ||
    faltaFichaACuenta ||
    cambioTrasCorte ||
    yaGrabada !== null;

  // Diseño nuevo: los atajos del mostrador. «/» busca, F2 cobra, Alt+1..3 elige el medio, Esc
  // limpia (sólo sin un cobro en duda: con una duda, «Empezar de nuevo» pregunta antes). Nunca con
  // el foco en un campo (Esc ahí es del campo) ni con un diálogo abierto.
  useEffect(() => {
    // En el boutique cobra el pie (sus medios son botones): los atajos del ticket no aplican.
    if (!nuevo || enBoutique) return;
    const alPresionar = (e: KeyboardEvent) => {
      const enCampo = enCampoEditable(e.target as HTMLElement | null);
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "F2" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (!cobrarBloqueado) formulario.current?.requestSubmit();
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-3]$/.test(e.key) && paid) {
        const m = MEDIOS_DE_COBRO[Number(e.key) - 1];
        if (m) {
          e.preventDefault();
          setMedio(m.valor);
          setACuenta(false);
        }
        return;
      }
      if (enCampo || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("vender-buscar")?.focus();
      } else if (e.key === "Escape" && !sinRespuesta && !yaGrabada) {
        limpiar();
      }
    };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  });

  function sumarUnidades(productId: string, n = 1) {
    const r = sumarUnaUnidad(lines, productId, nextKey, n);
    setLines(r.lineas);
    if (r.usoNuevaKey) setNextKey((k) => k + 1);
  }

  /** Por kilo: el renglón espera el peso, con el teclado grande abierto en una pantalla táctil. */
  function alPeso(productId: string) {
    const vacia = lines.find((l) => !l.productId);
    const key = vacia ? vacia.key : addLine(productId);
    if (vacia) setLine(key, { productId, qtyText: "" });
    setActivoKey(key);
    if (esTactil() || prefiereTeclado()) setTecladoDe(key);
    pedirFoco(`qty-${key}`);
  }

  /** ¿Pantalla táctil? (tablet, celular): ahí el teclado grande está siempre abierto en lo que se pesa. */
  function esTactil(): boolean {
    try {
      return window.matchMedia("(pointer: coarse)").matches;
    } catch {
      return false; // sin matchMedia: como en la PC
    }
  }

  function quitarManual(key: number) {
    const indice = manuales.findIndex((m) => m.key === key);
    if (indice < 0) return;
    const linea = manuales[indice];
    setManuales((ms) => ms.filter((m) => m.key !== key));
    setQuitado({ tipo: "manual", q: { linea, indice }, nombre: linea.nombre.trim() || "la línea con precio a mano" });
  }

  /**
   * MG-048: el precio de HOY de productos del ticket (leído al sumar el renglón, o devuelto por el
   * cobro frenado). Si alguno cambió (el dueño lo subió con el ticket abierto), la pantalla pasa a
   * ese precio y el renglón dice «Subió a $X recién». Al cobrar, además, se rearma el pie (su vuelto
   * era del total viejo) y se cobra con el próximo toque, ya con el total a la vista.
   */
  function aplicarPreciosVigentes(
    enPantalla: { id: string; name: string; saleUnit: "UNIT" | "WEIGHT"; price: number | null; pricePerKg: number | null }[],
    vigentes: Record<string, PrecioVigente>,
    momento: "al-sumar" | "al-cobrar",
  ) {
    const nuevos = cambiosDePrecio(enPantalla, vigentes);
    if (nuevos.length === 0) return;
    setPreciosNuevos((p) => ({ ...p, ...Object.fromEntries(nuevos.map((c) => [c.id, vigentes[c.id]])) }));
    // El chip dice el cambio desde lo que se veía la PRIMERA vez (si cambió dos veces, desde el original).
    setCambios((c) => ({ ...c, ...Object.fromEntries(nuevos.map((x) => [x.id, { ...x, antes: c[x.id]?.antes ?? x.antes }])) }));
    setAvisoBoutique(momento === "al-cobrar" ? avisoDeCambioDePrecio(nuevos) : avisoDePrecioAlSumar(nuevos));
    if (momento === "al-cobrar") setPieKey((k) => k + 1);
  }

  /** El dueño guarda las teclas fijas (con la versión que leyó: no pisa a otro). */
  async function guardarFijadas(ids: string[]): Promise<string | null> {
    try {
      const r = await fijarTeclasDelMostrador({ ids, version: fijadas.version });
      if (!r.ok) return r.error;
      setFijadas({ ids: r.ids, version: r.version });
      return null;
    } catch (e) {
      if (isNextRedirect(e)) throw e;
      return "No pudimos guardar las teclas: revisá la señal y probá de nuevo.";
    }
  }

  /** ¿Se puede tocar el ticket ahora? (no con un cobro en vuelo o en duda: se borraría al limpiar). */
  function sePuedeSumar(): boolean {
    const motivo = motivoParaNoSumar({ cobrando: cobrandoAhora.current, cobroEnDuda: sinRespuesta !== null || yaGrabada !== null });
    setAvisoBoutique(motivo);
    return motivo === null;
  }

  function tocarTecla(productId: string, enLaMano = false) {
    const p = byId.get(productId);
    if (!p || !sePuedeSumar()) return;
    setCoincidencias(null);
    setAgotadoEnLaMano(null);
    const t = teclaDeProducto(p, stockById[p.id]);
    if (t.bloquea) {
      setAvisoBoutique(`${p.name} está agotado.`);
      return;
    }
    // MG-047: la tecla agotada no carga el renglón. Por kilo, si el paquete está en la mano (el
    // stock del sistema puede ir atrasado, MAG-4), se vende igual con un toque más.
    if (t.agotado && !enLaMano) {
      setAgotadoEnLaMano(p.id);
      return;
    }
    if (p.saleUnit === "UNIT") sumarUnidades(p.id);
    else alPeso(p.id);
  }

  // El toque y el «fijar» de las teclas, con identidad fija (P-3): acá, después de declarar
  // `tocarTecla` y `guardarFijadas`, y antes de elegir la vista.
  const tocarTeclaEstable = useLlamadaEstable((id: string) => tocarTecla(id));
  const guardarFijadasEstable = useLlamadaEstable((ids: string[]) => guardarFijadas(ids));

  // MG-048 (tanda perf, sólo el boutique): el precio de HOY de cada producto se pide AL SUMARLO al
  // ticket, en segundo plano (como mucho una vez por minuto y por producto). Así el cobro es un solo
  // viaje: el servidor igual controla el precio visto al cobrar (`cobrarDelMostrador`).
  const idsDelTicket = enBoutique
    ? [...new Set(leidas.filter((l) => l.productId && byId.has(l.productId)).map((l) => l.productId))].sort().join(",")
    : "";
  const precioControlado = useRef(new Map<string, number>());
  const controlarPreciosAlSumar = useEffectEvent((ids: string[], ahora: number) => {
    const nuevos = ids.filter((id) => debeControlarPrecio(precioControlado.current.get(id), ahora));
    if (nuevos.length === 0) return;
    for (const id of nuevos) precioControlado.current.set(id, ahora);
    const enPantalla = nuevos.map((id) => byId.get(id)!);
    const olvidar = () => nuevos.forEach((id) => precioControlado.current.delete(id));
    conTiempoMaximo(preciosVigentesDelTicket(nuevos), 2500).then(
      (r) => {
        if (r.tipo !== "respuesta") return olvidar();
        aplicarPreciosVigentes(enPantalla, r.valor, "al-sumar");
      },
      // Sin respuesta (o la sesión venció): no se avisa nada; el cobro controla igual.
      olvidar,
    );
  });
  useEffect(() => {
    if (idsDelTicket && enLinea) controlarPreciosAlSumar(idsDelTicket.split(","), Date.now());
  }, [idsDelTicket, enLinea]);

  return {
    Quien,
    aCuenta,
    aCuentaActivo,
    aCuentaDisponible,
    activoKey,
    addLine,
    addManual,
    agotadoEnLaMano,
    alPeso,
    alQuien,
    aviso,
    avisoBoutique,
    avisoDeLaFicha,
    avisoLector,
    balanza,
    bloqueAviso,
    bloqueConfirmacion,
    bloqueDescuento,
    bloqueDudas,
    bloqueGrabada,
    bloqueManuales,
    bloqueUltima,
    botonesRapidos,
    busqueda,
    byId,
    cambioTrasCorte,
    cambios,
    camposDelUltimoPie,
    clienteKey,
    clienteVenta,
    cobrarBloqueado,
    cobroFrenadoPorPrecio,
    coincidencias,
    conCliente,
    conDescuento,
    conLector,
    conPeso,
    conZona,
    confirmacionDe,
    cotizacionEnvio,
    cupon,
    cuponSinAplicar,
    descuento,
    descuentoText,
    desdeLaFicha,
    direccion,
    elegirRapido,
    enviable,
    enviandoBoutique,
    envioPrevisto,
    esTactil,
    faltaFichaACuenta,
    faltanteDe,
    fijadas,
    finDelCobro,
    formulario,
    fulfillment,
    guardarFijadasEstable,
    hayCantidadInvalida,
    hayFaltante,
    hayLineaValida,
    hayManualInvalida,
    horario,
    huerfana,
    isOrder,
    k,
    leidas,
    lineaConPesoSinConfirmar,
    lineaSinCantidad,
    lines,
    manuales,
    manualesLeidas,
    medio,
    motivoBloqueo,
    negocio,
    negocioId,
    nextKey,
    nombreCliente,
    nombresDeLaDuda,
    nota,
    nuevo,
    opciones,
    pagoConDelPie,
    pagoConText,
    paid,
    pedirFoco,
    perfil,
    pieKey,
    productosConCodigo,
    products,
    puedeFacturar,
    quienCompra,
    quitado,
    reintentando,
    reintentoDeLaMisma,
    removeLine,
    rotuloRapidos,
    sePuedeSumar,
    setACuenta,
    setActivoKey,
    setAgotadoEnLaMano,
    setAvisoBoutique,
    setAvisoDeLaFicha,
    setBusqueda,
    setClienteVenta,
    setCoincidencias,
    setConCliente,
    setConDescuento,
    setDescuentoText,
    setDireccion,
    setEnviandoBoutique,
    setFulfillment,
    setHorario,
    setIsOrder,
    setLine,
    setLines,
    setManuales,
    setMedio,
    setNextKey,
    setNombreCliente,
    setNota,
    setPagoConText,
    setPaid,
    setPesosConfirmados,
    setQuitado,
    setReintentando,
    setTecladoDe,
    setTelefono,
    setTipoDescuento,
    setVersionDelPeso,
    setZonaId,
    sinConfirmar,
    sinRespuesta,
    soltarFocoParaElLector,
    stockById,
    submit,
    subtotal,
    sumarUnidades,
    sustantivo,
    tecladoDe,
    teclasBoutique,
    telefono,
    tipoDescuento,
    tocarTecla,
    tocarTeclaEstable,
    topePrecioAMano,
    total,
    totalACobrar,
    totalDeLinea,
    usarTeclado,
    vendedor,
    versionDelPeso,
    yaGrabada,
    zonaId,
    zonasDelEnvio,
  };
}

export type NucleoDeVenta = ReturnType<typeof useNucleoDeVenta>;
