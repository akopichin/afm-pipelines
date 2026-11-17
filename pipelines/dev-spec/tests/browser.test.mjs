import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import M from '../planning/model.cjs';
import {bind, build, json} from '../planning/workbench.mjs';

const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
assert(fs.existsSync(chromePath), 'Set CHROME_PATH to the Chrome executable');
assert.equal(typeof WebSocket, 'function', 'Browser checks require Node.js 22+');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-planning-browser-'));
const example = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../planning/example.json', import.meta.url)), 'utf8'));
fs.writeFileSync(path.join(temp, 'dev-plan.md'), '# Synthetic browser fixture\n'); json(path.join(temp, 'project.json'), {});
const doc = bind(example, path.join(temp, 'dev-plan.md'), path.join(temp, 'project.json'));
doc.session_id += '-' + Date.now();
const pageFile = path.join(temp, 'workbench.html'); build(M.create(doc), pageFile);
const reservation = net.createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = new Map(), errors = [];
let chrome, socket, sequence = 0;
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000);
    pending.set(id, {resolve, reject, timer}); socket.send(JSON.stringify({id, method, params}));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function ready() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if (await evaluate('Boolean(window.devPlanning && !document.getElementById("page-error").textContent)')) return; } catch {}
    await delay(70);
  }
  throw new Error('Planning page failed: ' + await evaluate('document.getElementById("page-error")?.textContent'));
}
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const input = text => evaluate(`(() => { const e=document.getElementById('comment-input'); e.value=${JSON.stringify(text)}; e.dispatchEvent(new Event('input',{bubbles:true})); })()`);

try {
  chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(temp, 'chrome')}`, 'about:blank'], {stdio: 'ignore'});
  let targets;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json()); if (targets.some(item => item.type === 'page')) break; } catch {}
    await delay(70);
  }
  assert(targets?.some(item => item.type === 'page'), 'Chrome did not start');
  socket = new WebSocket(targets.find(item => item.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, {once: true}); socket.addEventListener('error', reject, {once: true}); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (!pending.has(message.id)) return;
    const entry = pending.get(message.id); pending.delete(message.id); clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result);
  });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false});
  await send('Page.navigate', {url: pathToFileURL(pageFile).href}); await ready();

  for (const stepID of ['baseline', ...doc.steps.map(step => step.id)]) {
    await click(`.step[data-step="${stepID}"]`);
    assert(await evaluate('Boolean(document.getElementById("summary-what").textContent.trim() && document.getElementById("summary-why").textContent.trim())'), 'Every step shows What and Why');
  }
  await click('.step[data-step="change-1"]');
  const colors = await evaluate('({added:document.querySelectorAll("#after-diagram .node.added").length, removed:document.querySelectorAll("#before-diagram .node.removed").length})');
  assert.equal(colors.added, 1); assert.equal(colors.removed, 1);
  await click('[data-detail-id="start-stage"] .detail-context button');
  assert.match(await evaluate('document.getElementById("compose-context-label").textContent'), /StartStage/);
  await input('<img src=x onerror="window.injected=true"> Who cancels?'); await click('#send-comment');
  assert.equal(await evaluate('document.querySelectorAll("#conversation-thread img").length'), 0);
  assert.equal(await evaluate('window.injected'), undefined);
  assert.equal((await evaluate('window.devPlanning.readEvents(0)'))[0].anchor.id, 'start-stage');
  assert.equal(await evaluate('document.getElementById("ready-for-approval").disabled'), true);
  assert.equal(await evaluate('document.querySelectorAll(".message.agent").length'), 1, 'No fabricated agent reply');
  await input('Unsent draft'); await click('.step[data-step="change-2"]');
  assert.equal(await evaluate('document.getElementById("comment-input").value'), '');
  await evaluate(`(() => { const d=window.devPlanning.checkpoint().document; d.revision++; d.replies=[{event_id:1,text:'The run owns cancellation.'}]; window.devPlanning.publish(d); })()`);
  assert.equal(await evaluate('document.querySelectorAll("#conversation-thread .message.user").length'), 0, 'A late reply stays in the original thread');
  await click('.step[data-step="change-1"]');
  assert.equal(await evaluate('document.querySelectorAll(".message.agent").length'), 2);
  assert.equal(await evaluate('document.getElementById("comment-input").value'), 'Unsent draft');
  await send('Page.reload'); await delay(150); await ready();
  assert.equal(await evaluate('document.getElementById("comment-input").value'), 'Unsent draft', 'Draft survives reload');
  await input(''); await click('#context-clear');
  await evaluate(`(() => {const e=document.getElementById('discussion-scope');e.value='plan';e.dispatchEvent(new Event('change'));})()`);
  await input('Global contract question'); await click('#send-comment');
  assert.equal((await evaluate('window.devPlanning.readEvents(1)'))[0].step_id, null);
  await evaluate(`(() => {const d=window.devPlanning.checkpoint().document;d.revision++;d.replies=[{event_id:2,text:'The public API remains compatible.'}];window.devPlanning.publish(d);})()`);
  await click('#ready-for-approval');
  const status = await evaluate('window.devPlanning.status()'); assert.equal(status.ready, true);
  await evaluate(`window.devPlanning.acknowledge(${status.last_event_id})`);
  const checkpoint = await evaluate(`window.devPlanning.lock(${status.revision},${status.last_event_id})`);
  assert.equal(checkpoint.locked, true); assert.equal(await evaluate('document.getElementById("comment-input").disabled'), true);
  json(path.join(temp, 'saved-checkpoint.json'), checkpoint);
  build(checkpoint, path.join(temp, 'report.html'), true);

  for (const skin of ['graphite', 'goga']) for (const mode of ['dark', 'light']) {
    await evaluate(`window.devPlanning.setTheme(${JSON.stringify({skin, mode})})`);
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
    assert.equal(await evaluate('document.documentElement.dataset.skin'), skin);
    assert.equal(await evaluate('document.documentElement.dataset.theme'), mode);
  }
  await send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 1, mobile: false});
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'Mobile has no page overflow');
  await send('Page.navigate', {url: pathToFileURL(path.join(temp, 'report.html')).href}); await delay(150); await ready();
  assert.equal((await evaluate('window.devPlanning.status()')).read_only, true);
  assert.equal(await evaluate('getComputedStyle(document.getElementById("comment-form")).display'), 'none');
  assert.equal((await evaluate('window.devPlanning.checkpoint()')).events.length, checkpoint.events.length, 'Portable report retains discussion');
  assert.deepEqual(errors, []);
  console.log('PASS real Chrome: all-step explanations, color diff, source details, real comment events, original reply routing, drafts/reload, global discussion, readiness lock, Graphite/Goga × light/dark, mobile and portable report.');
} finally {
  socket?.close();
  for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Browser test closed')); }
  if (chrome && chrome.exitCode === null) {
    chrome.kill('SIGTERM');
    await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), delay(3000)]);
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
  }
  fs.rmSync(temp, {recursive: true, force: true});
}
