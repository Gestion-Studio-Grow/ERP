# ADR-045: Advisory Board + Challenger (contrarian) — tensión productiva tesis/antítesis antes de adoptar un fundamento

**Estado:** Aceptado — vigente (gobernanza de decisiones estratégicas)
**Fecha:** 2026-07-06
**Modelo:** **Sonnet 5 por defecto** (ultra-ahorro); escala a **Opus** a pedido del dueño o en el tramo crítico
**Depende de:** ADR-008 (decisiones cerradas → ADR), ADR-032 (economía de modelos / escalada puntual a Opus)
**Relacionado:** ADR-040 (Gate de Excelencia — misma lógica de "valla antes de adoptar"), ADR-039 (metodología), ADR-048 (Arquitecto de Solución — ejecuta lo reversible, eleva/sugiere cuándo algo necesita esta valla)
**Referenciado desde:** `CLAUDE.md` → "Advisory Board + Challenger"
**Charter operativo:** `docs/organizacion/advisory-board-challenger.md`

---

## Contexto
Las **decisiones estratégicas** de GSG —bases/fundamentos, roadmap, **segmentación de mercado
(low / mid / big)**, estrategia de escala— las propone un **Advisory Board** de alto nivel. El riesgo de un
board que **solo confirma** es real y caro: **groupthink**, sesgo de confirmación, supuestos no examinados
y modos de falla que se descubren **tarde**. Falta una fuerza **estructural** —no dependiente del ánimo ni
de la buena voluntad— que **estrese cada propuesta antes de adoptarla como fundamento**.

## Decisión
GSG institucionaliza un par **tesis / antítesis** para toda decisión estratégica:

- **Advisory Board (tesis) — PROPONE.** Panel de asesores de alto nivel que produce las propuestas
  estratégicas (bases/fundamentos, roadmap, segmentación low/mid/big, estrategia de escala) **con rigor y
  evidencia**.
- **Challenger / Contrarian (antítesis) — DESAFÍA.** Un agente con los **mismos skills de alto nivel** pero
  **postura OPUESTA** (abogado del diablo / red-team). Para **cada** propuesta del Advisory presenta —**con
  el mismo rigor**— el **caso contrario**, los **riesgos**, los **supuestos débiles / no examinados**, los
  **modos de falla** y las **alternativas**. No es un "sí, pero" decorativo: su trabajo es **intentar
  refutar** la propuesta.
- **Flujo:** **Advisory PROPONE → Challenger DESAFÍA → SÍNTESIS / DECISIÓN del dueño.** El dueño decide con
  **tesis y antítesis sobre la mesa**.
- **Regla dura:** **nada se adopta como fundamento sin pasar por el Challenger.** Es el equivalente
  estratégico del Gate de Excelencia (ADR-040): una valla obligatoria antes de que algo se vuelva canon.
- **Modelo (economía):** corre en **Sonnet 5 por defecto** (el debate es texto/juicio acotado y de alto
  volumen → ultra-ahorro); **escala a Opus** solo cuando **el dueño lo pide** o el tramo lo amerita
  (coherente con ADR-032: empezar barato, escalar al tramo crítico).

## Consecuencias
- **(+)** Decisiones estratégicas **más robustas**: la tensión tesis/antítesis **mata los supuestos
  frágiles antes** de que sean caros; se evita groupthink y sesgo de confirmación de forma **estructural**.
- **(+)** **Barato por default** (Sonnet) sin sacrificar rigor; el costo de la antítesis es bajo frente al
  costo de un fundamento equivocado adoptado.
- **(−)** Agrega un **paso deliberado de fricción** antes de adoptar un fundamento; exige que el Challenger
  sea **genuinamente adversarial** (si se vuelve complaciente, pierde todo el valor — es su único fracaso posible).
- **Documentado / referenciado en:** `CLAUDE.md` (metodología). Complementa ADR-008 (la síntesis adoptada
  se persiste como ADR) y ADR-032 (asignación/escalada de modelo).

## Estado
**Aceptado — vigente.** Gobernanza de toda decisión estratégica de GSG. Default Sonnet; el dueño puede
subirlo a Opus cuando la decisión lo justifique.
