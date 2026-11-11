// Asistente ARCA de 4 pasos (server component). Lo usan el cliente (/admin/facturacion?vista=arca) y
// el operador (ficha del negocio, pestaña Fiscal) con sus propias actions: cada plano pasa las suyas,
// con su guardia. El paso que toca sale de `estadoDelAsistente` (src/lib/fiscal/asistente-arca.ts).
// La clave privada nunca llega acá: sólo el .csr (público) para descargarlo.
import { Bloque, Button, Field, Franja, Input, Marca, Renglon, fmtCuit } from "@/components/ui";
import { CONDICIONES_DEL_EMISOR, type CondicionDelEmisor } from "@/lib/fiscal/condicion-iva-emisor";
import { INSTRUCCIONES_DEL_PEDIDO, PALABRA_DEL_PASE, type EstadoDePaso } from "@/lib/fiscal/asistente-arca";
import type { VistaDelAsistente } from "@/lib/fiscal/asistente-arca.server";
import { ANTES_DE_EMPEZAR, TEXTO_CERTIFICADO_PROPIO } from "@/lib/fiscal/contador-arca";
import { ObtenerAsistencia } from "./ObtenerAsistencia";
import { CampoCertificado, CopiarTexto } from "./PiezasArca";
import { GuiaArca } from "./GuiaArca";
import { AyudaArca } from "./AyudaArca";
import { canalGsg } from "@/app/facturita/contacto";
import { mensajeDeAyuda } from "@/lib/fiscal/guia-arca";

type Accion = (formData: FormData) => void | Promise<void>;

interface Props {
  vista: VistaDelAsistente;
  plano: "cliente" | "operador";
  /** Sólo en el plano del operador: va oculto en cada formulario (su guardia lo exige). */
  tenantId?: string;
  acciones: {
    generarPedido: Accion;
    cargarCertificado: Accion;
    probar: Accion;
    pedirPase?: Accion;
    /** «Obtené asistencia» (sólo el cliente). */
    pedirAsistencia?: Accion;
    cancelarAsistencia?: Accion;
  };
  /** Por qué este operador no puede tocar el negocio (CH sin el dueño de GSG), o null. */
  soloLectura?: string | null;
  aviso?: { ok?: string; error?: string };
}

const MARCA: Record<EstadoDePaso, { tipo: "hecho" | "atencion" | "pendiente"; texto: string }> = {
  hecho: { tipo: "hecho", texto: "Listo" },
  actual: { tipo: "atencion", texto: "Ahora" },
  falta: { tipo: "pendiente", texto: "Después" },
};

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

/** Las condiciones del pase que dependen del negocio; el resto (modo de la plataforma, limpieza de la
 * etapa de pruebas) las resuelve nuestro equipo y su detalle interno no se le muestra al cliente. */
const PRECONDICIONES_DEL_NEGOCIO = new Set(["cuit", "puntoVenta", "condicionIva", "credencial"]);
const DETALLE_DE_NUESTRO_EQUIPO = "Esto lo resuelve nuestro equipo cuando pedís el pase.";

function Paso({ numero, titulo, estado, children }: { numero: number; titulo: string; estado: EstadoDePaso; children: React.ReactNode }) {
  const m = MARCA[estado];
  return (
    <div className="border-b border-line py-3" aria-current={estado === "actual" ? "step" : undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-strong">
          Paso {numero} · {titulo}
        </h3>
        <Marca tipo={m.tipo}>{m.texto}</Marca>
      </div>
      <div className="mt-2 space-y-3 text-sm">{children}</div>
    </div>
  );
}

export function AsistenteArca({ vista, plano, tenantId, acciones, soloLectura = null, aviso }: Props) {
  const { estado, entrada, csrPem } = vista;
  const f = entrada.ficha;
  const [p1, p2, p3, p4] = estado.pasos;
  const oculto = plano === "operador" && tenantId ? <input type="hidden" name="tenantId" value={tenantId} /> : null;
  const puedeTocar = !soloLectura;
  const datosOk = estado.faltanDatos.length === 0;
  const iva = f.arcaCondicionIva ? CONDICIONES_DEL_EMISOR[f.arcaCondicionIva as CondicionDelEmisor] ?? f.arcaCondicionIva : null;
  const cuit = (f.arcaCuit ?? "").replace(/\D/g, "");
  const conCertificado = estado.certificado !== "ninguno";
  const canal = canalGsg();
  const actual = estado.pasos.find((p) => p.estado === "actual");

  return (
    <Bloque
      id="asistente-arca"
      titulo="Conectar con ARCA"
      cuenta={estado.paso === "listo" ? "Factura en producción" : `Paso ${Math.min(4, estado.pasos.findIndex((p) => p.estado === "actual") + 1)} de 4`}
      className="scroll-mt-24"
    >
      {/* La nota va abajo de la cabeza y no en `nota`: a 390 px las tres piezas en un renglón partían el título en tres. */}
      <p className="pt-2 text-[13px] text-muted">
        La clave del certificado se genera y se guarda cifrada en el sistema: nadie la ve ni la pega.
      </p>
      {aviso?.error && <Franja tono="peligro">{aviso.error}</Franja>}
      {aviso?.ok && <Franja>{aviso.ok}</Franja>}
      {soloLectura && (
        <p role="alert" className="py-3 text-sm text-warning">
          {soloLectura}
        </p>
      )}

      {/* Con el certificado ya cargado, el «antes de empezar» sobra: no se repite. */}
      {plano === "cliente" && estado.paso !== "listo" && !conCertificado && (
        <div className="space-y-2 border-b border-line py-3 text-sm">
          <p>{TEXTO_CERTIFICADO_PROPIO}</p>
          <Franja tono="atencion">{ANTES_DE_EMPEZAR}</Franja>
        </div>
      )}
      {/* La ayuda, visible para todos (ajuste del dueño 11/11). Con la guía en ARCA a la vista, va adentro
          de la guía con el subpaso exacto; si no, acá, con el paso del asistente. */}
      {plano === "cliente" && estado.paso !== "listo" && !(datosOk && csrPem) && (
        <div className="border-b border-line py-3">
          <AyudaArca
            canal={canal}
            mensaje={mensajeDeAyuda({
              donde: actual ? `el asistente de ARCA, paso ${actual.numero} de 4 («${actual.titulo}»)` : "el asistente de ARCA",
              error: aviso?.error,
              cuit,
            })}
          />
        </div>
      )}
      <ObtenerAsistencia
        contador={vista.contador}
        contadores={vista.contadores}
        avisoAlContador={vista.avisoAlContador}
        soporte={vista.soporte}
        acciones={
          puedeTocar && acciones.pedirAsistencia && acciones.cancelarAsistencia
            ? { pedir: acciones.pedirAsistencia, cancelar: acciones.cancelarAsistencia }
            : undefined
        }
      />

      <Paso numero={1} titulo={p1.titulo} estado={p1.estado}>
        <Renglon titulo="CUIT" detalle={f.arcaCuit ? fmtCuit(f.arcaCuit) : "Sin cargar"} />
        <Renglon titulo="Punto de venta" detalle={f.arcaPuntoVenta ? String(f.arcaPuntoVenta) : "Sin cargar"} />
        <Renglon titulo="Condición frente al IVA" detalle={iva ?? "Sin cargar"} />
        {!datosOk && (
          <p className="text-warning">
            {estado.faltanDatos.join(" ")}{" "}
            {plano === "cliente"
              ? "Pedíselo a nuestro equipo (por WhatsApp o por mail): estos datos los cargamos nosotros para que coincidan con ARCA."
              : "Cargalos en los pasos de más abajo (CUIT, punto de venta, condición frente al IVA)."}
          </p>
        )}
      </Paso>

      <Paso numero={2} titulo={p2.titulo} estado={p2.estado}>
        {!datosOk ? (
          <p className="text-muted">Primero hacen falta los datos del paso 1.</p>
        ) : (
          <>
            {csrPem ? (
              <>
                <p>
                  Listo el pedido de certificado (generado el {fecha(entrada.pedidoPendiente!.creadoEn)}). Es un texto que
                  le dice a ARCA quién sos; no tiene tu clave fiscal.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`data:application/pkcs10;base64,${btoa(csrPem)}`}
                    download={`pedido-arca-${cuit}.csr`}
                    className="inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-4"
                  >
                    Bajar el pedido (archivo .csr)
                  </a>
                  <CopiarTexto texto={csrPem} etiqueta="Copiar el pedido" />
                </div>
                <div className="space-y-3">
                  {(["produccion", "pruebas"] as const).map((k) => {
                    const lista = (
                      <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted">
                        {INSTRUCCIONES_DEL_PEDIDO[k].pasos.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ol>
                    );
                    // El cliente lo hace él mismo: la guía de a un paso. El operador ve la lista entera.
                    if (k === "produccion" && plano === "cliente") return <GuiaArca key={k} cuit={cuit} canal={canal} error={aviso?.error} />;
                    return k === "produccion" ? (
                      <div key={k}>
                        <p className="font-semibold text-strong">{INSTRUCCIONES_DEL_PEDIDO[k].titulo}</p>
                        {lista}
                      </div>
                    ) : (
                      <details key={k}>
                        <summary className="cursor-pointer font-medium text-accent-ink">{INSTRUCCIONES_DEL_PEDIDO[k].titulo}</summary>
                        {lista}
                      </details>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-muted">
                {estado.certificado === "pruebas"
                  ? "El certificado cargado es de pruebas. Para facturar en serio generá un pedido nuevo y canjealo en «Certificados Digitales» de ARCA."
                  : conCertificado
                    ? "Si el certificado vence o lo tenés que cambiar, generá un pedido nuevo."
                    : "Generamos el pedido de certificado de este negocio. Lo bajás y lo cargás vos en ARCA con tu clave fiscal (o se lo pasás a tu contador)."}
              </p>
            )}
            {puedeTocar && (
              <form action={acciones.generarPedido}>
                {oculto}
                {/* Rótulo corto: el botón no parte renglón y a 390 px el largo desbordaba la pantalla. */}
                {csrPem && <p className="pb-2 text-[13px] text-muted">Si generás otro pedido, el anterior deja de servir.</p>}
                <Button type="submit" variant={csrPem || conCertificado ? "outline" : undefined}>
                  {csrPem ? "Generar otro pedido" : "Generar el pedido de certificado"}
                </Button>
              </form>
            )}
          </>
        )}
      </Paso>

      <Paso numero={3} titulo={p3.titulo} estado={p3.estado}>
        {csrPem && puedeTocar ? (
          <form action={acciones.cargarCertificado} className="grid gap-3">
            {oculto}
            <CampoCertificado />
            <p className="text-[13px] text-muted">Al guardarlo, lo verificamos con ARCA en el momento y te decimos qué hacer si falta algo.</p>
            <div>
              <Button type="submit">Guardar el certificado</Button>
            </div>
          </form>
        ) : (
          !conCertificado && <p className="text-muted">Cuando ARCA te dé el certificado (el archivo .crt), lo pegás o lo subís acá.</p>
        )}
        {conCertificado && (
          <>
            <p>
              {estado.certificado === "produccion"
                ? "Hay un certificado de producción cargado."
                : estado.certificado === "pruebas"
                  ? "Hay un certificado de prueba cargado (modo de prueba)."
                  : "El certificado cargado tiene un problema: mirá el paso 4."}
            </p>
            {puedeTocar && (
              <form action={acciones.probar}>
                {oculto}
                <p className="pb-2 text-muted">
                  «Probar» pide el permiso a ARCA y lee el último comprobante del punto de venta. Con un certificado de
                  pruebas además saca una factura de prueba que no se guarda; en producción no emite nada.
                </p>
                <Button type="submit" variant="outline">
                  Probar con ARCA
                </Button>
              </form>
            )}
          </>
        )}
      </Paso>

      <Paso numero={4} titulo={p4.titulo} estado={p4.estado}>
        {estado.paso === "listo" ? (
          <p>El negocio ya factura en producción: cada comprobante sale con CAE y validez fiscal.</p>
        ) : (
          <>
            {estado.precondiciones.map((c) => (
              <Renglon
                key={c.id}
                titulo={c.titulo}
                detalle={plano === "cliente" && !c.ok && !PRECONDICIONES_DEL_NEGOCIO.has(c.id) ? DETALLE_DE_NUESTRO_EQUIPO : c.detalle}
                tecla={<Marca tipo={c.ok ? "hecho" : "pendiente"}>{c.ok ? "Listo" : "Falta"}</Marca>}
              />
            ))}
            {entrada.pedidoDePase && (
              <Franja tono="atencion">
                {plano === "cliente"
                  ? `Pediste el pase el ${fecha(entrada.pedidoDePase.pedidoEn)}: nuestro equipo revisa las condiciones y te confirma.`
                  : `El negocio pidió pasar a producción el ${fecha(entrada.pedidoDePase.pedidoEn)} (${entrada.pedidoDePase.por}). Se confirma en «Facturación real», más abajo.`}
              </Franja>
            )}
            {plano === "operador" ? (
              <p className="text-muted">
                El pase lo confirma un operador en{" "}
                <a href="#pase-a-real" className="font-medium text-accent-ink underline underline-offset-4">
                  Facturación real
                </a>
                .
              </p>
            ) : (
              acciones.pedirPase &&
              !entrada.pedidoDePase && (
                <form action={acciones.pedirPase} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <Franja tono="atencion" className="sm:col-span-2">
                    En producción cada comprobante sale con CAE de ARCA y tiene validez fiscal: no se edita ni se borra, se
                    anula con nota de crédito. Nuestro equipo revisa las condiciones y confirma el pase.
                  </Franja>
                  <Field
                    label={`Para pedir el pase, escribí ${PALABRA_DEL_PASE}`}
                    htmlFor="asistente-confirmacion"
                  >
                    <Input
                      id="asistente-confirmacion"
                      name="confirmacion"
                      autoComplete="off"
                      spellCheck={false}
                      required
                      disabled={!estado.puedePedirPase}
                    />
                  </Field>
                  <Button type="submit" disabled={!estado.puedePedirPase}>
                    Pedir el pase a producción
                  </Button>
                  {!estado.puedePedirPase && (
                    <p className="text-[13px] text-muted sm:col-span-2">
                      Se habilita cuando el certificado de producción está cargado y los datos del paso 1 están completos.
                    </p>
                  )}
                </form>
              )
            )}
          </>
        )}
      </Paso>
    </Bloque>
  );
}
