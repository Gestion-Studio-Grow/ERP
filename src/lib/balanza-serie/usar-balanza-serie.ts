"use client";

// ============================================================================
// useBalanzaSerie — el peso en vivo de la balanza por cable, para la pantalla.
// ============================================================================
//
// Engancha puerto.ts (abrir, detectar, escuchar, recordar) al estado de React:
//   · `soportado`: si el navegador tiene Web Serial (Chrome o Edge de computadora). En el
//     servidor y en el primer render es `false`, así no hay diferencia de hidratación.
//   · `conectar()`: abre la ventanita del navegador para elegir el puerto (tiene que salir de un
//     toque), busca cómo habla la balanza y queda escuchando. Con `recordarAlConectar` (lo de
//     siempre) guarda el puerto y la configuración EN ESTA PC; el asistente de configuración lo
//     apaga y guarda con `guardar()` cuando la persona confirma.
//   · Al volver (recargar la página, o enchufar de nuevo el cable), si hay una balanza recordada
//     y el navegador ya tiene el permiso de ese puerto, se reconecta sola, sin preguntar.
//   · `tomarPeso()`: el peso si se puede tomar (quieto, ni cero ni negativo), si no `null`.
//
// UNA balanza por pantalla: dos componentes con este hook abrirían dos veces el mismo puerto (el
// segundo queda «ocupado»). Si una pantalla necesita el peso en dos lugares, que comparta el valor.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { crudoHex, crudoLegible, type LecturaSerie } from "./protocolos";
import { estableParaTomar, type ConfiguracionSerie, type EstadoParaTomar, type MotivoSinPeso } from "./detector";
import {
  aErrorDeBalanza,
  detectarEnPuerto,
  escucharPuerto,
  guardarBalanzaRecordada,
  leerBalanzaRecordada,
  olvidarBalanzaRecordada,
  puertoRecordado,
  serieDelNavegador,
  TIEMPOS_DE_BALANZA,
  type BalanzaRecordada,
  type DiagnosticoSerie,
  type ErrorDeBalanza,
  type Escucha,
  type PuertoSerie,
  type TiemposDeBalanza,
} from "./puerto";

export type EstadoBalanzaSerie = "sin-soporte" | "desconectada" | "buscando" | "conectada" | "error";

export type OpcionesBalanzaSerie = {
  /** El negocio (slug o id): la balanza se recuerda por negocio en esta PC. */
  negocio: string;
  /** Guardar el puerto en esta PC apenas se conecta. Por defecto, sí. */
  recordarAlConectar?: boolean;
  /** Tiempos de la búsqueda y del sondeo (los tests los acortan). */
  tiempos?: Partial<TiemposDeBalanza>;
};

export type BalanzaSerie = {
  soportado: boolean;
  estado: EstadoBalanzaSerie;
  /** El último peso que mandó la balanza, en kilos (aunque se esté moviendo). */
  pesoActual: number | null;
  /** ¿Se puede tomar ya? (quieto, ni cero, ni negativo, ni pasado del máximo) */
  estable: boolean;
  /** Por qué todavía no se puede tomar (null si se puede). */
  motivo: MotivoSinPeso | null;
  /** Los últimos bytes que llegaron, legibles y en hexadecimal (para el diagnóstico). */
  crudo: { texto: string; hex: string };
  /** Qué se probó y qué se encontró en la última búsqueda. */
  diagnostico: DiagnosticoSerie | null;
  /** Cómo habla la balanza conectada. */
  configuracion: ConfiguracionSerie | null;
  /** ¿Hay una balanza recordada en esta PC para este negocio? */
  recordada: boolean;
  /** El mensaje para la persona si algo salió mal. */
  error: string | null;
  conectar: () => Promise<boolean>;
  desconectar: () => Promise<void>;
  /** Guarda en esta PC el puerto y la configuración de la balanza conectada. */
  guardar: () => boolean;
  /** Borra la balanza recordada en esta PC (no desconecta). */
  olvidar: () => void;
  tomarPeso: () => number | null;
};

/** Cuántas lecturas se guardan para decidir si el peso está quieto. */
const LECTURAS_GUARDADAS = 12;
/** Cuántos caracteres crudos se muestran. */
const LARGO_CRUDO = 64;

const sinSuscripcion = () => () => {};

function configuracionDeLaRecordada(r: BalanzaRecordada): ConfiguracionSerie {
  const c: ConfiguracionSerie = { velocidad: r.velocidad, bits: r.bits, modo: r.modo, protocolo: r.protocolo };
  if (r.comando) c.comando = r.comando;
  return c;
}

export function useBalanzaSerie({ negocio, recordarAlConectar = true, tiempos }: OpcionesBalanzaSerie): BalanzaSerie {
  const soportado = useSyncExternalStore(
    sinSuscripcion,
    () => serieDelNavegador() !== null,
    () => false,
  );
  const [estado, setEstado] = useState<Exclude<EstadoBalanzaSerie, "sin-soporte">>("desconectada");
  const [ultima, setUltima] = useState<LecturaSerie | null>(null);
  const [paraTomar, setParaTomar] = useState<EstadoParaTomar>({ ok: false, motivo: "sin-lecturas" });
  const [crudo, setCrudo] = useState("");
  const [diagnostico, setDiagnostico] = useState<DiagnosticoSerie | null>(null);
  const [configuracion, setConfiguracion] = useState<ConfiguracionSerie | null>(null);
  const [recordada, setRecordada] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lecturas = useRef<LecturaSerie[]>([]);
  const puerto = useRef<PuertoSerie | null>(null);
  const escucha = useRef<Escucha | null>(null);
  const ocupado = useRef(false);
  /** Cuándo llegó la última lectura y cuánto puede pasar sin otra (ver el efecto de «vencidas»). */
  const ultimaVez = useRef(0);
  const vencimiento = useRef(1500);
  const tiemposRef = useRef<TiemposDeBalanza>({ ...TIEMPOS_DE_BALANZA, ...tiempos });
  useEffect(() => {
    tiemposRef.current = { ...TIEMPOS_DE_BALANZA, ...tiempos };
  });

  const caer = useCallback((e: ErrorDeBalanza) => {
    escucha.current = null;
    lecturas.current = [];
    setUltima(null);
    setParaTomar({ ok: false, motivo: "sin-lecturas" });
    setEstado(e.tipo === "desconectada" ? "desconectada" : "error");
    setError(e.message);
  }, []);

  /** Deja de escuchar el puerto actual (si hay uno). */
  const soltar = useCallback(async () => {
    const e = escucha.current;
    escucha.current = null;
    await e?.detener();
  }, []);

  const escucharCon = useCallback(
    async (p: PuertoSerie, c: ConfiguracionSerie) => {
      lecturas.current = [];
      setUltima(null);
      setParaTomar({ ok: false, motivo: "sin-lecturas" });
      vencimiento.current = c.modo === "a-pedido" ? Math.max(3 * tiemposRef.current.sondeoMs, 800) : 1500;
      escucha.current = await escucharPuerto(
        p,
        c,
        {
          alLeer: (l) => {
            const ls = lecturas.current;
            ls.push(l);
            if (ls.length > LECTURAS_GUARDADAS) ls.shift();
            ultimaVez.current = performance.now();
            setUltima(l);
            setParaTomar(estableParaTomar(ls));
          },
          alRecibir: (t) => setCrudo((antes) => (antes + t).slice(-LARGO_CRUDO)),
          alCaer: caer,
        },
        tiemposRef.current,
      );
      puerto.current = p;
      setConfiguracion(c);
      setEstado("conectada");
      setError(null);
    },
    [caer],
  );

  const conectar = useCallback(async (): Promise<boolean> => {
    const serie = serieDelNavegador();
    if (!serie || ocupado.current) return false;
    ocupado.current = true;
    try {
      let elegido: PuertoSerie;
      try {
        elegido = await serie.requestPort();
      } catch (e) {
        throw aErrorDeBalanza(e, "elegir");
      }
      await soltar();
      setEstado("buscando");
      setError(null);
      setCrudo("");
      setDiagnostico(null);
      const { eleccion, diagnostico: d } = await detectarEnPuerto(elegido, tiemposRef.current, setDiagnostico);
      setDiagnostico(d);
      await escucharCon(elegido, eleccion.configuracion);
      if (recordarAlConectar) {
        guardarBalanzaRecordada(negocio, elegido, eleccion.configuracion);
        setRecordada(true);
      }
      return true;
    } catch (e) {
      const err = aErrorDeBalanza(e, "abrir");
      const d = (e as { diagnostico?: DiagnosticoSerie }).diagnostico;
      if (d) setDiagnostico(d);
      // Si no eligió puerto y ya estaba conectada, sigue conectada: no se pierde lo que andaba.
      if (err.tipo === "sin-puerto" && escucha.current) setError(err.message);
      else {
        setEstado("error");
        setError(err.message);
      }
      return false;
    } finally {
      ocupado.current = false;
    }
  }, [escucharCon, negocio, recordarAlConectar, soltar]);

  const desconectar = useCallback(async () => {
    await soltar();
    lecturas.current = [];
    setUltima(null);
    setParaTomar({ ok: false, motivo: "sin-lecturas" });
    setEstado("desconectada");
    setError(null);
  }, [soltar]);

  const guardar = useCallback((): boolean => {
    if (!puerto.current || !configuracion) return false;
    guardarBalanzaRecordada(negocio, puerto.current, configuracion);
    setRecordada(true);
    return true;
  }, [configuracion, negocio]);

  const olvidar = useCallback(() => {
    olvidarBalanzaRecordada(negocio);
    setRecordada(false);
  }, [negocio]);

  const tomarPeso = useCallback((): number | null => {
    const e = estableParaTomar(lecturas.current);
    return e.ok ? e.peso : null;
  }, []);

  // Lecturas VENCIDAS: si la balanza deja de mandar (Systel moviéndose contesta un byte de error
  // en vez del peso; la Prix en Prt2 no transmite con cero; un cable flojo), la última lectura
  // quieta no puede quedar «lista para tomar»: se olvida y se espera que vuelva a llegar.
  useEffect(() => {
    if (estado !== "conectada") return;
    const reloj = setInterval(() => {
      if (lecturas.current.length === 0) return;
      if (performance.now() - ultimaVez.current <= vencimiento.current) return;
      lecturas.current = [];
      setParaTomar({ ok: false, motivo: "inestable" });
    }, 250);
    return () => clearInterval(reloj);
  }, [estado]);

  // Al volver: la balanza recordada se reconecta sola (y de nuevo cuando se vuelve a enchufar).
  useEffect(() => {
    const serie = serieDelNavegador();
    if (!serie) return;
    let vigente = true;
    const reconectar = async () => {
      const r = leerBalanzaRecordada(negocio);
      setRecordada(r !== null);
      if (!r || escucha.current || ocupado.current) return;
      ocupado.current = true;
      try {
        const p = puertoRecordado(await serie.getPorts(), r);
        if (!p || !vigente) return;
        await escucharCon(p, configuracionDeLaRecordada(r));
        if (!vigente) await soltar();
      } catch (e) {
        if (vigente) {
          setEstado("error");
          setError(aErrorDeBalanza(e, "abrir").message);
        }
      } finally {
        ocupado.current = false;
      }
    };
    void reconectar();
    const alEnchufar = () => void reconectar();
    serie.addEventListener("connect", alEnchufar);
    return () => {
      vigente = false;
      serie.removeEventListener("connect", alEnchufar);
      void soltar();
    };
  }, [negocio, escucharCon, soltar]);

  return {
    soportado,
    estado: soportado ? estado : "sin-soporte",
    pesoActual: ultima && !ultima.sobrecarga ? ultima.peso : null,
    estable: paraTomar.ok,
    motivo: paraTomar.ok ? null : paraTomar.motivo,
    crudo: { texto: crudoLegible(crudo), hex: crudoHex(crudo) },
    diagnostico,
    configuracion,
    recordada,
    error,
    conectar,
    desconectar,
    guardar,
    olvidar,
    tomarPeso,
  };
}
