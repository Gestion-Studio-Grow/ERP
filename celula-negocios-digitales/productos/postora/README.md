# Postora

**El community manager con IA del comercio de barrio.** Arma el plan de contenido del mes en la voz de la
marca, ata cada posteo a una acción medible (WhatsApp taggeado / código de promo), y a fin de mes entrega
el **Reporte de Resultados**: conversaciones y ventas atribuidas. Suscripción Mercado Pago US$29–59/mes.

> #1 del roadmap de la Célula de Negocios Digitales. Este es el MVP: SPEC + ARQUITECTURA + PLAN + código
> núcleo funcionando + demo offline navegable. Corre **sin secretos y sin gastar tokens de producción**.

## Correr la demo (offline, cero dependencias)

Requiere Node 22+/24 (ejecuta TypeScript directo).

```bash
npm run demo        # genera un plan mensual, muestra COGS por modelo, margen y el Reporte de Resultados
npm test            # 28 tests (node:test) — routing, planes, generador, métricas
npm run typecheck   # tsc --noEmit
```

**Demo web navegable:** abrí `demo-web/index.html` en el navegador (todo inline, sin datos reales, sin
secretos). Publicable a costo cero (ver `docs/PROXIMOS-PASOS.md` → §C runbook).

## Mapa del código (`src/`)

| Archivo | Qué es |
|---|---|
| `tipos.ts` | Dominio: Kit de Marca, brief, posteo, CTA rastreable, plan, uso de tokens. |
| `routing.ts` | **Model routing + motor de COGS.** Tarifas, ruteo Haiku/Sonnet, kill-switch. El blindaje de margen. |
| `planes.ts` | Pricing: tiers con **tope de posteos + excedente + créditos de imagen**. Cálculo de factura y margen. |
| `marca.ts` | Kit de Marca de ejemplo (rotisería demo) + plantillas brandeadas. Datos ficticios. |
| `llm.ts` | Interfaz `LLMCliente` + **mock determinista offline** (sin red, sin secretos). |
| `llm-claude.ts` | Implementación real (Haiku + Sonnet, prompt caching, structured outputs). **Excluida del build** — cablearla es §C. |
| `generador.ts` | **El corazón:** genera el plan mensual en voz de marca con CTA rastreable y COGS medido. |
| `metricas.ts` | Atribución por tag + **Reporte de Resultados** (el antídoto al churn). |
| `demo.ts` | Demo ejecutable del corazón. |
| `*.test.ts` | Tests con `node:test`. |

## Las tres reglas que hacen que Postora exista (y no muera como "otro generador")

1. **El diseño/curaduría del estudio ES el producto** → el Kit de Marca manda cada posteo (moat vs Canva/Meta).
2. **Unit economics blindados desde el día 1** → routing Haiku/Sonnet + prompt caching + tope de posteos +
   imagen IA por crédito + kill-switch. **Nunca flat sobre un agente sin límite.**
3. **Ata el contenido a plata** → CTA rastreable por posteo + Reporte de Resultados con ventas atribuidas.

— Elaborado por GSG.
