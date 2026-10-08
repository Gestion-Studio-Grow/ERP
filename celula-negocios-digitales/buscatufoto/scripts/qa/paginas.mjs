import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const B='http://localhost:3100', OUT='/home/user/gsg-buscatufoto/docs/qa';
const rutas=['/','/funciones','/calculadora','/preguntas','/blog','/blog/nombrar-archivos-dorsal','/terminos','/privacidad','/nosotros','/contacto','/panel','/a/no-existe','/f/nadie','/xyz'];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
for (const [vn,vp] of [['esc',{width:1440,height:900}],['390',{width:390,height:844}]]) {
  const ctx=await b.newContext({viewport:vp, locale:'es-AR'}); const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  for (const r of rutas) {
    const resp=await p.goto(B+r,{waitUntil:'networkidle'}); await p.waitForTimeout(400);
    const ov=await p.evaluate(()=>{const w=document.documentElement.clientWidth; const bad=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect(); return r.right>w+1 && r.width>0 && getComputedStyle(e).position!=='fixed'}).slice(0,3).map(e=>e.tagName+'.'+String(e.className).slice(0,40)); return {sw:document.documentElement.scrollWidth,w,bad, h1:document.querySelector('h1')?.innerText}});
    console.log(vn,r,resp.status(),ov.sw>ov.w?'DESBORDE '+ov.sw+' '+ov.bad.join(','):'ok', '|', ov.h1);
    if (['/','/calculadora','/funciones','/panel'].includes(r)) await p.screenshot({path:`${OUT}/${vn}-${r==='/'?'inicio':r.slice(1).replace(/\//g,'-')}.png`, fullPage:r==='/'});
  }
  console.log(vn,'errores:',errs.slice(0,5));
  await ctx.close();
}
// tema claro
const ctx=await b.newContext({viewport:{width:1440,height:900}}); const p=await ctx.newPage();
await p.goto(B+'/'); await p.getByRole('button',{name:/Cambiar a tema claro/}).click(); await p.waitForTimeout(300);
await p.screenshot({path:`${OUT}/esc-inicio-claro.png`,fullPage:true}); console.log('tema', await p.evaluate(()=>document.documentElement.dataset.tema));
await p.reload(); console.log('tema tras recargar', await p.evaluate(()=>document.documentElement.dataset.tema));
await b.close();
