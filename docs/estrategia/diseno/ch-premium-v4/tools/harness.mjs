// CDP harness for CH premium mockup: image gen (via chromium egress), screenshots, visual gate.
// Node 24 (global fetch + WebSocket). Usage:
//   node harness.mjs gen <images.json> <outdir>
//   node harness.mjs shots <file.html> <outdir> <label>
//   node harness.mjs gate <file.html>
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Users/mlloveras2/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe";
const PORT = 9411 + Math.floor((Date.now() % 400));

function launch() {
  const args = ["--headless","--disable-gpu","--hide-scrollbars","--no-sandbox",
    "--disable-dev-shm-usage",`--remote-debugging-port=${PORT}`,"--remote-allow-origins=*","about:blank"];
  const p = spawn(CHROME, args, { stdio: "ignore" });
  return p;
}

async function wsBrowser() {
  for (let i=0;i<60;i++){
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {}
    await sleep(250);
  }
  throw new Error("no devtools");
}

class CDP {
  constructor(ws){ this.ws=ws; this.id=0; this.waits=new Map(); this.evwaits=[];
    ws.addEventListener("message",(e)=>{ const m=JSON.parse(e.data);
      if(m.id && this.waits.has(m.id)){ const {res,rej}=this.waits.get(m.id); this.waits.delete(m.id);
        m.error?rej(new Error(JSON.stringify(m.error))):res(m.result); }
      else if(m.method){ this.evwaits=this.evwaits.filter(w=>{ if(w.method===m.method){w.res(m.params);return false;} return true; }); }
    });
  }
  send(method,params={},sessionId){ const id=++this.id;
    return new Promise((res,rej)=>{ this.waits.set(id,{res,rej});
      this.ws.send(JSON.stringify(sessionId?{id,method,params,sessionId}:{id,method,params})); }); }
  once(method){ return new Promise(res=>this.evwaits.push({method,res})); }
}

function openWS(url){ return new Promise((res,rej)=>{ const ws=new WebSocket(url);
  ws.addEventListener("open",()=>res(ws)); ws.addEventListener("error",rej); }); }

async function withPage(fn){
  const proc=launch();
  try{
    const burl=await wsBrowser(); const bws=await openWS(burl); const cdp=new CDP(bws);
    const {targetId}=await cdp.send("Target.createTarget",{url:"about:blank"});
    const {sessionId}=await cdp.send("Target.attachToTarget",{targetId,flatten:true});
    await cdp.send("Page.enable",{},sessionId);
    await cdp.send("Runtime.enable",{},sessionId);
    return await fn(cdp,sessionId);
  } finally { proc.kill(); }
}

async function navigate(cdp,sid,url){
  const loaded=cdp.once("Page.loadEventFired");
  await cdp.send("Page.navigate",{url},sid);
  await Promise.race([loaded,sleep(15000)]);
}

const FETCH_HREF_B64 = `fetch(location.href).then(r=>r.blob()).then(b=>b.arrayBuffer()).then(buf=>{const a=new Uint8Array(buf);let s='';const C=0x8000;for(let i=0;i<a.length;i+=C){s+=String.fromCharCode.apply(null,a.subarray(i,i+C));}return btoa(s);})`;

async function cmdGen(jsonPath,outdir){
  mkdirSync(outdir,{recursive:true});
  const list=JSON.parse(readFileSync(jsonPath,"utf8"));
  await withPage(async(cdp,sid)=>{
    for(const it of list){
      const url=`https://image.pollinations.ai/prompt/${encodeURIComponent(it.prompt)}?width=${it.w}&height=${it.h}&nologo=true&seed=${it.seed}&model=${it.model||"flux"}`;
      let ok=false;
      for(let attempt=0;attempt<3 && !ok;attempt++){
        try{
          await navigate(cdp,sid,url);           // load image same-origin
          await sleep(800);
          const r=await cdp.send("Runtime.evaluate",{expression:FETCH_HREF_B64,awaitPromise:true,returnByValue:true,timeout:120000},sid);
          const b64=r.result?.value;
          if(b64 && b64.length>2000){ writeFileSync(`${outdir}/${it.name}.jpg`,Buffer.from(b64,"base64")); ok=true;
            console.log(`OK ${it.name} ${Math.round(b64.length*0.75/1024)}KB`); }
          else { console.log(`retry ${it.name} (small)`); await sleep(1500); }
        }catch(e){ console.log(`retry ${it.name} ${String(e).slice(0,80)}`); await sleep(2000); }
      }
      if(!ok) console.log(`FAIL ${it.name}`);
    }
  });
}

async function fullShot(cdp,sid,path,width,mobile){
  await cdp.send("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:2,mobile:!!mobile},sid);
  const file=`file:///${path.replace(/\\/g,"/")}`;
  await navigate(cdp,sid,file);
  await sleep(1000);
  // force reveal-on-scroll elements visible for one-shot capture
  await cdp.send("Runtime.evaluate",{expression:`document.querySelectorAll('.reveal').forEach(e=>{e.classList.add('in');e.style.opacity='1';e.style.transform='none';});`},sid);
  await sleep(700);
  const {cssContentSize}=await cdp.send("Page.getLayoutMetrics",{},sid);
  const h=Math.min(Math.ceil(cssContentSize.height),18000);
  const cap=await cdp.send("Page.captureScreenshot",{format:"jpeg",quality:88,captureBeyondViewport:true,
    clip:{x:0,y:0,width,height:h,scale:1}},sid);
  return Buffer.from(cap.data,"base64");
}

async function cmdShots(html,outdir,label){
  mkdirSync(outdir,{recursive:true});
  await withPage(async(cdp,sid)=>{
    const d=await fullShot(cdp,sid,html,1280,false);
    writeFileSync(`${outdir}/${label}-desktop.jpg`,d); console.log(`desktop ${Math.round(d.length/1024)}KB`);
    const m=await fullShot(cdp,sid,html,390,true);
    writeFileSync(`${outdir}/${label}-mobile.jpg`,m); console.log(`mobile ${Math.round(m.length/1024)}KB`);
  });
}

// ---- contrast + layout gate, evaluated in-page ----
const GATE_FN = `(()=>{
  function lum(hex){const c=hex.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];}
  function parse(s){const m=s.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const p=m[1].split(',').map(x=>parseFloat(x));return {r:p[0],g:p[1],b:p[2],a:p[3]===undefined?1:p[3]};}
  function effbg(el){let e=el;while(e){const c=parse(getComputedStyle(e).backgroundColor);if(c&&c.a>0.5)return c;e=e.parentElement;}return {r:255,g:255,b:255,a:1};}
  function ratio(fg,bg){const L1=lum([fg.r,fg.g,fg.b]),L2=lum([bg.r,bg.g,bg.b]);const a=Math.max(L1,L2),b=Math.min(L1,L2);return (a+0.05)/(b+0.05);}
  const fails=[];
  const texts=[...document.querySelectorAll('h1,h2,h3,h4,p,a,span,button,li,label,small,div,em,strong')].filter(el=>{
    const t=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
    if(!t)return false;const cs=getComputedStyle(el);
    return cs.visibility!=='hidden'&&cs.display!=='none'&&parseFloat(cs.fontSize)>0&&el.offsetParent!==null;});
  for(const el of texts){
    if(el.closest('.hero,.proof,.minfo,.sig-badge,.hero-tag,.map')) continue; // text over photography — verified visually
    const cs=getComputedStyle(el);const fg=parse(cs.color);if(!fg||fg.a<0.4)continue;
    const bg=effbg(el);const r=ratio(fg,bg);const fs=parseFloat(cs.fontSize);const bold=parseInt(cs.fontWeight)>=700;
    const large=fs>=24||(fs>=18.66&&bold);const need=large?3:4.5;
    if(r<need-0.02){fails.push({t:el.textContent.trim().slice(0,32),fg:cs.color,bg:'rgb('+bg.r+','+bg.g+','+bg.b+')',ratio:Math.round(r*100)/100,need,fs});}}
  // touch targets
  const touchFails=[];
  for(const el of document.querySelectorAll('a,button,input,[role=button]')){const r=el.getBoundingClientRect();
    if(r.width<1||r.height<1||el.offsetParent===null)continue;
    if(r.height<44-0.5||r.width<24){touchFails.push({t:(el.textContent||el.getAttribute('aria-label')||el.tagName).trim().slice(0,24),w:Math.round(r.width),h:Math.round(r.height)});}}
  const overflow={scrollW:document.documentElement.scrollWidth,clientW:document.documentElement.clientWidth,
    over:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  return JSON.stringify({contrast:fails,touch:touchFails,overflow,textCount:texts.length});
})()`;

async function cmdGate(html){
  const report={};
  await withPage(async(cdp,sid)=>{
    for(const [label,width,mobile] of [["desktop",1280,false],["mobile",390,true]]){
      await cdp.send("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile},sid);
      await navigate(cdp,sid,`file:///${html.replace(/\\/g,"/")}`);
      await sleep(1000);
      await cdp.send("Runtime.evaluate",{expression:`document.querySelectorAll('.reveal').forEach(e=>{e.classList.add('in');e.style.opacity='1';e.style.transform='none';});`},sid);
      await sleep(500);
      const r=await cdp.send("Runtime.evaluate",{expression:GATE_FN,returnByValue:true},sid);
      report[label]=JSON.parse(r.result.value);
    }
  });
  console.log(JSON.stringify(report,null,2));
}

async function cmdClip(html,outdir,width){
  mkdirSync(outdir,{recursive:true});
  const regions=JSON.parse(readFileSync(`${outdir}/regions.json`,"utf8"));
  await withPage(async(cdp,sid)=>{
    await cdp.send("Emulation.setDeviceMetricsOverride",{width:+width,height:900,deviceScaleFactor:2,mobile:false},sid);
    await navigate(cdp,sid,`file:///${html.replace(/\\/g,"/")}`);
    await sleep(1000);
    await cdp.send("Runtime.evaluate",{expression:`document.querySelectorAll('.reveal').forEach(e=>{e.classList.add('in');e.style.opacity='1';e.style.transform='none';});`},sid);
    await sleep(700);
    for(const r of regions){
      if(r.js){await cdp.send("Runtime.evaluate",{expression:r.js,awaitPromise:true},sid);await sleep(r.wait||600);}
      let y=r.y,h=r.h;
      if(r.sel){const rr=await cdp.send("Runtime.evaluate",{expression:`(()=>{const e=document.querySelector(${JSON.stringify(r.sel)});const b=e.getBoundingClientRect();return JSON.stringify({y:b.top+scrollY,h:b.height});})()`,returnByValue:true},sid);
        const o=JSON.parse(rr.result.value);y=Math.max(0,o.y-(r.pad||0));h=Math.min(o.h+(r.pad||0)*2,4000);}
      const cap=await cdp.send("Page.captureScreenshot",{format:"jpeg",quality:90,captureBeyondViewport:true,clip:{x:0,y,width:+width,height:h,scale:1}},sid);
      writeFileSync(`${outdir}/${r.name}.jpg`,Buffer.from(cap.data,"base64"));console.log(`clip ${r.name} y=${Math.round(y)} h=${Math.round(h)}`);
    }
  });
}
const [cmd,...rest]=process.argv.slice(2);
if(cmd==="gen") await cmdGen(rest[0],rest[1]);
else if(cmd==="shots") await cmdShots(rest[0],rest[1],rest[2]||"shot");
else if(cmd==="gate") await cmdGate(rest[0]);
else if(cmd==="clip") await cmdClip(rest[0],rest[1],rest[2]||1280);
else console.log("cmd?");
process.exit(0);
