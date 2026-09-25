// ============================================================================
// CATÁLOGO DE SERVICIOS (CH) — la página con «Diseño nuevo» (Renglón).
// ============================================================================
//
// Antes eran siete secciones apiladas con párrafos de ayuda (7.700 px de alto en el celular). Ahora
// es una pestaña por parte (Servicios, Profesionales, Boxes, Equipos, Productos, Quién hace qué,
// Cupones) y arriba la línea de estado con lo que falta resolver. Los datos son los mismos que ya
// trae `getCatalog()`/`getCoupons()` en page.tsx: esta página no consulta nada.

import Link from "next/link";
import type { getCatalog } from "@/lib/catalog-actions";
import type { getCoupons } from "@/lib/coupon-actions";
import { LineaDeEstado, PageHeader, Pestanas, buttonClasses } from "@/components/ui";
import ProfessionalsSection from "./ProfessionalsSection";
import ProductsSection from "./ProductsSection";
import AsignacionSection from "./AsignacionSection";
import { contarCatalogo, leerParte, type ParteDelCatalogo } from "./catalogo-servicios-core";
import { BoxesRenglon, CuponesRenglon, EquiposRenglon, ServiciosRenglon } from "./CatalogoServiciosRenglon";

type Sp = Record<string, string | string[] | undefined>;
type Datos = Awaited<ReturnType<typeof getCatalog>> & { coupons: Awaited<ReturnType<typeof getCoupons>> };

const ALTA: Partial<Record<ParteDelCatalogo, string>> = {
  servicios: "Agregar servicio",
  boxes: "Agregar box",
  equipos: "Agregar equipo",
  cupones: "Crear cupón",
};

const href = (parte: ParteDelCatalogo, extra = "") => `/admin/catalogo${parte === "servicios" ? (extra ? `?${extra}` : "") : `?ver=${parte}${extra ? `&${extra}` : ""}`}`;

export default function CatalogoServiciosPagina({ sp, datos }: { sp: Sp; datos: Datos }) {
  const { boxes, services, professionals, products, categories, resources, coupons } = datos;
  const parte = leerParte(sp);
  const editar = typeof sp.editar === "string" && sp.editar !== "" ? sp.editar : null;
  const agregar = sp.agregar === "1";

  const cuentas = contarCatalogo(services, professionals);
  const { quienesLaHacen, profesionalesPorBox } = cuentas;
  const nombresDeServicios = Object.fromEntries(services.map((s) => [s.id, s.name]));
  const sinQuien = cuentas.sinProfesional;
  const sinCategoria = cuentas.sinCategoria;
  const estado: React.ReactNode[] = [`${cuentas.aLaVenta} servicios a la venta`];
  if (sinQuien > 0)
    estado.push(
      <Link key="sin-quien" href={href("quien")} className="font-medium text-strong underline underline-offset-2">
        {sinQuien} sin profesional
      </Link>,
    );
  if (sinCategoria > 0) estado.push(<strong key="sin-cat">{sinCategoria} sin categoría</strong>);
  estado.push(`${cuentas.profesionalesActivos} profesionales · ${boxes.filter((b) => b.active).length} boxes`);

  const pestanas = [
    { parte: "servicios", etiqueta: "Servicios", conteo: services.length },
    { parte: "profesionales", etiqueta: "Profesionales", conteo: professionals.length },
    { parte: "boxes", etiqueta: "Boxes", conteo: boxes.length },
    { parte: "equipos", etiqueta: "Equipos", conteo: resources.length },
    { parte: "productos", etiqueta: "Productos", conteo: products.length },
    { parte: "quien", etiqueta: "Quién hace qué" },
    { parte: "cupones", etiqueta: "Cupones", conteo: coupons.length },
  ] as const;

  const alta = ALTA[parte];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Catálogo"
        actions={
          alta ? (
            <Link href={href(parte, "agregar=1")} scroll={false} className={buttonClasses("solid", "md")}>
              {alta}
            </Link>
          ) : undefined
        }
      />
      <LineaDeEstado datos={estado} className="-mt-2 mb-4" />
      <Pestanas
        etiqueta="Partes del catálogo"
        conRaya
        className="mb-6"
        pestanas={pestanas.map((p) => ({
          href: href(p.parte),
          etiqueta: p.etiqueta,
          actual: p.parte === parte,
          ...("conteo" in p ? { conteo: p.conteo } : {}),
        }))}
      />

      {parte === "servicios" && (
        <ServiciosRenglon
          servicios={services}
          categorias={categories}
          insumos={products}
          equipos={resources}
          quienesLaHacen={quienesLaHacen}
          editar={editar}
          agregar={agregar}
        />
      )}
      {parte === "boxes" && <BoxesRenglon boxes={boxes} profesionalesPorBox={profesionalesPorBox} editar={editar} agregar={agregar} />}
      {parte === "equipos" && <EquiposRenglon equipos={resources} nombresDeServicios={nombresDeServicios} editar={editar} agregar={agregar} />}
      {parte === "cupones" && <CuponesRenglon cupones={coupons} agregar={agregar} />}
      {parte === "profesionales" && <ProfessionalsSection professionals={professionals} boxes={boxes} services={services} />}
      {parte === "productos" && <ProductsSection products={products} />}
      {parte === "quien" && (
        <AsignacionSection
          services={services.map((s) => ({ id: s.id, name: s.name, active: s.active, categoryName: s.category?.name ?? null }))}
          professionals={professionals.map((p) => ({ id: p.id, name: p.name, active: p.active, serviceIds: p.services.map((s) => s.id) }))}
        />
      )}
    </main>
  );
}
