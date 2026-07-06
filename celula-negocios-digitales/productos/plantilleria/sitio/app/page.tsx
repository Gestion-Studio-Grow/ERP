import CardPlantilla from "../components/CardPlantilla";
import FAQ from "../components/FAQ";
import BotonComprar from "../components/BotonComprar";
import { PLANTILLAS, BUNDLE } from "../data/catalogo";

export default function Landing() {
  return (
    <>
      {/* HERO */}
      <section style={{ paddingTop: 72, paddingBottom: 40 }}>
        <div className="contenedor" style={{ maxWidth: 820, textAlign: "center" }}>
          <span className="badge badge-ar" style={{ marginBottom: 20 }}>
            🇦🇷 Hechas para la Argentina real
          </span>
          <h1>
            Dejá de pelearte con planillas que no sirven para acá.
          </h1>
          <p className="lead" style={{ marginBottom: 28 }}>
            Plantillas de monotributo, presupuestos por oficio, caja de kiosco, sueldos y finanzas —
            con los topes de ARCA, el aguinaldo y la inflación ya adentro. Las descargás y las usás hoy.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a className="btn btn-primario" href="#catalogo">
              Ver las 5 plantillas →
            </a>
            <a className="btn btn-secundario" href="#pack">
              Llevar el pack (US${BUNDLE.precioUSD})
            </a>
          </div>
          <p style={{ marginTop: 20, fontSize: ".9rem", color: "var(--ink-soft)" }}>
            Descarga inmediata · Pago seguro en USD · Sin suscripciones
          </p>
        </div>
      </section>

      {/* PROBLEMA / PROPUESTA */}
      <section className="seccion-alt">
        <div className="contenedor grid grid-3">
          {[
            { t: "El problema", d: "Las plantillas que bajás de internet son de México o España: monotributo que no existe, sueldos con otras leyes, finanzas que asumen precios estables." },
            { t: "Lo nuestro", d: "Cada plantilla está localizada: escalas de ARCA, recategorización, SAC, descuentos de ley y lógica anti-inflación. Diseño prolijo, en criollo." },
            { t: "El resultado", d: "Ordenás tu negocio o tu plata en una tarde, sin contratar un sistema caro ni saber de Excel. Cargás datos, la planilla calcula sola." },
          ].map((b) => (
            <div key={b.t} className="card">
              <h3>{b.t}</h3>
              <p style={{ color: "var(--ink-soft)", marginBottom: 0 }}>{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CATÁLOGO */}
      <section id="catalogo">
        <div className="contenedor">
          <div className="centro" style={{ maxWidth: 680, margin: "0 auto 40px" }}>
            <h2>El catálogo</h2>
            <p className="lead">Elegí la que resuelve tu dolor. Todas one-time, sin suscripción.</p>
          </div>
          <div className="grid grid-3">
            {PLANTILLAS.map((p) => (
              <CardPlantilla key={p.slug} p={p} />
            ))}
          </div>
        </div>
      </section>

      {/* PACK */}
      <section id="pack" className="seccion-alt">
        <div className="contenedor">
          <div className="card centro" style={{ maxWidth: 720, margin: "0 auto", alignItems: "center" }}>
            <span className="badge" style={{ marginBottom: 12 }}>Mejor precio</span>
            <h2>{BUNDLE.nombre}</h2>
            <p className="lead">{BUNDLE.gancho}</p>
            <div style={{ margin: "16px 0" }}>
              <span className="tachado">US${BUNDLE.precioUSD + BUNDLE.ahorroUSD}</span>{" "}
              <span className="precio" style={{ color: "var(--accent)" }}>US${BUNDLE.precioUSD}</span>
              <div className="precio-ars">≈ ${BUNDLE.precioARSref.toLocaleString("es-AR")} ARS · ahorrás US${BUNDLE.ahorroUSD}</div>
            </div>
            <BotonComprar checkoutUrl={BUNDLE.checkoutUrl} label={`Llevar las 5 por US$${BUNDLE.precioUSD}`} />
          </div>
        </div>
      </section>

      {/* PRUEBA SOCIAL (placeholder para reseñas reales) */}
      <section>
        <div className="contenedor centro" style={{ maxWidth: 760 }}>
          <h2>Lo que dicen los que ya la usan</h2>
          <p className="lead" style={{ marginBottom: 32 }}>
            (Reemplazar por testimonios reales apenas haya las primeras ventas — ver PLAN.md.)
          </p>
          <div className="grid grid-3">
            {[
              ["“Me di cuenta de que estaba a un mes de pasarme de categoría. Me salvó de una multa.”", "Rodrigo · monotributista"],
              ["“Cotizo los trabajos en 5 minutos y encima se ve profesional. Cerré más presupuestos.”", "Vanina · gasista matriculada"],
              ["“Por fin sé cuánto gano de verdad en el kiosco cada día.”", "Comercio de barrio · Rosario"],
            ].map(([texto, autor]) => (
              <div key={autor} className="card">
                <p style={{ fontStyle: "italic" }}>{texto}</p>
                <p style={{ fontWeight: 700, marginBottom: 0, color: "var(--ink-soft)" }}>{autor}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="seccion-alt">
        <div className="contenedor">
          <h2 className="centro" style={{ marginBottom: 32 }}>Preguntas frecuentes</h2>
          <FAQ />
        </div>
      </section>
    </>
  );
}
