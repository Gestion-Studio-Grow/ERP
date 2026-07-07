# ADR-028 — Panel de Dirección: producto ejecutivo para la mesa de dirección

- **Estado:** Aceptado · estructura implementada, deploy pendiente de Gate 1 · **Fecha:** 2026-07-07
- **Decide:** dónde vive y cómo se publica el panel de la Célula de Negocios Digitales cuando deja de ser
  experimento local y pasa a ser **producto para la dirección/dueños**.
- **Relación:** concreta el "Panel del Dueño" nombrado en ADR-027; se apoya en el plano de plataforma de
  ADR-021; no toca el aislamiento del tenant (ADR-018).

---

## 1. Contexto

La **Célula de Negocios Digitales** (`celula-negocios-digitales/`, hasta hoy aislada y local) produjo un
**panel autocontenido** (`panel/panel.html`): cartera de 95 negocios con fichas armadas como *preguntas de
un dueño*, costo real, ejemplos de uso y de venta, más generadores de PDF (manual, plantillas, costos). El
dueño decidió **publicarlo como producto para la mesa de dirección**. Pregunta a resolver: **¿dónde encaja
en la estructura del repo sin romper el modelo de la plataforma?**

## 2. Decisión

1. **Es un producto del PLANO DE PLATAFORMA (control-plane), no del plano del tenant.** Su audiencia es la
   **dirección/dueños** y su dato es **estratégico de la compañía**, no de un negocio-cliente. Va con
   `/operador` (ADR-021: dos superficies, dos audiencias, dos planos de autorización), **nunca** bajo
   `/admin` (que es el backoffice de un tenant, atado a RLS).

2. **Se sirve DENTRO del portón protegido**, no desde `public/`:
   - `src/app/operador/(console)/direccion/page.tsx` — vista embebida + botón "pantalla completa".
   - `src/app/operador/(console)/direccion/panel/route.ts` — sirve el HTML (`GET`) detrás del proxy.
   - `proxy.ts` ya protege `/operador/:path*` con **cookie y secreto propios de operador** (no comparte
     llavero con la sesión de un tenant). Un archivo en `public/` **quedaría accesible sin login** → por eso
     el panel **no** se copia a `public/`.

3. **Fuente de verdad = la Célula; publicación = bundle.** El panel se sigue editando en
   `celula-negocios-digitales/panel/panel.html` (con todos sus generadores). Para llevarlo a la app se corre
   **`npm run publicar:direccion`**, que bundlea el HTML como módulo TS (`direccion/panel.generated.ts`,
   marcado *generado, no editar*). El panel sigue **autocontenido**: sin DB, sin red externa → **cero
   acoplamiento con el Core**.

4. **Sin base de datos → sin Gate 2.** No hay migración (es contenido estático servido tras auth). El único
   gate es **Gate 1 (deploy a producción = OK de Maxi)**, como todo lo demás.

5. **Aislamiento intacto.** El panel **no lee** datos de ningún tenant ni del Core; no toca RLS ni la DB del
   tenant (ADR-018). Es un documento estratégico servido detrás del portón de plataforma. El "aislamiento"
   histórico de la célula deja de ser *"local sin publicar"* y pasa a ser *"plano separado, detrás de auth"*.

## 3. Estructura resultante

```
celula-negocios-digitales/panel/           ← FUENTE DE VERDAD (edición + generadores)
  panel.html                                  el producto
  generar-pdf-*.mjs                            manual / plantillas / costos / cartera
  publicar-a-app.mjs                           → publica a la app (bundle)
src/app/operador/(console)/direccion/       ← PRODUCTO EN LA APP (plano plataforma, protegido)
  page.tsx                                     vista ejecutiva (iframe + full-screen)
  panel/route.ts                               sirve el HTML detrás del proxy
  panel.generated.ts                           GENERADO por publicar-a-app.mjs
```

URL: **`/operador/direccion`** (embebido) y **`/operador/direccion/panel`** (pantalla completa), ambas tras
el login de operador.

## 4. Consecuencias

- **A favor:** el producto vive donde corresponde (plataforma, no tenant), protegido, sin tocar el Core ni la
  DB; la célula conserva su tooling; publicar es un comando; en nuestro propio iframe **la descarga/impresión
  a PDF SÍ funciona** (no es el sandbox de claude.ai). Reversible: es aditivo.
- **A vigilar / a futuro (no se construye ahora):**
  - **Auth propia de dirección:** hoy reutiliza el portón de operador. Si la mesa de dirección necesita su
    **propio acceso** (distinto del operador técnico), se separa en un plano `/direccion` con su cookie/secreto
    (misma mecánica que `operator-auth`). Decisión diferida hasta que haga falta.
  - **De estático a vivo:** cuando el panel deba mostrar datos dinámicos (no un snapshot generado por la
    célula), pasa a ser una feature con su modelo → otra `/sesion-feature`.
  - **Exports:** los PDF (manual/plantillas/costos) pueden ofrecerse como descargas desde la ruta protegida.

## 5. Estado

- **Implementado:** ruta protegida + route handler + `panel.generated.ts` + script `publicar:direccion` + link
  en la nav del control-plane. `tsc` limpio en los archivos nuevos.
- **Pendiente:** **Gate 1** (deploy a producción con OK de Maxi). Hasta entonces, vive en el repo y se ve en
  `next dev`. Nada publicado sin ese OK.
