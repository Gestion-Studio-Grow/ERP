"use client";

// «Usar mi ubicación»: opcional, con el consentimiento dicho en una línea y el link a privacidad.
// El navegador da latitud, longitud y precisión; `leerUbicacion` (motor puro) decide si sirve y
// viajan en los campos ocultos `ubicacionLat`, `ubicacionLng`, `ubicacionPrecision`. La dirección
// escrita SIEMPRE manda: si la persona no da permiso, sigue con la dirección y listo.

import Link from "next/link";
import { useState } from "react";
import { chequearRadio, leerUbicacion, PRECISION_UTIL_M, type Ubicacion } from "@/lib/delivery-local/ubicacion";
import s from "./local.module.css";

type Estado =
  | { fase: "inicial" }
  | { fase: "pidiendo" }
  | { fase: "lista"; ubicacion: Ubicacion }
  | { fase: "denegada"; texto: string };

const km = (n: number) => String(n).replace(".", ",");

export default function UbicacionDelCliente({
  local,
  radioKm,
}: {
  local: { lat: number; lng: number } | null;
  radioKm: number | null;
}) {
  const [estado, setEstado] = useState<Estado>({ fase: "inicial" });

  function pedir() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setEstado({ fase: "denegada", texto: "Este navegador no comparte la ubicación. Seguí con la dirección escrita." });
      return;
    }
    setEstado({ fase: "pidiendo" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const l = leerUbicacion(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        if (l.estado === "ok") setEstado({ fase: "lista", ubicacion: l.ubicacion });
        else setEstado({ fase: "denegada", texto: l.estado === "invalida" ? l.motivo : "No llegó la ubicación. Seguí con la dirección escrita." });
      },
      (err) => {
        const texto =
          err.code === err.PERMISSION_DENIED
            ? "No diste permiso para la ubicación. No pasa nada: seguí con la dirección."
            : "No pudimos tomar tu ubicación. Seguí con la dirección escrita.";
        setEstado({ fase: "denegada", texto });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  const u = estado.fase === "lista" ? estado.ubicacion : null;
  const distancia = u ? chequearRadio(local, u, radioKm) : null;

  return (
    <div className={s.caja}>
      {u && (
        <>
          <input type="hidden" name="ubicacionLat" value={u.lat} />
          <input type="hidden" name="ubicacionLng" value={u.lng} />
          <input type="hidden" name="ubicacionPrecision" value={u.precisionM ?? ""} />
        </>
      )}
      <div className={s.opciones}>
        <button type="button" className={s.boton} onClick={pedir} disabled={estado.fase === "pidiendo"} aria-busy={estado.fase === "pidiendo" || undefined}>
          {estado.fase === "pidiendo" ? "Buscando tu ubicación…" : u ? "Volver a tomar la ubicación" : "Usar mi ubicación"}
        </button>
        {u && (
          <button type="button" className={s.boton} onClick={() => setEstado({ fase: "inicial" })}>
            Quitarla
          </button>
        )}
      </div>
      <p className={s.ayuda}>
        Opcional. Sólo sirve para que el repartidor encuentre tu puerta; la dirección escrita es la que vale.{" "}
        <Link href="/tienda/privacidad" className={s.enlace}>
          Privacidad
        </Link>
      </p>
      <p aria-live="polite" className={s.ayuda}>
        {u && (
          <>
            ✓ Ubicación lista
            {u.precisionM !== null && u.precisionM > PRECISION_UTIL_M ? ` (aproximada, a unos ${u.precisionM} m: revisá que la dirección esté completa)` : ""}.
            {distancia?.estado === "dentro" && ` Estás a ${km(distancia.km)} km del local.`}
            {distancia?.estado === "fuera" &&
              ` Estás a ${km(distancia.km)} km y el local reparte hasta ${km(distancia.radioKm)} km: mandá igual el pedido y te confirman si llegan.`}
          </>
        )}
        {estado.fase === "denegada" && estado.texto}
      </p>
    </div>
  );
}
