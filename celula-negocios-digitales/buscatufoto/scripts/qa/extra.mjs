import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const B='http://localhost:3100', OUT='/home/user/gsg-buscatufoto/docs/qa';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const log=(...a)=>console.log('·',...a);
for (const [tag,vp] of [['esc',{width:1440,height:900}],['390',{width:390,height:844}]]) {
const ctx=await b.newContext({viewport:vp, locale:'es-AR', acceptDownloads:true}); const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ov=async(n)=>{const r=await p.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.clientWidth]); if(r[0]>r[1]) log('DESBORDE',n,r);};
try {
  // álbum de muestra desde cero
  const t0=Date.now();
  await p.goto(B+'/a/10k-costanera-muestra'); await p.waitForFunction(()=>document.querySelectorAll('img[src^="blob:"]').length>=18,null,{timeout:120000});
  log(tag,'muestra lista en', Date.now()-t0,'ms'); await ov('muestra');
  await p.screenshot({path:`${OUT}/${tag}-10-album-muestra.png`});
  await p.locator('input[inputmode=numeric]').first().fill('1043'); await p.waitForTimeout(400);
  log('búsqueda 1043:', (await p.locator('[aria-live]').allInnerTexts()).join(' ').trim());
  await p.locator('input[inputmode=numeric]').first().fill('99999'); await p.waitForTimeout(400);
  log('búsqueda 99999:', (await p.locator('main').innerText()).match(/[^\n]*(No hay|Ninguna|no encontramos|Sin )[^\n]*/i)?.[0]);
  await p.getByRole('button',{name:/selfie/i}).first().click(); await p.waitForTimeout(400);
  log('selfie:', (await p.locator('dialog[open]').innerText()).replace(/\n+/g,' | ').slice(0,250)); await p.screenshot({path:`${OUT}/${tag}-11-selfie.png`}); await p.keyboard.press('Escape');
  // visor
  await p.locator('input[inputmode=numeric]').first().fill(''); await p.waitForTimeout(300);
  await p.locator('img[src^="blob:"]').nth(3).click(); await p.waitForTimeout(500);
  const dims=await p.locator('dialog[open] img').first().evaluate(i=>[i.naturalWidth,i.naturalHeight]); log('visor previa px', dims);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300); await p.screenshot({path:`${OUT}/${tag}-12-visor.png`}); await p.keyboard.press('Escape');
  // paquete: 3 fotos
  for (let i=0;i<3;i++) await p.getByRole('button',{name:'Agregar'}).first().click();
  await p.getByRole('button',{name:/Ver carrito/}).click(); await p.waitForTimeout(300);
  log('carrito 3:', (await p.locator('dialog[open]').innerText()).replace(/\n+/g,' | ').slice(0,400));
  await p.keyboard.press('Escape');
  // panel: cuenta de muestra, editor de marca, placa
  await p.goto(B+'/panel'); await p.getByRole('button',{name:/cuenta de muestra/}).click(); await p.waitForTimeout(1500);
  await p.goto(B+'/panel/marca'); await p.waitForTimeout(1500); await ov('marca');
  await p.getByRole('textbox',{name:'Texto',exact:true}).fill('© Estudio QA'); await p.waitForTimeout(500);
  await p.screenshot({path:`${OUT}/${tag}-13-editor-marca.png`});
  const c=await p.locator('canvas').first().evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let s=0; for(let i=0;i<d.length;i+=40) s+=d[i]; return [c.width,c.height,s]}); log('canvas marca', c);
  await p.goto(B+'/panel'); await p.waitForTimeout(800);
  await p.getByRole('link',{name:/10K de la Costanera/}).first().click(); await p.waitForTimeout(800);
  await p.getByRole('link',{name:'Compartir'}).last().click(); await p.waitForTimeout(2500); await ov('compartir');
  await p.screenshot({path:`${OUT}/${tag}-14-placa.png`, fullPage:true});
  const [dl]=await Promise.all([p.waitForEvent('download'), p.getByRole('button',{name:/Descargar placa/}).click()]);
  await dl.saveAs(`${OUT}/placa-historias.png`); log('placa', dl.suggestedFilename());
  for (const r of ['/panel/ventas','/panel/facturacion','/panel/cobros','/panel/perfil','/panel/cupones','/panel/descuentos','/panel/colaboradores','/f/estudio-de-muestra']) { await p.goto(B+r); await p.waitForTimeout(700); await ov(r); }
  await p.goto(B+'/panel/facturacion'); await p.waitForTimeout(800); await p.screenshot({path:`${OUT}/${tag}-15-facturacion.png`});
  await p.goto(B+'/f/estudio-de-muestra'); await p.waitForTimeout(800); await p.screenshot({path:`${OUT}/${tag}-16-perfil-publico.png`});
} catch(e){ log('ERROR', e.message.split('\n')[0], p.url()); await p.screenshot({path:`${OUT}/${tag}-error.png`}); }
log(tag,'pageerrors', errs);
await ctx.close();
}
await b.close();
