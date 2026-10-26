import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const out=path.resolve(process.argv[2]||`/tmp/refactor-brag-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const tool=path.join(root,'pipelines/refactor/scripts/workbench.mjs');
const run=(...args)=>execFileSync(process.execPath,[tool,...args],{encoding:'utf8'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync(path.join(out,'raw'),{recursive:true});
run('build','--input',path.join(here,'architecture.json'),'--output',path.join(out,'workbench.html'));
const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
let chrome,socket,sequence=0,frames=[],errors=[],cursor={x:1340,y:80},caption='',beat='';const pending=new Map();
const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
async function js(expression){const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(expression){for(let i=0;i<120;i++){if(await js(expression))return;await sleep(100);}throw Error('Not ready: '+expression);}
async function cursorAt(x,y){cursor={x,y};await js(`(()=>{const c=document.getElementById('demo-pointer');if(c){c.style.left='${x}px';c.style.top='${y}px';}})()`);}
async function snap(){const png=await cdp('Page.captureScreenshot',{format:'png'});const file=`raw/${String(frames.length).padStart(5,'0')}.png`;fs.writeFileSync(path.join(out,file),Buffer.from(png.data,'base64'));frames.push({file,caption,beat});return file;}
async function hold(seconds){const file=await snap();for(let i=1;i<Math.round(seconds*12);i++)frames.push({file,caption,beat});}
function scene(name,text){beat=name;caption=text;console.log(name);}
async function click(selector,animate=true){const p=await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing ${selector}');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);if(animate){const from={...cursor};for(let i=1;i<=3;i++){const t=i/3;await cursorAt(from.x+(p.x-from.x)*t,from.y+(p.y-from.y)*t);await snap();}}await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});await sleep(220);}
async function type(selector,text){await click(selector);await cdp('Input.insertText',{text});await sleep(100);}
async function diagram(){await sleep(200);await until('window.refactor.view().diagram?.ready');}
async function newPlan(title){await click('#review-new-plan');await type('#review-plan-name',title);await hold(1.3);await click('#review-plan-confirm');await diagram();}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
try{
 run('start','--session',out,'--port',String(port));
 chrome=spawn(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+path.join(out,'chrome'),'about:blank'],{stdio:'ignore'});
 const active=path.join(out,'chrome/DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await sleep(100);assert(fs.existsSync(active));
 const cdpPort=fs.readFileSync(active,'utf8').split('\n')[0],pages=await(await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
 socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.method==='Runtime.exceptionThrown')errors.push(data.params);const job=pending.get(data.id);if(job){pending.delete(data.id);clearTimeout(job.timer);data.error?job.reject(Error(data.error.message)):job.resolve(data.result);}});
 await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await cdp('Page.navigate',{url:`http://127.0.0.1:${port}`});await until('Boolean(window.refactor?.view().graphs)');
 await js(`(()=>{const c=document.createElement('div');c.id='demo-pointer';c.style='position:fixed;width:20px;height:20px;border:2px solid #e9fff6;background:#83d7af44;border-radius:50%;z-index:99999;pointer-events:none;box-shadow:0 0 0 5px #83d7af22;';document.body.append(c);reviewProposal('extract-pricing');setTab('description');})()`);await cursorAt(1340,80);await diagram();
 scene('01-description','01 / ПОНЯТЬ ИЗМЕНЕНИЕ     Четыре канала. Одна цена.');await hold(3.8);
 scene('02-question','02 / ОБСУДИТЬ ЭТАП     Вопрос и ответ остаются рядом с изменением.');await click('#tab-discussion');await type('#comment','Как сохранить округление при объединении расчёта?');await hold(.8);await click('#send');await hold(.6);
 const reply=fs.readFileSync(path.join(here,'evidence/reply.txt'),'utf8').trim();
 await js(`(()=>{const d=structuredClone(window.refactor.checkpoint().document);d.revision++;d.addressed_event_id=window.refactor.status().last_event_id;d.replies=[{proposal_id:'extract-pricing',text:${JSON.stringify(reply)}}];window.refactor.publish(d);window.refactor.acknowledge(d.addressed_event_id);})()`);await sleep(250);await hold(3.5);
 scene('03-first-plan','03 / СОБРАТЬ ПЛАН     Сначала выделяем и проверяем общий расчёт.');await newPlan('01 · Общий расчёт');await click('#tab-plans');await hold(1.8);
 scene('04-next-proposal','04 / СРАВНИТЬ ДО И ПОСЛЕ     Три копии исчезают. Вызовы идут в общий модуль.');await click('#next-step');await click('#tab-description');await diagram();await hold(2.4);await click('#explanation-toggle');await click('#play-transition');
 for(let i=0;i<60;i++){await snap();await sleep(40);}await click('#transition-close');
 scene('05-three-dimensional','05 / ПОСМОТРЕТЬ СВЯЗИ В 3D     Вращаем граф: четыре канала сходятся к CalculatePrice.');await click('[data-layout="spatial"]');await sleep(800);await click('#reset');await sleep(700);await hold(1.2);
 const point=await js(`(()=>{const r=document.getElementById('after-webgl').getBoundingClientRect();return {x:r.x+r.width*.62,y:r.y+r.height*.65}})()`);
 const cameraBefore=await js('window.refactor.view().graphs.after.camera');
 await cursorAt(point.x,point.y);await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
 for(let i=1;i<=40;i++){const p={x:point.x-140*i/40,y:point.y+Math.sin(i/40*Math.PI)*70};await cursorAt(p.x,p.y);await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,...p});await snap();await sleep(35);}
 await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:point.x-140,y:point.y});await hold(1.6);
 const camerasAfter=await js('window.refactor.view().graphs');assert.notDeepEqual(camerasAfter.after.camera,cameraBefore,'The 3D drag rotates the actual camera');assert.deepEqual(camerasAfter.before.camera,camerasAfter.after.camera,'Comparison rotation stays synchronized');
 scene('06-second-plan','06 / РАЗДЕЛИТЬ РАБОТУ     Подключение каналов — отдельный план после общего расчёта.');await click('#clear-highlights');await click('[data-layout="diagram"]');await diagram();await newPlan('02 · Подключение каналов');await click('#tab-plans');await hold(2.5);
 const status=await js('window.refactor.status()');assert.deepEqual(status.selected,['extract-pricing','reuse-pricing']);assert.equal(status.plan_groups.filter(g=>g.proposal_ids.length).length,2);
 scene('07-save','07 / СОХРАНИТЬ     Согласованы два плана. Код приложения ещё не менялся.');await click('#download');await click('#approve');await hold(1.5);
 const approved=await js('window.refactor.status()');assert(approved.approval);const checkpoint=await js(`window.refactor.seal(${approved.revision},${approved.approval.event_id})`);fs.writeFileSync(path.join(out,'checkpoint.json'),JSON.stringify(checkpoint,null,2));
 run('plan','--checkpoint',path.join(out,'checkpoint.json'),'--output',path.join(out,'plan.md'));
 run('export','--checkpoint',path.join(out,'checkpoint.json'),'--plan',path.join(out,'plan.md'),'--output',path.join(out,'approved'));
 const index=JSON.parse(fs.readFileSync(path.join(out,'approved/plans/index.json')));assert.equal(index.plans.length,2);assert.equal(index.plans[1].depends_on[0],index.plans[0].id);
 const cards=index.plans.map((plan,i)=>{const p=checkpoint.document.proposals.find(p=>p.id===plan.proposal_ids[0]);return `<article><div class="number">0${i+1}</div><small>plans/${escape(plan.file)}</small><h2>${escape(plan.title.replace(/^\d+ · /,''))}</h2><p>${escape(p.explanation.why)}</p><h3>Что сделать</h3><ol>${p.steps.map(x=>`<li>${escape(x)}</li>`).join('')}</ol><h3>Проверка</h3><ul>${p.verification.map(x=>`<li>${escape(x)}</li>`).join('')}</ul><footer>${i?'После плана 01 · Общий расчёт':'Можно выполнять первым'}<span>Markdown + before/after JSON</span></footer></article>`}).join('');
 fs.writeFileSync(path.join(out,'plans.html'),`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#10181c;color:#e6eeec;font:20px -apple-system,BlinkMacSystemFont,sans-serif;padding:56px 64px}small,.eyebrow{color:#a2ceb9;font-size:16px;letter-spacing:.04em}h1{font-size:44px;margin:14px 0}body>p{color:#a8b9bd;margin-bottom:36px}main{display:grid;grid-template-columns:1fr 1fr;gap:26px}article{border:1px solid #3e5951;background:#19252a;border-radius:20px;padding:30px;position:relative;min-height:570px}article>small{font:15px monospace}h2{font-size:30px;margin:20px 0}h3{font-size:14px;text-transform:uppercase;color:#a8b9bd;letter-spacing:.1em;margin:28px 0 14px}p,li{line-height:1.5}li{margin:12px 0}ol,ul{padding-left:22px}.number{position:absolute;right:25px;top:20px;color:#94ccae33;font-size:58px;font-weight:700}footer{border-top:1px solid #3e5951;margin-top:25px;padding-top:20px;font-size:17px;color:#b5e2c9}footer span{display:block;font-size:14px;color:#91a6ab;margin-top:12px}</style><div class="eyebrow">AFM / REFACTOR · СОХРАНЁННЫЙ РЕЗУЛЬТАТ</div><h1>Два плана. Понятный порядок.</h1><p>Реальные файлы экспорта этого примера · README.md + plans/index.json + два плана</p><main>${cards}</main>`);
 scene('08-ready-plans','ГОТОВО     Открыть README → взять первый план → проверить → перейти ко второму.');await cdp('Page.navigate',{url:'file://'+path.join(out,'plans.html')});await sleep(300);await hold(6);
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'capture.json'),JSON.stringify({width:1440,height:900,fps:12,frames,plans:index,agentReplySource:'demo/refactor/evidence/reply.txt',errors},null,2));console.log(out);
}finally{for(const job of pending.values())clearTimeout(job.timer);socket?.close();if(chrome&&!chrome.killed){chrome.kill('SIGTERM');await sleep(500);}run('stop','--session',out);}
