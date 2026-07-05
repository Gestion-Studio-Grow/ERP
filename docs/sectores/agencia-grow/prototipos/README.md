# Prototipos de concepto — Agencia Grow

Mockups visuales que bajan el **concepto Grow** (ADR-030) a pantalla. Son **prototipos de concepto en
sandbox** para alinear la visión y vender la idea — **no** son producto en producción, **no** tocan
prod/Neon/deploy ni están cableados a datos reales.

## `consola-grow.html` — la Consola Grow (v1)

El *cockpit* del dueño que encarna el concepto: **su patrimonio creciendo en automático**. HTML
standalone (abrilo directo en el navegador; tema claro/oscuro). Secciones:

- **Patrimonio proyectado** — cifra + curva de ingreso recurrente en construcción (dato de muestra).
- **Negocios automatizados** — online o físico (CH Estética vivo · Magra en obra · arca online · ERP self-serve).
- **La máquina** — el stack propio corriendo (Mercado Pago · ARCA · ERP · Panel del Dueño · WhatsApp).
- **Agentes expertos** — un experto por área operando como agente (1 disciplina = 1 sesión, ADR-008).
- **El negocio te habla** — insights en lenguaje llano (Panel del Dueño) + teaser de benchmarking (ADR-027).

**Para desarrollarlo de verdad:** la parte real es el **Panel del Dueño** (motor `src/lib/owner-insights.ts`
ya construido y testeado; falta la pantalla — `/sesion-feature`, ver `PROXIMOS-PASOS.md`). Esta consola es
la referencia visual de a dónde va esa pantalla y cómo se presenta el concepto Grow al dueño.

> Datos de muestra, no reales. Marco: ADR-028 (gobierno) · ADR-029 (pricing/planes) · ADR-030 (identidad).
