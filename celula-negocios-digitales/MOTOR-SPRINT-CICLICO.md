# MOTOR — Sprint cíclico de la célula

> **PMO · 2026-07-06.** El dueño pidió que la célula funcione como un **sprint cíclico permanente**:
> analizar → entregar → desafiar → (visión del dueño) → repetir, mientras el desarrollo corre en
> paralelo sobre lo validado. **El dueño está en la cúspide: aporta la visión y gatea.** Todo local,
> sin publicar, hasta su OK.

## El ciclo (una vuelta = un sprint)

```
        ┌─────────────────────────── VISIÓN DEL DUEÑO ───────────────────────────┐
        │  (prioriza, marca dirección, gatea qué pasa a dev y qué se publica)     │
        ▼                                                                          │
  ①  GENERAR + ANALIZAR ──▶ ②  DESAFIAR (red-team) ──▶ ③  ENTREGAR al dueño ──────┘
     creativos + analíticos      R1 mercado + R2 plata      resumen ejecutivo con
     (capa horizontal)           intentan matar cada idea    números + recomendación

  En paralelo, siempre:  ④  DESARROLLAR lo que el dueño ya validó (devs, aislado, local)
```

1. **Generar + Analizar (horizontal):** creativos divergen ideas nuevas; analíticos filtran, dimensionan
   y costean con research real y fuentes. Mismo nivel, no apilados.
2. **Desafiar (red-team de 2):** R1 ataca mercado/demanda/moat; R2 ataca plata/ejecución. Solo pasa lo
   que sobrevive.
3. **Entregar al dueño:** resumen ejecutivo con números (build, COGS, precio, margen, break-even) y una
   recomendación clara. **Este es el punto de contacto con el dueño.**
4. **Visión del dueño (la cúspide):** el dueño prioriza, marca dirección para el próximo ciclo, y **gatea**
   qué pasa a desarrollo y qué se publica. Su visión alimenta el ciclo siguiente.
5. **Desarrollar (en paralelo):** los devs construyen los MVP validados, aislados y locales, hasta el
   primer peso. No esperan al próximo ciclo de research.

## Roles
- **🎯 Dueño (cúspide):** visión, prioridad, gates (dev / deploy). No ejecuta; dirige.
- **🎯 PMO:** orquesta el ciclo, integra, es el único que consolida y reporta al dueño.
- **🎨 Creativos + 📊 Analíticos:** la capa horizontal de generación+análisis.
- **⚔️ Red-team (2):** el filtro adversarial antes de cada entrega.
- **🛠️ Desarrolladores:** construyen lo validado, en carpetas aisladas (`productos/<slug>/`).

## Cadencia
- **1 sprint / semana** por defecto (configurable). Se dispara con un **trigger recurrente** que reabre
  el ciclo y reporta al dueño. **Pausable en cualquier momento** (decilo y lo freno).
- Cada ciclo **no repite** negocios ya cubiertos: busca ángulos nuevos o profundiza sobrevivientes.

## Reglas permanentes (aprendidas en los ciclos 1-2)
- **Validar competencia LOCAL antes de puntuar alto** — el "hueco en español" hay que probarlo (así
  murieron 4 negocios en la ronda 2).
- **Todo lo conversacional/voz se cobra por USO**, nunca flat (la voz cuesta 15-30× el texto).
- **Ads sobre tráfico argentino no alcanza** (RPM Tier 3) — hace falta afiliado/producto/sponsor.
- **El costo real no es construir (barato con Claude Code), es DISTRIBUIR/vender.**
- **Local sin publicar** hasta OK explícito del dueño. Gates de deploy/DB siguen vigentes.

## Estado del motor
- **Ciclo 1 (ronda 1):** 12 negocios → portfolio + recomendación.
- **Ciclo 2 (ronda 2):** 23 ideas → 10 finalistas → red-team → 2 sobrevivientes limpios + 2 comodines.
- **Desarrollo activo (kickoff 2026-07-06):** Plantillería, Testigo, Kudos, Fantasma (`productos/`).
- **Próximo ciclo:** disparado por el trigger semanal; el dueño marca la dirección al recibir la entrega.
