# Unboxing Fest · cómo se publica

Publicados en `public/juegos/unboxingfest/` el 17/11/2026, con la autorización de `AUTORIZACION-MARCA.md`.
La raíz de `unboxingfest.gsgapp.com.ar` va a la portada (`src/lib/producto-host.ts`); el comodín `*.gsgapp.com.ar`
ya está en el proyecto `erp-ch` de Vercel, así que no hace falta agregar el dominio.

**Fase 1 (esta publicación):** el link muestra la cuenta regresiva y «Agendalo» hasta que abre la ventana
(5/12 10:00, provisional). Con `?demo=1` se puede jugar para mostrarlo, pero el código sale `DEMO-…`, no tiene premio
y no se manda nada a la planilla.

**Fase 2 (antes del 5/12, una publicación más):**
1. Instalar la planilla (guía § 4) y completar en cada juego `endpoint` y `endpointToken`.
2. Cambiar `pin` y `codeSalt` (guía § 5) y cargar `waMarca` con el número de la marca.
3. Volver a copiar los 3 juegos a `public/juegos/unboxingfest/` y publicar.
