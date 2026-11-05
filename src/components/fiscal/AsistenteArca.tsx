// Asistente ARCA de 4 pasos (server component). Lo usan el cliente (/admin/facturacion?vista=arca) y
// el operador (ficha del negocio, pestaña Fiscal) con sus propias actions: cada plano pasa las suyas,
// con su guardia. El paso que toca sale de `estadoDelAsistente` (src/lib/fiscal/asistente-arca.ts).
// La clave privada nunca llega acá: sólo el .csr (público) para descargarlo.
import { Bloque, Button, Field, Franja, Input, Marca, Renglon, Textarea, fmtCuit } from "@/components/ui";
import { CONDICIONES_DEL_EMISOR, type CondicionDelEmisor } from "@/lib/fiscal/condicion-iva-emisor";
import { INSTRUCCIONES_DEL_PEDIDO, PALABRA_DEL_PASE, type EstadoDePaso } from "@/lib/fiscal/asistente-arca";
import type { VistaDelAsistente } from "@/lib/fiscal/asistente-arca.server";

type Accion = (formData: FormData) => void | Promise<void>;

interface Props {
  vista: VistaDelAsistente;
  plano: "cliente" | "operador";
  /** Sólo en el plano del operador: va oculto en cada formulario (su guardia lo exige). */
  tenantId?: string;
  acciones: { generarPedido: Accion; cargarCertificado: Accion; probar: Accion; pedirPase?: Accion };
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

  return (
    <Bloque
      id="asistente-arca"
      titulo="Conectar con ARCA"
      cuenta={estado.paso === "listo" ? "Factura en producción" : `Paso ${Math.min(4, estado.pasos.findIndex((p) => p.estado === "actual") + 1)} de 4`}
      nota="La clave del certificado se genera y se guarda cifrada en el sistema: nadie la ve ni la pega"
      className="scroll-mt-24"
    >
      {aviso?.error && <Franja tono="peligro">{aviso.error}</Franja>}
      {aviso?.ok && <Franja>{aviso.ok}</Franja>}
      {soloLectura && (
        <p role="alert" className="py-3 text-sm text-warning">
          {soloLectura}
        </p>
      )}

      <Paso numero={1} titulo={p1.titulo} estado={p1.estado}>
        <Renglon titulo="CUIT" detalle={f.arcaCuit ? fmtCuit(f.arcaCuit) : "Sin cargar"} />
        <Renglon titulo="Punto de venta" detalle={f.arcaPuntoVenta ? String(f.arcaPuntoVenta) : "Sin cargar"} />
        <Renglon titulo="Condición frente al IVA" detalle={iva ?? "Sin cargar"} />
        {!datosOk && (
          <p className="text-warning">
            {estado.faltanDatos.join(" ")}{" "}
            {plano === "cliente"
              ? "Pedile a GSG que lo cargue (por WhatsApp o por mail): estos datos los carga GSG para que coincidan con ARCA."
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
                  Pedido generado el {fecha(entrada.pedidoPendiente!.creadoEn)}.{" "}
                  <a
                    href={`data:application/pkcs10;base64,${btoa(csrPem)}`}
                    download={`pedido-arca-${cuit}.csr`}
                    className="font-medium text-accent-ink underline underline-offset-4"
                  >
                    Bajar el archivo .csr
                  </a>
                </p>
                <div className="grid gap-4 lg:grid-cols-2">
                  {(["pruebas", "produccion"] as const).map((k) => (
                    <div key={k}>
                      <p className="font-semibold text-strong">{INSTRUCCIONES_DEL_PEDIDO[k].titulo}</p>
                      <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted">
                        {INSTRUCCIONES_DEL_PEDIDO[k].pasos.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted">
                {estado.certificado === "pruebas"
                  ? "El certificado cargado es de pruebas. Para facturar en serio generá un pedido nuevo y canjealo en «Certificados Digitales» de ARCA."
                  : conCertificado
                    ? "Si el certificado vence o lo tenés que cambiar, generá un pedido nuevo."
                    : "Generamos el pedido de certificado de este negocio. Lo bajás y lo cargás en ARCA con la clave fiscal del negocio."}
              </p>
            )}
            {puedeTocar && (
              <form action={acciones.generarPedido}>
                {oculto}
                <Button type="submit" variant={csrPem || conCertificado ? "outline" : undefined}>
                  {csrPem ? "Generar otro pedido (el anterior deja de servir)" : "Generar pedido de certificado"}
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
            <Field label="Pegá el certificado que te dio ARCA" htmlFor="asistente-cert">
              <Textarea
                id="asistente-cert"
                name="certPem"
                rows={4}
                placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                className="font-mono text-xs"
              />
            </Field>
            <Field label="O subí el archivo .crt" htmlFor="asistente-cert-archivo">
              <Input id="asistente-cert-archivo" name="certArchivo" type="file" accept=".crt,.cer,.pem,.txt" />
            </Field>
            <div>
              <Button type="submit">Guardar el certificado</Button>
            </div>
          </form>
        ) : (
          !conCertificado && <p className="text-muted">Cuando ARCA te dé el certificado del pedido, lo cargás acá.</p>
        )}
        {conCertificado && (
          <>
            <p>
              {estado.certificado === "produccion"
                ? "Hay un certificado de producción cargado."
                : estado.certificado === "pruebas"
                  ? "Hay un certificado de pruebas (homologación) cargado."
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
                detalle={c.detalle}
                tecla={<Marca tipo={c.ok ? "hecho" : "pendiente"}>{c.ok ? "Listo" : "Falta"}</Marca>}
              />
            ))}
            {entrada.pedidoDePase && (
              <Franja tono="atencion">
                {plano === "cliente"
                  ? `Pediste el pase el ${fecha(entrada.pedidoDePase.pedidoEn)}: GSG revisa las condiciones y te confirma.`
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
                    anula con nota de crédito. GSG revisa las condiciones y confirma el pase.
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
