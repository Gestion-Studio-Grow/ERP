"use client";

// La pantalla de Envíos (magra-DISENO.md §2.3). Lo que se escribe se valida con la MISMA regla que
// el servidor (`validarConfigEnvios`, envios/modelo.ts) antes de mandarlo; el servidor la vuelve a
// correr. La plata se escribe como se escribe acá («4.000», «60.000») y la lee `leerImporte`.
//
// «Pausar la tienda» se guarda solo (sin tocar lo demás que esté sin guardar): es lo que se
// necesita YA cuando no se puede atender. El resto se guarda con «Guardar».
// Colores por tokens (bg-surface-raised, text-strong, accent…): la marca del negocio (en Magra,
// oscuro y oro) la pone el tema, no este componente.

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Input, Seccion } from "@/components/ui";
import { guardarConfigEnvios, pausarTienda } from "@/lib/envios/acciones";
import { MAX_LARGO_MENSAJE_PAUSA, MAX_ZONAS, MENSAJE_PAUSA_POR_DEFECTO, validarConfigEnvios, type ConfigEnvios } from "@/lib/envios/modelo";

type ZonaEnPantalla = { id: string; nombre: string; costo: string; gratisDesde: string; franjas: string };

const texto = (n: number | null) => (n === null ? "" : n.toLocaleString("es-AR", { maximumFractionDigits: 2 }));
const unir = (franjas: string[]) => franjas.join("; ");

let contador = 0;
const idNuevo = () => `z${Date.now().toString(36)}${(contador++).toString(36)}`;

type Aviso = { ok: boolean; texto: string } | null;

export default function EnviosForm({ inicial, version: versionInicial }: { inicial: ConfigEnvios; version: string | null }) {
  const [version, setVersion] = useState(versionInicial);
  const [retiro, setRetiro] = useState(inicial.retiroEnLocal);
  const [horario, setHorario] = useState(inicial.horarioRetiro ?? "");
  const [minimo, setMinimo] = useState(texto(inicial.pedidoMinimoEnvio));
  const [zonas, setZonas] = useState<ZonaEnPantalla[]>(() =>
    inicial.zonas.map((z) => ({ id: z.id, nombre: z.nombre, costo: texto(z.costo), gratisDesde: texto(z.gratisDesde), franjas: unir(z.franjas) })),
  );
  const [franjasRetiro, setFranjasRetiro] = useState(unir(inicial.franjasRetiro));
  const [pausada, setPausada] = useState(inicial.tiendaPausada);
  const [armandoPausa, setArmandoPausa] = useState(false);
  const [mensajePausa, setMensajePausa] = useState("");
  const [aviso, setAviso] = useState<Aviso>(null);
  const [avisoPausa, setAvisoPausa] = useState<Aviso>(null);
  const [guardando, empezarGuardado] = useTransition();
  const [pausando, empezarPausa] = useTransition();
  // La zona recién sumada recibe el foco en su nombre (teclado y lector de pantalla).
  // `Input` no reenvía ref: se busca por id cuando la fila ya está en pantalla.
  const focoPendiente = useRef<string | null>(null);
  useEffect(() => {
    const id = focoPendiente.current;
    if (!id) return;
    focoPendiente.current = null;
    document.getElementById(`envios-zona-${id}-nombre`)?.focus();
  }, [zonas]);

  const cambiarZona = (id: string, campo: keyof ZonaEnPantalla, valor: string) =>
    setZonas((zs) => zs.map((z) => (z.id === id ? { ...z, [campo]: valor } : z)));

  const agregarZona = () => {
    const id = idNuevo();
    setZonas((zs) => [...zs, { id, nombre: "", costo: "", gratisDesde: "", franjas: "" }]);
    focoPendiente.current = id;
  };

  const quitarZona = (id: string) => setZonas((zs) => zs.filter((z) => z.id !== id));

  const armarConfig = () => ({
    retiroEnLocal: retiro,
    horarioRetiro: horario,
    pedidoMinimoEnvio: minimo,
    zonas,
    franjasRetiro,
    tiendaPausada: pausada,
  });

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    const config = armarConfig();
    const previa = validarConfigEnvios(config);
    if (!previa.ok) {
      setAviso({ ok: false, texto: previa.error });
      return;
    }
    setAviso(null);
    empezarGuardado(async () => {
      const r = await guardarConfigEnvios({ config, version });
      if (r.ok) setVersion(r.version);
      setAviso(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error });
    });
  };

  const cambiarPausa = (pausar: boolean) => {
    setAvisoPausa(null);
    empezarPausa(async () => {
      const r = await pausarTienda({ pausar, mensaje: mensajePausa, version });
      if (r.ok) {
        setVersion(r.version);
        setPausada(r.pausada ?? null);
        setArmandoPausa(false);
        setMensajePausa("");
      }
      setAvisoPausa(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error });
    });
  };

  return (
    <div className="space-y-8">
      {/* ── La tienda: tomando pedidos o pausada ───────────────────────────── */}
      <section aria-labelledby="envios-tienda" className="space-y-3 rounded-md border border-line bg-surface-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="envios-tienda" className="text-base font-semibold text-strong">
            Tienda:{" "}
            <span className={pausada ? "text-warning" : "text-success"}>
              <span aria-hidden="true">● </span>
              {pausada ? "Pausada" : "Tomando pedidos"}
            </span>
          </h2>
          {pausada ? (
            <Button type="button" variant="outline" onClick={() => cambiarPausa(false)} disabled={pausando}>
              {pausando ? "Abriendo…" : "Volver a tomar pedidos"}
            </Button>
          ) : (
            !armandoPausa && (
              <Button type="button" variant="outline" onClick={() => setArmandoPausa(true)}>
                Pausar…
              </Button>
            )
          )}
        </div>
        {pausada && (
          <p className="text-sm text-body">
            Las clientas ven: «{pausada.mensaje || MENSAJE_PAUSA_POR_DEFECTO}» y no pueden confirmar pedidos por la web. El mostrador sigue vendiendo.
          </p>
        )}
        {!pausada && armandoPausa && (
          <div id="envios-pausa" className="space-y-2">
            <label htmlFor="envios-mensaje-pausa" className="block text-sm font-medium text-strong">
              Qué ven las clientas mientras está pausada
            </label>
            <Input
              id="envios-mensaje-pausa"
              value={mensajePausa}
              maxLength={MAX_LARGO_MENSAJE_PAUSA}
              placeholder={MENSAJE_PAUSA_POR_DEFECTO}
              onChange={(e) => setMensajePausa(e.target.value)}
              autoFocus
              aria-describedby="envios-mensaje-pausa-ayuda"
            />
            <p id="envios-mensaje-pausa-ayuda" className="text-xs text-muted">
              Si lo dejás vacío, ven el texto de ejemplo. Nadie puede confirmar un pedido por la web hasta que la vuelvas a abrir.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => cambiarPausa(true)} disabled={pausando}>
                {pausando ? "Pausando…" : "Pausar la tienda"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setArmandoPausa(false)} disabled={pausando}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
        {avisoPausa && (
          <p role={avisoPausa.ok ? "status" : "alert"} className={avisoPausa.ok ? "text-sm text-success" : "text-sm font-medium text-danger"}>
            {avisoPausa.texto}
          </p>
        )}
      </section>

      <form onSubmit={guardar} className="space-y-8" noValidate>
        {/* ── Retiro y mínimo ─────────────────────────────────────────────────── */}
        <Seccion id="envios-retiro" titulo="Retiro y mínimo" nivel="h2">
          <div className="grid gap-4 pt-3 sm:grid-cols-2">
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-strong sm:col-span-2">
              <input type="checkbox" checked={retiro} onChange={(e) => setRetiro(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
              Se puede retirar en el local
            </label>
            <div>
              <label htmlFor="envios-horario" className="mb-1 block text-sm font-medium text-strong">
                Horario de retiro
              </label>
              <Input id="envios-horario" value={horario} onChange={(e) => setHorario(e.target.value)} placeholder="Lun a sáb 9–19" disabled={!retiro} />
            </div>
            <div>
              <label htmlFor="envios-minimo" className="mb-1 block text-sm font-medium text-strong">
                Pedido mínimo para envío
              </label>
              <Input
                id="envios-minimo"
                importe
                inputMode="decimal"
                value={minimo}
                onChange={(e) => setMinimo(e.target.value)}
                placeholder="Sin mínimo"
                aria-describedby="envios-minimo-ayuda"
              />
              <p id="envios-minimo-ayuda" className="mt-1 text-xs text-muted">
                Debajo de esto la tienda ofrece retirar en el local. Vacío: sin mínimo.
              </p>
            </div>
          </div>
        </Seccion>

        {/* ── Zonas ───────────────────────────────────────────────────────────── */}
        <Seccion id="envios-zonas" titulo="Zonas de envío" nivel="h2" nota={zonas.length ? `${zonas.length} de ${MAX_ZONAS}` : undefined}>
          {zonas.length === 0 ? (
            <p className="pt-3 text-sm text-muted">
              Todavía no hay zonas: la tienda cobra el envío como siempre. Sumá una zona con su costo y, si querés, desde qué monto es gratis.
            </p>
          ) : (
            <div className="pt-3">
              <div aria-hidden="true" className="hidden gap-3 pb-1 text-xs font-medium text-muted sm:grid sm:grid-cols-[2fr_1fr_1fr_2fr_auto]">
                <span>Zona</span>
                <span>Costo</span>
                <span>Gratis desde</span>
                <span>Días y franjas</span>
                <span className="w-11" />
              </div>
              <ul className="space-y-3">
                {zonas.map((z, i) => {
                  const n = i + 1;
                  const id = (campo: string) => `envios-zona-${z.id}-${campo}`;
                  return (
                    <li key={z.id} className="grid gap-3 border-b border-line pb-3 sm:grid-cols-[2fr_1fr_1fr_2fr_auto] sm:items-start sm:border-0 sm:pb-0">
                      <div>
                        <label htmlFor={id("nombre")} className="mb-1 block text-xs font-medium text-muted sm:sr-only">
                          Zona {n}
                        </label>
                        <Input
                          id={id("nombre")}
                          value={z.nombre}
                          onChange={(e) => cambiarZona(z.id, "nombre", e.target.value)}
                          placeholder="Canning centro"
                          aria-label={`Nombre de la zona ${n}`}
                        />
                      </div>
                      <div>
                        <label htmlFor={id("costo")} className="mb-1 block text-xs font-medium text-muted sm:sr-only">
                          Costo del envío
                        </label>
                        <Input
                          id={id("costo")}
                          importe
                          inputMode="decimal"
                          value={z.costo}
                          onChange={(e) => cambiarZona(z.id, "costo", e.target.value)}
                          placeholder="3.000"
                          aria-label={`Costo del envío a la zona ${n}`}
                        />
                      </div>
                      <div>
                        <label htmlFor={id("gratis")} className="mb-1 block text-xs font-medium text-muted sm:sr-only">
                          Gratis desde
                        </label>
                        <Input
                          id={id("gratis")}
                          importe
                          inputMode="decimal"
                          value={z.gratisDesde}
                          onChange={(e) => cambiarZona(z.id, "gratisDesde", e.target.value)}
                          placeholder="Nunca"
                          aria-label={`Gratis desde, zona ${n}`}
                        />
                      </div>
                      <div>
                        <label htmlFor={id("franjas")} className="mb-1 block text-xs font-medium text-muted sm:sr-only">
                          Días y franjas
                        </label>
                        <Input
                          id={id("franjas")}
                          value={z.franjas}
                          onChange={(e) => cambiarZona(z.id, "franjas", e.target.value)}
                          placeholder="L-S 11-13; L-S 17-19"
                          aria-label={`Días y franjas de la zona ${n}`}
                        />
                      </div>
                      <Button type="button" variant="ghost" size="md" onClick={() => quitarZona(z.id)} aria-label={`Quitar la zona ${z.nombre || n}`} className="justify-self-start px-3">
                        Quitar
                      </Button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs text-muted">Separá las franjas con punto y coma. «Gratis desde» vacío: el envío a esa zona siempre se cobra.</p>
            </div>
          )}
          <div className="pt-3">
            <Button type="button" variant="outline" onClick={agregarZona} disabled={zonas.length >= MAX_ZONAS}>
              + Zona
            </Button>
          </div>
        </Seccion>

        {/* ── Franjas para retiro ─────────────────────────────────────────────── */}
        <Seccion id="envios-franjas" titulo="Franjas para retiro" nivel="h2">
          <div className="pt-3">
            <label htmlFor="envios-franjas-retiro" className="mb-1 block text-sm font-medium text-strong">
              Cuándo pueden pasar a buscar
            </label>
            <Input
              id="envios-franjas-retiro"
              value={franjasRetiro}
              onChange={(e) => setFranjasRetiro(e.target.value)}
              placeholder="Hoy mañana 10-13; Hoy tarde 17-20"
              disabled={!retiro}
              aria-describedby="envios-franjas-ayuda"
            />
            <p id="envios-franjas-ayuda" className="mt-1 text-xs text-muted">
              Separadas con punto y coma. La clienta elige una al pedir.
            </p>
          </div>
        </Seccion>

        <div className="space-y-3 border-t border-line pt-4">
          {aviso && (
            <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "text-sm text-success" : "text-sm font-medium text-danger"}>
              {aviso.texto}
            </p>
          )}
          <Button type="submit" disabled={guardando} className="w-full sm:w-auto">
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
          <p className="text-xs text-muted">La tienda y el mostrador lo usan al instante.</p>
        </div>
      </form>
    </div>
  );
}
