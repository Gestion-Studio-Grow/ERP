# Código frontend (siempre cargado)
- Componentes pequeños con una responsabilidad. Sin props booleanas en cadena: preferí composición. Sin abstracciones prematuras ni código defensivo de más.
- Datos: nunca cascadas de fetch en cliente; en Next, server components por defecto.
- Sin dependencias nuevas sin preguntar. Sin código copiado de ejemplos sin adaptar.
- Nombres en inglés, textos visibles en el idioma del sitio, sin strings hardcodeados si hay i18n.
- Accesibilidad: foco visible, contraste AA, alt en imágenes, navegación por teclado (se tilda en el bloque 1 del Gate de Excelencia).
- Performance en piezas visuales entregadas: Lighthouse performance ≥ 90 y accesibilidad ≥ 95; LCP < 2,5 s; CLS 0.
- Verificación: `npm run gates` · `npx tsc --noEmit` · `npm test` · `npm run build`. Tests donde haya lógica; para UI, QA clic por clic con el agente `qa` y capturas con `visual-verifier` (Playwright).
- Cada commit/PR: qué cambió, cómo se verificó, capturas.
