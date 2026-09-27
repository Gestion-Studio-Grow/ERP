"use client";

// La lista de promos y el formulario para armarlas. Lo que se valida acá es lo MISMO que valida
// el servidor (`problemaDeLaPromocion`), así el botón no deja guardar lo que va a rebotar.

import { buscarPorNombre } from "@/lib/supermercado/lectura";
import { useMemo, useState } from "react";
import { Badge, Button, cn, fmtMoneyARS } from "@/components/ui";
import { guardarPromocion } from "@/lib/supermercado/ofertas-actions";
import {
  PRIORIDAD_SUGERIDA,
  TIPOS_PROMOCION,
  condicionesDePromocion,
  problemaDeLaPromocion,
  rotuloDePromocion,
  vigenteEn,
  type Promocion,
  type TipoPromocion,
} from "@/lib/supermercado/promociones";
import { MEDIOS_DE_COBRO, type MedioDeCobro } from "@/lib/caja/medio-cobro";
import { leerImporte } from "@/lib/pos-peso";

type PromoEnLista = Promocion & { version: string; actualizada: string };
type ProductoLite = { id: string; name: string; seccion: string; codigo: string | null };

const DIAS = [
  { d: 1, n: "Lun" },
  { d: 2, n: "Mar" },
  { d: 3, n: "Mié" },
  { d: 4, n: "Jue" },
  { d: 5, n: "Vie" },
  { d: 6, n: "Sáb" },
  { d: 0, n: "Dom" },
];

type Borrador = {
  version: string | null;
  id: string;
  nombre: string;
  tipo: TipoPromocion;
  productos: string[];
  secciones: string[];
  lleva: string;
  paga: string;
  porcentaje: string;
  medios: MedioDeCobro[];
  combo: { productId: string; cantidad: string }[];
  precioCombo: string;
  dias: number[];
  desde: string;
  hasta: string;
  prioridad: string;
  acumulable: boolean;
  activa: boolean;
};

function vacio(): Borrador {
  return {
    version: null,
    id: "nueva-0000",
    nombre: "",
    tipo: "nxm",
    productos: [],
    secciones: [],
    lleva: "2",
    paga: "1",
    porcentaje: "",
    medios: [],
    combo: [
      { productId: "", cantidad: "1" },
      { productId: "", cantidad: "1" },
    ],
    precioCombo: "",
    dias: [],
    desde: "",
    hasta: "",
    prioridad: String(PRIORIDAD_SUGERIDA.nxm),
    acumulable: false,
    activa: true,
  };
}

function desdePromo(p: PromoEnLista): Borrador {
  return {
    version: p.version,
    id: p.id,
    nombre: p.nombre,
    tipo: p.tipo,
    productos: p.productos,
    secciones: p.secciones,
    lleva: String(p.lleva ?? 2),
    paga: String(p.paga ?? 1),
    porcentaje: p.porcentaje != null ? String(p.porcentaje).replace(".", ",") : "",
    medios: p.medios ?? [],
    combo: p.combo?.componentes.map((c) => ({ productId: c.productId, cantidad: String(c.cantidad) })) ?? vacio().combo,
    precioCombo: p.combo ? String(p.combo.precio).replace(".", ",") : "",
    dias: p.dias,
    desde: p.desde ?? "",
    hasta: p.hasta ?? "",
    prioridad: String(p.prioridad),
    acumulable: p.acumulable,
    activa: p.activa,
  };
}

function aPromocion(b: Borrador): Promocion {
  const num = (s: string) => {
    const l = leerImporte(s);
    return l.estado === "ok" ? l.valor : NaN;
  };
  const base: Promocion = {
    id: b.id,
    nombre: b.nombre.trim(),
    tipo: b.tipo,
    productos: b.tipo === "combo" || b.tipo === "medio-de-pago" ? [] : b.productos,
    secciones: b.tipo === "combo" || b.tipo === "medio-de-pago" ? [] : b.secciones,
    dias: b.dias,
    desde: b.desde || null,
    hasta: b.hasta || null,
    prioridad: Number.parseInt(b.prioridad, 10),
    acumulable: b.acumulable,
    activa: b.activa,
  };
  if (b.tipo === "nxm") return { ...base, lleva: Number.parseInt(b.lleva, 10), paga: Number.parseInt(b.paga, 10) };
  if (b.tipo === "segunda-unidad" || b.tipo === "porcentaje") return { ...base, porcentaje: num(b.porcentaje) };
  if (b.tipo === "medio-de-pago") return { ...base, porcentaje: num(b.porcentaje), medios: b.medios };
  return {
    ...base,
    combo: {
      componentes: b.combo.filter((c) => c.productId).map((c) => ({ productId: c.productId, cantidad: Number.parseInt(c.cantidad, 10) })),
      precio: num(b.precioCombo),
    },
  };
}

export default function Ofertas({
  inicial,
  productos,
  secciones,
  hoy,
  diaSemana,
}: {
  inicial: PromoEnLista[];
  productos: ProductoLite[];
  secciones: { id: string; nombre: string }[];
  hoy: string;
  diaSemana: number;
}) {
  const [promos, setPromos] = useState(inicial);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const nombreDe = useMemo(() => new Map(productos.map((p) => [p.id, p.name])), [productos]);

  const promo = borrador ? aPromocion(borrador) : null;
  const problema = promo ? problemaDeLaPromocion(promo) : null;

  async function enviar(accion: "crear" | "editar" | "pausar" | "activar" | "borrar", p: Promocion, version: string | null) {
    setEnviando(true);
    setMensaje(null);
    const r = await guardarPromocion({ accion, version, promocion: p });
    setEnviando(false);
    if (!r.ok) return setMensaje({ ok: false, texto: r.error });
    setPromos(r.promociones.map((x) => ({ ...x, actualizada: new Date(x.actualizada).toISOString() })));
    setMensaje({ ok: true, texto: r.mensaje });
    if (accion === "crear" || accion === "editar") setBorrador(null);
  }

  const encontrados =
    busqueda.trim().length >= 2
      ? // Por código exacto o por las palabras del nombre, sin importar acentos ni el orden (la misma búsqueda de la caja).
        (() => {
          const q = busqueda.trim();
          const porCodigo = productos.filter((p) => p.codigo === q);
          return porCodigo.length > 0 ? porCodigo : buscarPorNombre(productos, q);
        })()
      : [];

  return (
    <div className="space-y-6">
      {mensaje && (
        <p role={mensaje.ok ? "status" : "alert"} className={mensaje.ok ? "text-sm text-success" : "text-sm font-medium text-danger"}>
          {mensaje.texto}
        </p>
      )}

      {!borrador && (
        <Button type="button" onClick={() => setBorrador(vacio())} data-ofertas="nueva">
          Nueva promo
        </Button>
      )}

      {borrador && promo && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!problema) void enviar(borrador.version ? "editar" : "crear", promo, borrador.version);
          }}
          className="space-y-4 rounded-md border border-line bg-surface-raised p-4"
          aria-label="Promo"
        >
          <h2 className="text-base font-semibold text-strong">{borrador.version ? "Editar la promo" : "Nueva promo"}</h2>
          <label className="block text-sm">
            <span className="font-medium text-strong">Nombre (lo lee el cliente en el ticket)</span>
            <input
              value={borrador.nombre}
              onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
              placeholder="2×1 en Coca-Cola 2,25 L"
              className="mt-1 h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-strong"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-strong">Tipo</span>
            <select
              value={borrador.tipo}
              onChange={(e) => {
                const tipo = e.target.value as TipoPromocion;
                setBorrador({ ...borrador, tipo, prioridad: String(PRIORIDAD_SUGERIDA[tipo]), acumulable: tipo === "medio-de-pago" });
              }}
              className="mt-1 h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-strong"
            >
              {TIPOS_PROMOCION.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre} — {t.ejemplo}
                </option>
              ))}
            </select>
          </label>

          {borrador.tipo === "nxm" && (
            <div className="flex gap-3">
              <label className="text-sm">
                <span className="text-strong">Lleva</span>
                <input inputMode="numeric" value={borrador.lleva} onChange={(e) => setBorrador({ ...borrador, lleva: e.target.value })} className="mt-1 block h-11 w-20 rounded-md border border-line-strong px-3" />
              </label>
              <label className="text-sm">
                <span className="text-strong">Paga</span>
                <input inputMode="numeric" value={borrador.paga} onChange={(e) => setBorrador({ ...borrador, paga: e.target.value })} className="mt-1 block h-11 w-20 rounded-md border border-line-strong px-3" />
              </label>
            </div>
          )}
          {(borrador.tipo === "segunda-unidad" || borrador.tipo === "porcentaje" || borrador.tipo === "medio-de-pago") && (
            <label className="block text-sm">
              <span className="text-strong">{borrador.tipo === "segunda-unidad" ? "Descuento en la segunda unidad (%)" : "Descuento (%)"}</span>
              <input inputMode="decimal" value={borrador.porcentaje} onChange={(e) => setBorrador({ ...borrador, porcentaje: e.target.value })} className="mt-1 block h-11 w-28 rounded-md border border-line-strong px-3" />
            </label>
          )}
          {borrador.tipo === "medio-de-pago" && (
            <fieldset className="text-sm">
              <legend className="text-strong">Pagando todo con</legend>
              <div className="mt-1 flex flex-wrap gap-3">
                {MEDIOS_DE_COBRO.map((m) => (
                  <label key={m.valor} className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={borrador.medios.includes(m.valor)}
                      onChange={(e) => setBorrador({ ...borrador, medios: e.target.checked ? [...borrador.medios, m.valor] : borrador.medios.filter((x) => x !== m.valor) })}
                    />
                    {m.etiqueta}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {borrador.tipo !== "combo" && borrador.tipo !== "medio-de-pago" && (
            <fieldset className="space-y-2 text-sm">
              <legend className="font-medium text-strong">En qué productos o secciones</legend>
              <div className="flex flex-wrap gap-2">
                {secciones.map((s) => (
                  <label key={s.id} className={cn("flex min-h-11 items-center gap-2 rounded-md border px-3", borrador.secciones.includes(s.id) ? "border-accent bg-accent-soft" : "border-line")}>
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={borrador.secciones.includes(s.id)}
                      onChange={(e) => setBorrador({ ...borrador, secciones: e.target.checked ? [...borrador.secciones, s.id] : borrador.secciones.filter((x) => x !== s.id) })}
                    />
                    {s.nombre}
                  </label>
                ))}
              </div>
              <label className="block">
                <span className="text-muted">Sumar un producto (nombre o código)</span>
                <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="mt-1 h-11 w-full rounded-md border border-line-strong px-3" />
              </label>
              {encontrados.length > 0 && (
                <ul className="divide-y divide-line rounded-md border border-line">
                  {encontrados.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="min-h-11 w-full px-3 text-left hover:bg-accent-soft"
                        onClick={() => {
                          if (!borrador.productos.includes(p.id)) setBorrador({ ...borrador, productos: [...borrador.productos, p.id] });
                          setBusqueda("");
                        }}
                      >
                        {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {borrador.productos.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {borrador.productos.map((id) => (
                    <li key={id} className="flex items-center gap-1 rounded-md bg-surface-sunken px-2 text-sm">
                      {nombreDe.get(id) ?? "Producto"}
                      <button type="button" className="min-h-11 px-2" aria-label={`Sacar ${nombreDe.get(id) ?? "producto"}`} onClick={() => setBorrador({ ...borrador, productos: borrador.productos.filter((x) => x !== id) })}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
          )}

          {borrador.tipo === "combo" && (
            <fieldset className="space-y-2 text-sm">
              <legend className="font-medium text-strong">Qué lleva el combo</legend>
              {borrador.combo.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    value={c.productId}
                    onChange={(e) => setBorrador({ ...borrador, combo: borrador.combo.map((x, k) => (k === i ? { ...x, productId: e.target.value } : x)) })}
                    className="h-11 min-w-0 flex-1 rounded-md border border-line-strong px-2"
                    aria-label={`Producto ${i + 1} del combo`}
                  >
                    <option value="">Elegí un producto</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    inputMode="numeric"
                    aria-label={`Cantidad del producto ${i + 1}`}
                    value={c.cantidad}
                    onChange={(e) => setBorrador({ ...borrador, combo: borrador.combo.map((x, k) => (k === i ? { ...x, cantidad: e.target.value } : x)) })}
                    className="h-11 w-16 rounded-md border border-line-strong px-2"
                  />
                </div>
              ))}
              <button type="button" className="min-h-11 underline" onClick={() => setBorrador({ ...borrador, combo: [...borrador.combo, { productId: "", cantidad: "1" }] })}>
                + Otro producto
              </button>
              <label className="block">
                <span className="text-strong">Precio del combo ($)</span>
                <input inputMode="decimal" value={borrador.precioCombo} onChange={(e) => setBorrador({ ...borrador, precioCombo: e.target.value })} className="mt-1 block h-11 w-40 rounded-md border border-line-strong px-3" />
              </label>
            </fieldset>
          )}

          <fieldset className="text-sm">
            <legend className="font-medium text-strong">Qué días (ninguno = todos)</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {DIAS.map(({ d, n }) => (
                <label key={d} className={cn("flex min-h-11 items-center gap-2 rounded-md border px-3", borrador.dias.includes(d) ? "border-accent bg-accent-soft" : "border-line")}>
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={borrador.dias.includes(d)}
                    onChange={(e) => setBorrador({ ...borrador, dias: e.target.checked ? [...borrador.dias, d] : borrador.dias.filter((x) => x !== d) })}
                  />
                  {n}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-3 text-sm">
            <label>
              <span className="text-strong">Desde</span>
              <input type="date" value={borrador.desde} onChange={(e) => setBorrador({ ...borrador, desde: e.target.value })} className="mt-1 block h-11 rounded-md border border-line-strong px-2" />
            </label>
            <label>
              <span className="text-strong">Hasta</span>
              <input type="date" value={borrador.hasta} onChange={(e) => setBorrador({ ...borrador, hasta: e.target.value })} className="mt-1 block h-11 rounded-md border border-line-strong px-2" />
            </label>
            <label>
              <span className="text-strong">Prioridad (menor, primero)</span>
              <input inputMode="numeric" value={borrador.prioridad} onChange={(e) => setBorrador({ ...borrador, prioridad: e.target.value })} className="mt-1 block h-11 w-24 rounded-md border border-line-strong px-2" />
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={borrador.acumulable} onChange={(e) => setBorrador({ ...borrador, acumulable: e.target.checked })} />
            Se suma a otras promos en el mismo producto
          </label>

          <div className="rounded-md bg-surface-sunken p-3 text-sm">
            {problema ? (
              <p className="text-danger">{problema}</p>
            ) : (
              <p className="text-body">
                <strong>{rotuloDePromocion(promo)}</strong> · {condicionesDePromocion(promo)}
                {promo.tipo === "combo" && promo.combo ? ` A ${fmtMoneyARS(promo.combo.precio)}.` : ""}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={enviando || problema !== null}>
              {enviando ? "Guardando…" : "Guardar la promo"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setBorrador(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {promos.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong p-6 text-sm text-muted">
          Todavía no hay promos. Tocá «Nueva promo»: por ejemplo, un 2×1 en una gaseosa o un 20 % en verdulería los martes.
        </div>
      ) : (
        <ul aria-label="Promos" className="divide-y divide-line rounded-md border border-line bg-surface-raised">
          {promos.map((p) => {
            const hoyVale = vigenteEn(p, { fecha: hoy, diaSemana });
            const vencida = p.hasta != null && p.hasta < hoy;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-strong">
                    {p.nombre}{" "}
                    <Badge tone={!p.activa ? "neutral" : vencida ? "warning" : hoyVale ? "success" : "info"}>
                      {!p.activa ? "Pausada" : vencida ? "Vencida" : hoyVale ? "Vale hoy" : "No vale hoy"}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted">
                    {rotuloDePromocion(p)} · {condicionesDePromocion(p)} · prioridad {p.prioridad}
                    {p.acumulable ? " · se suma a otras" : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="outline" disabled={enviando} onClick={() => setBorrador(desdePromo(p))}>
                    Editar
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={enviando} onClick={() => void enviar(p.activa ? "pausar" : "activar", p, p.version)}>
                    {p.activa ? "Pausar" : "Activar"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={enviando} onClick={() => void enviar("borrar", p, p.version)}>
                    Borrar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
