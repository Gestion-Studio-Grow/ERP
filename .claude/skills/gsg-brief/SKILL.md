---
name: gsg-brief
description: Entrevista guiada antes de construir cualquier pieza visual de GSG (hero, sección, landing, componente animado, escena 3D). Produce un brief en docs/briefs/ sin escribir código. Usar siempre antes de /gsg-build.
disable-model-invocation: true
argument-hint: <qué querés construir>
---
# Brief GSG

Objetivo: convertir "$ARGUMENTS" en una especificación clara. No escribas código en esta skill.

## Pasos
1. Leé DESIGN.md (si existe) y `.claude/rules/marca.md`. No preguntes nada que ya esté resuelto ahí.
2. Hacé como máximo 5 preguntas, DE A UNA, en castellano simple, y esperá cada respuesta:
   - ¿A quién le habla esta pieza y qué tiene que sentir en los primeros 3 segundos?
   - ¿Qué acción queremos que haga después (scroll, click, contacto, compra)?
   - ¿Tenés una referencia visual (URL o captura)? ¿Qué te gusta de ella y qué no?
   - ¿Qué NO tiene que parecer? (por ejemplo, "template genérico de IA")
   - ¿Dispositivo prioritario: móvil o desktop? ¿Hay contenido real o uso placeholders?
3. Escribí `docs/briefs/<slug>.md` con estas secciones:
   - **Objetivo y audiencia** (2 líneas)
   - **Tono y personalidad** (tomados de DESIGN.md más las respuestas)
   - **Criterios de aceptación verificables** (formato Dado / Cuando / Entonces), mínimo 3
   - **Restricciones de marca** (paleta, tipografía, movimiento) copiadas literalmente de DESIGN.md
   - **Movimiento**: qué se anima, por qué, y qué queda con prefers-reduced-motion
   - **Presupuesto**: Lighthouse performance ≥ 90 y accesibilidad ≥ 95; LCP < 2,5 s; CLS 0
   - **Fuera de alcance**
4. Mostrame el brief completo y preguntá: "¿Lo apruebo o cambio algo?". Terminá ahí.
