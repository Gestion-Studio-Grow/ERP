---
description: Segundo cerebro — Fase 0 barata: foto derivada del repo + solo los guardarraíles que aplican
---

# 🧠 /brain — arranque de sesión a bajo costo

Sos la sesión que arranca. Este comando reemplaza la Fase 0 cara (leer `ESTADO-ACTUAL.md` de 44 KB +
`registro.md` de 38 KB) por la barata. **El 86% del gasto de la factory es acarreo de contexto**
(`docs/metricas/costo-uso-factory.md`), así que lo que no leés es plata que no se va.

## Procedimiento

1. **Sincronizá el vault** (cuesta cero tokens, lo corre Node):

   ```bash
   npm run brain
   ```

2. **Leé SOLO estas dos notas** (juntas pesan ~11 KB, contra ~82 KB de la Fase 0 vieja):
   - `brain/10-estado/ESTADO.md` — dónde está el repo, migraciones, drift detectado.
   - `brain/20-lecciones/000-INDICE.md` — una línea por guardarraíl.

3. **Abrí solo lo que aplica al frente.** Del índice de lecciones, abrí las notas atómicas de las
   categorías que vas a tocar — **no el registro entero**:
   - tocás prod/deploy → `PD-*`
   - tocás DB/migraciones → `DB-*`
   - tocás multi-tenant → `MT-*`
   - **tocás demos, vidrieras o fronts de cliente → `DX-*`** (es el trabajo P1 de la casa)
   - tocás auth/secretos/RLS → `SEC-*`
   - planificás/orquestás → `MP-*`

4. **Si el frente necesita decisiones**, no leas los 81 ADR: pedí la lista acotada.

   ```bash
   npm run adr:context -- <keywords del frente>
   ```

   Y recién ahí abrí el ADR completo que la lista señale. **El índice apunta, el ADR razona**
   (ADR-008): nunca te quedes con el resumen para una decisión de fondo.

5. **Escalá al territorio solo si hace falta.** `brain/` es el mapa. Si necesitás el detalle
   narrativo (el porqué histórico, el estado de un tenant, un handoff), ahí sí abrí
   `docs/ESTADO-ACTUAL.md` o el doc puntual — pero sabiendo qué buscás, no de barrido.

## Lo que el cerebro NO reemplaza (y sigue siendo obligatorio)

El vault abarata la Fase 0; **no la deroga**. Estos cuatro ítems de `CLAUDE.md` no son derivables
del repo y hay que hacerlos igual:

- **Declarar el modelo.** Fijalo explícito (`/model opus` | `/model sonnet`) según la capa del
  frente. Una sesión que arranca sin modelo declarado está **fuera de norma** (§4 del Modelo de
  trabajo) — y el default de la cuenta no cuenta como declaración.
- **Escribir tus 3-5 principios** antes de actuar (ADR-052, paso 2). Sin eso la calibración está
  incompleta por definición del propio `CLAUDE.md`, por más que hayas leído el mapa.
- **Fase 0 sectorial**, si el frente es de un sector: Agencia Digital →
  `docs/sectores/agencia-digital/FUNDAMENTO.md`; negocios propios del grupo →
  `docs/sectores/agencia-grow.md`. El cerebro cubre la Fase 0 del ERP, no la de los sectores.
- **Estado que no es derivable**: tenants vivos, gates abiertos, bugs conocidos. `ESTADO.md` te
  dice a qué sección de `docs/ESTADO-ACTUAL.md` ir; no los inventa.

> **Estatus normativo:** este comando lo propone **RFC-005**, que está **en revisión del dueño**.
> Mientras no se acepte, `CLAUDE.md` manda: si hay conflicto entre lo que dice el vault y lo que
> dice la norma, **gana la norma**.

## Si el usuario pasó una pregunta como argumento

Respondela con el mínimo contexto posible: `brain/` primero, `npm run adr:context` después, y solo
entonces el documento completo. Citá **de dónde** sacaste cada cosa (archivo y sección) para que se
pueda verificar sin releer todo.

## Reglas del vault

- **Nunca edites** `brain/10-estado/`, `brain/20-lecciones/` ni `brain/30-decisiones/`: son
  generados y se pisan en el próximo sync. Si algo está mal ahí, se arregla en la **fuente**
  (`docs/`) o en `scripts/brain-sync.mjs`.
- Conocimiento nuevo que tiene que durar va a `docs/` (ADR / lección / playbook), no al vault.
- Al cerrar el sprint, la retro (ADR-047) suma la lección al registro; el próximo `npm run brain`
  la atomiza sola.
