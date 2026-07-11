---
id: ADR-068
nivel: fundacional
dominio: [Operaciones, Seguridad]
depends_on: [ADR-040, ADR-045, ADR-049]
---
# ADR-068: Gobernanza 100%-IA con DOS gates humanos — consultor funcional y ciberseguridad (fundadores)

**Estado:** Aceptado — **fundamento de gobernanza**. Define quién firma qué en un sistema donde **la IA
construye y verifica**: dos puntos humanos de firma sobre evidencia automática.
**Fecha:** 2026-07-10
**Depende de:** ADR-040 (Gate de Excelencia, corre en Opus), ADR-045 (Advisory + Challenger), ADR-049 (RACI:
dueño aprueba, arquitecto ejecuta/eleva)
**Relacionado:** ADR-064 (invariantes I1–I7 que firma el funcional), ADR-062/066/067 (superficie que firma
seguridad), ADR-047 (retro), ADR-048 (reversible/irreversible) · `CLAUDE.md` (Gate)

---

## Contexto

El desarrollo es **100%-IA**: la IA diseña, construye, testea y audita (el Gate de Excelencia corre en Opus,
ADR-040). Eso genera velocidad y consistencia, pero también un riesgo: **¿quién es el humano responsable de lo
que no se puede delegar a un modelo** — la validez funcional/fiscal de un proceso de negocio y la postura de
ciberseguridad? El sistema ya tiene tensión estructurada (Advisory/Challenger, ADR-045) y un Gate automático,
pero faltaba fijar los **puntos humanos de firma** y su alcance, para que "100%-IA" no signifique "sin
responsable humano" en lo caro/irreversible.

## Decisión

La gobernanza es **100%-IA con DOS gates humanos** —ambos **fundadores**— que **firman invariantes sobre
evidencia que la IA produce**; la IA construye y verifica **dentro** de esos gates:

1. **Gate humano FUNCIONAL — el consultor funcional (fundador).** Firma que el proceso de negocio es **correcto
   y fiscalmente válido**: el alcance de cada módulo (spec lean, ADR-065), y los **invariantes del núcleo
   transaccional I1–I7** (ADR-064) — sobre los **tests** que la IA corre, no sobre promesas. Sin su firma, un
   proceso de plata/fisco no se da por "cumple".
2. **Gate humano de CIBERSEGURIDAD — Facundo (fundador).** Firma la **postura de seguridad**: aislamiento/RLS
   (ADR-062), credenciales por tenant y custodia del certificado fiscal (ADR-066), cumplimiento/DR (ADR-067),
   rotación de secretos. Sobre la evidencia automática (gate:rls sin drift, auditorías), pone el **juicio
   humano** en lo que un check no decide (riesgo aceptable, prioridad de un rojo).

**Reglas:**
- **La IA construye y verifica DENTRO de los gates**: produce la evidencia (tests, invariantes, auditorías,
  el Gate ADR-040 en Opus); los dos fundadores **firman sobre esa evidencia**. No se reemplazan — se apoyan.
- **Firma sobre evidencia, no sobre opinión**: cada firma se ancla en artefactos verificables (tests I1–I7,
  gate:rls, reporte de auditoría) — coherente con ADR-071 ("nada listo sin artefacto + evidencia").
- **Encaja en el RACI** (ADR-049): el **dueño aprueba** los irreversibles; estos dos gates son la **firma
  experta** que habilita esa aprobación en lo funcional/fiscal y en seguridad.
- **La tensión Advisory/Challenger** (ADR-045) precede a la firma en decisiones estratégicas; los dos gates
  firman la **ejecución**.

> **En una línea:** *la IA hace y prueba todo; dos humanos fundadores firman lo indelegable —que el negocio/
> fisco cierra (consultor funcional) y que la seguridad aguanta (Facundo)— sobre la evidencia que la IA generó.*

## Consecuencias

- **(+)** **Responsabilidad humana clara** en lo caro/irreversible sin frenar la velocidad de la IA: dos firmas
  acotadas, no revisión humana de todo.
- **(+)** **Firma sobre evidencia** → las firmas son verificables y auditables (tests, gate:rls), no un "confío".
- **(+)** Separa los dos juicios que **no** son el mismo (validez de negocio/fisco ≠ postura de seguridad) →
  cada fundador firma lo suyo.
- **(−)** Los dos gates son **cuello humano** para lo que firman: hay que mantener la evidencia lista y legible
  para que la firma sea rápida (la IA prepara el paquete de evidencia).
- **(−)** Riesgo de **firma-sello** (firmar sin mirar) si la evidencia no es clara → se mitiga exigiendo
  artefactos concretos por firma (I1–I7 verdes, gate:rls sin drift) y la retro (ADR-047).

## Alternativas descartadas

- **100%-IA sin gate humano** ("el Gate en Opus alcanza"). El Gate automático es necesario pero no es
  **responsable** de la validez fiscal ni de aceptar un riesgo de seguridad. Rechazada: lo indelegable necesita
  firma humana.
- **Revisión humana de TODO lo que produce la IA.** Mata la ventaja de velocidad y es inviable a escala.
  Rechazada: firma acotada a invariantes/postura, no a cada línea.
- **Un solo gate humano generalista.** Mezcla dos juicios distintos (negocio/fisco vs. seguridad) en una
  persona/rol → uno de los dos se descuida. Rechazada: dos gates especializados.

— Elaborado por GSG (PMO / Arquitecto de Solución — fundamento de gobernanza, reversible/doc-only)
