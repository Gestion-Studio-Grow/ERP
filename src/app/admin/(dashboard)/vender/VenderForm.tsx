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
//
// PARTIDO (Magra · tanda practicidad, V-6): el estado y las reglas de la venta viven en
// `nucleo-de-venta.tsx` (un hook); acá quedan las vistas de siempre (CH). El mostrador boutique es
// su propio módulo (`boutique/VenderBoutique.tsx`) y llega diferido si se pide desde acá.
import { useMemo, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { buscarClienteParaVenta } from "@/lib/order-actions";
import { BuscadorCombo, Input, Select, buttonClasses, cn, fmtMoneyARS } from "@/components/ui";
import { Atajos } from "@/components/ui/Renglon";
import { Kbd } from "@/components/ui/Kbd";
import { Plata } from "@/components/ui/Plata";
import { Icono, iconoDelMedio } from "@/components/ui/Icono";
import { TecladoNumerico } from "@/components/ui/Teclado";
import { MEDIOS_DE_COBRO } from "@/lib/caja/medio-cobro";
import { cantidadParaFormulario, formatearCantidad } from "@/lib/pos-peso";
import ZonaDelEnvio from "./ZonaDelEnvio";
import { describirFormato } from "@/lib/supermercado/balanza";
import { indiceDelLector, lineaDesdeLectura, REGLA_DEL_PRECIO_DE_BALANZA, type ProductoDelLector } from "@/lib/lector/linea-desde-lectura";
import TomarPesoParaElTicket from "@/components/balanza/TomarPesoParaElTicket";
import { calcularVuelto, motivoDeLineaSinCantidad, type BalanzaDeVender } from "./reglas-venta";
import { etiquetaDeReintento } from "./cobro-sin-conexion";
import dynamic from "next/dynamic";
import { useNucleoDeVenta, sinSuscripcion, ConfirmarPeso, ID_CAMPO_ETIQUETA, precioDe, isNextRedirect, type PropsDeVender } from "./nucleo-de-venta";

export type { BoutiqueDeVender } from "./nucleo-de-venta";

// El boutique por esta puerta (el mostrador de la bandeja con el interruptor): su propio pedazo.
const VenderBoutique = dynamic(() => import("./boutique/VenderBoutique"));


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


// El servidor no tiene el almacén de la pestaña, y la primera pintura del navegador tiene que
// ser igual a la del servidor: ésa se arma sin mirar el almacén. Apenas se sabe que se está en el
// navegador, el formulario se arma de nuevo, ya con el cobro sin confirmar si quedó uno (el mismo
// arreglo que RecuentoForm). Navegando dentro del panel no hay pintura del servidor: se arma una
// sola vez, directo con lo guardado.
export default function VenderForm(props: PropsDeVender) {
  if (props.boutique) return <VenderBoutique {...props} />;
  return <VenderFormDeSiempre {...props} />;
}

function VenderFormDeSiempre(props: PropsDeVender) {
  const enNavegador = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  return <FormularioVender key={enNavegador ? "navegador" : "servidor"} {...props} enNavegador={enNavegador} />;
}

function FormularioVender(props: PropsDeVender & { enNavegador: boolean }) {
  const {
    Quien,
    aCuentaActivo,
    aCuentaDisponible,
    addLine,
    addManual,
    alQuien,
    aviso,
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
    cobrarBloqueado,
    conCliente,
    conDescuento,
    conLector,
    conPeso,
    conZona,
    confirmacionDe,
    cotizacionEnvio,
    descuento,
    direccion,
    elegirRapido,
    enviable,
    envioPrevisto,
    faltaFichaACuenta,
    faltanteDe,
    formulario,
    fulfillment,
    hayLineaValida,
    horario,
    huerfana,
    isOrder,
    leidas,
    lineaSinCantidad,
    lines,
    manuales,
    manualesLeidas,
    medio,
    motivoBloqueo,
    negocio,
    negocioId,
    nombreCliente,
    nombresDeLaDuda,
    nota,
    nuevo,
    opciones,
    pagoConText,
    paid,
    pedirFoco,
    productosConCodigo,
    products,
    reintentoDeLaMisma,
    removeLine,
    rotuloRapidos,
    setACuenta,
    setBusqueda,
    setConCliente,
    setConDescuento,
    setDireccion,
    setFulfillment,
    setHorario,
    setIsOrder,
    setLine,
    setMedio,
    setNombreCliente,
    setNota,
    setPagoConText,
    setPaid,
    setPesosConfirmados,
    setTelefono,
    setZonaId,
    sinConfirmar,
    sinRespuesta,
    soltarFocoParaElLector,
    submit,
    subtotal,
    sustantivo,
    tecladoDe,
    telefono,
    total,
    totalACobrar,
    totalDeLinea,
    usarTeclado,
    vendedor,
    zonaId,
    zonasDelEnvio,
  } = useNucleoDeVenta(props);


  // El campo de la etiqueta: el renglón entra como con una tecla rápida, pero con el peso (o la
  // cantidad) ya puesto. Completo, el foco vuelve al campo para la próxima etiqueta; si falta el
  // peso (se tipeó el PLU de un corte por kilo), va a ese peso.
  function cargarLectura(productId: string, qtyText: string) {
    const vacia = lines.find((l) => !l.productId);
    const key = vacia ? vacia.key : addLine(productId);
    setLine(key, { productId, qtyText });
    pedirFoco(qtyText ? ID_CAMPO_ETIQUETA : `qty-${key}`);
  }
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
  const vuelto = paid && !aCuentaActivo && medio === "EFECTIVO" ? calcularVuelto(totalACobrar, pagoConText) : null;

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
