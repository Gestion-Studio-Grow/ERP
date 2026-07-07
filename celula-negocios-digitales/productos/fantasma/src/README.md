# Fantasma — scaffold del corazón

Prototipo aislado y local del agente "turno noche de WhatsApp". Cero dependencias para correr la demo.

## Correr la demo (offline, con LLM mock)

```bash
node --experimental-strip-types src/demo.ts
# o, con package.json:  npm run demo
```

Muestra: conversación fuera de horario (input→output), COGS medido de esa conversación, y la
proyección mensual de factura + margen con el pricing por uso (tope + excedente).

## Typecheck

```bash
npx tsc --noEmit    # o: npm run typecheck
```

## Estructura

| Archivo | Rol |
|---|---|
| `tipos.ts` | Modelo de dominio (Cliente, Conversación, Ticket, UsoLLM, DecisionTurno…). |
| `planes.ts` | Pricing por uso: planes con tope + excedente y cálculo de factura/margen. |
| `cogs.ts` | Motor de COGS: tokens de Claude Sonnet → US$ (con prompt caching). |
| `llm.ts` | Interfaz `LLMCliente` + `LLMMock` determinista (para correr offline). |
| **`agente.ts`** | **EL CORAZÓN**: máquina de estados + límites de margen + registro de COGS. |
| `guion-ejemplo.ts` | Cliente faro de ejemplo (barbería): guion + catálogo + agenda. |
| `demo.ts` | Demo ejecutable (conversación simulada + COGS + proyección). |
| `llm-claude.ts` | Implementación real con Claude Sonnet (excluida del build; requiere `@anthropic-ai/sdk`). |

## Pasar a producción (Claude Sonnet real)

```bash
npm install @anthropic-ai/sdk
export ANTHROPIC_API_KEY=...      # o `ant auth login`
```

Quitar `src/llm-claude.ts` del `exclude` en `tsconfig.json`, instalar `@types/node`, borrar
`globals.d.ts`, y en el runtime usar `new LLMClaude()` en vez de `new LLMMock()`. El COGS real se lee
de `response.usage` (input / cache_read / output) — misma cuenta que el motor de `cogs.ts`.

> Las integraciones externas (WhatsApp Cloud API, Mercado Pago, agenda) están como contratos/placeholders.
> Ver `ARQUITECTURA.md §6`.
