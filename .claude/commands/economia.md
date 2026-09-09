---
description: Modo GENERACIÓN — Fable para volumen; el juicio y el Gate se quedan en Opus (el default)
model: claude-opus-5
---

# 🏭 Modo GENERACIÓN — Fable para volumen, Opus para juicio

> ### ⚠️ Este comando cambió de significado (2026-09-09)
> Antes era **"Modo ECONOMÍA"**: ponía **Sonnet como default de ejecución** para ahorrar. **Eso quedó
> derogado por bajada del dueño** (ver `CLAUDE.md` §2 y **ADR-091**): **el default ahora es Opus y
> Sonnet salió de la factory.** El comando se conserva —no se borra— porque el nombre está en la
> memoria muscular del equipo, pero **lo que hace ahora es otra cosa**: rutear **generación de volumen**
> a **Fable**, sin tocar el juicio.

**Objetivo:** producir volumen rápido **sin degradar ninguna decisión**. No es un modo de ahorro: es un
modo de *reparto de trabajo*.

## La pregunta que decide (una sola)

> **¿Esto es DECIDIR, o es PRODUCIR lo que ya se decidió?**

- **Decidir → Opus** (`claude-opus-5`). Es el **default**: si dudás, es Opus.
- **Producir volumen ya decidido → Fable** (`claude-fable-5-1`), y **solo si lo declarás explícito**.

## Qué va a Fable (generación)
- Código largo sobre una spec ya cerrada: scaffolding, conectores, consolas, componentes repetitivos.
- Análisis extensos y documentos largos cuyo **marco y criterio ya fijó Opus**.
- Fixtures, datasets, migraciones de texto, traducciones, tareas mecánicas de volumen.

## Qué NUNCA sale de Opus
- **Arquitectura y ADRs** — límites de dominio, decisiones estructurales multi-tenant.
- **Seguridad** — RLS/aislamiento, auth, secretos, superficies expuestas.
- **Dinero / fiscal** — cobros, ARCA, representación de importes, caja, **y toda la Mesa de Dinero**.
- **Metodología / gobernanza** — reglas del sprint, estándares transversales.
- **Todo lo irreversible** — prod, Neon, deploy, migraciones.
- **El Gate de Excelencia** (ver abajo).

## 🛡️ EXCEPCIÓN DURA, NO NEGOCIABLE — la AUDITORÍA GSG siempre en Opus

**El control de calidad GSG NUNCA se degrada de modelo.** El **Gate de Excelencia completo** —Auditoría
SAP Fiori en TODOS sus ángulos + ángulo argentino + sello/estándar de Marca GSG— corre **SIEMPRE en
Opus**, sin excepción, aunque la generación del frente haya corrido en Fable.

- Si estás generando en Fable y llegás al paso de auditoría, **el Gate se corre en Opus**, sí o sí.
- Aplica a los bloques 1 y 2 del Gate **y** a la decisión de "pasa / no pasa" de todo entregable,
  incluidos los **presets** del generador por IA (gate de entrega bloqueante).
- *Por qué:* el Gate es la garantía de que nada sale por debajo del nivel GSG. Auditar con un modelo
  degradado es degradar justo donde no se debe. Referencias:
  `docs/metodologia/auditoria-sap-fiori.md`, `docs/metodologia/estandar-marca-gsg.md`.

## Cómo activarlo
Este comando corre en **Opus**, que ya es el default del proyecto (`.claude/settings.json`). Para mandar
un tramo de generación a Fable, declaralo explícito: `/model fable`, o el parámetro de modelo al
despachar el subagente. **Volvé a Opus para decidir y para auditar.** Un frente que no declara modelo
corre en Opus — y eso está bien, es el default.

> **Sonnet no es una opción.** Salió de la factory (ADR-091). Si ves una sesión o un charter que todavía
> dice Sonnet, está **fuera de norma**: corregilo antes de trabajar.
