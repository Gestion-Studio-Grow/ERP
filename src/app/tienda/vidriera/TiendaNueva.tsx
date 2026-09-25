// ============================================================================
// LA TIENDA NUEVA (servidor) — arma lo de cada marca y lo que no se toca: portada, historia y pie.
// ============================================================================
//
// Se sirve SÓLO con el interruptor «Diseño nuevo» del negocio prendido (tienda/page.tsx). Lee lo
// mismo que la vidriera de hoy (`getStorefront`, sin una consulta más) y decide, por marca:
//   · a qué sección va cada producto, su marca y modelo (pádel) y su foto (MAGRA) — viajan resueltos;
//   · la portada, lo editorial y el pie, dibujados acá: su código no viaja al navegador;
//   · qué dice el envío y el pago, con lo que es cierto de cada negocio.
//
// Los textos de marketing son los de cada marca, tal cual (magra-content.ts es textual y autorizado
// por el dueño; storefront.ts). Lo que agrega esta pantalla son rótulos de trabajo ("La carta de
// hoy", "Tus datos") y lo que se deduce de los datos (precios, cuántas palas hay, desde cuánto).
// Promesas que el sistema no cumple (A Dos Manos: "28 % off por transferencia", "cuotas sin
// interés", "envío gratis desde $300.000") NO se publican: el checkout no las aplica.

import Image from "next/image";
import Link from "next/link";
import s from "./vidriera.module.css";
import Vidriera, { type DatosVidriera, type SeccionVista } from "./Vidriera";
import { ConsejoDePala } from "./ConsejoDePala";
import { IconoWhatsApp } from "./Iconos";
import { CONFIG, marcaDeLaVidriera, seccionDe, type MarcaId } from "./marcas";
import { leerFiltros, marcaYModelo, plata, precioDe, type ProductoVidriera } from "./catalogo-core";
import { buildWhatsAppHref, sanitizePhone } from "@/lib/whatsapp-cta";
import { textoDeMediosDePago } from "../reglas-tienda";
import type { StorefrontCopy } from "@/tenants/storefront";
import type { TenantImagery } from "@/lib/tenant-layout";
import type { RetailWording } from "@/blueprints/retail/rubros";
import {
  MAGRA,
  MAGRA_HERO_IMG,
  cutImage,
  esElLocalDelCopy,
  promesaDeReparto,
  resolveMagraLocal,
  textoAbout,
  type MagraLocal,
} from "@/tenants/magra-content";

type Branding = {
  shortLabel: string | null;
  city: string | null;
  addressLine: string | null;
  hoursLabel: string | null;
  whatsapp: string | null;
  instagram: string | null;
  email: string | null;
  contactNote: string | null;
} | null;

export type EntradaTienda = {
  nombre: string;
  branding: Branding;
  wording: RetailWording;
  copy: StorefrontCopy | null;
  productos: ProductoVidriera[];
  tenantKey: string;
  front: string | null;
  brandId: string | null;
  imagery: TenantImagery | null;
  acento: string;
  searchParams: Record<string, string | string[] | undefined>;
};

const ANIO = 2026;

/** "Efectivo, transferencia y Mercado Pago." → "efectivo, transferencia y Mercado Pago." */
function mediosEnFrase(medios: readonly string[] | undefined): string {
  const t = textoDeMediosDePago(medios ?? []);
  return t && !/^Mercado Pago/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

function WaLink({
  numero,
  texto,
  className,
  children,
}: {
  numero: string;
  texto: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a className={className} href={buildWhatsAppHref(numero, texto)} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export default function TiendaNueva(e: EntradaTienda) {
  const marca: MarcaId = marcaDeLaVidriera(e.front, e.brandId);
  const cfg = CONFIG[marca];
  const copy = e.copy;
  const productos = e.productos;

  // ── Qué es cada producto ──
  const seccionDeProducto: Record<string, string> = {};
  const marcaDe: Record<string, string> = {};
  const modeloDe: Record<string, string> = {};
  const imagenDe: Record<string, string> = {};
  const marcasCopy = marca === "adosmanos" ? (copy?.providers ?? []) : [];
  for (const p of productos) {
    seccionDeProducto[p.id] = seccionDe(marca, p.name);
    if (marcasCopy.length) {
      const mm = marcaYModelo(p.name, marcasCopy);
      if (mm.marca) marcaDe[p.id] = mm.marca;
      modeloDe[p.id] = mm.modelo;
    }
    if (marca === "magra") {
      const img = cutImage(p.name);
      if (img) imagenDe[p.id] = img;
    }
  }
  const marcasPresentes = marcasCopy.filter((m) => Object.values(marcaDe).includes(m));

  // ── Las secciones, con lo que dice la marca de cada una ──
  const lineaDe = (id: string) => copy?.vacioLines.find((l) => l.section === id)?.text ?? null;
  const secciones: SeccionVista[] = cfg.secciones.map((sec) => {
    let bajada: string | null = null;
    let hechos: string[] = [];
    let imagen: string | null = null;
    if (marca === "magra") {
      const i = ["vaca", "cerdo", "pollo"].indexOf(sec.id);
      bajada = i >= 0 ? (copy?.vacioLines[i]?.text ?? null) : "Para acompañar";
      hechos = i >= 0 ? ["Envasado al vacío.", ...(bajada ? [bajada] : [])] : [];
    } else if (marca === "shinevelas") {
      bajada = lineaDe(sec.id);
      imagen = e.imagery?.sectionImages?.[sec.id as keyof NonNullable<TenantImagery["sectionImages"]>] ?? null;
    } else if (marca === "adosmanos") {
      bajada = sec.id === "accesorios" ? (copy?.gourmetItems.join(" · ") ?? null) : lineaDe(sec.id);
      hechos = sec.id === "calzado" ? ["Te confirmamos el talle antes de cobrar."] : [];
    }
    return { ...sec, bajada, hechos, imagen };
  });

  // ── El local: WhatsApp, zona, pago ──
  const local: MagraLocal | null = marca === "magra" ? resolveMagraLocal(e.branding) : null;
  const whatsapp = local ? local.whatsapp : sanitizePhone(e.branding?.whatsapp);
  const zona =
    marca === "magra" ? (local?.zoneLabel ?? null) : marca === "shinevelas" ? (copy?.deliveryZones.join(" y ") ?? null) : null;
  const textoPago =
    marca === "magra"
      ? `Pagás al recibir: ${mediosEnFrase(copy?.paymentMethods)}`
      : marca === "shinevelas"
        ? `Coordinamos el pago al confirmar: ${mediosEnFrase(copy?.paymentMethods)}`
        : "Te confirmamos el total, el medio de pago y la entrega antes de cobrar.";

  const filtros = leerFiltros(e.searchParams, {
    secciones: cfg.secciones.map((x) => x.id),
    marcas: marcasPresentes,
  });
  const productoInicial = typeof e.searchParams.producto === "string" ? e.searchParams.producto : null;

  const carta = cartaDe(marca, copy, e.wording);

  const datos: DatosVidriera = {
    marca,
    tenantKey: e.tenantKey,
    productos,
    secciones,
    seccionDe: seccionDeProducto,
    marcaDe,
    modeloDe,
    marcas: marcasPresentes,
    imagenDe,
    whatsapp,
    envio: copy?.shipping ?? null,
    envioSinTarifa: cfg.envioSinTarifa,
    entregaPorDefecto: cfg.entregaPorDefecto,
    zona,
    textoPago,
    palabras: cfg.palabras,
    filtrosIniciales: filtros,
    productoInicial,
    ...carta,
  };

  const ctx: Ctx = {
    e,
    marca,
    copy,
    whatsapp,
    local,
    productos,
    seccionDeProducto,
    marcaDe,
    marcasPresentes,
  };

  return (
    <div style={marca === "generica" ? ({ "--acento-negocio": e.acento } as React.CSSProperties) : undefined}>
      <Vidriera
        {...datos}
        cabecera={<Cabecera {...ctx} />}
        portada={<Portada {...ctx} />}
        editorial={<Editorial {...ctx} />}
        pie={<Pie {...ctx} />}
      />
    </div>
  );
}

type Ctx = {
  e: EntradaTienda;
  marca: MarcaId;
  copy: StorefrontCopy | null;
  whatsapp: string;
  local: MagraLocal | null;
  productos: ProductoVidriera[];
  seccionDeProducto: Record<string, string>;
  marcaDe: Record<string, string>;
  marcasPresentes: string[];
};

function cartaDe(marca: MarcaId, copy: StorefrontCopy | null, wording: RetailWording) {
  if (marca === "magra")
    return {
      cartaKicker: "01 · Comprá online",
      cartaTitulo: "La carta de hoy",
      cartaIntro: "Pedís por kilo o por pieza. Lo pesamos al envasar y el total se ajusta al peso real.",
    };
  if (marca === "shinevelas") {
    const envio = copy?.shipping;
    return {
      cartaKicker: "01 · Comprá online",
      cartaTitulo: "La colección",
      cartaIntro: envio
        ? `Envío a domicilio en ${copy?.deliveryZones.join(" y ")}: ${plata(envio.flatRate)}, sin cargo desde ${plata(envio.freeThreshold)}.`
        : null,
    };
  }
  if (marca === "adosmanos")
    return {
      cartaKicker: "01 · Comprá online",
      cartaTitulo: "Palas y zapatillas, lado a lado",
      cartaIntro: "Modelo, marca y precio en la misma fila. Tocá «Precio» para ordenar; tocá el modelo para ver la ficha.",
    };
  return {
    cartaKicker: "Comprá online",
    cartaTitulo: wording.catalogHeading,
    cartaIntro: wording.weightNote,
  };
}

// ── Cabecera: la marca, las secciones, WhatsApp ─────────────────────────────

function Cabecera({ marca, e, local, whatsapp }: Ctx) {
  const nav =
    marca === "magra"
      ? [
          ["#carta", "La carta"],
          ["#envasados", "Envasados"],
          ["#resenas", "Reseñas"],
          ["#contacto", "Cómo llegar"],
        ]
      : marca === "shinevelas"
        ? [
            ["#carta", "Colección"],
            ["#regalos", "Regalos"],
            ["#ritual", "Ritual"],
            ["#contacto", "Contacto"],
          ]
        : marca === "adosmanos"
          ? [
              ["#carta", "Palas y zapatillas"],
              ["#como", "Cómo comprar"],
              ["#contacto", "Contacto"],
            ]
          : [
              ["#carta", "Productos"],
              ["#contacto", "Contacto"],
            ];
  return (
    <>
      <a href="#top" className={s.logo} aria-label={e.nombre}>
        {marca === "magra" ? (
          <>
            <span className={s.logoMarca}>
              {MAGRA.brandLead}
              <b>{MAGRA.brandAccent}</b>
              {MAGRA.brandTail}
            </span>
            <span className={s.logoSub}>{local?.zoneLabel ? `${MAGRA.brandSub} · ${local.zoneLabel}` : MAGRA.brandSub}</span>
          </>
        ) : marca === "shinevelas" ? (
          <>
            <Image src="/tenants/shinevelas/brand/logo.png" alt="Shine" width={128} height={40} className={s.logoImg} priority />
            <span className={s.logoSub}>Velas · aromas · deco</span>
          </>
        ) : marca === "adosmanos" ? (
          <>
            <span className={s.logoMarca}>A Dos Manos</span>
            <span className={s.logoSub}>Pádel</span>
          </>
        ) : (
          <span className={s.logoMarca}>{e.nombre}</span>
        )}
      </a>
      <nav className={s.nav} aria-label="Secciones">
        {nav.map(([href, t]) => (
          <a key={href} href={href}>
            {t}
          </a>
        ))}
      </nav>
      {whatsapp && (
        <WaLink
          numero={whatsapp}
          texto={`¡Hola ${e.nombre}! Quería hacer una consulta.`}
          className={`${s.btn} ${s.btnWa} ${s.cabWa}`}
        >
          <IconoWhatsApp /> WhatsApp
        </WaLink>
      )}
    </>
  );
}

// ── Portadas ───────────────────────────────────────────────────────────────

function Portada(c: Ctx) {
  if (c.marca === "magra") return <PortadaMagra {...c} />;
  if (c.marca === "shinevelas") return <PortadaShine {...c} />;
  if (c.marca === "adosmanos") return <PortadaAdm {...c} />;
  return (
    <section id="top" className={`${s.env} ${s.portada} ${s.portadaSola}`}>
      <div className={s.portadaTxt}>
        <span className={s.kicker}>{c.copy?.eyebrow ?? c.e.branding?.shortLabel ?? c.e.nombre}</span>
        <h1 className={`${s.titulo} ${s.portadaH1}`}>{c.copy?.tagline ?? c.e.wording.heroTagline}</h1>
        {(c.copy?.intro ?? c.e.branding?.contactNote) && (
          <p className={s.portadaLede}>{c.copy?.intro ?? c.e.branding?.contactNote}</p>
        )}
      </div>
    </section>
  );
}

function PortadaMagra({ local, whatsapp, productos }: Ctx) {
  // La cinta: los cortes de la marquesina de la marca, con su precio de HOY (de la base). Quieta.
  const porNombre = new Map(productos.map((p) => [p.name.toLowerCase(), p]));
  const cinta = MAGRA.marquee
    .map((n) => porNombre.get(n.toLowerCase()))
    .filter((p): p is ProductoVidriera => Boolean(p) && precioDe(p!) > 0);
  const zona = local ? promesaDeReparto(local, MAGRA) : null;
  return (
    <>
      <section id="top" className={`${s.env} ${s.portada}`}>
        <div className={s.portadaTxt}>
          <span className={s.kicker}>{MAGRA.heroEyebrow}</span>
          <h1 className={`${s.titulo} ${s.portadaH1}`}>{MAGRA.heroTitle}</h1>
          <p className={s.portadaLede}>{MAGRA.heroLede}</p>
          {zona && <p className={s.portadaZona}>{zona}</p>}
          <div className={s.portadaAcc}>
            <a className={`${s.btn} ${s.btnPri}`} href="#carta">
              Ver la carta de hoy
            </a>
            {whatsapp && (
              <WaLink numero={whatsapp} texto="¡Hola MAGRA! Quería hacer un pedido." className={`${s.btn} ${s.btnSec}`}>
                <IconoWhatsApp /> Pedir por WhatsApp
              </WaLink>
            )}
          </div>
        </div>
        <div className={s.portadaFoto}>
          <Image
            src={MAGRA_HERO_IMG}
            alt="Corte madurado envasado al vacío"
            width={718}
            height={821}
            priority
            fetchPriority="high"
            sizes="(max-width: 719px) 100vw, 50vw"
          />
          <span className={s.portadaSello}>Al vacío · frío hasta tu casa</span>
        </div>
      </section>
      {cinta.length > 0 && (
        <div className={s.cinta} aria-label="Algunos precios de hoy">
          <ul className={s.env}>
            {cinta.map((p) => (
              <li key={p.id}>
                {p.name}{" "}
                <b>
                  · {plata(precioDe(p))}
                  {p.saleUnit === "WEIGHT" ? "/kg" : ""}
                </b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function PortadaShine({ copy, e, whatsapp }: Ctx) {
  const hero = e.imagery?.heroImage ?? null;
  return (
    <section id="top" className={s.portadaSangre}>
      {hero && (
        <div className={s.sangreFoto}>
          <Image src={hero} alt="Velas de soja encendidas en un living" fill priority fetchPriority="high" sizes="100vw" />
        </div>
      )}
      <div className={`${s.env} ${s.portadaSangreEnv}`}>
        <div className={s.portadaEtiqueta}>
          <span className={s.kicker}>{copy?.eyebrow}</span>
          <h1 className={`${s.titulo} ${s.portadaH1}`}>{copy?.tagline}</h1>
          <p className={s.portadaLede}>{copy?.intro}</p>
          <div className={s.portadaAcc}>
            <a className={`${s.btn} ${s.btnPri}`} href="#carta">
              Ver la colección
            </a>
            {whatsapp && (
              <WaLink numero={whatsapp} texto="¡Hola Shine! Quería hacer una consulta." className={`${s.btn} ${s.btnSec}`}>
                Escribinos por WhatsApp
              </WaLink>
            )}
          </div>
          <p className={s.firma}>Que tu luz nunca se apague.</p>
        </div>
      </div>
    </section>
  );
}

function PortadaAdm({ copy, whatsapp, productos, seccionDeProducto, marcaDe, marcasPresentes }: Ctx) {
  const palas = productos.filter((p) => seccionDeProducto[p.id] === "palas" && precioDe(p) > 0);
  const precios = palas.map(precioDe);
  const marcasDePalas = marcasPresentes.filter((m) => palas.some((p) => marcaDe[p.id] === m));
  return (
    <section id="top" className={s.portadaPartida}>
      <div className={s.pIzq}>
        <span className={s.kicker}>{copy?.pitch ?? copy?.eyebrow}</span>
        <h1 className={`${s.titulo} ${s.portadaH1}`}>{copy?.tagline}</h1>
        <p className={s.portadaLede}>{copy?.intro}</p>
        <div className={s.portadaAcc}>
          <a className={`${s.btn} ${s.btnPri}`} href="#carta">
            Ver el cuadro de palas
          </a>
          {whatsapp && (
            <WaLink numero={whatsapp} texto="¡Hola A Dos Manos! Quería asesorarme." className={`${s.btn} ${s.btnSec}`}>
              <IconoWhatsApp /> Asesorate por WhatsApp
            </WaLink>
          )}
        </div>
        {marcasPresentes.length > 0 && (
          <p className={s.pMarcas} aria-label="Marcas">
            {marcasPresentes.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </p>
        )}
      </div>
      <div className={s.pDer}>
        <span className={s.kicker}>Las palas de hoy</span>
        {palas.length > 0 ? (
          <>
            <h2 className={`${s.titulo} ${s.pDerTit}`}>
              {palas.length} {palas.length === 1 ? "modelo" : "modelos"}, {marcasDePalas.length}{" "}
              {marcasDePalas.length === 1 ? "marca" : "marcas"}
            </h2>
            <dl className={s.resumenPalas}>
              <div>
                <dt>Desde</dt>
                <dd>{plata(Math.min(...precios))}</dd>
              </div>
              <div>
                <dt>Hasta</dt>
                <dd>{plata(Math.max(...precios))}</dd>
              </div>
            </dl>
          </>
        ) : (
          <h2 className={`${s.titulo} ${s.pDerTit}`}>Estamos cargando las palas.</h2>
        )}
        {marcasDePalas.length > 1 && (
          <nav aria-label="Palas por marca">
            <span className={s.kicker}>Por marca</span>
            <p className={s.porMarca}>
              {marcasDePalas.map((m) => (
                <a key={m} href={`?seccion=palas&marca=${encodeURIComponent(m)}#carta`}>
                  {m} <span>{palas.filter((p) => marcaDe[p.id] === m).length}</span>
                </a>
              ))}
            </p>
          </nav>
        )}
        {whatsapp && <ConsejoDePala whatsapp={whatsapp} />}
      </div>
    </section>
  );
}

// ── Lo editorial, debajo de la carta ───────────────────────────────────────

function Editorial(c: Ctx) {
  const { marca, copy, whatsapp, local } = c;
  if (marca === "magra") {
    return (
      <>
        <section id="envasados" className={s.edi}>
          <div className={s.ediCab}>
            <span className={s.kicker}>02 · {MAGRA.vacioTitle}</span>
          </div>
          <div className={s.tres}>
            {MAGRA.vacio.map((l) => (
              <article key={l.title}>
                <Image
                  src={l.img}
                  alt=""
                  width={809}
                  height={728}
                  sizes="(max-width: 719px) 100vw, (max-width: 1079px) 50vw, 420px"
                />
                <h3 className={s.titulo}>{l.title}</h3>
                <p>{l.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className={s.edi}>
          <div className={s.ediCab}>
            <span className={s.kicker}>03 · {MAGRA.providersTitle}</span>
          </div>
          <p className={s.prov}>
            {MAGRA.providers.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </p>
        </section>
        <section id="resenas" className={s.edi}>
          <div className={s.ediCab}>
            <span className={s.kicker}>04 · Lo que dicen nuestros clientes · 5 de 5</span>
          </div>
          <div className={s.resenas}>
            {MAGRA.reviews.map((r) => (
              <figure key={r.name} className={s.resena}>
                <blockquote>“{r.text}”</blockquote>
                <figcaption>{r.name} · cliente MAGRA</figcaption>
              </figure>
            ))}
          </div>
        </section>
        <section className={s.edi}>
          <div className={s.nosotros}>
            <h2 className={s.titulo}>{MAGRA.aboutTitle}</h2>
            <p>{local ? textoAbout(local, MAGRA) : MAGRA.aboutBody}</p>
          </div>
        </section>
      </>
    );
  }
  if (marca === "shinevelas" && copy) {
    return (
      <>
        {copy.giftSets && (
          <section id="regalos" className={s.edi}>
            <div className={s.ediCab}>
              <span className={s.kicker}>02 · Para regalar</span>
              <h2 className={`${s.titulo} ${s.ediTit}`}>{copy.giftSets.title}</h2>
              {copy.giftSets.intro && <p className={s.ediBaj}>{copy.giftSets.intro}</p>}
            </div>
            <ul className={s.sets}>
              {copy.giftSets.sets.map((g) => (
                <li key={g.name} className={s.set}>
                  <span>
                    <span className={s.setNom}>{g.name}</span>
                    {g.note && <span className={s.setNota}>{g.note}</span>}
                  </span>
                  <span className={s.setTxt}>{g.items}</span>
                  <span className={s.renPrecio}>{typeof g.price === "number" ? plata(g.price) : "A consultar"}</span>
                  {whatsapp && (
                    <WaLink numero={whatsapp} texto={`¡Hola Shine! Me interesa el ${g.name}.`} className={`${s.btn} ${s.btnSec}`}>
                      Pedirlo
                    </WaLink>
                  )}
                </li>
              ))}
            </ul>
            {!whatsapp && <p className={s.nota}>Los sets se arman a pedido: contanos cuál querés en la nota de tu pedido.</p>}
          </section>
        )}
        {copy.ritual && (
          <div id="ritual" className={s.banda}>
            <section className={s.edi}>
              <div className={s.ediCab}>
                <span className={s.kicker}>03 · Una experiencia</span>
                <h2 className={`${s.titulo} ${s.ediTit}`}>{copy.ritual.title}</h2>
                <p className={s.ediBaj}>{copy.ritual.intro}</p>
              </div>
              <ol className={s.pasos}>
                {copy.ritual.steps.map((p) => (
                  <li key={p.title}>
                    <h3>{p.title}</h3>
                    <p>{p.text}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
        <section className={s.edi}>
          <div className={s.nosotros}>
            <h2 className={s.titulo}>{copy.about.title}</h2>
            <p>{copy.about.body}</p>
            {copy.gourmetItems.length > 0 && (
              <>
                <span className={`${s.kicker} ${s.aromasTit}`}>{copy.gourmetTitle}</span>
                <p className={s.aromas}>
                  {copy.gourmetItems.map((a) => (
                    <span key={a}>{a}</span>
                  ))}
                </p>
              </>
            )}
          </div>
        </section>
      </>
    );
  }
  if (marca === "adosmanos" && copy) {
    return (
      <>
        <div id="como" className={s.banda}>
          <section className={s.edi}>
            <div className={s.ediCab}>
              <span className={s.kicker}>02 · Cómo comprar</span>
              <h2 className={`${s.titulo} ${s.ediTit}`}>Sin vueltas</h2>
            </div>
            <ol className={s.pasos}>
              <li>
                <h3>Elegís{whatsapp ? ", o nos escribís" : ""}</h3>
                <p>
                  Armá el pedido acá
                  {whatsapp ? " o contanos por WhatsApp cómo jugás y te recomendamos" : ""}.
                </p>
              </li>
              <li>
                <h3>Te confirmamos todo</h3>
                <p>Stock, talle, medio de pago y envío, antes de cobrar nada.</p>
              </li>
              <li>
                <h3>Retirás o te lo mandamos</h3>
                <p>{copy.deliveryZones.join(" · ")}. El costo del envío te lo decimos al confirmar.</p>
              </li>
            </ol>
            <p className={s.condiciones}>
              <b>Medios de pago, cuotas y envío:</b> te los confirmamos al tomar el pedido, antes de cobrar.
            </p>
          </section>
        </div>
        <section className={s.edi}>
          <div className={s.nosotros}>
            <h2 className={s.titulo}>{copy.about.title}</h2>
            <p>{copy.about.body}</p>
          </div>
        </section>
      </>
    );
  }
  return null;
}

// ── El pie: los datos del local, o "a confirmar" (nunca los de otro local) ───

function Pie({ marca, e, copy, whatsapp, local }: Ctx) {
  const b = e.branding;
  const direccion = local ? local.addressLine : b?.addressLine;
  const ciudad = local ? local.city : b?.city;
  const horario = local ? local.hours : b?.hoursLabel;
  const instagram = local?.instagram ?? b?.instagram ?? null;
  const email = local?.email ?? b?.email ?? null;
  const falta = (t: string) => <p className={s.aConfirmar}>{t} a confirmar</p>;
  return (
    <footer id="contacto" className={s.pie}>
      <div className={s.env}>
        <div className={s.pieCols}>
          <div>
            <p className={`${s.titulo} ${s.logoMarca} ${s.pieMarca}`}>
              {marca === "magra" ? "MAGRA" : marca === "shinevelas" ? "Shine" : marca === "adosmanos" ? "A Dos Manos" : e.nombre}
            </p>
            <p className={s.pieLema}>{marca === "magra" ? MAGRA.aboutTitle : (copy?.pitch ?? b?.contactNote ?? "")}</p>
          </div>
          <div>
            <h3>Dónde estamos</h3>
            {direccion ? <p>{direccion}</p> : falta("Dirección")}
            {ciudad && <p>{ciudad}</p>}
          </div>
          <div>
            <h3>Horarios</h3>
            {horario ? <p>{horario}</p> : falta("Horarios")}
            {marca === "magra" && local && esElLocalDelCopy(local) && (
              <>
                <h3 className={s.pieSub}>Llegamos a</h3>
                <p>{MAGRA.deliveryZones.join(" · ")}</p>
              </>
            )}
            {marca !== "magra" && copy && copy.deliveryZones.length > 0 && (
              <>
                <h3 className={s.pieSub}>Envíos</h3>
                <p>{copy.deliveryZones.join(" · ")}</p>
              </>
            )}
          </div>
          <div>
            <h3>Contacto</h3>
            {whatsapp ? (
              <WaLink numero={whatsapp} texto={`¡Hola ${e.nombre}!`}>
                WhatsApp {local?.whatsappLabel ?? ""}
              </WaLink>
            ) : (
              falta("WhatsApp")
            )}
            {instagram && !/a-confirmar/.test(instagram) && (
              <p>
                <a
                  href={`https://www.instagram.com/${instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Instagram {instagram.startsWith("@") ? instagram : `@${instagram}`}
                </a>
              </p>
            )}
            {email && (
              <p>
                <a href={`mailto:${email}`}>{email}</a>
              </p>
            )}
          </div>
        </div>
        <p className={s.legal}>
          <span>{marca === "magra" ? MAGRA.copyright : `© ${ANIO} ${e.nombre}`}</span>
          <Link href="/admin">Acceso administrador</Link>
        </p>
      </div>
    </footer>
  );
}
