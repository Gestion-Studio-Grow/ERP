"use client";

// EL MOSTRADOR BOUTIQUE, SU PROPIO MÓDULO (Magra · tanda practicidad, V-6).
//
// La vista del interruptor `mostrador-boutique` sobre el MISMO núcleo de la venta
// (`../nucleo-de-venta.tsx`: estado, reglas, firma, idempotencia, duda sin señal). Antes era la
// rama `vistaBoutique` de VenderForm y el JS del boutique bajaba también las vistas de siempre.
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { Input, Select, buttonClasses, cn, fmtMoneyARS } from "@/components/ui";
import { leerMedioDeCobroConTarjeta, type MedioDeCobro } from "@/lib/caja/medio-cobro";
import { cantidadParaFormulario, formatearCantidad, importeOCero, leerImporte } from "@/lib/pos-peso";
import { COBRAR_EL_DE_LA_ETIQUETA, etiquetaDistinta, lineaAManoDeLaEtiqueta, puedeCobrarElDeLaEtiqueta, textoEtiquetaDistinta } from "../etiqueta-de-balanza";
import { ClienteDeLaVentaDiferido as ClienteDeLaVenta, TeclasMemorizadas } from "./perezosos";
import { CampoUnico, ID_CAMPO_UNICO, type LecturaUnica } from "@/components/lector/CampoUnico";
import type { ResultadoDelPie } from "@/components/cobro/PieDeCobro";
import { camposDelPie } from "@/lib/cobro/pie-de-cobro-core";
import { REGLA_DEL_PRECIO_DE_BALANZA } from "@/lib/lector/linea-desde-lectura";
import { etiquetaDistintaDelSistema } from "@/lib/lector/decidir-lectura";
import type { BalanzaSerie } from "@/lib/balanza-serie/usar-balanza-serie";
import { motivoDeLineaSinCantidad, type TipoDescuento, BANDA_DIA_CERRADO, REGISTRAR_PARA_MANANA, buscarEnElCatalogo, teclaDeProducto, CHIPS_DE_DESCUENTO, descuentoParaRedondear, deshacerRenglon, faltaEnLineaAMano, pasoDelRenglon, quitarRenglon, reemplazosDe, textoDelCambioDePrecio } from "../reglas-venta";
import { ConBalanzaEnVivo, PesoEnVivoDelRenglon } from "../TicketQueCrece";
import RenglonBoutique, { TicketBoutique } from "./RenglonBoutique";
import { PieDeCobroPlegable } from "./PieDeCobro";
import { etiquetaDeReintento } from "../cobro-sin-conexion";
import { useNucleoDeVenta, sinSuscripcion, ConfirmarPeso, precioDe, type BoutiqueDeVender, type PropsDeVender } from "../nucleo-de-venta";



// El servidor no tiene el almacén de la pestaña, y la primera pintura del navegador tiene que
// ser igual a la del servidor: ésa se arma sin mirar el almacén. Apenas se sabe que se está en el
// navegador, el formulario se arma de nuevo, ya con el cobro sin confirmar si quedó uno (el mismo
// arreglo que RecuentoForm). Navegando dentro del panel no hay pintura del servidor: se arma una
// sola vez, directo con lo guardado.
export default function VenderBoutique(props: PropsDeVender) {
  const enNavegador = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  return <FormularioBoutique key={enNavegador ? "navegador" : "servidor"} {...props} enNavegador={enNavegador} />;
}

function FormularioBoutique(props: PropsDeVender & { enNavegador: boolean }) {
  const {
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
    balanza,
    bloqueAviso,
    bloqueConfirmacion,
    bloqueDescuento,
    bloqueDudas,
    bloqueGrabada,
    bloqueManuales,
    bloqueUltima,
    byId,
    cambioTrasCorte,
    cambios,
    camposDelUltimoPie: camposDelUltimoPieRef,
    clienteKey,
    clienteVenta,
    cobroFrenadoPorPrecio: cobroFrenadoPorPrecioRef,
    coincidencias,
    conCliente,
    conDescuento,
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
    enviandoBoutique,
    envioPrevisto,
    esTactil,
    faltanteDe,
    fijadas,
    finDelCobro: finDelCobroRef,
    formulario: formularioRef,
    fulfillment,
    guardarFijadasEstable,
    hayCantidadInvalida,
    hayFaltante,
    hayLineaValida,
    hayManualInvalida,
    horario,
    huerfana,
    isOrder,
    leidas,
    lineaConPesoSinConfirmar,
    lineaSinCantidad,
    lines,
    manuales,
    manualesLeidas,
    medio,
    motivoBloqueo,
    negocioId,
    nextKey,
    nombresDeLaDuda,
    nota,
    pagoConDelPie: pagoConDelPieRef,
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
    sePuedeSumar,
    setACuenta,
    setActivoKey,
    setAgotadoEnLaMano,
    setAvisoBoutique,
    setAvisoDeLaFicha,
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
    stockById,
    submit,
    subtotal,
    sumarUnidades,
    tecladoDe,
    teclasBoutique,
    tipoDescuento,
    tocarTecla,
    tocarTeclaEstable,
    topePrecioAMano,
    total,
    totalACobrar,
    totalDeLinea,
    usarTeclado,
    yaGrabada,
    zonaId,
    zonasDelEnvio,
  } = useNucleoDeVenta(props);


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
    const f = formularioRef.current;
    if (!f) return Promise.resolve();
    // Un campo obligatorio vacío (el nombre del pedido, la dirección): el navegador no lo manda.
    if (!f.checkValidity()) {
      f.reportValidity();
      return Promise.resolve();
    }
    return new Promise<void>((resolver) => {
      finDelCobroRef.current = resolver;
      f.requestSubmit();
    });
  }

  /** El pie eligió cómo pagó: el estado de la venta queda con ese medio y sale el cobro. */
  async function cobrarConElPie(r: ResultadoDelPie) {
    // MG-048: el precio se controla al sumar el renglón y otra vez en el mismo viaje del cobro
    // (`cobrarDelMostrador`): si cambió, no se cobra uno que no se ve.
    const antes = { paid, medio, aCuenta };
    cobroFrenadoPorPrecioRef.current = false;
    const campos = camposDelPie(totalACobrar, r);
    // Tarjeta (N2 · M1-C1) viaja como un medio más (el pie la manda igual que `PieDeCobro`, con el mismo
    // molde): sólo si la página la ofreció; el servidor la vuelve a exigir con `tarjetaHabilitada()`.
    const principal = (leerMedioDeCobroConTarjeta(campos.find(([n]) => n === "paymentMethod")?.[1] ?? "", props.boutique?.conTarjeta === true) ??
      "") as MedioDeCobro | "";
    camposDelUltimoPieRef.current = campos;
    // «Pagó con $X · Vuelto $Y» en el ticket (O-3): lo que entregó en efectivo, también en un pago
    // dividido (el vuelto se cuenta contra el renglón de efectivo, `vueltoDelTicket`).
    pagoConDelPieRef.current =
      (r.modo === "simple" ? r.medio === "EFECTIVO" : r.pagos.some((p) => p.medio === "EFECTIVO")) ? (r.recibido ?? null) : null;
    // La firma del cobro (lo que el servidor compara en un reintento) lleva el medio: se fija ANTES
    // de mandar, para que `submit` salga con él.
    flushSync(() => {
      setPaid(true);
      setMedio(principal);
      setACuenta(false);
    });
    await enviarYEsperar();
    // Frenado por un precio que cambió: la venta sigue como estaba antes del toque (no se cobró).
    if (cobroFrenadoPorPrecioRef.current) {
      cobroFrenadoPorPrecioRef.current = false;
      setPaid(antes.paid);
      setMedio(antes.medio);
      setACuenta(antes.aCuenta);
    }
  }

  /** Registrar sin cobrar (día cerrado, pedido, «Más») o dejar a cuenta, por el mismo `submit`. */
  async function registrarBoutique(como: "sin-cobrar" | "a-cuenta") {
    if (enviandoBoutique) return;
    setEnviandoBoutique(true);
    pagoConDelPieRef.current = null;
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
        // Y un corte recién tocado, sin el peso todavía: «Falta el peso de Vacío» (no «Cargá algo»).
        (faltaEnManual ?? (lineaSinCantidad ? motivoDeLineaSinCantidad(byId.get(lineaSinCantidad.productId)) : undefined))
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
      !paid || aCuentaActivo ? [] : (camposDelUltimoPieRef.current ?? (medio ? camposDelPie(totalACobrar, { modo: "simple", medio }) : []));
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
        <RenglonBoutique
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
        </RenglonBoutique>
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

        {/* La grilla del mostrador: elegir (buscador, teclas, atajos) a la izquierda y el ticket a la
            derecha en la PC; en el celular, uno abajo del otro. El <form> es `contents`: sólo envuelve
            lo que viaja (el ticket y el cobro), así los atajos —que tienen sus propios formularios
            (la caja) y campos (el pedido de WhatsApp)— quedan fuera de la venta. */}
        <div data-vender="grilla-boutique" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] lg:items-start">
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
            {b.atajos}
          </div>

        <form ref={formularioRef} action={submit} data-vender="mostrador-boutique" className="contents">
          <input type="hidden" name="channel" value={isOrder ? "ONLINE" : "COUNTER"} />
          {/* «Reintentar cobro»: lo mismo que se mandó en el intento que quedó en duda. */}
          {reintentando &&
            camposDelReintento.map(([nombre, valor], i) => <input key={`${nombre}-${i}`} type="hidden" name={nombre} value={valor} />)}
          {aCuentaActivo && <input type="hidden" name="aCuenta" value="1" />}

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

            <TicketBoutique
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
            </TicketBoutique>

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
                  // El teléfono y el nombre van en la firma del cobro, como viajan en el formularioRef.
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

          {/* El cobro, fijo abajo en el celular (encima de la barra de espacios) y a lo ancho en la PC.
              Vacío no ocupa lugar; con algo cargado es una barra con el total y «Cobrar $X» (V-2). */}
          <div data-vender="cobro-boutique" className="sticky bottom-[var(--alto-barra-inferior,0px)] z-20 space-y-2 lg:col-span-2">
            <div className="space-y-2 rounded-lg border border-line bg-surface-sunken p-3 empty:hidden">{bloqueAviso}</div>
            {puedeReintentar && (
              <div className="rounded-lg border border-line bg-surface-sunken p-3">
                <button type="button" className={buttonClasses("solid", "lg", "w-full")} disabled={enviandoBoutique} onClick={() => void reintentarBoutique()}>
                  {enviandoBoutique ? "Cobrando…" : `${etiquetaDeReintento(isOrder)} ${isOrder ? "" : fmtMoneyARS(sinRespuesta!.total)}`.trim()}
                </button>
              </div>
            )}
            {isOrder && !paid ? (
              <div data-vender="pie-del-pedido" className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-sunken p-3">
                <p data-vender="total-fijo" className="min-w-0">
                  <span className="block text-xs font-medium uppercase tracking-wide text-muted">Total del pedido</span>
                  <span className="font-display text-3xl leading-none tabular-nums text-accent-ink">
                    {fmtMoneyARS(totalACobrar, Number.isInteger(totalACobrar) ? 0 : 2)}
                  </span>
                </p>
                <button
                  type="button"
                  className={buttonClasses("solid", "lg")}
                  disabled={registrarBloqueado}
                  onClick={() => void registrarBoutique("sin-cobrar")}
                >
                  {enviandoBoutique ? "Registrando…" : registrarBloqueado && motivoBloqueo ? motivoBloqueo : "Registrar pedido"}
                </button>
              </div>
            ) : (
              <>
                <PieDeCobroPlegable
                  version={pieKey}
                  total={totalACobrar}
                  cargado={conProducto.length > 0 || manuales.length > 0}
                  rotuloTotal={isOrder ? "Total del pedido" : "Total"}
                  deshabilitado={motivoDelPie ? { motivo: motivoDelPie } : undefined}
                  textoBoton={cobrarEnPedido ? "Registrar y cobrar" : "Cobrar"}
                  conTarjeta={b.conTarjeta === true}
                  onCobrar={cobrarConElPie}
                  alLado={
                    !isOrder && !diaCerrado ? (
                      <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
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
                      </div>
                    ) : undefined
                  }
                />
                {!isOrder && diaCerrado && hayLineaValida && (
                  <button
                    type="button"
                    className={buttonClasses("solid", "lg", "w-full")}
                    disabled={registrarBloqueado}
                    onClick={() => void registrarBoutique("sin-cobrar")}
                  >
                    {enviandoBoutique ? "Registrando…" : REGISTRAR_PARA_MANANA}
                  </button>
                )}
              </>
            )}
          </div>
        </form>
        </div>
      </div>
    );
  }

  // La vista lee al dibujar los campos del último intento cortado (`camposDelUltimoPieRef`, para
  // «Reintentar cobro»), igual que cuando era la rama de VenderForm: no cambia nada del cobro.
  // eslint-disable-next-line react-hooks/refs
  return vistaBoutique(props.boutique!);
}
