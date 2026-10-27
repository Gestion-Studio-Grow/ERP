"use client";

// VENDER — el mostrador en su propia pantalla.
//
// Es el POS de la bandeja (pedidos/PosForm.tsx) con lo que el local no podía hacer: dar el
// vuelto, hacer un descuento, vender algo sin precio cargado, dejar la venta en la ficha del
// cliente, llegar en un toque a lo que más se vende y darle el ticket. La regla de diseño es
// que NADA de eso agrega un paso al camino feliz: Vacío, 1,240, Efectivo, Cobrar sigue siendo
// lo mismo. Cliente, descuento y precio a mano están cerrados hasta que alguien los abre; el
// vuelto aparece solo cuando el medio es efectivo.
//
// Lo que se mantiene del PosForm, con el mismo porqué (ver los comentarios de allá):
//   · la cantidad se TIPEA como texto y se lee con `leerCantidad` (coma y punto valen igual);
//   · el medio arranca vacío siempre: nunca efectivo por default;
//   · la clave de idempotencia es una por ticket y se renueva recién cuando el ticket se limpia;
//   · los rechazos del servidor llegan DEVUELTOS (no lanzados) y se muestran enteros.
//
// En el celular el total y el botón de cobrar quedan FIJOS abajo (se ve cuánto es y se cobra sin
// bajar hasta el final), y lo que no salió se dice AHÍ, al lado del botón, hasta que se resuelva:
// antes era un aviso de 4 segundos que en el celular tapaba justo el botón y se iba. Sin señal a
// mitad del cobro, el botón pasa a «Reintentar cobro» con la MISMA venta (cobro-sin-conexion.ts).
// Lo mismo si el servidor no contesta en TIEMPO_MAXIMO_DEL_COBRO_MS o falla por algo que no es un
// rechazo de negocio. Esa duda queda guardada en la pestaña (sessionStorage, por negocio): si se
// recarga o se vuelve a Vender, reaparece con lo cargado y la misma clave. Y si el servidor
// contesta que esa clave ya estaba grabada con OTRA cosa («ya-grabada-distinta»), se dice cuál
// quedó y qué no se registró, y se ofrece cobrar sólo lo que falta como otra venta.
//
// Todas las reglas de plata (descuento, tope, vuelto, precio a mano) son las de
// reglas-venta.ts, las MISMAS que aplica el servidor: la pantalla avisa y el servidor decide.
//
// EL LECTOR (sólo con el módulo `terminal`, que decide el servidor y llega en `terminal`): una
// ráfaga de teclas que termina como termina el lector de ESTE equipo (Enter, Tab o nada; perfil
// en «Este equipo»), FUERA de un campo, es un código de barras: se busca en el catálogo que ya
// está en la pantalla (`codigo` del producto) y se suma la línea, como si se la hubiera elegido
// en el buscador. El tipeo de una persona nunca dispara (es mucho más lento que un lector, ver
// src/lib/terminal/lector-core.ts) y dentro de un campo el teclado es de la persona. Si el código
// no está, se dice y suena el error; el cobro no se toca. Precio y stock los decide el servidor
// al cobrar, como siempre. Sin el módulo, nada de esto existe.
// Sin imports de valor de Prisma: esto es un client component.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync, useFormStatus } from "react-dom";
import Link from "next/link";
import { createOrder, buscarClienteParaVenta, facturarVenta } from "@/lib/order-actions";
import { AvisoError, BuscadorCombo, Input, Select, buttonClasses, cn, fmtMoneyARS, type OpcionBuscador } from "@/components/ui";
import { Atajos } from "@/components/ui/Renglon";
import { Kbd } from "@/components/ui/Kbd";
import { Plata } from "@/components/ui/Plata";
import { Icono, iconoDelMedio } from "@/components/ui/Icono";
import { TecladoNumerico } from "@/components/ui/Teclado";
import { useDiseno } from "@/lib/diseno/DisenoProvider";
import { faltanteDeLinea, type PosStockInfo } from "@/lib/stock/pos-stock-rules";
import { MEDIOS_DE_COBRO, leerMedioDeCobro, type MedioDeCobro } from "@/lib/caja/medio-cobro";
import type { VentaYaGrabada } from "@/lib/reintento-de-venta";
import {
  leerCantidad,
  cantidadParaFormulario,
  confirmacionDePeso,
  pesoPorConfirmar,
  motivoDePesoSinConfirmar,
  formatearCantidad,
  importeOCero,
  importeParaFormulario,
  leerImporte,
} from "@/lib/pos-peso";
import { textoDelFaltante, type Faltante } from "@/lib/reintento-de-venta";
import { round2 } from "@/lib/round";
import TicketVenta from "./TicketVenta";
import {
  COBRAR_EL_DE_LA_ETIQUETA,
  etiquetaDistinta,
  lineaAManoDeLaEtiqueta,
  puedeCobrarElDeLaEtiqueta,
  textoEtiquetaDistinta,
} from "./etiqueta-de-balanza";
import type { ClienteElegido, ValorDelCliente } from "./ClienteDeLaVenta";
// Rama boutique (tanda perf): el bloque Cliente diferido y las teclas memorizadas.
import { ClienteDeLaVentaDiferido as ClienteDeLaVenta, TeclasMemorizadas, useLlamadaEstable, usePrecargaDelCliente } from "./boutique/perezosos";
import type { RepetirPedido } from "@/lib/clientes/fiado";
import ZonaDelEnvio from "./ZonaDelEnvio";
import { CampoUnico, ID_CAMPO_UNICO, type LecturaUnica } from "@/components/lector/CampoUnico";
import { PieDeCobro, type ResultadoDelPie } from "@/components/cobro/PieDeCobro";
import { camposDelPie } from "@/lib/cobro/pie-de-cobro-core";
import { cotizarEnvioDelMostrador, tieneZonas } from "@/lib/envios/tarifa";
import type { ConfigEnvios } from "@/lib/envios/modelo";
import { describirFormato } from "@/lib/supermercado/balanza";
import { indiceDelLector, lineaDesdeLectura, REGLA_DEL_PRECIO_DE_BALANZA, type ProductoDelLector } from "@/lib/lector/linea-desde-lectura";
import { etiquetaDistintaDelSistema } from "@/lib/lector/decidir-lectura";
import TomarPesoParaElTicket from "@/components/balanza/TomarPesoParaElTicket";
import type { BalanzaSerie } from "@/lib/balanza-serie/usar-balanza-serie";
import { usePerfilSiHayTerminal, type TerminalDelEquipo } from "@/lib/terminal/usar-perfil";
import { enCampoDeTexto, enCampoEditable, esCampoDeCantidad, motivoParaNoSumar } from "@/lib/terminal/lector-core";
import { useLectorDeRafaga, type OrigenDeLaLectura } from "@/lib/terminal/usar-lector";
import { avisar } from "@/lib/terminal/senal";
import { indexarPorCodigo, resolverCodigo } from "@/lib/supermercado/lectura";
import FacturarVenta from "../ventas/FacturarVenta";
import { SIN_FACTURA, type FacturaDeVenta } from "../ventas/factura";
import { useCuponDePedido } from "@/app/tienda/pedido-online";
import {
  aplicarDescuento,
  calcularVuelto,
  controlarPrecioAMano,
  descuentoDelFormulario,
  lineaSinCantidad as primeraLineaSinCantidad,
  motivoDeLineaSinCantidad,
  validarLineaAMano,
  type ResultadoDescuento,
  type TipoDescuento,
  type TopePrecioAMano,
  type VentaTicket,
  BANDA_DIA_CERRADO,
  REGISTRAR_PARA_MANANA,
  buscarEnElCatalogo,
  sumarUnaUnidad,
  teclaDeProducto,
  vueltoDelTicket,
  type BalanzaDeVender,
  CHIPS_DE_DESCUENTO,
  DESHACER_MS,
  MOTIVOS_PRECIO_A_MANO,
  avisoDeCambioDePrecio,
  cambiosDePrecio,
  descuentoParaRedondear,
  deshacerRenglon,
  faltaEnLineaAMano,
  gondolasDelMostrador,
  pasoDelRenglon,
  quitarRenglon,
  reemplazosDe,
  teclasPrincipales,
  textoDelCambioDePrecio,
  lineasDesdeLaFicha,
  avisoDeRepetir,
  type CambioDePrecio,
  type RenglonQuitado,
} from "./reglas-venta";
import TicketQueCrece, { ConBalanzaEnVivo, PesoEnVivoDelRenglon, RenglonDelTicket } from "./TicketQueCrece";
import { fijarTeclasDelMostrador, preciosVigentesDelTicket, type PrecioVigente } from "./acciones-del-mostrador";
import type { TeclasDelMostrador } from "./teclas.server";
import {
  almacenDeSesion,
  antesDeCobrar,
  avisoDelCobro,
  avisoDeYaGrabada,
  borrarCobroSinConfirmar,
  cambioDespuesDelCorte,
  claveParaCobrar,
  conTiempoMaximo,
  avisoAntesDeEmpezarDeNuevo,
  avisoDeDudaDeOtraPersona,
  avisoDeDudaIlegible,
  avisoDeGrabadaAhoraPorOtroTotal,
  cuandoDelEnvio,
  ETIQUETA_DEJARLA_ASI,
  ETIQUETA_VOLVER_A_CONSULTAR,
  etiquetaDeCobrarAparte,
  etiquetaDeOtraVenta,
  etiquetaDeReintento,
  etiquetaDeVerGrabada,
  firmaDelCobro,
  guardarCobroSinConfirmar,
  leerCobroSinConfirmar,
  recordarEnvioSinRespuesta,
  renovarClaveTrasRechazo,
  TIEMPO_MAXIMO_DEL_COBRO_MS,
  type CargadoDelCobro,
  type EnvioSinRespuesta,
} from "./cobro-sin-conexion";

type SellableProduct = {
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
type Line = {
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
const PREF_TECLADO = "vender:teclado-grande";
function prefiereTeclado(): boolean {
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
function ConfirmarPeso({
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

const ID_CAMPO_ETIQUETA = "vender-etiqueta";

/**
 * «Etiqueta de la balanza o código» — el campo de la vista DE SIEMPRE (sin el mostrador boutique),
 * al lado del buscador. Antes era su propio archivo (CampoEtiqueta.tsx); con el boutique lo
 * reemplaza el campo único (`CampoUnico`) y éste quedó acá, igual, sólo para la vista de siempre.
 *
 * El lector "tipea" los dígitos y manda un Enter: ese Enter carga el renglón (lib/lector) en vez de
 * mandar el formulario. Lo que no se puede leer se avisa con role="status" y no frena nada. El
 * campo no tiene `name`: no viaja al servidor, que vuelve a decidir todo al cobrar.
 */
function CampoEtiqueta({
  productos,
  balanza,
  alLeer,
}: {
  productos: readonly ProductoDelLector[];
  balanza: BalanzaDeVender;
  /** Carga el renglón. `qtyText` vacío = falta el peso (el foco va a ese campo). */
  alLeer: (productId: string, qtyText: string) => void;
}) {
  const indice = useMemo(() => indiceDelLector(productos), [productos]);
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
};

/** Una línea con precio a mano: nombre, importe tipeado y motivo. */
type LineaManual = { key: number; nombre: string; importeText: string; motivo: string };

function nuevaClaveDeTicket(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function precioDe(p: SellableProduct): number {
  return (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0;
}

// El redirect de sesión vencida llega como excepción con digest NEXT_REDIRECT: tragarlo
// dejaría a la persona sin login (el mismo helper que PosForm y los formularios de la bandeja).
function isNextRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function CobrarSubmit({ disabled, label, pendiente, atajo }: { disabled: boolean; label: string; pendiente: string; atajo?: string }) {
  const { pending } = useFormStatus();
  // Sin `atajo` (la vista de siempre), el botón de siempre, byte a byte. Con `atajo` (el ticket del
  // diseño nuevo), marcado para la piel y con la tecla a la vista en la PC.
  if (!atajo) {
    return (
      <button
        type="submit"
        disabled={disabled || pending}
        className={buttonClasses("solid", "lg", "w-full sm:w-auto disabled:opacity-50")}
      >
        {pending ? pendiente : label}
      </button>
    );
  }
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      data-ui="button"
      data-variant="solid"
      data-size="lg"
      data-estado={pending ? "cargando" : undefined}
      aria-keyshortcuts={atajo}
      className={buttonClasses("solid", "lg", "w-full")}
    >
      {pending ? pendiente : label}
      <Kbd enBoton>{atajo}</Kbd>
    </button>
  );
}

/** Lo que no salió en el último intento de cobro. El texto se arma al mostrarlo (según la señal de AHORA). */
// Lo que se mandó sin respuesta (su firma y su total) NO va acá: se guarda aparte, porque el
// intento siguiente pisa la falla y la duda sigue (cobro-sin-conexion.ts, "Lo que se mandó y no
// tuvo respuesta").
type Falla = { tipo: "sin-senal" } | { tipo: "red" } | { tipo: "rechazo"; error: string };

type PropsDeVender = {
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

const sinSuscripcion = () => () => {};

// El servidor no tiene el almacén de la pestaña, y la primera pintura del navegador tiene que
// ser igual a la del servidor: ésa se arma sin mirar el almacén. Apenas se sabe que se está en el
// navegador, el formulario se arma de nuevo, ya con el cobro sin confirmar si quedó uno (el mismo
// arreglo que RecuentoForm). Navegando dentro del panel no hay pintura del servidor: se arma una
// sola vez, directo con lo guardado.
export default function VenderForm(props: PropsDeVender) {
  const enNavegador = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  return <FormularioVender key={enNavegador ? "navegador" : "servidor"} {...props} enNavegador={enNavegador} />;
}

/**
 * Las líneas con las que arranca el formulario: las de un cobro sin confirmar, las del pedido que
 * se repite desde la ficha (boutique), o una vacía.
 */
function lineasIniciales(
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

function FormularioVender({
  products: productosDeLaPagina,
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
  enNavegador,
}: PropsDeVender & { enNavegador: boolean }) {
  // «Subió a $X recién» (MG-048, sólo el boutique): el precio de HOY de los productos cuyo precio
  // cambió con el ticket abierto (lo leyó `preciosAlDia` antes de cobrar). Pisa al de la página en
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

  // El campo de la etiqueta: el renglón entra como con una tecla rápida, pero con el peso (o la
  // cantidad) ya puesto. Completo, el foco vuelve al campo para la próxima etiqueta; si falta el
  // peso (se tipeó el PLU de un corte por kilo), va a ese peso.
  function cargarLectura(productId: string, qtyText: string) {
    const vacia = lines.find((l) => !l.productId);
    const key = vacia ? vacia.key : addLine(productId);
    setLine(key, { productId, qtyText });
    pedirFoco(qtyText ? ID_CAMPO_ETIQUETA : `qty-${key}`);
  }
  const productosConCodigo = useMemo(
    () => products.map((p) => ({ id: p.id, name: p.name, codigo: p.codigo ?? null, saleUnit: p.saleUnit, price: p.price, pricePerKg: p.pricePerKg })),
    [products],
  );
  const campoEtiqueta = balanza ? <CampoEtiqueta productos={productosConCodigo} balanza={balanza} alLeer={cargarLectura} /> : null;
  // El peso en vivo por cable (Chrome de computadora): sólo si algo se vende por kilo.
  const tomarPeso =
    conPeso && negocioId && products.some((p) => p.saleUnit === "WEIGHT") ? (
      <TomarPesoParaElTicket
        negocio={negocioId}
        renglones={lines}
        porKilo={(id) => byId.get(id)?.saleUnit === "WEIGHT"}
        nombreDe={(id) => byId.get(id)?.name ?? ""}
        alPoner={(key, qtyText) => setLine(key, { qtyText })}
      />
    ) : null;
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

  // Lo que dijo la última lectura, al lado del buscador. Sólo con el lector (módulo `terminal`).
  const bloqueLector = conLector ? (
    <p
      role={avisoLector?.tono === "error" ? "alert" : "status"}
      aria-live="polite"
      data-vender="lector"
      className={cn("min-h-5 text-sm", avisoLector?.tono === "error" ? "font-medium text-danger" : "text-muted")}
    >
      {avisoLector?.texto ?? ""}
    </p>
  ) : null;

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
  const vuelto = paid && !aCuentaActivo && medio === "EFECTIVO" ? calcularVuelto(totalACobrar, pagoConText) : null;

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

  async function buscarCliente() {
    const tel = telefono.trim();
    if (tel.replace(/\D/g, "").length < 6) return;
    setBusqueda("buscando");
    try {
      const r = await buscarClienteParaVenta(tel);
      if (r) {
        setNombreCliente(r.nombre);
        setBusqueda("encontrado");
      } else {
        setBusqueda("sin-ficha");
      }
    } catch (e) {
      if (isNextRedirect(e)) throw e;
      setBusqueda("error");
    }
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
    let espera;
    try {
      espera = await conTiempoMaximo(createOrder(fd), TIEMPO_MAXIMO_DEL_COBRO_MS);
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

  // Diseño nuevo: la tecla principal deshabilitada SIEMPRE dice qué falta (sin líneas, «Cargá un
  // producto…»; con una línea sin peso, cuál) y la que cobra dice el monto, también en el pedido.
  const etiquetaCobrar = !hayLineaValida
    ? nuevo
      ? lineaSinCantidad
        ? motivoDeLineaSinCantidad(byId.get(lineaSinCantidad.productId))
        : isOrder
          ? "Cargá un producto para el pedido"
          : "Cargá un producto para cobrar"
      : "Cobrar"
    : motivoBloqueo ??
      (aviso?.reintentar
        ? isOrder
          ? etiquetaDeReintento(true)
          : // El reintento de la duda dice lo que se MANDÓ (y quizá se cobró), no el total a
            // precios de hoy: si estaba grabada, vuelve esa venta con ese total.
            `${etiquetaDeReintento()} ${fmtMoneyARS(reintentoDeLaMisma && sinRespuesta ? sinRespuesta.total : totalACobrar)}`
        : isOrder
          ? nuevo && paid
            ? `Registrar y cobrar ${fmtMoneyARS(totalACobrar)}`
            : "Registrar pedido"
          : aCuentaActivo
            ? `Dejar a cuenta ${fmtMoneyARS(total)}`
            : `Cobrar ${fmtMoneyARS(totalACobrar)}`);

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

  const bloqueCliente = (
    <>
        {/* Cliente: opcional en la venta, obligatorio el nombre en el pedido. */}
        {isOrder || conCliente ? (
          <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Teléfono / WhatsApp{isOrder ? "" : " (opcional)"}</span>
              <div className="flex gap-2">
                <Input
                  id="vender-telefono"
                  name="customerPhone"
                  inputMode="tel"
                  autoComplete="off"
                  value={telefono}
                  onChange={(e) => {
                    setTelefono(e.target.value);
                    if (busqueda !== "nada") setBusqueda("nada");
                  }}
                  onBlur={() => void buscarCliente()}
                  placeholder="11…"
                />
                <button
                  type="button"
                  onClick={() => void buscarCliente()}
                  className="chip-btn h-11 shrink-0 text-sm"
                  disabled={busqueda === "buscando"}
                >
                  {busqueda === "buscando" ? "Buscando…" : "Buscar"}
                </button>
              </div>
              {busqueda === "encontrado" && (
                <span role="status" className="mt-1 block text-xs text-success">
                  {Quien}: {nombreCliente}. La venta queda en su ficha.
                </span>
              )}
              {busqueda === "sin-ficha" && (
                <span role="status" className="mt-1 block text-xs text-muted">
                  No hay una ficha con ese teléfono: la venta queda con el nombre que escribas.
                </span>
              )}
              {busqueda === "error" && (
                <span role="alert" className="mt-1 block text-xs text-warning">
                  No se pudo buscar ahora. Podés seguir: la venta se registra igual.
                </span>
              )}
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Nombre{isOrder ? " *" : " (opcional)"}</span>
              <Input
                name="customerName"
                required={isOrder}
                value={nombreCliente}
                onChange={(e) => setNombreCliente(e.target.value)}
                placeholder="Nombre y apellido"
              />
            </label>
            {isOrder && (
              <>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Entrega</span>
                  <Select
                    name="fulfillment"
                    value={fulfillment}
                    onChange={(e) => setFulfillment(e.target.value as "PICKUP" | "DELIVERY")}
                  >
                    <option value="PICKUP">Retira en el local</option>
                    <option value="DELIVERY">Envío a domicilio</option>
                  </Select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Horario deseado</span>
                  <Input
                    name="scheduledFor"
                    type="datetime-local"
                    value={horario}
                    onChange={(e) => setHorario(e.target.value)}
                  />
                </label>
                {conZona && <ZonaDelEnvio zonas={zonasDelEnvio} valor={zonaId} alCambiar={setZonaId} cotizacion={cotizacionEnvio} />}
                {fulfillment === "DELIVERY" && (
                  <label className="text-sm sm:col-span-2">
                    <span className="mb-1 block text-muted">Dirección *</span>
                    <Input
                      name="address"
                      required
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                      placeholder="Calle, número, barrio"
                    />
                  </label>
                )}
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-muted">Nota</span>
                  <Input
                    name="notes"
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="Ej.: cortar en milanesas, sin grasa"
                  />
                </label>
              </>
            )}
          </div>
        ) : null}
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

  const bloqueMedios = (
    <>
          {paid && (
            <div
              role="radiogroup"
              aria-label="Cómo pagó"
              className="flex flex-wrap gap-2"
              onKeyDown={(e) => {
                const paso =
                  e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
                if (!paso) return;
                e.preventDefault();
                const n = MEDIOS_DE_COBRO.length;
                const actual = MEDIOS_DE_COBRO.findIndex((m) => `vender-medio-${m.valor}` === (e.target as HTMLElement).id);
                const sig = MEDIOS_DE_COBRO[(Math.max(actual, 0) + paso + n) % n];
                setMedio(sig.valor);
                document.getElementById(`vender-medio-${sig.valor}`)?.focus();
              }}
            >
              {MEDIOS_DE_COBRO.map((m, i) => (
                <button
                  key={m.valor}
                  id={`vender-medio-${m.valor}`}
                  type="button"
                  role="radio"
                  aria-checked={!aCuentaActivo && medio === m.valor}
                  tabIndex={(medio ? medio === m.valor : i === 0) ? 0 : -1}
                  onClick={() => {
                    setMedio(m.valor);
                    setACuenta(false);
                  }}
                  // `!`: `.chip-btn` (globals.css, sin capa) le gana a las utilidades en el color y el hover,
                  // y el elegido quedaba con texto apagado sobre el acento.
                  className={cn("chip-btn h-11 px-4 text-sm", !aCuentaActivo && medio === m.valor && "!border-accent !bg-accent !text-on-accent")}
                >
                  {nuevo && <Icono nombre={!aCuentaActivo && medio === m.valor ? "listo" : iconoDelMedio(m.valor)} />}
                  {m.etiqueta}
                </button>
              ))}
              {/* A cuenta: no es un medio (no entra plata), va a la cuenta corriente del cliente. */}
              {aCuentaDisponible && !isOrder && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={aCuentaActivo}
                  tabIndex={-1}
                  onClick={() => {
                    setACuenta(true);
                    setMedio("");
                    setConCliente(true);
                    pedirFoco("vender-telefono");
                  }}
                  className={cn("chip-btn h-11 px-4 text-sm", aCuentaActivo && "bg-accent text-on-accent")}
                >
                  {nuevo && <Icono nombre={aCuentaActivo ? "listo" : iconoDelMedio("A_CUENTA")} />}
                  A cuenta
                </button>
              )}
              {medio && !aCuentaActivo && <input type="hidden" name="paymentMethod" value={medio} />}
              {aCuentaActivo && <input type="hidden" name="aCuenta" value="1" />}
            </div>
          )}
          {aCuentaActivo && (
            <p role={faltaFichaACuenta ? "alert" : "status"} className={cn("text-xs", faltaFichaACuenta ? "text-warning" : "text-muted")}>
              {faltaFichaACuenta
                ? `Para dejar a cuenta, buscá ${alQuien} por su teléfono: la deuda queda en su ficha.`
                : `Queda en la cuenta corriente de ${nombreCliente}. No entra al libro de caja hasta que la pague.`}
            </p>
          )}
    </>
  );

  const bloqueVuelto = (
    <>
          {/* Vuelto: sólo con efectivo, y no se guarda. */}
          {vuelto && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-muted">Pagó con</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={pagoConText}
                  onChange={(e) => setPagoConText(e.target.value)}
                  placeholder="$"
                  className="w-36 text-right tabular-nums"
                  aria-invalid={vuelto.estado === "invalido" ? true : undefined}
                />
              </label>
              <p role="status" className="min-h-11 py-2 text-sm">
                {vuelto.estado === "ok" && (
                  <>
                    Vuelto <strong className="text-lg tabular-nums text-strong">{fmtMoneyARS(vuelto.vuelto)}</strong>
                  </>
                )}
                {vuelto.estado === "falta" && (
                  <span className="text-danger">Faltan {fmtMoneyARS(vuelto.falta)}</span>
                )}
                {vuelto.estado === "invalido" && <span className="text-danger">Eso no es un importe</span>}
              </p>
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

  /**
   * EL TICKET QUE CRECE (diseño nuevo, «Renglón»). La MISMA venta que la vista de siempre: las mismas
   * líneas, los mismos campos con el mismo nombre (lo que viaja al servidor es idéntico, lo prueba
   * vender-pantalla.test.ts) y las mismas reglas. Cambia cómo se ve y se toca:
   *   · a la izquierda (arriba en el celular) el buscador y las teclas de «Más vendidos» con su
   *     precio por kilo o por unidad; tocar una suma la línea y deja el cursor en su peso;
   *   · a la derecha (abajo) el ticket: cada línea `1,280 kg × $28.600 = $36.608`, con «−» para
   *     sacarla; el total grande para el cliente del otro lado del mostrador;
   *   · el pie: los medios como segmentado, «Pagó con» y el vuelto a la vista, y «Cobrar $X» (F2).
   * «Cobrado» deja de ser una casilla a la vista: cobrar ES la acción; «registrar sin cobrar» va a «Más».
   */
  function vistaTicket() {
    const conProducto = leidas.filter((l) => l.productId);
    const nLineas = leidas.filter(enviable).length + manualesLeidas.filter((m) => m.valida).length;
    const porPeso = botonesRapidos.some((p) => p.saleUnit === "WEIGHT");
    const buscarQue = sustantivo && sustantivo !== "producto" ? `Buscá un ${sustantivo} o un producto` : "Buscá un producto";
    const casillaCobrado = (
      <label data-vender="casilla" className="flex min-h-11 w-fit items-center gap-2 text-sm">
        <input
          key={isOrder ? "cobrado-pedido" : "cobrado-venta"}
          type="checkbox"
          name="paid"
          checked={paid}
          onChange={(e) => setPaid(e.target.checked)}
          className="h-5 w-5"
        />
        <span className="text-body">{isOrder ? "Ya está cobrado" : "Cobrado"}</span>
      </label>
    );
    return (
      <div data-vender="ticket-que-crece" className="space-y-4">
        {bloqueDudas}
        {bloqueUltima}
        {bloqueGrabada}
        {bloqueConfirmacion}
        <form ref={formulario} action={submit} data-vender="formulario" className="grid gap-6">
          <input type="hidden" name="channel" value={isOrder ? "ONLINE" : "COUNTER"} />
          <div data-vender="elegir" className="@container min-w-0 space-y-4">
            <BuscadorCombo
              id="vender-buscar"
              ariaLabel={buscarQue}
              placeholder={buscarQue}
              opciones={opciones}
              valor=""
              onElegir={(id) => elegirRapido(id)}
              // El foco vuelve acá solo después de cada peso: la lista se abre al tipear, no
              // encima de los más vendidos (un toque caía sobre otro corte).
              abrirAlEnfocar={false}
            />
            {campoEtiqueta}
            {tomarPeso}
            {bloqueLector}
            {botonesRapidos.length > 0 && (
              <section data-vender="rapidos" aria-labelledby="vender-rapidos">
                <div data-parte="cabeza" className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="vender-rapidos" className="text-[15px] font-semibold text-strong">
                    {rotuloRapidos}
                  </h2>
                  <p className="text-[13px] text-muted">{porPeso ? "Tocá y cargá el peso de la balanza" : "Tocá y cargá la cantidad"}</p>
                </div>
                <div data-parte="teclas" className="grid grid-cols-2 gap-2">
                  {botonesRapidos.map((p) => {
                    const esPeso = p.saleUnit === "WEIGHT";
                    return (
                      <button key={p.id} type="button" onClick={() => elegirRapido(p.id)} data-vender="tecla-producto" className="text-left">
                        <span data-parte="nombre">{p.name}</span>{" "}
                        <span data-parte="precio">
                          {fmtMoneyARS(precioDe(p), 0)}
                          <small> / {esPeso ? "kg" : "u"}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
            <Atajos
              atajos={[
                { teclas: ["/"], que: "buscar" },
                { teclas: ["Enter"], que: porPeso ? "listo el peso" : "listo" },
                { teclas: ["F2"], que: isOrder ? "registrar" : "cobrar" },
                { teclas: ["Alt", "1–3"], que: "medio de pago" },
                { teclas: ["Esc"], que: "limpiar" },
              ]}
            />
          </div>

          <section data-vender="ticket" aria-label={isOrder ? "Pedido" : "Ticket"} className="min-w-0">
            <header data-parte="cabeza" className="flex flex-wrap items-center justify-between gap-2">
              <div role="group" aria-label="Qué se registra" data-vender="modo" className="flex gap-1">
                <button
                  type="button"
                  aria-pressed={!isOrder}
                  onClick={() => {
                    if (!isOrder) return;
                    setIsOrder(false);
                    setPaid(true);
                  }}
                >
                  {!isOrder && <Icono nombre="listo" />}
                  Venta
                </button>
                <button
                  type="button"
                  aria-pressed={isOrder}
                  onClick={() => {
                    if (isOrder) return;
                    setIsOrder(true);
                    setPaid(false);
                    setACuenta(false);
                  }}
                >
                  {isOrder && <Icono nombre="listo" />}
                  Pedido
                </button>
              </div>
              <span data-parte="quien">{[vendedor, negocio].filter(Boolean).join(" · ")}</span>
            </header>

            {conProducto.length === 0 && manuales.length === 0 && (
              <p data-parte="vacio">
                {porPeso
                  ? "Tocá un producto o buscalo: la línea se suma acá y escribís el peso de la etiqueta de la balanza."
                  : "Tocá un producto o buscalo: la línea se suma acá con su cantidad y su precio."}
              </p>
            )}

            <ol data-parte="lineas" aria-label="Lo que lleva">
              {conProducto.map((l) => {
                const p = byId.get(l.productId);
                if (!p && huerfana(l.productId)) {
                  return (
                    <li key={l.key} data-vender="linea">
                      <div data-parte="que">
                        <span data-parte="producto">{nombresDeLaDuda[l.productId] ?? "Un producto"}</span>
                        <span data-parte="detalle" className="text-warning">
                          ya no está en el catálogo (va igual en el reintento)
                        </span>
                      </div>
                      <span id={`qty-${l.key}`} data-parte="cantidad">
                        {l.qtyText}
                      </span>
                      <span data-parte="importe" />
                      <button
                        type="button"
                        data-parte="quitar"
                        onClick={() => removeLine(l.key)}
                        aria-label={`Quitar línea de ${nombresDeLaDuda[l.productId] ?? "un producto"}`}
                      >
                        <Icono nombre="cerrar" />
                        <span data-parte="palabra">Quitar</span>
                      </button>
                      {l.qty > 0 && (
                        <>
                          <input type="hidden" name="productId" value={l.productId} />
                          <input type="hidden" name="quantity" value={cantidadParaFormulario(l.qty)} />
                        </>
                      )}
                    </li>
                  );
                }
                if (!p) return null;
                const esPeso = p.saleUnit === "WEIGHT";
                const lineTotal = totalDeLinea(l);
                const faltante = faltanteDe(l);
                const falta = faltante?.bloquea && !reintentoDeLaMisma ? faltante : null;
                const faltaEnDuda = faltante?.bloquea && reintentoDeLaMisma ? faltante : null;
                const avisoStock = faltante && !faltante.bloquea ? faltante.aviso : null;
                const confirmar = confirmacionDe(l);
                return (
                  <li key={l.key} data-vender="linea" data-sin-cantidad={l.qty > 0 ? undefined : ""}>
                    <div data-parte="que">
                      <span data-parte="producto">{p.name}</span>
                      <span data-parte="detalle">
                        {l.qty > 0 ? `${formatearCantidad(l.qty)} ${esPeso ? "kg" : "u"} × ` : "× "}
                        {fmtMoneyARS(precioDe(p), 0)}
                        {esPeso ? " / kg" : " / u"}
                      </span>
                    </div>
                    <label data-parte="cantidad">
                      <span data-parte="rotulo" aria-hidden>
                        {esPeso ? "Peso" : "Cantidad"}
                      </span>
                      <Input
                        id={`qty-${l.key}`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={l.qtyText}
                        aria-label={esPeso ? "Peso en kg" : "Cantidad"}
                        placeholder={esPeso ? "0,000" : "Cant."}
                        onChange={(e) => setLine(l.key, { qtyText: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (l.qty > 0) {
                              if (conLector) soltarFocoParaElLector();
                              else document.getElementById("vender-buscar")?.focus();
                            }
                          }
                        }}
                        aria-invalid={falta || l.invalida ? true : undefined}
                        data-tipo={esPeso ? "peso" : "cantidad"}
                        className="text-right tabular-nums"
                      />
                      <span data-parte="unidad" aria-hidden>
                        {esPeso ? "kg" : "u"}
                      </span>
                    </label>
                    <div data-parte="subtotal">
                      <span data-parte="rotulo">Subtotal</span>
                      <span data-parte="importe">{lineTotal > 0 ? <Plata valor={lineTotal} /> : "—"}</span>
                    </div>
                    <button type="button" data-parte="quitar" onClick={() => removeLine(l.key)} aria-label={`Quitar línea de ${p.name}`}>
                      <Icono nombre="cerrar" />
                      <span data-parte="palabra">Quitar</span>
                    </button>
                    {confirmar && (
                      <ConfirmarPeso
                        data-parte="nota"
                        confirmacion={confirmar}
                        pendiente={sinConfirmar(l)}
                        alConfirmar={() => setPesosConfirmados((c) => ({ ...c, [l.key]: l.qty }))}
                        alCorregir={() => setLine(l.key, { qtyText: formatearCantidad(confirmar.corregido) })}
                      />
                    )}
                    {l.invalida && (
                      <p role="alert" data-parte="nota" className="text-xs text-danger">
                        Eso no es una cantidad. Escribí el {esPeso ? "peso" : "número"}, con coma si
                        {esPeso ? " tiene gramos (1,240)" : " hace falta"}.
                      </p>
                    )}
                    {faltaEnDuda && (
                      <p role="status" data-parte="nota" className="text-xs text-warning">
                        Quedan {formatearCantidad(faltaEnDuda.available)} {esPeso ? "kg" : "u"} de {p.name}, pero puede ser porque esta misma
                        venta ya se grabó: el reintento lo controla el sistema.
                      </p>
                    )}
                    {falta && (
                      <p role="alert" data-parte="nota" className="text-xs text-danger">
                        No alcanza el stock: quedan {formatearCantidad(falta.available)} {esPeso ? "kg" : "u"} de {p.name}.
                      </p>
                    )}
                    {avisoStock && (
                      <p role="status" data-parte="nota" className="text-xs text-warning">
                        {avisoStock}
                      </p>
                    )}
                    {esPeso && (
                      <div data-parte="nota" data-vender="teclado-de-peso" className="grid gap-2">
                        <button
                          type="button"
                          className="chip-btn h-11 justify-self-start text-sm"
                          aria-expanded={tecladoDe === l.key}
                          onClick={() => usarTeclado(tecladoDe === l.key ? null : l.key)}
                        >
                          {tecladoDe === l.key ? "Cerrar el teclado grande" : "Teclado grande"}
                        </button>
                        {tecladoDe === l.key && (
                          <TecladoNumerico
                            key={l.key}
                            modo="peso"
                            etiqueta={`Peso de ${p.name}`}
                            ayuda="Los números de la etiqueta de la balanza: la coma la ponemos nosotros."
                            inicial={l.qty > 0 ? String(Math.round(l.qty * 1000)) : ""}
                            onCambio={(valor) => setLine(l.key, { qtyText: valor > 0 ? formatearCantidad(valor) : "" })}
                          />
                        )}
                      </div>
                    )}
                    {l.qty > 0 && (
                      <>
                        <input type="hidden" name="productId" value={l.productId} />
                        <input type="hidden" name="quantity" value={cantidadParaFormulario(l.qty)} />
                      </>
                    )}
                  </li>
                );
              })}
            </ol>

            {bloqueManuales}

            <div data-vender="opcionales" className="flex flex-wrap gap-2">
              <button type="button" onClick={addManual} className="chip-btn h-11 text-sm">
                <Icono nombre="mas" />
                Precio a mano
              </button>
              {!conDescuento && (
                <button
                  type="button"
                  onClick={() => {
                    setConDescuento(true);
                    pedirFoco("descuento-valor");
                  }}
                  className="chip-btn h-11 text-sm"
                >
                  <Icono nombre="mas" />
                  Descuento
                </button>
              )}
              {!isOrder && !conCliente && (
                <button type="button" onClick={() => setConCliente(true)} className="chip-btn h-11 text-sm">
                  <Icono nombre="mas" />
                  {Quien}
                </button>
              )}
            </div>

            {bloqueCliente}
            {bloqueDescuento}

            <div data-vender="pie" className="space-y-3">
              <div data-parte="total" className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p data-ui="rotulo">
                    {isOrder ? "Total del pedido" : "Total"}
                    {nLineas > 0 ? ` · ${nLineas} ${nLineas === 1 ? "línea" : "líneas"}` : ""}
                  </p>
                  {descuento.ok && descuento.descuento > 0 && (
                    <p data-parte="subtotal" className="text-[13px] tabular-nums text-muted">
                      Subtotal {fmtMoneyARS(subtotal)} · descuento −{fmtMoneyARS(descuento.descuento)}
                    </p>
                  )}
                </div>
                {/* En CH, el total en su petróleo (como en la pantalla clásica). `!`: renglon.css le pone
                    la tinta a toda la plata, sin capa, y le gana a las utilidades. */}
                <Plata valor={totalACobrar} tamano="grande" sinCentavos={Number.isInteger(totalACobrar)} className="in-data-[estetica=beauty-spa]:!text-accent-ink" />
              </div>
              {isOrder && casillaCobrado}
              {bloqueMedios}
              {bloqueVuelto}
              {!isOrder && (
                <details data-vender="mas">
                  <summary>Más: registrar sin cobrar</summary>
                  {casillaCobrado}
                  <p className="text-[13px] text-muted">Sin «Cobrado», la venta queda en Pedidos para preparar hasta que se cobre.</p>
                </details>
              )}
            </div>
            {/* Lo que va fijo abajo en el celular: el botón (que dice el total) y lo que no salió, al
                lado del botón, que es donde se está mirando. Encima de la cápsula del armazón
                (`--alto-barra-inferior`); en la PC, en su lugar. Con el ticket vacío no se fija
                (renglon.css, `:not([data-fijo])`): no hay nada que cobrar y tapaba la fila de
                «Precio a mano · Descuento · Cliente». La clase queda literal: la mide
                pie-pegado-zona-segura.test.ts. */}
            <div
              data-vender="cobrar" className="sticky bottom-[var(--alto-barra-inferior,0px)] z-20 space-y-3"
              data-fijo={conProducto.length > 0 || manuales.length > 0 ? "" : undefined}
            >
              {bloqueAviso}
              <CobrarSubmit disabled={cobrarBloqueado} label={etiquetaCobrar} pendiente={isOrder ? "Registrando…" : "Cobrando…"} atajo="F2" />
            </div>
          </section>
        </form>
      </div>
    );
  }

  // ══ MOSTRADOR BOUTIQUE (interruptor `mostrador-boutique`, Magra tanda 1 · 1B) ══════════════
  //
  // La MISMA venta (estado, reglas, firma, idempotencia, duda sin señal) con otras piezas:
  //   · el campo único «Escaneá o buscá» (etiqueta de la balanza, código o nombre) en lugar del
  //     buscador y del campo de la etiqueta; con foco al montar y otra vez al limpiar;
  //   · teclas con precio y stock del catálogo (sin exigir ventas previas); la unidad entra con 1
  //     y suma si se repite; por kilo, al peso (teclado grande en táctil);
  //   · el pie de cobro único (`PieDeCobro`): medios que cobran, billetes, vuelto, Dividir. Escribe
  //     sus campos en el formulario y el cobro sale por el MISMO `submit` de siempre;
  //   · el bloque Cliente con CUIT (`ClienteDeLaVenta`) y «Facturar al cobrar»;
  //   · en un pedido con envío, la zona del negocio (src/lib/envios) → `envioZona`;
  //   · arriba, la banda del día cerrado (y el botón que registra para cobrar mañana).

  /** Manda el formulario y espera a que `submit` termine (o nada, si el navegador lo frena). */
  function enviarYEsperar(): Promise<void> {
    const f = formulario.current;
    if (!f) return Promise.resolve();
    // Un campo obligatorio vacío (el nombre del pedido, la dirección): el navegador no lo manda.
    if (!f.checkValidity()) {
      f.reportValidity();
      return Promise.resolve();
    }
    return new Promise<void>((resolver) => {
      finDelCobro.current = resolver;
      f.requestSubmit();
    });
  }

  /** El pie eligió cómo pagó: el estado de la venta queda con ese medio y sale el cobro. */
  async function cobrarConElPie(r: ResultadoDelPie) {
    // MG-048: si un precio cambió con el ticket abierto, no se cobra uno que no se ve.
    if (!(await preciosAlDia())) return;
    const campos = camposDelPie(totalACobrar, r);
    const principal = leerMedioDeCobro(campos.find(([n]) => n === "paymentMethod")?.[1] ?? "") ?? "";
    camposDelUltimoPie.current = campos;
    // «Pagó con $X · Vuelto $Y» en el ticket (O-3): lo que entregó en efectivo, también en un pago
    // dividido (el vuelto se cuenta contra el renglón de efectivo, `vueltoDelTicket`).
    pagoConDelPie.current =
      (r.modo === "simple" ? r.medio === "EFECTIVO" : r.pagos.some((p) => p.medio === "EFECTIVO")) ? (r.recibido ?? null) : null;
    // La firma del cobro (lo que el servidor compara en un reintento) lleva el medio: se fija ANTES
    // de mandar, para que `submit` salga con él.
    flushSync(() => {
      setPaid(true);
      setMedio(principal);
      setACuenta(false);
    });
    await enviarYEsperar();
  }

  /** Registrar sin cobrar (día cerrado, pedido, «Más») o dejar a cuenta, por el mismo `submit`. */
  async function registrarBoutique(como: "sin-cobrar" | "a-cuenta") {
    if (enviandoBoutique) return;
    setEnviandoBoutique(true);
    pagoConDelPie.current = null;
    flushSync(() => {
      setPaid(como === "a-cuenta");
      setMedio("");
      setACuenta(como === "a-cuenta");
    });
    try {
      await enviarYEsperar();
    } finally {
      setEnviandoBoutique(false);
    }
  }

  /** «Reintentar cobro»: lo mismo que se mandó (los campos del pie de ese intento), misma clave. */
  async function reintentarBoutique() {
    if (enviandoBoutique) return;
    setEnviandoBoutique(true);
    flushSync(() => setReintentando(true));
    try {
      await enviarYEsperar();
    } finally {
      setReintentando(false);
      setEnviandoBoutique(false);
    }
  }

  /** Un renglón con su cantidad ya puesta (etiqueta) o esperando el peso (código de un corte). */
  function cargarRenglon(productId: string, qtyText: string, etiqueta?: number) {
    const vacia = lines.find((l) => !l.productId);
    const key = vacia ? vacia.key : addLine(productId);
    setLine(key, { productId, qtyText, etiqueta });
    setActivoKey(key);
    pedirFoco(qtyText ? ID_CAMPO_UNICO : `qty-${key}`);
  }

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

  /** El renglón tocado pasa a ser el activo (el que recibe el peso); en táctil, con el teclado grande. */
  function activar(key: number, porKilo: boolean) {
    if (activoKey !== key) setActivoKey(key);
    if (porKilo && esTactil() && tecladoDe !== key) setTecladoDe(key);
  }

  /** El peso o la cantidad cambió DESDE AFUERA del teclado (−/+, balanza): se escribe y se rearma el teclado. */
  function ponerCantidad(key: number, qty: number) {
    setLine(key, { qtyText: formatearCantidad(qty), etiqueta: undefined });
    setVersionDelPeso((v) => ({ ...v, [key]: (v[key] ?? 0) + 1 }));
  }

  /** «Quitar»: sin preguntar, con «Deshacer» 5 s. */
  function quitarProducto(key: number) {
    const r = quitarRenglon(lines, key, nextKey);
    if (!r.quitado) return;
    setLines(r.lineas);
    if (r.usoKeyVacia) setNextKey((k) => k + 1);
    setActivoKey((a) => (a === key ? null : a));
    setQuitado({ tipo: "producto", q: r.quitado, nombre: byId.get(r.quitado.linea.productId)?.name ?? nombresDeLaDuda[r.quitado.linea.productId] ?? "el renglón" });
  }

  function quitarManual(key: number) {
    const indice = manuales.findIndex((m) => m.key === key);
    if (indice < 0) return;
    const linea = manuales[indice];
    setManuales((ms) => ms.filter((m) => m.key !== key));
    setQuitado({ tipo: "manual", q: { linea, indice }, nombre: linea.nombre.trim() || "la línea con precio a mano" });
  }

  function deshacerQuitado() {
    const q = quitado;
    if (!q) return;
    if (q.tipo === "producto") setLines((ls) => deshacerRenglon(ls, q.q));
    else
      setManuales((ms) => {
        if (ms.some((m) => m.key === q.q.linea.key)) return ms;
        const i = Math.min(q.q.indice, ms.length);
        return [...ms.slice(0, i), q.q.linea, ...ms.slice(i)];
      });
    setQuitado(null);
  }

  /**
   * MG-048: antes de cobrar, el precio de HOY de lo que lleva el ticket. Si alguno cambió (el dueño
   * lo subió con el ticket abierto), la pantalla pasa a ese precio, el renglón dice «Subió a $X
   * recién» y NO se cobra todavía: se cobra con el próximo toque, ya con el total a la vista. Sin
   * señal o sin respuesta a tiempo, sigue el cobro de siempre (el servidor cobra con su catálogo).
   */
  async function preciosAlDia(): Promise<boolean> {
    if (reintentando || !enLinea) return true;
    const enTicket = [...new Set(leidas.filter((l) => l.qty > 0 && byId.has(l.productId)).map((l) => l.productId))];
    if (enTicket.length === 0) return true;
    let vigentes: Record<string, PrecioVigente>;
    try {
      const r = await conTiempoMaximo(preciosVigentesDelTicket(enTicket), 2500);
      if (r.tipo !== "respuesta") return true;
      vigentes = r.valor;
    } catch (e) {
      if (isNextRedirect(e)) throw e;
      return true;
    }
    const nuevos = cambiosDePrecio(enTicket.map((id) => byId.get(id)!), vigentes);
    if (nuevos.length === 0) return true;
    setPreciosNuevos((p) => ({ ...p, ...Object.fromEntries(nuevos.map((c) => [c.id, vigentes[c.id]])) }));
    // El chip dice el cambio desde lo que se veía la PRIMERA vez (si cambió dos veces, desde el original).
    setCambios((c) => ({ ...c, ...Object.fromEntries(nuevos.map((x) => [x.id, { ...x, antes: c[x.id]?.antes ?? x.antes }])) }));
    setAvisoBoutique(avisoDeCambioDePrecio(nuevos));
    setPieKey((k) => k + 1);
    return false;
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

  function alLeerBoutique(l: LecturaUnica) {
    if (l.tipo === "desconocida") return; // el campo ya dijo por qué
    if (l.tipo === "texto") {
      setAvisoBoutique(null);
      setCoincidencias({ texto: l.texto, ids: buscarEnElCatalogo(products, l.texto) });
      return;
    }
    if (!sePuedeSumar()) return;
    setCoincidencias(null);
    if (l.tipo === "etiqueta") {
      // MG-023: si el papel dice otro importe, el renglón lo guarda para mostrarlo (y, al Dueño,
      // ofrecer «Cobrar el de la etiqueta»). Cobra el del sistema.
      cargarRenglon(l.productId, formatearCantidad(l.kg), etiquetaDistintaDelSistema(l) ? (l.importeEtiqueta ?? undefined) : undefined);
      return;
    }
    if (l.cantidad == null) alPeso(l.productId);
    else sumarUnidades(l.productId, l.cantidad);
  }

  /**
   * «Cobrar el de la etiqueta» (sólo el Dueño, MG-023): el renglón pasa a una línea a precio a mano
   * con el importe del papel y el motivo «etiqueta de balanza». El servidor la vuelve a controlar
   * con el tope del ROL de la sesión (`controlarPreciosAManoEnTx`): sin el rol, no se graba.
   */
  function cobrarElDeLaEtiqueta(key: number) {
    const l = leidas.find((x) => x.key === key);
    const p = l ? byId.get(l.productId) : undefined;
    if (!l || !p || l.etiqueta == null || !puedeCobrarElDeLaEtiqueta(topePrecioAMano)) return;
    const m = lineaAManoDeLaEtiqueta({ nombre: p.name, kg: l.qty, importeEtiqueta: l.etiqueta, importeSistema: totalDeLinea(l) });
    const nueva = nextKey;
    removeLine(key);
    setManuales((ms) => [...ms, { key: nueva, ...m }]);
    setNextKey((k) => k + 1);
    setAvisoBoutique(null);
    pedirFoco(ID_CAMPO_UNICO);
  }

  function vistaBoutique(b: BoutiqueDeVender) {
    const conProducto = leidas.filter((l) => l.productId);
    // Las teclas (2A): la pestaña principal (las fijadas por el dueño, o las de siempre) y una
    // pestaña por góndola con TODO el catálogo vendible, las más vendidas primero.
    const explicitas = b.teclas?.gondolas;
    // Memorizadas arriba (`teclasBoutique`): las mismas listas, calculadas sólo si cambian.
    const { principal, gondolas } = teclasBoutique!;
    const faltaEnManual = manualesLeidas.map((m) => (m.error ? faltaEnLineaAMano(m) : null)).find((x) => x !== null) ?? null;
    // Las zonas y la cotización del envío salen de arriba (`zonasDelEnvio`, `cotizacionEnvio`):
    // las mismas que suman al total que cobra el pie.
    const zonas = zonasDelEnvio;
    const cotizacion = cotizacionEnvio;
    const diaCerrado = b.diaCerrado !== null;
    const enDuda = sinRespuesta !== null || yaGrabada !== null;
    // Lo que frena el pie, en palabras (el pie se deshabilita con este motivo). Sin renglones lo
    // dice el pie solo («Cargá algo para cobrar»).
    const motivoDelPie = !hayLineaValida
      ? // Sólo una línea a mano a medio llenar: se dice qué le falta (MG-050), no «Cargá algo».
        (faltaEnManual ?? undefined)
      : diaCerrado
        ? "El día está cerrado: registrala para cobrar mañana."
        : enDuda
          ? "Hay un cobro sin confirmar: resolvelo arriba antes de cobrar otra vez."
          : (motivoBloqueo ??
            (hayFaltante
              ? "No alcanza el stock de un producto: revisá el ticket."
              : hayCantidadInvalida
                ? "Revisá la cantidad: hay una que no se entiende."
                : hayManualInvalida
                  ? // MG-050: el botón dice QUÉ falta («Falta el motivo de «Bondiola»»).
                    (faltaEnManual ?? "Revisá el precio a mano: pasa el tope de tu usuario.")
                  : null)) ?? undefined;
    const registrarBloqueado =
      enviandoBoutique ||
      !hayLineaValida ||
      (hayFaltante && !reintentoDeLaMisma) ||
      hayCantidadInvalida ||
      lineaSinCantidad !== undefined ||
      lineaConPesoSinConfirmar !== undefined ||
      hayManualInvalida ||
      !descuento.ok ||
      cuponSinAplicar ||
      enDuda;
    const cobrarEnPedido = isOrder && paid && !diaCerrado;
    const ficha = clienteVenta?.cliente ?? null;
    // Sin cobrar o a cuenta, el reintento no lleva campos del pie; cobrada, los del intento cortado
    // (o, si la pantalla se recargó, el medio que quedó guardado con la duda).
    const camposDelReintento: [string, string][] =
      !paid || aCuentaActivo ? [] : (camposDelUltimoPie.current ?? (medio ? camposDelPie(totalACobrar, { modo: "simple", medio }) : []));
    const puedeReintentar = sinRespuesta !== null && !cambioTrasCorte && aviso?.reintentar === true;
    // «Redondear»: lo que baja el total a la centena de abajo (sobre lo que se compra, sin el envío).
    const redondeo = descuentoParaRedondear(subtotal);
    const ponerDescuento = (tipo: TipoDescuento, valor: string) => {
      cupon.limpiar();
      setConDescuento(true);
      setTipoDescuento(tipo);
      setDescuentoText(valor);
    };

    const renglon = (l: (typeof leidas)[number], balanzaEnVivo: BalanzaSerie | null) => {
      const p = byId.get(l.productId);
      if (!p) {
        if (!huerfana(l.productId)) return null;
        const nombre = nombresDeLaDuda[l.productId] ?? "Un producto";
        return (
          <li key={l.key} data-vender="renglon" className="flex flex-wrap items-center gap-2 py-2">
            <p className="min-w-0 flex-1 text-sm text-strong">
              {nombre} <span className="text-xs text-warning">· ya no está en el catálogo (va igual en el reintento)</span>
            </p>
            <span id={`qty-${l.key}`} className="text-sm tabular-nums text-body">
              {l.qtyText}
            </span>
            <button type="button" onClick={() => quitarProducto(l.key)} aria-label={`Quitar línea de ${nombre}`} className="chip-btn h-11 text-sm">
              Quitar
            </button>
            {l.qty > 0 && (
              <>
                <input type="hidden" name="productId" value={l.productId} />
                <input type="hidden" name="quantity" value={cantidadParaFormulario(l.qty)} />
              </>
            )}
          </li>
        );
      }
      const esPeso = p.saleUnit === "WEIGHT";
      const lineTotal = totalDeLinea(l);
      const faltante = faltanteDe(l);
      const falta = faltante?.bloquea && !reintentoDeLaMisma ? faltante : null;
      const faltaEnDuda = faltante?.bloquea && reintentoDeLaMisma ? faltante : null;
      const avisoStock = faltante && !faltante.bloquea ? faltante.aviso : null;
      const confirmar = confirmacionDe(l);
      // El activo es el elegido, o el último por kilo que entró si no se eligió ninguno.
      const activo = activoKey !== null ? activoKey === l.key : esPeso && conProducto.filter((x) => byId.get(x.productId)?.saleUnit === "WEIGHT").at(-1)?.key === l.key;
      const cambio = cambios[l.productId];
      // «Quedan 2 · dejar 2 · reemplazo» (MG-047): por unidad, lo que hay y los de la misma góndola.
      const alcanza = falta && !esPeso ? Math.max(0, Math.floor(falta.available)) : 0;
      const reemplazos = falta && !esPeso ? reemplazosDe(p.id, products, stockById, explicitas) : [];
      return (
        <RenglonDelTicket
          key={l.key}
          linea={l}
          nombre={p.name}
          porKilo={esPeso}
          precio={precioDe(p)}
          total={lineTotal}
          activo={activo}
          invalida={l.invalida}
          marcarInvalida={!!falta || l.invalida}
          cambioDePrecio={cambio ? textoDelCambioDePrecio(cambio) : null}
          onActivar={() => activar(l.key, esPeso)}
          onTipear={(qtyText) => setLine(l.key, { qtyText, etiqueta: undefined })}
          onEnter={() => pedirFoco(ID_CAMPO_UNICO)}
          onPaso={(sentido) => ponerCantidad(l.key, pasoDelRenglon(l.qty, esPeso, sentido))}
          onQuitar={() => quitarProducto(l.key)}
          teclado={
            esPeso
              ? {
                  abierto: tecladoDe === l.key,
                  version: versionDelPeso[l.key] ?? 0,
                  onAlternar: () => usarTeclado(tecladoDe === l.key ? null : l.key),
                  onPeso: (valor) => setLine(l.key, { qtyText: valor > 0 ? formatearCantidad(valor) : "", etiqueta: undefined }),
                }
              : null
          }
          pesoEnVivo={
            esPeso && activo && balanzaEnVivo ? (
              <PesoEnVivoDelRenglon key={l.key} balanza={balanzaEnVivo} nombre={p.name} onTomar={(kg) => ponerCantidad(l.key, kg)} />
            ) : undefined
          }
        >
          {confirmar && (
            <ConfirmarPeso
              confirmacion={confirmar}
              pendiente={sinConfirmar(l)}
              alConfirmar={() => setPesosConfirmados((c) => ({ ...c, [l.key]: l.qty }))}
              alCorregir={() => ponerCantidad(l.key, confirmar.corregido)}
            />
          )}
          {l.etiqueta != null && lineTotal > 0 && etiquetaDistinta(l.etiqueta, lineTotal) && (
            <div data-vender="etiqueta-distinta" className="flex flex-wrap items-center gap-2">
              <p role="status" className="text-xs text-warning">
                <span className="font-semibold tabular-nums">{textoEtiquetaDistinta(l.etiqueta, lineTotal)}</span> · se cobra el del
                sistema.
              </p>
              {puedeCobrarElDeLaEtiqueta(topePrecioAMano) && (
                <button
                  type="button"
                  className="chip-btn h-11 text-sm"
                  aria-label={`${COBRAR_EL_DE_LA_ETIQUETA} de ${p.name}: ${fmtMoneyARS(l.etiqueta)}`}
                  onClick={() => cobrarElDeLaEtiqueta(l.key)}
                >
                  {COBRAR_EL_DE_LA_ETIQUETA}
                </button>
              )}
            </div>
          )}
          {l.invalida && (
            <p role="alert" className="text-xs text-danger">
              Eso no es una cantidad. Escribí el {esPeso ? "peso, con coma si tiene gramos (1,240)" : "número"}.
            </p>
          )}
          {faltaEnDuda && (
            <p role="status" className="text-xs text-warning">
              Quedan {formatearCantidad(faltaEnDuda.available)} {esPeso ? "kg" : "u"} de {p.name}, pero puede ser porque esta misma venta
              ya se grabó: el reintento lo controla el sistema.
            </p>
          )}
          {falta && esPeso && (
            <p role="alert" className="text-xs text-danger">
              No alcanza el stock: quedan {formatearCantidad(falta.available)} kg de {p.name}.
            </p>
          )}
          {falta && !esPeso && (
            <div role="alert" data-vender="faltan-unidades" className="flex flex-wrap items-center gap-2 text-xs text-danger">
              <span className="font-semibold">Quedan {formatearCantidad(alcanza)}</span>
              {alcanza > 0 && (
                <button type="button" className="chip-btn h-11 text-sm" onClick={() => ponerCantidad(l.key, alcanza)}>
                  Dejar {formatearCantidad(alcanza)}
                </button>
              )}
              {reemplazos.length > 0 && (
                <button
                  type="button"
                  className="chip-btn h-11 text-sm"
                  onClick={() => setCoincidencias({ texto: `reemplazo de ${p.name}`, ids: reemplazos })}
                >
                  Reemplazo
                </button>
              )}
            </div>
          )}
          {avisoStock && (
            <p role="status" className="text-xs text-warning">
              {avisoStock}
            </p>
          )}
          {l.qty > 0 && (
            <>
              <input type="hidden" name="productId" value={l.productId} />
              <input type="hidden" name="quantity" value={cantidadParaFormulario(l.qty)} />
            </>
          )}
        </RenglonDelTicket>
      );
    };
    return (
      <div data-vender="boutique" className="space-y-4">
        {diaCerrado && (
          <p role="status" data-vender="dia-cerrado" className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm font-semibold text-strong">
            {BANDA_DIA_CERRADO}
          </p>
        )}
        {bloqueDudas}
        {bloqueUltima}
        {bloqueGrabada}
        {bloqueConfirmacion}
        {avisoDeLaFicha && (
          <div role="status" data-vender="desde-la-ficha" className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-sunken p-2 text-sm text-body">
            <p className="min-w-0 flex-1">{avisoDeLaFicha}</p>
            <button type="button" className="h-11 px-2 text-sm text-muted underline" onClick={() => setAvisoDeLaFicha(null)}>
              Entendido
            </button>
          </div>
        )}

        <form
          ref={formulario}
          action={submit}
          data-vender="mostrador-boutique"
          className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] lg:items-start"
        >
          <input type="hidden" name="channel" value={isOrder ? "ONLINE" : "COUNTER"} />
          {/* «Reintentar cobro»: lo mismo que se mandó en el intento que quedó en duda. */}
          {reintentando &&
            camposDelReintento.map(([nombre, valor], i) => <input key={`${nombre}-${i}`} type="hidden" name={nombre} value={valor} />)}
          {aCuentaActivo && <input type="hidden" name="aCuenta" value="1" />}

          <div data-vender="elegir" className="min-w-0 space-y-4">
            <CampoUnico
              productos={productosConCodigo}
              balanza={balanza ? { formato: balanza.formato } : null}
              rafaga={balanza !== null || perfil !== null}
              lector={perfil?.lector}
              onLectura={alLeerBoutique}
            />
            {avisoBoutique && (
              <p role="alert" className="text-sm font-medium text-danger">
                {avisoBoutique}
              </p>
            )}
            {coincidencias && (
              <section aria-label={`Lo que coincide con «${coincidencias.texto}»`} data-vender="coincidencias" className="space-y-2">
                {coincidencias.ids.length === 0 ? (
                  <p role="status" className="text-sm text-muted">
                    No hay nada que se llame «{coincidencias.texto}». Probá con otra palabra o cargalo con «Precio a mano».
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {coincidencias.ids.map((id) => {
                      const p = byId.get(id);
                      return p ? (
                        <button key={id} type="button" className="chip-btn h-11 text-sm" onClick={() => tocarTecla(id)}>
                          {p.name} · {teclaDeProducto(p, stockById[id]).precio}
                        </button>
                      ) : null;
                    })}
                  </div>
                )}
              </section>
            )}
            {balanza?.configurar && (
              <p className="text-xs text-muted">
                {REGLA_DEL_PRECIO_DE_BALANZA}{" "}
                <Link href={balanza.configurar} className="font-semibold text-accent-ink underline">
                  Cambiar el formato de la balanza
                </Link>
              </p>
            )}
            {agotadoEnLaMano && byId.get(agotadoEnLaMano) && (
              <div role="status" data-vender="agotado-en-la-mano" className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-sunken p-2 text-sm text-body">
                <p className="min-w-0 flex-1">
                  {byId.get(agotadoEnLaMano)!.name} figura agotado en el sistema. Si tenés el paquete en la mano, vendelo igual: el stock queda
                  para recontar.
                </p>
                <button type="button" className="chip-btn h-11 text-sm" onClick={() => tocarTecla(agotadoEnLaMano, true)}>
                  Lo tengo: venderlo igual
                </button>
                <button type="button" className="h-11 px-2 text-sm text-muted underline" onClick={() => setAgotadoEnLaMano(null)}>
                  No
                </button>
              </div>
            )}
            {(principal.ids.length > 0 || gondolas.length > 0) && (
              <TeclasMemorizadas
                productos={products}
                stockById={stockById}
                principal={principal}
                gondolas={gondolas}
                onTocar={tocarTeclaEstable}
                fijar={b.teclas?.puedeFijar ? { fijadas: fijadas.ids, onGuardar: guardarFijadasEstable } : null}
              />
            )}
          </div>

          <ConBalanzaEnVivo negocio={conPeso && negocioId && products.some((p) => p.saleUnit === "WEIGHT") ? negocioId : null}>
          {(balanzaEnVivo) => (
          <section data-vender="ticket-boutique" aria-label={isOrder ? "Pedido" : "Ticket"} className="min-w-0 space-y-3 rounded-lg border border-line bg-surface-raised p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div role="group" aria-label="Qué se registra" className="flex gap-1">
                <button
                  type="button"
                  aria-pressed={!isOrder}
                  onClick={() => {
                    if (!isOrder) return;
                    setIsOrder(false);
                    setPaid(true);
                  }}
                  className={cn("chip-btn h-11 text-sm", !isOrder && "!border-accent !bg-accent !text-on-accent")}
                >
                  Venta
                </button>
                <button
                  type="button"
                  aria-pressed={isOrder}
                  onClick={() => {
                    if (isOrder) return;
                    setIsOrder(true);
                    setPaid(false);
                    setACuenta(false);
                    setConCliente(true);
                  }}
                  className={cn("chip-btn h-11 text-sm", isOrder && "!border-accent !bg-accent !text-on-accent")}
                >
                  Pedido (retiro / envío)
                </button>
              </div>
            </div>

            <TicketQueCrece
              rotuloTotal={isOrder ? "Total del pedido" : "Total"}
              total={totalACobrar}
              vacio={conProducto.length === 0 && manuales.length === 0}
              deshacer={quitado ? { texto: `Quitaste ${quitado.nombre}.`, onDeshacer: deshacerQuitado } : null}
              detalles={
                <>
                  {descuento.ok && descuento.descuento > 0 && (
                    <p className="text-xs tabular-nums text-muted">
                      Subtotal {fmtMoneyARS(subtotal)} · descuento −{fmtMoneyARS(descuento.descuento)}
                    </p>
                  )}
                  {envioPrevisto > 0 && cotizacionEnvio?.ok && (
                    <p data-vender="total-envio" className="text-xs tabular-nums text-muted">
                      Productos {fmtMoneyARS(total)} · {cotizacionEnvio.renglon ?? "Envío"} {fmtMoneyARS(envioPrevisto)}
                    </p>
                  )}
                </>
              }
            >
              {conProducto.map((l) => renglon(l, balanzaEnVivo))}
            </TicketQueCrece>

            {bloqueManuales}

            <div className="flex flex-wrap gap-2">
              {!isOrder && !conCliente && (
                <button type="button" onClick={() => setConCliente(true)} className="chip-btn h-11 text-sm">
                  + {Quien}
                </button>
              )}
              <button type="button" onClick={addManual} className="chip-btn h-11 text-sm">
                + Precio a mano
              </button>
            </div>

            {/* Descuento en chips (2A): 5 % · 10 % · Redondear · Otro. El tope del rol lo controla
                `aplicarDescuento` igual que el servidor: un % de más se ve y frena el cobro. */}
            <div role="group" aria-label="Descuento" data-vender="chips-descuento" className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">Descuento</span>
              {CHIPS_DE_DESCUENTO.map((pct) => {
                const puesto = conDescuento && tipoDescuento === "porcentaje" && leerImporte(descuentoText).estado === "ok" && importeOCero(descuentoText) === pct;
                return (
                  <button
                    key={pct}
                    type="button"
                    aria-pressed={puesto}
                    onClick={() => ponerDescuento("porcentaje", String(pct))}
                    className={cn("chip-btn h-11 text-sm", puesto && "!border-accent !bg-accent !text-on-accent")}
                  >
                    {pct} %
                  </button>
                );
              })}
              <button
                type="button"
                disabled={redondeo === 0}
                title={redondeo === 0 ? "El total ya está redondo" : undefined}
                onClick={() => ponerDescuento("monto", String(redondeo).replace(".", ","))}
                className="chip-btn h-11 text-sm"
              >
                Redondear{redondeo > 0 ? ` −${fmtMoneyARS(redondeo, Number.isInteger(redondeo) ? 0 : 2)}` : ""}
              </button>
              {!conDescuento && (
                <button
                  type="button"
                  onClick={() => {
                    setConDescuento(true);
                    pedirFoco("descuento-valor");
                  }}
                  className="chip-btn h-11 text-sm"
                >
                  Otro…
                </button>
              )}
            </div>

            {(isOrder || conCliente) && (
              <ClienteDeLaVenta
                key={clienteKey}
                // Desde la ficha, el cliente ya elegido (sólo el primero: al limpiar, vacío).
                inicial={clienteKey === 0 ? (desdeLaFicha?.cliente ?? null) : null}
                quien={quienCompra}
                puedeFacturar={puedeFacturar}
                rolFactura={b.rolFactura}
                puedeEditarFicha={b.puedeEditarFicha}
                nombreObligatorio={isOrder}
                onCambio={(v) => {
                  setClienteVenta(v);
                  // El teléfono y el nombre van en la firma del cobro, como viajan en el formulario.
                  setTelefono(v.telefono);
                  setNombreCliente(v.nombre);
                  // La última dirección de la ficha, propuesta y editable (MG-035).
                  if (v.cliente?.ultimaDireccion) setDireccion((d) => d || v.cliente!.ultimaDireccion!);
                }}
              />
            )}

            {isOrder && (
              <fieldset data-vender="entrega" className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
                <legend className="sr-only">Entrega</legend>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Entrega</span>
                  <Select name="fulfillment" value={fulfillment} onChange={(e) => setFulfillment(e.target.value as "PICKUP" | "DELIVERY")}>
                    <option value="PICKUP">Retira en el local</option>
                    <option value="DELIVERY">Envío a domicilio</option>
                  </Select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Horario deseado</span>
                  <Input name="scheduledFor" type="datetime-local" value={horario} onChange={(e) => setHorario(e.target.value)} />
                </label>
                {conZona && (
                  <label className="text-sm sm:col-span-2">
                    <span className="mb-1 block text-muted">Zona de envío *</span>
                    <Select name="envioZona" required value={zonaId} onChange={(e) => setZonaId(e.target.value)}>
                      <option value="">Elegí la zona</option>
                      {zonas.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.nombre} · {z.costo > 0 ? fmtMoneyARS(z.costo, 0) : "sin cargo"}
                          {z.gratisDesde !== null ? ` · gratis desde ${fmtMoneyARS(z.gratisDesde, 0)}` : ""}
                        </option>
                      ))}
                    </Select>
                    {cotizacion && (
                      <span role="status" data-vender="envio" className="mt-1 block text-xs text-body">
                        {cotizacion.ok
                          ? `${cotizacion.renglon ?? "Envío"}: ${cotizacion.costo > 0 ? fmtMoneyARS(cotizacion.costo) : "sin cargo"}` +
                            (cotizacion.faltaParaGratis > 0 ? ` · te faltan ${fmtMoneyARS(cotizacion.faltaParaGratis)} para el envío gratis` : "")
                          : cotizacion.motivo}
                      </span>
                    )}
                  </label>
                )}
                {fulfillment === "DELIVERY" && (
                  <label className="text-sm sm:col-span-2">
                    <span className="mb-1 block text-muted">Dirección *</span>
                    <Input name="address" required value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle, número, barrio" />
                  </label>
                )}
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-muted">Nota</span>
                  <Input name="notes" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: cortar en milanesas, sin grasa" />
                </label>
                <label className="flex min-h-11 w-fit items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-5 w-5" />
                  <span className="text-body">Ya está cobrado</span>
                </label>
              </fieldset>
            )}

            {bloqueDescuento}
          </section>
          )}
          </ConBalanzaEnVivo>

          {/* El cobro, fijo abajo en el celular (encima de la barra de espacios) y a lo ancho en la PC. */}
          <div
            data-vender="cobro-boutique"
            className="sticky bottom-[var(--alto-barra-inferior,0px)] z-20 space-y-2 rounded-lg border border-line bg-surface-sunken lg:col-span-2"
          >
            {/* En el celular el ticket queda arriba de las teclas: el total, también acá abajo (MG-045). */}
            <p data-vender="total-fijo" aria-hidden className="flex items-baseline justify-between gap-2 px-3 pt-2 lg:hidden">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">{isOrder ? "Total del pedido" : "Total"}</span>
              <span className="font-display text-3xl leading-none tabular-nums text-accent-ink">
                {fmtMoneyARS(totalACobrar, Number.isInteger(totalACobrar) ? 0 : 2)}
              </span>
            </p>
            <div className="space-y-2 px-3 pt-3 empty:hidden">{bloqueAviso}</div>
            {puedeReintentar && (
              <div className="px-3">
                <button type="button" className={buttonClasses("solid", "lg", "w-full")} disabled={enviandoBoutique} onClick={() => void reintentarBoutique()}>
                  {enviandoBoutique ? "Cobrando…" : `${etiquetaDeReintento(isOrder)} ${isOrder ? "" : fmtMoneyARS(sinRespuesta!.total)}`.trim()}
                </button>
              </div>
            )}
            {isOrder && !paid ? (
              <div className="p-3">
                <button
                  type="button"
                  className={buttonClasses("solid", "lg", "w-full")}
                  disabled={registrarBloqueado}
                  onClick={() => void registrarBoutique("sin-cobrar")}
                >
                  {enviandoBoutique ? "Registrando…" : registrarBloqueado && motivoBloqueo ? motivoBloqueo : "Registrar pedido"}
                </button>
              </div>
            ) : (
              <>
                <PieDeCobro
                  key={pieKey}
                  total={totalACobrar}
                  deshabilitado={motivoDelPie ? { motivo: motivoDelPie } : undefined}
                  textoBoton={cobrarEnPedido ? "Registrar y cobrar" : "Cobrar"}
                  onCobrar={cobrarConElPie}
                />
                {!isOrder && (
                  <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
                    {diaCerrado ? (
                      <button
                        type="button"
                        className={buttonClasses("solid", "lg", "w-full")}
                        disabled={registrarBloqueado}
                        onClick={() => void registrarBoutique("sin-cobrar")}
                      >
                        {enviandoBoutique ? "Registrando…" : REGISTRAR_PARA_MANANA}
                      </button>
                    ) : (
                      <>
                        {aCuentaDisponible && (
                          <button
                            type="button"
                            className="chip-btn h-11 text-sm"
                            disabled={registrarBloqueado || !ficha}
                            title={ficha ? undefined : `Elegí ${alQuien} para dejarlo a cuenta`}
                            onClick={() => void registrarBoutique("a-cuenta")}
                          >
                            Dejar a cuenta {fmtMoneyARS(total)}
                          </button>
                        )}
                        <button
                          type="button"
                          className="h-11 px-2 text-sm text-muted underline"
                          disabled={registrarBloqueado}
                          onClick={() => void registrarBoutique("sin-cobrar")}
                        >
                          Registrar sin cobrar
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </form>
      </div>
    );
  }

  // El toque y el «fijar» de las teclas, con identidad fija (P-3): acá, después de declarar
  // `tocarTecla` y `guardarFijadas`, y antes de elegir la vista.
  const tocarTeclaEstable = useLlamadaEstable((id: string) => tocarTecla(id));
  const guardarFijadasEstable = useLlamadaEstable((ids: string[]) => guardarFijadas(ids));

  if (boutique) return vistaBoutique(boutique);

  if (nuevo) return vistaTicket();

  return (
    <div className="space-y-4">
      {bloqueUltima}

      {/* La venta que YA estaba grabada con esta clave, como quedó en la base («Ver la venta #N»). */}
      {bloqueGrabada}

      {bloqueConfirmacion}

      {bloqueDudas}

      {/* Dos columnas desde 1024 px (tablet horizontal, terminal, PC): a la izquierda qué se vende
          (tipo, más vendidos, etiqueta, balanza y renglones); a la derecha, fija al desplazar, el
          cobro (cliente, descuento, medio, vuelto, total y «Cobrar»). Abajo de 1024, una columna con
          el cobro fijo abajo: el total y «Cobrar» siempre a la vista, sin desplazar. */}
      <form
        ref={formulario}
        action={submit}
        data-vender="mostrador"
        className="space-y-4 rounded-lg border border-line p-3 sm:p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)] lg:items-start lg:gap-x-6 lg:space-y-0"
      >
        <input type="hidden" name="channel" value={isOrder ? "ONLINE" : "COUNTER"} />

        <div data-vender="elegir" className="@container min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Qué se registra">
          <button
            type="button"
            aria-pressed={!isOrder}
            onClick={() => {
              if (!isOrder) return;
              setIsOrder(false);
              setPaid(true);
            }}
            className={cn("chip-btn h-11 text-sm", !isOrder && "bg-accent text-on-accent")}
          >
            Venta
          </button>
          <button
            type="button"
            aria-pressed={isOrder}
            onClick={() => {
              if (isOrder) return;
              setIsOrder(true);
              setPaid(false);
              setACuenta(false);
            }}
            className={cn("chip-btn h-11 text-sm", isOrder && "bg-accent text-on-accent")}
          >
            Pedido (retiro / envío)
          </button>
        </div>

        {/* Los más vendidos: un toque y salta al peso. Sólo si ya hubo ventas. */}
        {botonesRapidos.length > 0 && (
          <div>
            <p className="mb-2 text-xs text-muted">{rotuloRapidos}</p>
            <div className="grid grid-cols-2 gap-2 @md:grid-cols-4">
              {botonesRapidos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => elegirRapido(p.id)}
                  className="chip-btn h-11 min-w-0 justify-center px-2 text-sm text-strong"
                  title={p.name}
                >
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {campoEtiqueta}
        {tomarPeso}
        {bloqueLector}

        {/* Líneas con producto */}
        <div className="space-y-2">
          {leidas.map((l) => {
            const p = byId.get(l.productId);
            // Una línea de la duda cuyo producto salió del catálogo: se muestra, viaja igual en el
            // reintento y se puede quitar (y entonces ya no es la misma venta).
            if (!p && huerfana(l.productId)) {
              return (
                <div key={l.key} className="grid grid-cols-[1fr_auto] items-center gap-2 @md:grid-cols-[1fr_128px_auto]">
                  <p className="col-span-2 @md:col-span-1 text-sm text-strong">
                    {nombresDeLaDuda[l.productId] ?? "Un producto"}{" "}
                    <span className="text-xs text-warning">· ya no está en el catálogo (va igual en el reintento)</span>
                  </p>
                  <span id={`qty-${l.key}`} className="text-right text-sm tabular-nums text-body">
                    {l.qtyText}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLine(l.key)}
                    aria-label="Quitar línea"
                    className="inline-flex h-11 w-11 items-center justify-center text-lg leading-none text-muted hover:text-danger"
                  >
                    ×
                  </button>
                  {l.qty > 0 && (
                    <>
                      <input type="hidden" name="productId" value={l.productId} />
                      <input type="hidden" name="quantity" value={cantidadParaFormulario(l.qty)} />
                    </>
                  )}
                </div>
              );
            }
            const esPeso = p?.saleUnit === "WEIGHT";
            const lineTotal = totalDeLinea(l);
            const faltante = faltanteDe(l);
            const falta = faltante?.bloquea && !reintentoDeLaMisma ? faltante : null;
            const faltaEnDuda = faltante?.bloquea && reintentoDeLaMisma ? faltante : null;
            const avisoStock = faltante && !faltante.bloquea ? faltante.aviso : null;
            const confirmar = confirmacionDe(l);
            return (
              <div key={l.key} className="grid grid-cols-[1fr_auto] items-center gap-2 @md:grid-cols-[1fr_128px_auto]">
                <BuscadorCombo
                  className="col-span-2 @md:col-span-1"
                  id={`prod-${l.key}`}
                  ariaLabel="Producto"
                  placeholder="Buscá el producto…"
                  opciones={opciones}
                  valor={l.productId}
                  onElegir={(productId) => {
                    if (productId !== l.productId) setLine(l.key, { productId, qtyText: "" });
                    pedirFoco(`qty-${l.key}`);
                  }}
                />
                <div className="relative">
                  <Input
                    id={`qty-${l.key}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={l.qtyText}
                    aria-label={esPeso ? "Peso en kg" : "Cantidad"}
                    placeholder={p ? (esPeso ? "Peso" : "Cantidad") : "—"}
                    onChange={(e) => setLine(l.key, { qtyText: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (l.qty > 0) {
                          if (conLector) soltarFocoParaElLector();
                          else pedirFoco(`prod-${addLine()}`);
                        }
                      }
                    }}
                    disabled={!p}
                    aria-invalid={falta || l.invalida ? true : undefined}
                    // Con el lector (módulo `terminal`): marca el campo para que una ráfaga que cae
                    // acá se lea como código y el campo vuelva a su valor. Sin el módulo, como siempre.
                    data-tipo={conLector ? (esPeso ? "peso" : "cantidad") : undefined}
                    className="pr-8 text-right tabular-nums"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-faint">
                    {p ? (esPeso ? "kg" : "u") : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <span className="w-24 text-right text-sm tabular-nums text-body">
                    {lineTotal > 0 ? fmtMoneyARS(lineTotal) : "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLine(l.key)}
                    aria-label="Quitar línea"
                    className="inline-flex h-11 w-11 items-center justify-center text-lg leading-none text-muted hover:text-danger"
                  >
                    ×
                  </button>
                </div>
                {confirmar && (
                  <ConfirmarPeso
                    className="col-span-2 @md:col-span-3"
                    confirmacion={confirmar}
                    pendiente={sinConfirmar(l)}
                    alConfirmar={() => setPesosConfirmados((c) => ({ ...c, [l.key]: l.qty }))}
                    alCorregir={() => setLine(l.key, { qtyText: formatearCantidad(confirmar.corregido) })}
                  />
                )}
                {l.invalida && (
                  <p role="alert" className="col-span-2 @md:col-span-3 text-xs text-danger">
                    Eso no es una cantidad. Escribí el {esPeso ? "peso" : "número"}, con coma si
                    {esPeso ? " tiene gramos (1,240)" : " hace falta"}.
                  </p>
                )}
                {faltaEnDuda && (
                  <p role="status" className="col-span-2 @md:col-span-3 text-xs text-warning">
                    Quedan {formatearCantidad(faltaEnDuda.available)} {esPeso ? "kg" : "u"} de {p?.name}, pero puede ser porque
                    esta misma venta ya se grabó: el reintento lo controla el sistema.
                  </p>
                )}
                {falta && (
                  <p role="alert" className="col-span-2 @md:col-span-3 text-xs text-danger">
                    No alcanza el stock: quedan {formatearCantidad(falta.available)} {esPeso ? "kg" : "u"} de {p?.name}.
                  </p>
                )}
                {avisoStock && (
                  <p role="status" className="col-span-2 @md:col-span-3 text-xs text-warning">
                    {avisoStock}
                  </p>
                )}
                {esPeso && p && (
                  <div data-vender="teclado-de-peso" className="col-span-2 @md:col-span-3 grid gap-2">
                    <button
                      type="button"
                      className="chip-btn h-11 justify-self-start text-sm"
                      aria-expanded={tecladoDe === l.key}
                      onClick={() => usarTeclado(tecladoDe === l.key ? null : l.key)}
                    >
                      {tecladoDe === l.key ? "Cerrar el teclado grande" : "Teclado grande"}
                    </button>
                    {tecladoDe === l.key && (
                      <TecladoNumerico
                        key={l.key}
                        modo="peso"
                        etiqueta={`Peso de ${p.name}`}
                        ayuda="Los números de la etiqueta de la balanza: la coma la ponemos nosotros."
                        inicial={l.qty > 0 ? String(Math.round(l.qty * 1000)) : ""}
                        onCambio={(valor) => setLine(l.key, { qtyText: valor > 0 ? formatearCantidad(valor) : "" })}
                        className="max-w-sm"
                      />
                    )}
                  </div>
                )}
                {p && l.qty > 0 && (
                  <>
                    <input type="hidden" name="productId" value={l.productId} />
                    <input type="hidden" name="quantity" value={cantidadParaFormulario(l.qty)} />
                  </>
                )}
              </div>
            );
          })}

          {bloqueManuales}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => pedirFoco(`prod-${addLine()}`)} className="chip-btn h-11 text-sm">
              + Agregar producto
            </button>
            <button type="button" onClick={addManual} className="chip-btn h-11 text-sm">
              Precio a mano
            </button>
          </div>
        </div>

        </div>

        {/* Hasta lg la columna no existe (`contents`): sus hijos quedan sueltos en el formulario y la
            barra de cobro se pega abajo a lo largo de todo el formulario, no sólo al final. */}
        <div data-vender="cobro" className="contents lg:block lg:min-w-0 lg:space-y-4 lg:sticky lg:top-20 lg:rounded-lg lg:border lg:border-line lg:p-4">
        {bloqueCliente}

        {bloqueDescuento}

        {/* Cobro */}
        <div className="space-y-3 border-t border-line pt-4 lg:border-t-0 lg:pt-0">
          <label className="flex min-h-11 w-fit items-center gap-2 text-sm">
            <input
              key={isOrder ? "cobrado-pedido" : "cobrado-venta"}
              type="checkbox"
              name="paid"
              checked={paid}
              onChange={(e) => setPaid(e.target.checked)}
              className="h-5 w-5"
            />
            <span className="text-body">Cobrado</span>
          </label>
        </div>

        {/* Opcionales cerrados: se abren sólo si hacen falta. */}
        {(!conDescuento || (!isOrder && !conCliente)) && (
          <div className="flex flex-wrap gap-2">
            {!conDescuento && (
              <button
                type="button"
                onClick={() => {
                  setConDescuento(true);
                  pedirFoco("descuento-valor");
                }}
                className="chip-btn h-11 text-sm"
              >
                Descuento
              </button>
            )}
            {!isOrder && !conCliente && (
              <button type="button" onClick={() => setConCliente(true)} className="chip-btn h-11 text-sm">
                {Quien}
              </button>
            )}
          </div>
        )}

        {/* Total y cobrar. En el celular, FIJOS abajo mientras se arma el ticket (el pie del
            formulario los suelta al final); desde sm, el pie de siempre. Lo que no salió va acá
            arriba del botón, que es donde se está mirando. z-10 y no más: la lista del buscador
            (z-20) tiene que poder abrirse por encima de la barra. Se apoya ENCIMA de la barra de
            espacios del celular (`--alto-barra-inferior`, layout.tsx; 0 donde no la hay): con
            bottom-0 quedaba debajo y tocar «Cobrar» abría la hoja de «Mostrador». La zona segura
            del iPhone (la rayita de abajo) se deja UNA vez: si hay barra, ya viene en su alto y el
            pie no la vuelve a sumar; si no hay, la deja el pie (pie-pegado-zona-segura.test.ts). */}
        <div
          data-fijo={leidas.some((l) => l.productId) || manualesLeidas.length > 0 ? "" : undefined}
          className="sticky bottom-[var(--alto-barra-inferior,0px)] z-20 -mx-3 -mb-3 space-y-3 rounded-b-lg border-t border-line bg-surface px-3 pt-3 pb-[max(0.75rem,calc(env(safe-area-inset-bottom)_-_var(--alto-barra-inferior,0px)))] shadow-[0_-6px_16px_-10px_rgba(0,0,0,0.25)] sm:-mx-4 sm:-mb-4 sm:px-4 lg:static lg:z-auto lg:mx-0 lg:mb-0 lg:rounded-none lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-4 lg:shadow-none not-data-fijo:static not-data-fijo:shadow-none">
          {/* El medio y el vuelto van en la barra: elegir cómo pagó y cobrar, sin desplazar. Con la
              venta vacía no se fija (`data-fijo`): no hay nada que cobrar y en un celular de 5"
              tapaba el buscador, que es el primer paso. */}
          {bloqueMedios}
          {bloqueVuelto}
          {bloqueAviso}
          {/* El mismo pie de siempre (total arriba y botón a lo ancho en el celular; en fila desde
              sm): lo único nuevo es que en el celular queda fijo. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted">
              {descuento.ok && descuento.descuento > 0 && (
                <p className="tabular-nums">
                  Subtotal {fmtMoneyARS(subtotal)} · descuento −{fmtMoneyARS(descuento.descuento)}
                </p>
              )}
              {envioPrevisto > 0 && cotizacionEnvio?.ok && (
                <p data-vender="total-envio" className="tabular-nums">
                  Productos {fmtMoneyARS(total)} · {cotizacionEnvio.renglon ?? "Envío"} {fmtMoneyARS(envioPrevisto)}
                </p>
              )}
              <p>
                Total{" "}
                {/* En CH (piel `data-estetica="beauty-spa"` del layout) el total va en su serif y su
                    petróleo, como los títulos de su marca; en el resto, como siempre. */}
                <span className="ml-1 text-2xl font-semibold tabular-nums text-strong in-data-[estetica=beauty-spa]:font-display in-data-[estetica=beauty-spa]:font-medium in-data-[estetica=beauty-spa]:text-accent-ink">
                  {fmtMoneyARS(totalACobrar)}
                </span>
              </p>
            </div>
            <CobrarSubmit
              disabled={cobrarBloqueado}
              label={etiquetaCobrar}
              pendiente={isOrder ? "Registrando…" : "Cobrando…"}
            />
          </div>
        </div>
        </div>
      </form>
    </div>
  );
}
