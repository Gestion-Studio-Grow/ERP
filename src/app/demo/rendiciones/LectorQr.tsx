"use client";

// "Probar con un QR real": lee el QR de una factura electrónica argentina en el navegador.
//
// - Si el navegador tiene BarcodeDetector (Chrome en Android, Safari reciente…), se puede abrir
//   la cámara o elegir una foto. Si no lo tiene (p. ej. Chrome de escritorio en Windows), queda
//   el campo para pegar el contenido del QR.
// - El texto pasa por `leerQrArca` del motor, que valida la especificación de ARCA y devuelve
//   el error en criollo. Nada se envía a ningún servidor: la imagen no sale del teléfono.

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { AvisoError, Button, Field, Textarea } from "@/components/ui";
import { claseDesdeTipoArca, leerQrArca, type LecturaQr } from "@/lib/rendiciones";
import { escenarioDemo } from "./escenario";
import { IconoCamara, IconoQr } from "./piezas";

type CodigoDetectado = { rawValue: string };
type DetectorDeCodigos = { detect(fuente: ImageBitmapSource): Promise<CodigoDetectado[]> };
type ConstructorDetector = new (opciones: { formats: string[] }) => DetectorDeCodigos;

function detectorDisponible(): ConstructorDetector | undefined {
  return (globalThis as { BarcodeDetector?: ConstructorDetector }).BarcodeDetector;
}

function sinSuscripcion() {
  return () => {};
}

const MONEDAS_QUE_RINDE = ["PES", "DOL"];

export default function LectorQr({ legajo, onLeido }: { legajo: string; onLeido: (lectura: LecturaQr) => void }) {
  const id = useId();
  // Se consulta recién en el navegador (en el HTML estático no hay cámara ni detector).
  const conDetector = useSyncExternalStore(sinSuscripcion, () => Boolean(detectorDisponible()), () => false);
  const conCamara = useSyncExternalStore(
    sinSuscripcion,
    () => Boolean(detectorDisponible() && navigator.mediaDevices?.getUserMedia),
    () => false,
  );
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [camara, setCamara] = useState<"apagada" | "abriendo" | "encendida">("apagada");
  const videoRef = useRef<HTMLVideoElement>(null);
  const flujoRef = useRef<MediaStream | null>(null);
  const intervaloRef = useRef<number | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);

  const apagarCamara = useCallback(() => {
    if (intervaloRef.current !== null) window.clearInterval(intervaloRef.current);
    intervaloRef.current = null;
    flujoRef.current?.getTracks().forEach((pista) => pista.stop());
    flujoRef.current = null;
  }, []);

  // Si la persona se va de la pantalla con la cámara prendida, se apaga.
  useEffect(() => apagarCamara, [apagarCamara]);

  const procesar = (contenido: string) => {
    const resultado = leerQrArca(contenido.trim());
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    const { lectura } = resultado;
    if (!claseDesdeTipoArca(lectura.tipoComprobanteArca)) {
      setError(`Es un QR de ARCA, pero de un tipo de comprobante que no se rinde (código ${lectura.tipoComprobanteArca}).`);
      return;
    }
    if (!MONEDAS_QUE_RINDE.includes(lectura.moneda)) {
      setError(`La demo rinde comprobantes en pesos o en dólares; este está en "${lectura.moneda}".`);
      return;
    }
    setError(null);
    onLeido(lectura);
  };

  const abrirCamara = async () => {
    const Detector = detectorDisponible();
    if (!Detector) return;
    setError(null);
    setCamara("abriendo");
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      flujoRef.current = flujo;
      const video = videoRef.current;
      if (!video) throw new Error("sin video");
      video.srcObject = flujo;
      await video.play();
      setCamara("encendida");
      const detector = new Detector({ formats: ["qr_code"] });
      intervaloRef.current = window.setInterval(async () => {
        try {
          const [codigo] = await detector.detect(video);
          if (codigo?.rawValue) {
            apagarCamara();
            setCamara("apagada");
            procesar(codigo.rawValue);
          }
        } catch {
          /* cuadro sin QR legible: se sigue mirando */
        }
      }, 400);
    } catch {
      apagarCamara();
      setCamara("apagada");
      setError("No pudimos abrir la cámara. Revisá el permiso del navegador, o elegí una foto o pegá el contenido del QR.");
    }
  };

  const cerrarCamara = () => {
    apagarCamara();
    setCamara("apagada");
  };

  const leerFoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    const Detector = detectorDisponible();
    if (!archivo || !Detector) return;
    try {
      const imagen = await createImageBitmap(archivo);
      const [codigo] = await new Detector({ formats: ["qr_code"] }).detect(imagen);
      imagen.close();
      if (codigo?.rawValue) procesar(codigo.rawValue);
      else setError("No encontramos un QR en la foto. Probá con otra más de cerca, o pegá el contenido.");
    } catch {
      setError("No pudimos leer la foto. Probá con otra, o pegá el contenido del QR.");
    }
  };

  // El ejemplo es el QR de una factura que ya rindió OTRA persona: al cargarla se ve que el
  // sistema detecta duplicados en toda la empresa, no sólo dentro de la rendición (plan §7).
  const ejemplo = Object.entries(escenarioDemo.qrPorComprobante).find(
    ([id]) => escenarioDemo.comprobantes.find((c) => c.id === id)?.legajo !== legajo,
  )?.[1];

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-body">
        Si tenés a mano una factura electrónica, leé su QR. El teléfono saca del QR los datos exactos que registró ARCA.
        <span className="font-medium text-strong"> Nada se envía a ningún servidor.</span>
      </p>

      {conDetector ? (
        <div className="space-y-3">
          <div className={camara === "apagada" ? "hidden" : "rendi-visor relative overflow-hidden rounded-2xl"}>
            <video ref={videoRef} muted playsInline className="aspect-[3/4] w-full object-cover" aria-label="Vista de la cámara" />
            <span className="rendi-esquinas" aria-hidden="true" />
          </div>
          {camara === "apagada" ? (
            <div className="grid grid-cols-2 gap-2">
              {conCamara ? (
                <Button onClick={abrirCamara}>
                  <IconoCamara />
                  Abrir la cámara
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => fotoRef.current?.click()} className={conCamara ? undefined : "col-span-2"}>
                <IconoQr />
                Elegir una foto
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p role="status" className="text-sm text-muted">
                {camara === "abriendo" ? "Abriendo la cámara…" : "Apuntá al QR del comprobante."}
              </p>
              <Button variant="ghost" size="sm" onClick={cerrarCamara}>
                Cerrar la cámara
              </Button>
            </div>
          )}
          <input ref={fotoRef} type="file" accept="image/*" capture="environment" onChange={leerFoto} className="sr-only" tabIndex={-1} aria-hidden="true" />
        </div>
      ) : (
        <p className="rounded-lg bg-surface-sunken px-3 py-2.5 text-xs leading-relaxed text-muted">
          Este navegador no trae lector de QR integrado. Podés pegar el contenido del QR (la dirección que empieza con
          https://www.arca.gob.ar/fe/qr/ o https://www.afip.gob.ar/fe/qr/). En un teléfono Android con Chrome se abre la cámara.
        </p>
      )}

      <div className="space-y-2">
        <Field label="Contenido del QR" htmlFor={`${id}-texto`} hint="Pegá la dirección completa o sólo el código que va después de ?p=">
          <Textarea
            id={`${id}-texto`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            spellCheck={false}
            className="font-mono text-xs"
            placeholder="https://www.arca.gob.ar/fe/qr/?p=…"
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => procesar(texto)} disabled={!texto.trim()}>
            Leer el QR
          </Button>
          {ejemplo ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTexto(ejemplo);
                procesar(ejemplo);
              }}
            >
              Probar con el QR de una factura que ya rindió otra persona
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <AvisoError titulo="No se pudo leer el QR" comoSeguir={error} /> : null}
    </div>
  );
}
