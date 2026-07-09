---
id: C-003
titulo: Modelo SaaS
nivel: constitucional
tipo: indice-puntero-inmutable
apunta_a: [docs/estrategia/costos-por-segmento.md, docs/estrategia/roadmap-dos-modelos.md, ADR-007, ADR-030]
---

# C-003 · Modelo SaaS

> **Índice-puntero INMUTABLE (Nivel 0).** Cristaliza lo no-negociable del **modelo de negocio SaaS**. **No
> reescribe** las fuentes — apunta a ellas. Enmienda: Advisory → Challenger (ADR-045) → OK dueño ([README](README.md)).

## Fuente de verdad (leer el cuerpo completo ahí)
- **`docs/estrategia/costos-por-segmento.md`** — el costo real de bolsillo por segmento (micro/pyme/enterprise),
  con confiabilidad incluida; **§4: la mano de obra humana es el límite real**, no la plata.
- **`docs/estrategia/roadmap-dos-modelos.md`** — los hitos M0–M5 para bajar los dos modelos (Comercio/Empresa) a
  producto vendible.
- **ADR-007** (`analisis-financiero`) — economía a 1 / 100 / 1.000 clientes; punto de decisión de réplicas.
- **ADR-030** (`ciclo-demo-venta-inversion`) — **no se invierte hasta vender**: demo gratis sin datos reales; la
  venta dispara la inversión; los secretos los pega el dueño (FASE 2, ADR-041).

## Lo no-negociable (cristalizado)
1. **No-invertir-hasta-vender** (ADR-030): nada de infra/gasto/§C especulativo; la venta concreta lo dispara.
2. **Self-serve como condición de rentabilidad**: el micro solo rinde auto-servible (preset-IA, ADR-034); el día
   que exige mano de obra dedicada, deja de rendir.
3. **La mano de obra humana es el recurso escaso con techo** (`costos §4`): cada cliente que exige atención
   significativa se **advierte** y se decide capacidad **antes** de comprometer.
4. **Tres segmentos, un solo Core**: micro (Comercio) y pyme (Empresa) comparten producto (ver C-004); enterprise
   dedicado solo cuando la venta lo paga.

## Cómo se enmienda
Advisory → Challenger (ADR-045) → OK del dueño → edición **aditiva** ([README](README.md)).

_Enmiendas: (ninguna todavía)._
