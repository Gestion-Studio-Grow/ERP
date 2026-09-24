"use client";

// Planilla de RECUENTO por góndola. Client component: no importa nada de servidor (la acción
// llega como referencia de "use server", los helpers son puros).
//
// Qué guarda cada línea: el TEXTO contado (se lee con `leerCantidad`, coma decimal, igual que
// el servidor) y la HORA en que se empezó a tipear, con el reloj del teléfono (`marcaDeConteo`).
// Al guardar, el formulario agrega la hora del teléfono en ese momento (`enviadoA`): el servidor
// usa sólo la diferencia entre las dos ("se contó hace 12 minutos") y compara contra el stock que
// había entonces. No se usa ninguna hora del servidor de cuando se armó la página: al volver con
// Atrás, Next muestra esa página guardada y la hora quedaría vieja (`horaDelConteo`).
//
// Conteo ciego (opcional): esconde el stock del sistema y la diferencia mientras se cuenta,
// para que el número esperado no empuje lo que se anota. La diferencia se ve al guardar.
//
// CON UNA MANO, EN EL CELULAR. Se cuenta con el teléfono en una mano y la mercadería en la
// otra, así que:
// - lo contado se anota en el teléfono a cada tecla (`borrador.ts`): si la pantalla se bloquea
//   y el navegador descarta la pestaña, al volver la planilla sigue como estaba;
// - "Siguiente" en el teclado salta al producto de abajo y, al terminar la góndola, al botón de
//   la próxima: no hace falta soltar la mercadería para apuntarle a un campo;
// - el avance y Guardar quedan pegados abajo, al alcance del pulgar, por encima de la barra de
//   espacios del celular (`--alto-barra-inferior`, layout.tsx).
//
// GUARDAR UNA SOLA VEZ. El borrador sobrevive a todo, también a un Guardar que llegó al servidor
// y cuya respuesta no volvió (sin señal en la cámara, pestaña descartada con Guardar en curso).
// Volver a mandar esos conteos descontaría la diferencia DOS veces. Por eso: antes de mandar se
// anota en el borrador que se está guardando; si la respuesta no llega, Guardar se traba hasta
// recargar; y al recargar, los conteos de productos que ya figuran recontados después
// (`ultimoRecuento` de la planilla de hoy) no vuelven (`leerBorrador`, borrador.ts).

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { unstable_rethrow } from "next/navigation";
import { registrarRecuento, type EstadoAjuste } from "@/lib/stock-adjustment-actions";
import { AvisoError, Textarea, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { cantidadParaFormulario, formatearCantidad, leerCantidad } from "@/lib/pos-peso";
import { round3 } from "@/lib/stock/ledger";
import { marcaDeConteo } from "@/lib/stock/adjustment-core";
import { useEnvio } from "@/lib/inventario/envio";
import {
  desdeRecuentoReciente,
  pideRecuento,
  resumirRecuento,
  type Gondola,
  type LineaDeRecuento,
} from "@/lib/inventario/recuento";
import {
  conteosVencidos,
  haceCuanto,
  leerBorrador,
  recuentosEnHoraDelTelefono,
  serializarBorrador,
  siguienteDeLaGondola,
} from "./borrador";

type Conteo = { texto: string; contadoA: number | null };
type EstadoDelBorrador = { gondola: string; ciego: boolean; nota: string; conteos: Record<string, Conteo>; enviadoA: number | null };

const signed = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3, signDisplay: "always" });

// El campo de la cantidad: el mismo aspecto que el `Input` de la casa, pero con letra de 16 px.
// Con menos, el Safari del iPhone agranda la página al tocar el campo y hay que achicarla con
// dos dedos, que es justo lo que no se tiene libre mientras se cuenta.
const CAMPO_CANTIDAD =
  "h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-right text-base tabular-nums " +
  "text-strong placeholder:text-faint transition-colors focus:border-accent focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-focus aria-invalid:border-danger";

function diasDesde(iso: string | null, ahora: number): string {
  if (!iso) return "nunca contado";
  const dias = Math.floor((ahora - Date.parse(iso)) / 86_400_000);
  if (dias <= 0) return "contado hoy";
  return dias === 1 ? "contado ayer" : `contado hace ${dias} días`;
}

// El almacenamiento del teléfono puede no estar (modo privado, bloqueado por el navegador) y
// entonces tira: la planilla tiene que andar igual, como antes, con lo cargado en memoria.
function leerAlmacen(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}
function escribirAlmacen(clave: string, valor: string | null) {
  try {
    if (valor === null) window.localStorage.removeItem(clave);
    else window.localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento: lo cargado queda sólo en la memoria de la pestaña.
  }
}

type PropsDeLaPlanilla = {
  gondolas: Gondola[];
  conCostos: boolean;
  /** Hora del servidor al armar la pantalla. SÓLO para mostrar "contado hace N días". */
  ahoraServidor: number;
  productoInicial: string | null;
  /**
   * ¿Quien cuenta tiene tope por carga (el encargado)? El faltante del recuento pasa por el
   * mismo tope que la merma; se avisa antes de contar, sin el monto (no ve costos).
   */
  conTope?: boolean;
  /** Dónde se anota el borrador en este teléfono (`claveDelBorrador`: negocio + persona). */
  claveBorrador: string;
};

const sinSuscripcion = () => () => {};

// El servidor no tiene el almacenamiento del teléfono, y la primera pintura del cliente tiene
// que ser igual a la del servidor: esa se arma sin borrador y sin anotar nada (si anotara, su
// planilla vacía borraría el borrador antes de leerlo). Apenas se sabe que se está en el
// teléfono, la planilla se arma de nuevo, ya con lo anotado. En la navegación dentro del panel
// no hay primera pintura del servidor: se arma una sola vez, directo con el borrador.
export default function RecuentoForm(props: PropsDeLaPlanilla) {
  const enTelefono = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  return <Planilla key={enTelefono ? "telefono" : "servidor"} {...props} enTelefono={enTelefono} />;
}

function Planilla({
  gondolas,
  conCostos,
  ahoraServidor,
  productoInicial,
  conTope = false,
  claveBorrador,
  enTelefono,
}: PropsDeLaPlanilla & { enTelefono: boolean }) {
  // Lo que había quedado anotado en este teléfono, contra la planilla de hoy. Se lee una sola
  // vez, al armar la planilla. Lo ya recontado después de cada conteo (la planilla de hoy lo
  // trae) no vuelve: ver "Guardar una sola vez" arriba.
  const [arranque] = useState(() => {
    if (!enTelefono) return null;
    const ahora = Date.now();
    const productos = gondolas.flatMap((g) => g.productos);
    const ids = new Set(productos.map((p) => p.id));
    const r = leerBorrador(leerAlmacen(claveBorrador), ids, ahora, recuentosEnHoraDelTelefono(productos, ahoraServidor, ahora));
    return r ? { ...r, hace: haceCuanto(r.borrador.guardadoA, ahora) } : null;
  });
  const b = arranque?.borrador;
  const inicial = productoInicial ? gondolas.find((g) => g.productos.some((p) => p.id === productoInicial))?.id : undefined;
  // Si se llegó con un producto elegido ("Recontar"), manda la góndola de ese producto; si no,
  // la del borrador.
  const gondolaDelBorrador = b && gondolas.some((g) => g.id === b.gondola) ? b.gondola : undefined;
  const [gondola, setGondola] = useState<string>(inicial ?? gondolaDelBorrador ?? gondolas[0]?.id ?? "");
  const [ciego, setCiego] = useState(b?.ciego ?? false);
  const [conteos, setConteos] = useState<Record<string, Conteo>>(b?.conteos ?? {});
  const [nota, setNota] = useState(b?.nota ?? "");
  const [recuperado, setRecuperado] = useState(
    arranque
      ? {
          recuperados: arranque.recuperados,
          descartados: arranque.descartados,
          yaRecontados: arranque.yaRecontados,
          seEstabaGuardando: arranque.seEstabaGuardando,
          hace: arranque.hace,
        }
      : null,
  );
  // Se tocó Guardar y no volvió respuesta: no se sabe si entró. Guardar queda trabado hasta
  // recargar (al recargar, lo que haya entrado sale de la planilla).
  const [sinRespuesta, setSinRespuesta] = useState(false);
  const listaRef = useRef<HTMLUListElement>(null);

  // Lo último anotado, para la acción de Guardar (que corre fuera del render) y para no volver
  // a escribir lo mismo. `anotado` guarda el contenido SIN la hora: reabrir la pantalla con el
  // mismo borrador no lo "rejuvenece", así la regla de un día vale también para la nota. Si lo
  // recuperado no es igual a lo que había (se sacaron conteos, o venía marcado "se estaba
  // guardando"), arranca vacío y se reescribe.
  const estadoRef = useRef<EstadoDelBorrador>({ gondola, ciego, nota, conteos, enviadoA: null });
  const anotado = useRef<string | null | undefined>(
    arranque && arranque.descartados === 0 && arranque.yaRecontados === 0 && !arranque.seEstabaGuardando
      ? serializarBorrador({ gondola, ciego, nota, conteos }, 0)
      : undefined,
  );
  function anotar(estado: EstadoDelBorrador) {
    estadoRef.current = estado;
    const contenido = serializarBorrador(estado, 0);
    if (contenido === anotado.current) return;
    anotado.current = contenido;
    escribirAlmacen(claveBorrador, contenido === null ? null : serializarBorrador(estado, Date.now()));
  }

  // Cada cambio queda anotado en el momento, sin esperar a salir de la pantalla: un bloqueo no
  // avisa, y una pestaña descartada no corre nada al irse. La marca de "se está guardando" la
  // pone y la saca la acción de Guardar; acá se conserva.
  useEffect(() => {
    if (!enTelefono) return;
    anotar({ gondola, ciego, nota, conteos, enviadoA: estadoRef.current.enviadoA });
  });

  useEffect(() => {
    if (productoInicial) document.getElementById(`cont-${productoInicial}`)?.focus();
  }, [productoInicial]);

  const todos = useMemo(() => gondolas.flatMap((g) => g.productos), [gondolas]);

  // Si se guardó, la planilla vuelve a empezar y el borrador se borra: el resultado queda a la
  // vista y un segundo toque no guarda el mismo recuento dos veces. Si volvió con error, todo
  // sigue cargado y anotado. Antes de enviar se agrega la hora del teléfono al tocar Guardar:
  // con ella el servidor sabe hace cuánto se contó cada línea.
  // `useEnvio` (onSubmit) y no `<form action>`: con action, React vaciaba el formulario también
  // cuando el recuento volvía con error.
  const { estado, enviar, enviando } = useEnvio<EstadoAjuste>(async (prev, fd) => {
    const ahora = Date.now();
    // Un conteo de más de un día hace que el servidor rechace el recuento ENTERO: se saca antes
    // de mandar y se dice cuál, así el resto se puede guardar.
    const horas = fd.getAll("contadoA").map(Number);
    const enviados = Object.fromEntries(fd.getAll("productId").map((id, i) => [String(id), { contadoA: horas[i] ?? null }]));
    const vencidos = conteosVencidos(enviados, ahora);
    if (vencidos.length > 0) {
      const nombres = vencidos.map((id) => todos.find((p) => p.id === id)?.nombre ?? id).join(", ");
      setConteos((m) => {
        const n = { ...m };
        for (const id of vencidos) delete n[id];
        return n;
      });
      return {
        ok: false,
        error:
          vencidos.length === 1
            ? `Un conteo tenía más de un día y se sacó de la planilla (${nombres}): volvé a contarlo y guardá.`
            : `${vencidos.length} conteos tenían más de un día y se sacaron de la planilla (${nombres}): volvé a contarlos y guardá.`,
      };
    }
    fd.set("enviadoA", String(ahora));
    // Antes de mandar, queda anotado que se está guardando: si la pestaña muere acá, al volver
    // se sabe que este Guardar pudo haber entrado.
    anotar({ ...estadoRef.current, enviadoA: ahora });
    let r: EstadoAjuste;
    try {
      r = await registrarRecuento(prev, fd);
    } catch (err) {
      // Una redirección (sesión vencida) la maneja Next; lo demás es que la respuesta no llegó.
      unstable_rethrow(err);
      setSinRespuesta(true);
      return {
        ok: false,
        error:
          "Se cortó la conexión antes de que llegara la respuesta: puede que el recuento se haya guardado. Recargá la pantalla antes de volver a guardar: lo que ya entró sale de la planilla y lo demás sigue cargado.",
      };
    }
    // Hubo respuesta: ya no hay nada en duda.
    if (r?.ok) {
      estadoRef.current = { gondola, ciego, nota: "", conteos: {}, enviadoA: null };
      anotado.current = null;
      escribirAlmacen(claveBorrador, null);
      setConteos({});
      setNota("");
      setRecuperado(null);
    } else {
      anotar({ ...estadoRef.current, enviadoA: null });
    }
    return r;
  }, null);

  const actualIdx = Math.max(0, gondolas.findIndex((g) => g.id === gondola));
  const actual = gondolas[actualIdx];
  const proxima = gondolas[actualIdx + 1] ?? null;
  const reciente = desdeRecuentoReciente(new Date(ahoraServidor));

  // Lo que viaja: sólo los productos con algo legible, de TODAS las góndolas (cambiar de
  // góndola no pierde lo contado).
  const cargados = todos.flatMap((p) => {
    const c = conteos[p.id];
    if (!c) return [];
    const l = leerCantidad(c.texto);
    return l.estado === "ok" && c.contadoA !== null ? [{ p, valor: l.valor, contadoA: c.contadoA }] : [];
  });
  const ilegibles = todos.filter((p) => conteos[p.id] && leerCantidad(conteos[p.id].texto).estado === "invalida");
  const contadosAca = actual ? actual.productos.filter((p) => conteos[p.id]).length : 0;
  const aGuardar = ilegibles.length > 0 ? 0 : cargados.length;

  function irAGondola(id: string) {
    setGondola(id);
    // Arriba de la lista nueva y con el primer campo listo para tipear.
    requestAnimationFrame(() => {
      listaRef.current?.scrollIntoView({ block: "start" });
      const primero = gondolas.find((g) => g.id === id)?.productos[0];
      if (primero) document.getElementById(`cont-${primero.id}`)?.focus({ preventScroll: true });
    });
  }

  // "Siguiente" en el teclado: el producto de abajo; al terminar la góndola, el botón de la
  // próxima (o Guardar, en la última).
  // `focus()` sólo desplaza si el campo está fuera de la pantalla, y uno que queda DEBAJO del pie
  // pegado cuenta como "adentro": el foco se iba a un campo tapado. Se mide contra el borde de
  // arriba del pie (en la PC el pie está al final, así que manda el alto de la ventana) y, si
  // no se ve entero, se lo trae al centro.
  function siguiente(id: string) {
    const prox = siguienteDeLaGondola(actual?.productos.map((p) => p.id) ?? [], id);
    const el = document.getElementById(prox ? `cont-${prox}` : proxima ? "recuento-proxima" : "recuento-guardar");
    if (!el) return;
    el.focus({ preventScroll: true });
    const r = el.getBoundingClientRect();
    const pie = document.getElementById("recuento-pie")?.getBoundingClientRect().top ?? window.innerHeight;
    if (el.id !== "recuento-guardar" && (r.top < 0 || r.bottom > Math.min(window.innerHeight, pie))) {
      el.scrollIntoView({ block: "center" });
    }
  }

  // Tirar lo contado no tiene vuelta atrás: es de lo poco que pide confirmación.
  function empezarDeCero() {
    if (!confirm("¿Borrar todo lo que contaste y empezar de cero? No se puede deshacer.")) return;
    anotar({ ...estadoRef.current, nota: "", conteos: {}, enviadoA: null });
    setConteos({});
    setNota("");
    setRecuperado(null);
  }

  return (
    <div className="space-y-6">
      {sinRespuesta ? (
        <AvisoError
          titulo="No sabemos si se guardó"
          comoSeguir="Se cortó la conexión antes de que llegara la respuesta. Recargá la pantalla antes de volver a guardar: lo que ya entró sale de la planilla y lo demás sigue cargado."
          accion={
            <button type="button" onClick={() => window.location.reload()} className={buttonClasses("solid", "md")}>
              Recargar
            </button>
          }
        />
      ) : (
        estado?.ok === false && (
          <AvisoError titulo="No se guardó el recuento" comoSeguir={`${estado.error} Lo que contaste sigue cargado.`} />
        )
      )}
      {estado?.ok && estado.recuento && <Resultado mensaje={estado.mensaje} lineas={estado.recuento} conCostos={conCostos} />}
      {recuperado && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-sunken px-4 py-3">
          <p className="min-w-0 text-sm text-body">
            {recuperado.recuperados > 0
              ? `Seguís donde habías dejado: ${recuperado.recuperados === 1 ? "1 conteo anotado" : `${recuperado.recuperados} conteos anotados`} ${recuperado.hace}.`
              : nota.trim() !== "" && `Quedó la nota que escribiste ${recuperado.hace}.`}
            {recuperado.yaRecontados > 0 && (
              <span className="block text-warning">
                {recuperado.seEstabaGuardando
                  ? `El último Guardar se cortó pero llegó: ${recuperado.yaRecontados === 1 ? "1 conteo ya estaba guardado" : `${recuperado.yaRecontados} conteos ya estaban guardados`} y no se vuelve a cargar. Mirá el resultado en Movimientos.`
                  : `${recuperado.yaRecontados === 1 ? "1 conteo no se recuperó: ese producto" : `${recuperado.yaRecontados} conteos no se recuperaron: esos productos`} ya se recontaron después. Mirá Movimientos.`}
              </span>
            )}
            {recuperado.seEstabaGuardando && recuperado.yaRecontados === 0 && recuperado.recuperados > 0 && (
              <span className="block text-muted">El último Guardar se cortó antes de llegar: no figura guardado, así que podés volver a guardarlo.</span>
            )}
            {recuperado.descartados > 0 && (
              <span className="block text-warning">
                {recuperado.descartados === 1
                  ? "1 conteo no se recuperó: tenía más de un día o ese producto ya no está en la planilla. Volvé a contarlo."
                  : `${recuperado.descartados} conteos no se recuperaron: tenían más de un día o esos productos ya no están en la planilla. Volvé a contarlos.`}
              </span>
            )}
          </p>
          {(recuperado.recuperados > 0 || nota.trim() !== "") && (
            <button type="button" onClick={empezarDeCero} className={buttonClasses("outline", "md")}>
              Empezar de cero
            </button>
          )}
        </div>
      )}

      <form onSubmit={enviar} className="space-y-4">
        {/* Góndolas: cada una es un tramo del recorrido. */}
        {gondolas.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Góndola">
            {gondolas.map((g) => {
              const hechos = g.productos.filter((p) => conteos[p.id]).length;
              const elegida = g.id === actual?.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={elegida}
                  onClick={() => setGondola(g.id)}
                  className={`inline-flex h-11 items-center rounded-md border px-3 text-sm transition-colors ${
                    elegida ? "border-accent bg-accent text-on-accent" : "border-line-strong text-muted hover:bg-surface-sunken"
                  }`}
                >
                  {g.nombre}
                  <span className="ml-1 tabular-nums opacity-80">
                    {hechos}/{g.productos.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <label className="flex min-h-11 items-center gap-3 text-sm text-body">
          <input
            type="checkbox"
            checked={ciego}
            onChange={(e) => setCiego(e.target.checked)}
            className="size-5 accent-[var(--accent)]"
          />
          Conteo ciego: no mostrar el stock del sistema mientras cuento
        </label>
        {!ciego && (
          <p className="text-xs text-faint">
            La diferencia que ves al lado de cada uno es contra el stock de este momento. Al guardar se calcula con lo que
            había cuando lo contaste.
          </p>
        )}
        {conTope && (
          <p className="text-xs text-muted">
            Tenés un tope por carga: si el recuento da un faltante grande, no se guarda y lo guarda la dueña o el dueño.
          </p>
        )}

        <ul ref={listaRef} className="scroll-mt-4 divide-y divide-line rounded-lg border border-line">
          {actual?.productos.map((p) => {
            const c = conteos[p.id];
            const l = c ? leerCantidad(c.texto) : null;
            const dif = l?.estado === "ok" ? round3(l.valor - p.stock) : null;
            const pide = pideRecuento(p.ultimoRecuento, reciente);
            return (
              <li key={p.id} className="grid grid-cols-[1fr_7.5rem] items-center gap-x-3 gap-y-1 px-3 py-3">
                <div className="min-w-0">
                  <label htmlFor={`cont-${p.id}`} className="block text-sm font-medium text-strong">
                    {p.nombre}
                  </label>
                  <p className="text-xs text-muted">
                    {!ciego && (
                      <span className="tabular-nums">
                        sistema {formatearCantidad(p.stock)} {p.unidad} ·{" "}
                      </span>
                    )}
                    <span className={pide ? "text-warning" : ""}>{diasDesde(p.ultimoRecuento, ahoraServidor)}</span>
                  </p>
                </div>
                <input
                  id={`cont-${p.id}`}
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="next"
                  autoComplete="off"
                  placeholder={p.kilo ? "kg" : p.unidad}
                  aria-invalid={l?.estado === "invalida" ? true : undefined}
                  value={c?.texto ?? ""}
                  onChange={(e) => {
                    const texto = e.target.value;
                    const ahora = Date.now();
                    setConteos((m) => {
                      const nuevo = { ...m };
                      if (texto.trim() === "") delete nuevo[p.id];
                      else nuevo[p.id] = { texto, contadoA: marcaDeConteo(m[p.id], texto, ahora) };
                      return nuevo;
                    });
                  }}
                  onKeyDown={(e) => {
                    // Enter no manda la planilla a medio contar: pasa al que sigue.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      siguiente(p.id);
                    }
                  }}
                  className={CAMPO_CANTIDAD}
                />
                {l?.estado === "invalida" && (
                  <p role="alert" className="col-span-2 text-xs text-danger">
                    Eso no es una cantidad. Escribila con coma si tiene gramos (4,350).
                  </p>
                )}
                {!ciego && dif !== null && dif !== 0 && (
                  <p className={`col-span-2 text-xs tabular-nums ${dif < 0 ? "text-danger" : "text-success"}`}>
                    {signed.format(dif)} {p.unidad}
                    {conCostos && p.costo !== null && ` · ${fmtMoneyARS(dif * p.costo)}`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        {proxima && (
          <button
            id="recuento-proxima"
            type="button"
            onClick={() => irAGondola(proxima.id)}
            className={`${buttonClasses("outline", "md")} w-full sm:w-auto`}
          >
            Seguir con {proxima.nombre}
          </button>
        )}

        {/* Lo que viaja a la acción: arrays paralelos, en forma canónica. */}
        {cargados.map(({ p, valor, contadoA }) => (
          <span key={p.id} hidden>
            <input type="hidden" name="productId" value={p.id} />
            <input type="hidden" name="value" value={cantidadParaFormulario(valor)} />
            <input type="hidden" name="contadoA" value={String(contadoA)} />
          </span>
        ))}

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Nota (opcional)</span>
          <Textarea name="note" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: recuento del lunes, heladera 2" />
        </label>

        {ilegibles.length > 0 && (
          <p role="alert" className="text-sm text-danger">
            Hay {ilegibles.length === 1 ? "1 cantidad que no se entiende" : `${ilegibles.length} cantidades que no se entienden`}:{" "}
            {ilegibles.map((p) => p.nombre).join(", ")}. Corregilas antes de guardar.
          </p>
        )}
        <p className="text-xs text-faint">
          Se guardan sólo los que cargaste; los que coinciden quedan registrados como contados. Hasta que guardes, lo que
          cargás queda anotado en este teléfono.
        </p>

        {/* Pegado abajo, al alcance del pulgar: cuánto va de esta góndola y Guardar. En la PC
            queda en su lugar, al final. */}
        <div id="recuento-pie" className="sticky bottom-[var(--alto-barra-inferior,0px)] z-10 -mx-4 flex items-center justify-between gap-3 border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-6px_16px_-10px_rgba(0,0,0,0.25)] sm:static sm:z-auto sm:mx-0 sm:px-0 sm:pb-0 sm:shadow-none">
          <p className="min-w-0 text-sm text-muted" aria-live="polite">
            {actual && (
              <span className="block tabular-nums">
                <span className="font-semibold text-strong">
                  {contadosAca} de {actual.productos.length}
                </span>{" "}
                {gondolas.length > 1 ? `en ${actual.nombre}` : "contados"}
              </span>
            )}
            {gondolas.length > 1 && cargados.length > contadosAca && (
              <span className="block text-xs tabular-nums">{cargados.length} en total</span>
            )}
          </p>
          <button
            id="recuento-guardar"
            type="submit"
            disabled={aGuardar === 0 || enviando || sinRespuesta}
            className={`${buttonClasses("solid", "lg")} shrink-0`}
          >
            {enviando ? "Guardando…" : aGuardar === 0 ? "Cargá lo contado" : `Guardar recuento (${aGuardar})`}
          </button>
        </div>
      </form>
    </div>
  );
}

function Resultado({ mensaje, lineas, conCostos }: { mensaje: string; lineas: LineaDeRecuento[]; conCostos: boolean }) {
  const r = resumirRecuento(lineas);
  const conDiferencia = lineas.filter((l) => l.diferencia !== 0);
  return (
    <section role="status" className="rounded-lg border border-success/30 bg-success-soft p-4">
      <p className="text-sm font-semibold text-strong">{mensaje}</p>
      {conCostos && (r.pesosFaltante > 0 || r.pesosSobrante > 0) && (
        <p className="mt-1 text-sm text-body">
          Faltante {fmtMoneyARS(r.pesosFaltante)} · sobrante {fmtMoneyARS(r.pesosSobrante)} a costo
          {r.sinCosto > 0 && ` (${r.sinCosto} sin costo cargado)`}.
        </p>
      )}
      {conDiferencia.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface-raised">
          {conDiferencia.map((l, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-sm">
              <span className="text-strong">{l.nombre}</span>
              <span className="tabular-nums text-body">
                había {formatearCantidad(l.teorico)} · contaste {formatearCantidad(l.contado)} ·{" "}
                <span className={l.diferencia < 0 ? "font-medium text-danger" : "font-medium text-success"}>
                  {signed.format(l.diferencia)} {l.unidad}
                </span>
                {conCostos && l.pesos !== null && ` · ${fmtMoneyARS(l.pesos)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
