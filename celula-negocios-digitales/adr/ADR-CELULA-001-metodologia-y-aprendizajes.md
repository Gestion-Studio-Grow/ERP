# ADR-CÉLULA-001 — Metodología y aprendizajes de la Célula de Negocios Digitales

- **Estado:** Aceptado (vivo — se actualiza al cierre de cada ciclo) · **Fecha:** 2026-07-06
- **Ámbito:** Célula de Negocios Digitales (aislada del resto del estudio; local, sin publicar hasta OK del dueño)
- **Autor:** PMO de la célula

> **Por qué este ADR:** para **no volver a recordar todo de memoria**. Acá queda persistida la
> experiencia acumulada —cómo trabaja la célula, qué equipos la componen, las bajadas de línea del dueño
> y, sobre todo, los **aprendizajes duros pagados con análisis reales**— para que cada ciclo arranque
> parado sobre lo anterior y dé mejores resultados. Es la **memoria de la célula**.

---

## 1. Contexto
La compañía abrió una célula aislada para que un equipo de agentes funcione como **consultora interna**:
inventa negocios digitales construibles con Claude Code, los analiza con datos reales, los desafía y le
trae al dueño solo los que sobreviven, con plan de ejecución. El dueño está en la cúspide (visión +
gates). Todo local hasta su OK explícito.

## 2. Decisión — el MOTOR (sprint cíclico, diario, hasta que el dueño lo frene)

```
   VISIÓN DEL DUEÑO (prioriza, marca dirección, gatea dev y publicación)
        │
        ▼
 ① INTELIGENCIA+BOLETINES → ② CREATIVOS → ③ ANALÍTICOS + INGENIERÍA DE DATOS
    (noticias/legislación)     (sobre señales)   (dimensionan+costean, fuentes)
        → ④ MARKETING analiza TODOS (adquisición/canal/CAC) — input del desafiador
        → ⑤ RED-TEAM + DESAFIADOR (triple filtro; aptitud a producción, índice, perfil 💥/🌱)
        → ⑥ REPORTERO (refresca tablero) → ⑦ DUEÑO gatea
   En paralelo: ⑦ EQUIPO DE EJECUCIÓN construye lo que el dueño manda a producción.
```

- **Cadencia diaria** (no semanal: el pipeline debe fluir; regla anti-desperdicio: si un día no hay nada
  genuinamente nuevo y bueno, se dice y no se mete relleno).
- **Coordinación por el repo, no por el chat.** Cada resultado queda en `celula-negocios-digitales/`.
- **Corre hasta que el dueño diga "frená"** (se pausa el trigger); se reanuda con "seguí".

## 3. Estructura de equipos (roster)
| Célula / rol | Función |
|---|---|
| 🎯 **Dueño** (cúspide) | visión, prioridad, gates (dev / publicar / cobrar dinero real) |
| 🎯 **PMO** global | orquesta, integra, único que consolida y reporta |
| 🛰️ **Célula de Inteligencia de Señales** (PMO experto propio) | Curador de fuentes + Verificador/Fact-check + Analista + Traductor a oportunidades. Noticias confiables → briefs accionables. `inteligencia-senales/FUNDAMENTO.md` |
| 🎨 **Banca creativa** (varios agentes/ciclo) | generan sobre señales frescas, ángulos distintos (regulatorio, tech, arbitraje local, integración) |
| 📊 **Analíticos** | filtran, dimensionan, unit economics |
| 📊 **Ingeniería de Datos** | TAM/SAM/SOM con fuentes duras, demanda medible, método trazable |
| ⚔️ **Red-team (2)** + **Desafiador senior** | operador real (sin humo): nombran desafíos, deciden aptitud a producción |
| 📣 **Reportero ejecutivo** | mantiene `STATUS-NEGOCIOS.md` y `panel/status-data.json` (autocontenido) |
| 🚀 **Equipo de ejecución** (con el GO) | Constructor · Diseño & Marca · Cobro & Fiscal · Growth · Operaciones. `EQUIPO-EJECUCION.md` |

## 4. Bajadas de línea del dueño (mandan sobre la generación)
1. **Mercado LOCAL argentino primero** — capacidad real de pago, WhatsApp, informalidad, estacionalidad.
2. **Integraciones a entes PÚBLICOS (ARCA/AFIP, ANSES, RENAPER, PAMI, BCRA, municipios, registros) y
   PRIVADOS (bancos, billeteras, cámaras, MercadoLibre) = el MOAT.**
3. **Salir del sesgo del modelo** — nada obvio (chatbot/wrapper/dashboard/agencia). Innovar de verdad:
   contrarian, segundo orden, arbitrajes locales. Novedad CON sustancia.
4. **Resolver un problema real de la sociedad + vendible** — impacto y plata van juntos.
5. **Creativos se nutren de la actualidad** — cada idea ata a una noticia/cambio regulatorio/tendencia
   real y fechada.
6. **Desafiador con rango ampliado** — se permiten negocios de retorno lento, sustentable y de ingresos
   pasivos (12–18 meses OK). Descartar SOLO por razones reales (sin demanda, sin moat, competidor local
   ya lo tiene, unit economics negativos, dependencia fatal de plataforma), nunca por "es lento/pasivo/chico".
7. **Números siempre en pesos** al dólar oficial BNA del día (y USD entre paréntesis).

## 5. Aprendizajes duros (la parte más valiosa — no repetir errores)
- **Validar competencia LOCAL antes de puntuar alto.** El "hueco en español / no existe en AR" hay que
  PROBARLO — mató VetVoz (QVET Escriba/SmartVet), Recepcionista (Mi Agenda Profesional), GremioPro
  (Tutti/Timbrit), Mercader (ML con IA nativa), y varios más. Es el error #1.
- **Lo conversacional/voz se cobra POR USO, nunca flat.** La voz cuesta 15–30× el texto
  (US$0,13–0,31/min) → funde el margen si se vende plano.
- **El costo real no es construir (barato con Claude Code): es DISTRIBUIR/vender.** El mercado casi nunca
  es el cuello (la ingeniería de datos lo confirmó: break-even = fracción ínfima del SAM en casi todos).
- **Ads sobre tráfico argentino no alcanza** (RPM Tier 3, US$2–8) → hace falta afiliado/producto/sponsor.
- **AI Overviews de Google mataron el SEO informativo** (CTR −34/−61%) → lo defendible es
  transaccional/local/datos propios, no contenido informativo.
- **Churn pyme 3–7%/mes** (43% de bajas en los primeros 90 días) → los LTV optimistas se ajustan; el moat
  que baja el churn vale oro.
- **Cobrar USD desde AR se liberó en 2025** (exportación de servicios, sin tope) → vender global es más fácil.
- **La integración con un ente público que vuelve tu formato "el que el organismo espera" dispara el
  switching cost** — es el mejor moat disponible (ej. Testigo con bromatología; ADR de oportunidad).
- **Regla de foco vertical:** verticales de padrón chico (ej. control de plagas 3–6k) dan el break-even
  pero capan el techo → crecer exige abrir rubros.

## 6. Instrumentos que quedan
- **Índice de Factibilidad Real (0–100):** validación + producto construido + camino a cobrar + riesgo.
  Ordena el leaderboard del panel.
- **Aptitud a producción:** 🟢 a producción / 🟡 en pista (con condición) / 🔴 no (razón real).
- **Runbook de ejecución (GO → primer peso):** GO del dueño → producto listo → marca+landing → cobro
  activo → lanzamiento → operar. Gates: **publicar = OK del dueño**, **cobrar dinero real = OK del dueño**.
- **Panel del dueño** (`panel/`) + **tablero** (`STATUS-NEGOCIOS.md`) como memoria viva y vista ejecutiva.

## 7. Consecuencias
- **A favor:** memoria acumulativa reproducible; cada ciclo parte de lo aprendido; menos errores repetidos;
  el dueño mantiene control con visibilidad; onboarding de cualquier agente nuevo leyendo este ADR.
- **En contra / a vigilar:** costo de tokens del ciclo diario (mitigado con la regla anti-relleno);
  riesgo de que el ADR quede desactualizado (mitigación: **es un doc vivo, se actualiza al cierre de cada
  ciclo** con los aprendizajes nuevos).

## 8. Seguimiento
- Este ADR se **revisa y amplía al cierre de cada ciclo** (el Reportero suma los aprendizajes nuevos).
- Cuando el dueño lo decida ("luego vemos"), se evalúa **ratificar la célula y esta metodología como ADR
  formal del estudio** (integrándola a `docs/adr/INDEX.md`), hoy mantenida aislada y local.
