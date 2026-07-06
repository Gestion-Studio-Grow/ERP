# Kudos

Gestión de reseñas en piloto automático para pymes hispanohablantes. Capturamos reseñas cumpliendo
la política de Google y **respondemos el 100%** con la voz de la marca. Producto validado por la
célula (Ronda 2, score 8/10 — el de mejor margen: 90–95%).

- **`SPEC.md`** — MVP: captación anti-gating (QR + WhatsApp), generador, tablero, kit de voz de marca.
- **`ARQUITECTURA.md`** — stack, integración GBP + WhatsApp + Claude Sonnet, modelo de datos, costos.
- **`PLAN.md`** — milestones hasta el primer local pagando + cómo se demuestra el ROI.
- **`src/`** — el corazón: dado (reseña + voz de marca) genera la respuesta apropiada.

## Correr la demo del corazón (offline, sin API key ni npm install)

```bash
npx tsx src/examples.ts
```

Muestra el ruteo distinto para 1★ vs 5★, el escalado de temas sensibles a humano, y los guardarraíles.

## Estructura de `src/`

| Archivo | Rol |
|---|---|
| `types.ts` | Tipos: `Review`, `BrandVoice`, `ResultadoRespuesta`. |
| `classify.ts` | Ruteo por estrellas (negativa/neutra/positiva). |
| `sensitive.ts` | Detección de temas sensibles → escalado a humano. |
| `promptBuilder.ts` | System prompt (voz de marca, cacheable) + user prompt (reseña). |
| `guardrails.ts` | Validación de salida; degrada a revisión humana ante dudas. |
| `reviewResponder.ts` | **El corazón** — orquesta todo. |
| `llm.ts` | Interfaz `LLM` + `MockLLM` (demo offline). |
| `anthropicClient.ts` | Implementación de referencia real con Claude Sonnet + prompt caching. |
| `policy.ts` | Lint anti-gating del copy de captación (política de Google). |
| `examples.ts` | Demo ejecutable input→output. |

Prototipo aislado: no toca el ERP, no usa git, no se despliega.
