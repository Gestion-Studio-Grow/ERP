# GSG Lab — Gestión Studio Grow · Laboratorio de Negocios Digitales

> **Qué es:** el **laboratorio interno** del estudio. Una célula aislada de **agentes de IA** que funciona
> como consultora propia: inventa negocios digitales para el mercado argentino, los analiza con datos
> reales, los desafía sin piedad y le trae a la dirección solo los que sobreviven, con plan de ejecución
> y de venta. Su salida es un **producto para la mesa de dirección** (el Panel de Dirección, ADR-056).
>
> **Etiqueta del desarrollo:** `GSG Lab` · **Estado:** activo (ciclo pausable por el dueño) · **Fecha:** 2026-07-07
>
> Este documento **guarda todos los agentes** del lab (su roster completo y reusable) para que el equipo no
> se pierda entre sesiones. Es la memoria del "quién" del lab; el "cómo" vive en `MOTOR-SPRINT-CICLICO.md` y
> el "qué aprendimos" en `adr/ADR-CELULA-001-metodologia-y-aprendizajes.md`.

---

## 1. Qué produce GSG Lab

- **La cartera:** 95 negocios digitales evaluados, cada uno con ficha armada como *preguntas de un dueño*
  (qué es · cómo funciona · por qué ahora · quién lo compra · cómo se vende · cuánto gano · cuánto cuesta ·
  qué puede salir mal · cómo lo pongo en marcha), costo real (dev/diseño = $0, solo lo que la IA no cubre),
  ejemplos de uso y de venta en criollo.
- **El producto para la dirección:** el **Panel de Dirección** (`panel/panel.html`), publicado en la app
  como `/operador/direccion` (plano de plataforma, ADR-056).
- **Los entregables PDF:** manual completo (con apéndice de las 95 fichas), plantillas de venta de los top 4,
  costo real de la cartera, playbook + roadmap ejecutivo. Generadores en `panel/generar-pdf-*.mjs`.
- **La memoria:** aprendizajes duros persistidos en `adr/ADR-CELULA-001`.

## 2. El roster completo — TODOS los agentes del lab

### 2.a Motor generativo (la fábrica de negocios, corre hasta que el dueño lo frena)
| Agente / célula | Función |
|---|---|
| 🎯 **PMO** | Orquesta el ciclo, integra, es el único que consolida y reporta al dueño. |
| 🛰️ **Inteligencia de Señales** (sub-célula con PMO propio) | Curador de Fuentes · Verificador/Fact-check · Analista de Señales · Traductor a Oportunidades. Noticias + boletines oficiales → briefs accionables. |
| 🎨 **Banca creativa** (varios agentes/ciclo) | Generan negocios sobre señales frescas, cada uno con un ángulo distinto (regulatorio, tech, arbitraje local, integración). |
| 📊 **Analíticos** | Filtran, dimensionan, unit economics. |
| 📊 **Ingeniería de Datos** | TAM/SAM/SOM con fuentes duras, demanda medible, método trazable. |
| 📣 **Marketing** (2) | Adquisición / canal / CAC — corre ANTES del desafiador y lo alimenta. |
| ⚔️ **Red-team (2) + Desafiador senior** | Operador real sin humo: triple filtro, deciden aptitud a producción (🟢/🟡/🔴) y perfil (💥 grande / 🌱 pasivo). |
| 📣 **Reportero ejecutivo** | Mantiene vivo el panel/tablero. |
| 🚀 **Equipo de ejecución** (con el GO) | Constructor · Diseño & Marca · Cobro & Fiscal · Growth · Operaciones. Detalle: `EQUIPO-EJECUCION.md`. |

### 2.b Squads especializados de verificación y mejora (se disparan por tanda)
| Squad | Qué hace |
|---|---|
| ⚖️ **Panel de 4 expertos** (estrategia/PMO · inversor/CFO · ejecución+GTM Argentina · claridad ejecutiva) | Revisan adversarialmente los entregables ejecutivos (playbook/roadmap) y devuelven mejoras concretas. |
| 💵 **6 analistas de costos** | Costo real por negocio (arranque + operativo + variable), dev/diseño = $0. |
| ✍️ **6 reescritores criollo** | Reescriben la solución y el ejemplo práctico en criollo (antes → después → plata). |
| 🤝 **6 vendedores** | Ejemplo de venta por negocio (a quién, canal, gancho, oferta, cierre). |
| 🧰 **4 redactores de plantillas** | Kit de arranque/venta de los top 4 (mensaje frío, guion de demo, oferta, objeciones, onboarding, landing). |
| ❓ **6 analistas de preguntas de dueño** | Campos "por qué ahora / por qué no me lo copian / qué necesito para arrancar". |
| 🔎 **Investigador de plataforma** | Ad-hoc (ej. sandbox de artifacts, viabilidad técnica). |

### 2.c Squad de activación / release (se suma a la estructura SGS)
| Agente | Rol SGS (`METODO-ROLES`) | Función |
|---|---|---|
| 🔦 **Verificación de publicación** | QA / Release | ¿Qué está publicado y qué no? Evidencia dura del estado de prod. |
| 🏗️ **Activación técnica** | Plataforma / Build | Deja la app buildeable (tsc/build verde), detecta bloqueadores. |
| 🧭 **Runbook + gates** | Ejecutivo / PMO | Paso a paso de deploy respetando Gate 1 (OK de Maxi) y las env vars. |

> El squad de activación **corre como una `/sesion-feature`** del tablero SGS: publica el Panel de Dirección
> (ADR-056), reporta con los estados canónicos (🟢/✅/🔒) y deja handoff en `docs/PROXIMOS-PASOS.md`.

## 3. Reglas del lab (invariantes)
- **Aislado:** GSG Lab no se mezcla con las demás áreas del estudio (no es el sector Agencia Digital).
- **Local hasta el OK del dueño:** todo queda local; publicar/cobrar/deploy son gates del dueño.
- **Mercado local primero**, integraciones a entes públicos como moat, salir del sesgo del modelo, resolver
  un problema real + vendible, atado a una señal fechada. Detalle en `adr/ADR-CELULA-001` §4.
- **Cadencia:** ciclo diario, corre hasta que el dueño dice "frená"; se reanuda con "seguí".

## 4. Cómo GSG Lab se conecta con SGS (la metodología del estudio)
- **Salidas para la dirección** → `/sesion-negocio` (docs al dueño) cuando entran al flujo formal.
- **Decisiones estructurales** (ej. publicar el panel como producto) → `/sesion-arquitectura` + ADR
  (ya: **ADR-056**, plano de plataforma).
- **Publicación del producto** → `/sesion-feature` con el squad de activación (§2.c), gateada por Gate 1.
- **Persistencia:** este doc (roster) + `MOTOR-SPRINT-CICLICO.md` (método) + `ADR-CELULA-001` (aprendizajes)
  + `ADR-056` (el producto en la app). Nada del lab vive solo en el chat.

## 5. Mapa de archivos
```
celula-negocios-digitales/
  GSG-LAB.md                     ← este doc (marca + roster de agentes)
  MOTOR-SPRINT-CICLICO.md         el método/motor cíclico
  EQUIPO-EJECUCION.md             el squad de ejecución (GO → primer peso)
  adr/ADR-CELULA-001-*.md         memoria y aprendizajes duros
  panel/panel.html                el producto (fuente de verdad)
  panel/generar-pdf-*.mjs         generadores de PDF (manual/plantillas/costos/cartera)
  panel/publicar-a-app.mjs        publica el panel a la app (/operador/direccion)
docs/adr/ADR-056-*.md             el Panel de Dirección como producto del control-plane
src/app/operador/(console)/direccion/   el producto vivo en la app (protegido)
```
