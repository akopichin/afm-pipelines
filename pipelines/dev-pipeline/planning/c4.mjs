#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {atomic, json, sourceIdentity, checkSource} from './workbench.mjs';
import M from './model.cjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const fileHash = file => hash(fs.readFileSync(file));
const check = (condition, message) => { if (!condition) throw new Error(message); };
const same = M.same;
const id = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(value);
const text = (value, limit = 160) => typeof value === 'string' && value.trim() && value.length <= limit && !/[\x00-\x1f]/.test(value);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const markdown = value => String(value).replace(/[\\`*_{}[\]()<>#+.!|~-]/g, '\\$&');
const levels = {2: 'Контейнеры', 3: 'Компоненты', 4: 'Код'};
const kinds = {person:'Человек', system:'Система', container:'Контейнер', store:'Хранилище', component:'Компонент', code:'Код'};
const colors = {existing:'#aeb5c1', changed:'#edbc61', added:'#99d98c', removed:'#ed9797'};
const statuses = {existing:'СУЩЕСТВУЕТ', changed:'ИЗМЕНЯЕТСЯ', added:'ДОБАВЛЯЕТСЯ', removed:'УДАЛЯЕТСЯ'};
const stateOf = item => !item.before ? 'added' : !item.after ? 'removed' : same(item.before, item.after) ? 'existing' : 'changed';

export function validateModel(model) {
  check(model?.schema_version === 1 && Number.isSafeInteger(model.revision) && model.revision > 0, 'Expected C4 schema_version 1 and a positive revision');
  check(text(model.title, 100), 'C4 title is required (up to 100 characters)');
  check(Array.isArray(model.views) && model.views.length <= 6, 'Use at most six focused C4 views');
  if (!model.views.length) {
    check(text(model.skip_reason, 400), 'A change without architecture diagrams needs an explicit skip_reason');
    return model;
  }
  check(model.views.some(view => view.id === model.primary_view), 'primary_view must name a view');
  const viewIDs = new Set();
  for (const view of model.views) {
    check(id(view.id) && !viewIDs.has(view.id), 'Invalid or duplicate C4 view ID'); viewIDs.add(view.id);
    check(levels[view.level] && text(view.title, 100) && text(view.scope, 100), 'Each view needs a level (2/3/4), title and scope');
    check(text(view.what, 400) && text(view.why, 400), 'Every view needs its own what and why');
    check(Array.isArray(view.nodes) && view.nodes.length >= 1 && view.nodes.length <= 8, 'Keep each C4 view to 1–8 nodes; split larger views');
    check(Array.isArray(view.relations) && view.relations.length <= 12, 'Keep each C4 view to at most 12 relations');
    const nodes = new Map();
    for (const node of view.nodes) {
      check(id(node.id) && node.id !== 'scope' && node.id !== 'root' && !nodes.has(node.id), 'Invalid or duplicate C4 node ID'); nodes.set(node.id, node);
      check(node.before || node.after, 'A node needs before and/or after');
      check(node.external === undefined || typeof node.external === 'boolean', 'external must be boolean');
      for (const state of ['before', 'after']) if (node[state]) {
        const value = node[state];
        check(text(value.name, 80) && text(value.description, 160) && kinds[value.type], 'Every node needs a name, type and short responsibility');
        check(value.type === 'person' || text(value.technology, 60), 'Every software node needs its technology');
        if (!node.external) check(({2:['container','store'],3:['component'],4:['code']})[view.level].includes(value.type), 'Do not mix abstraction levels inside a C4 boundary');
      }
      if (node.before) check(Array.isArray(node.source_refs) && node.source_refs.length && node.source_refs.every(ref => text(ref, 240)), 'Existing nodes need real source_refs');
      if (stateOf(node) !== 'existing') check(Array.isArray(node.task_ids) && node.task_ids.length && node.task_ids.every(task => text(task, 60)), 'Changed nodes need implementation task_ids');
    }
    check(view.nodes.some(node => !node.external), 'A view needs nodes inside its scope');
    const relationIDs = new Set();
    for (const relation of view.relations) {
      check(id(relation.id) && !relationIDs.has(relation.id), 'Invalid or duplicate relation ID'); relationIDs.add(relation.id);
      check(nodes.has(relation.from) && nodes.has(relation.to) && relation.from !== relation.to, 'Dangling or self C4 relation');
      check(relation.before || relation.after, 'A relation needs before and/or after');
      for (const state of ['before', 'after']) if (relation[state]) {
        check(nodes.get(relation.from)[state] && nodes.get(relation.to)[state], 'Relation endpoint is absent in this version');
        check(text(relation[state].label, 90) && text(relation[state].technology, 60), 'Every relation needs a directional label and protocol/technology');
      }
    }
  }
  return model;
}

function wrap(value, limit) {
  const lines = [];
  for (const word of value.split(/\s+/)) {
    const chunks = word.match(new RegExp(`.{1,${limit}}`, 'gu')) || [];
    for (const chunk of chunks) {
      if (lines.length && lines.at(-1).length + chunk.length + 1 <= limit) lines[lines.length - 1] += ' ' + chunk;
      else lines.push(chunk);
    }
  }
  return lines;
}
const words = (value, x, y, size, limit, fill = '#edf0f4', bold = false) => wrap(value, limit).map((line, i) =>
  `<text x="${x}" y="${y + i * (size + 7)}" font-size="${size}" fill="${fill}" font-weight="${bold ? 700 : 400}">${escape(line)}</text>`).join('');
const typeLabel = value => `[${kinds[value.type]}${value.technology ? ' · ' + value.technology : ''}]`;
const nodeHeight = value => 95 + wrap(value.name,25).length * 30 + wrap(typeLabel(value),33).length * 23 + wrap(value.description,32).length * 24;

let resources;
async function runtime() {
  if (!resources) resources = (async () => {
    const [{default: ELK}, resvg] = await Promise.all([import('./vendor/c4/elk.cjs'), import('./vendor/c4/resvg.mjs')]);
    await resvg.initWasm(fs.readFileSync(path.join(directory, 'vendor/c4/resvg.wasm')));
    return {elk: new ELK(), Resvg: resvg.Resvg};
  })();
  return resources;
}

export async function layoutView(view) {
  const {elk} = await runtime();
  const nodes = view.nodes.map(node => ({id:node.id, width:360, height:Math.max(...[node.before,node.after].filter(Boolean).map(nodeHeight))}));
  const internals = nodes.filter(node => !view.nodes.find(value => value.id === node.id).external);
  const external = nodes.filter(node => view.nodes.find(value => value.id === node.id).external);
  const layoutOptions = {'elk.algorithm':'layered', 'elk.direction':'RIGHT', 'elk.edgeRouting':'ORTHOGONAL',
    'elk.hierarchyHandling':'INCLUDE_CHILDREN', 'elk.spacing.nodeNode':'80', 'elk.spacing.edgeNode':'45',
    'elk.layered.spacing.nodeNodeBetweenLayers':'70', 'elk.layered.spacing.edgeNodeBetweenLayers':'25',
    'elk.randomSeed':'1',
    'elk.padding':'[top=70,left=35,bottom=35,right=35]'};
  const edges = view.relations.map(relation => {
      const values = [relation.before, relation.after].filter(Boolean);
      const maxLength = Math.max(...values.map(value => value.label.length));
      const maxTech = Math.max(...values.map(value => value.technology.length));
      return {id:relation.id, sources:[relation.from], targets:[relation.to], labels:[{id:relation.id + '-label', text:relation.id,
        width:Math.min(28, Math.max(maxLength, maxTech)) * 11 + 20,
        height:(Math.ceil(maxLength / 28) + Math.ceil(maxTech / 30)) * 26 + 16}]};
    });
  const internalIDs = new Set(internals.map(node => node.id));
  const isInternal = edge => internalIDs.has(edge.sources[0]) && internalIDs.has(edge.targets[0]);
  const candidates = [];
  for (const direction of ['RIGHT','DOWN']) {
    const options = {...layoutOptions,'elk.direction':direction};
    candidates.push(await elk.layout({id:'root',layoutOptions:{...options,'elk.padding':'[top=12,left=12,bottom=12,right=12]'},children:[...external,
      {id:'scope',layoutOptions:options,children:internals,edges:edges.filter(isInternal)}],edges:edges.filter(edge => !isInternal(edge))}));
  }
  const fit = layout => Math.min(1600 / layout.width, 1000 / layout.height);
  const layout = candidates.sort((a,b) => fit(b) - fit(a))[0];
  const scope = layout.children.find(node => node.id === 'scope');
  const offset = point => ({x:point.x + scope.x, y:point.y + scope.y});
  layout.edges = [...(layout.edges || []), ...(scope.edges || []).map(edge => ({...edge,
    labels:edge.labels.map(label => ({...label,...offset(label)})),
    sections:edge.sections.map(section => ({...section,startPoint:offset(section.startPoint),endPoint:offset(section.endPoint),
      bendPoints:section.bendPoints?.map(offset)}))}))];
  return layout;
}

export function renderSvg(model, view, layout, state) {
  check(['before','after'].includes(state), 'Expected before or after');
  const padding = 42, top = 170 + wrap(view.title,85).length * 37, width = Math.max(1280, Math.ceil(layout.width + padding * 2));
  check(width <= 3600, 'Diagram is too wide to read inline; split this view into smaller scopes');
  const footer = Math.ceil(top + layout.height + 40), footerLimit = Math.floor((width - 84) / 12);
  const whyY = footer + 45 + wrap('Что: ' + view.what,footerLimit).length * 27;
  const height = whyY + wrap('Зачем: ' + view.why,footerLimit).length * 26 + 32;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#1d2026"/><g font-family="Noto Sans">`,
    words(`C${view.level} · ${levels[view.level]} · ${state === 'before' ? 'Было' : 'Стало'} · v${model.revision}`, 42, 44, 20, 100, '#bbc2cc'),
    words(view.title, 42, 91, 30, 85, '#f1f3f6', true)];
  let legendX = 42;
  for (const [key, color] of Object.entries(colors)) {
    parts.push(`<rect x="${legendX}" y="${top - 55}" width="16" height="16" rx="4" fill="${color}"/>`, words(statuses[key], legendX + 25, top - 41, 14, 30, '#d6dae1'));
    legendX += 240;
  }
  parts.push(`<g transform="translate(${(width - layout.width) / 2},${top})">`);
  const positions = new Map();
  for (const group of layout.children) {
    if (group.id === 'scope') {
      parts.push(`<rect x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" rx="16" fill="#242830" stroke="#737d8e" stroke-width="2" stroke-dasharray="5 6"/>`,
        words(view.scope, group.x + 24, group.y + 38, 21, 80, '#cbd1da', true));
      for (const node of group.children) positions.set(node.id, {...node,x:node.x + group.x,y:node.y + group.y});
    } else positions.set(group.id, group);
  }
  for (const edge of layout.edges || []) {
    const relation = view.relations.find(item => item.id === edge.id), value = relation[state];
    if (!value) continue;
    const color = colors[stateOf(relation)];
    for (const section of edge.sections || []) {
      const points = [section.startPoint,...(section.bendPoints || []),section.endPoint];
      const end = points.at(-1), previous = points.at(-2), angle = Math.atan2(end.y - previous.y,end.x - previous.x) * 180 / Math.PI;
      parts.push(`<polyline points="${points.map(p => p.x + ',' + p.y).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5"/>`,
        `<path d="M0,0 L-13,-6 L-13,6 Z" transform="translate(${end.x},${end.y}) rotate(${angle})" fill="${color}"/>`);
    }
    const label = edge.labels[0], y = label.y + 25;
    parts.push(`<rect x="${label.x - 5}" y="${label.y - 3}" width="${label.width + 10}" height="${label.height + 6}" rx="7" fill="#242830"/>`,
      words(value.label, label.x + 5, y, 18, 28, '#e2e6ec', true),
      words(value.technology, label.x + 5, y + wrap(value.label,28).length * 25, 16, 30, '#aeb7c5'));
  }
  for (const node of view.nodes) {
    const value = node[state];
    if (!value) continue;
    const position = positions.get(node.id), {x,y,width:w,height:h} = position, status = stateOf(node), color = colors[status];
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="13" fill="#2b303a" stroke="${color}" stroke-width="${status === 'existing' ? 1.5 : 3}"/>`,
      words(value.name,x + 20,y + 35,23,25,'#f2f4f7',true));
    const typeY = y + 39 + wrap(value.name,25).length * 30;
    parts.push(words(typeLabel(value),x + 20,typeY,16,33,'#c5cdd8'),
      words(value.description,x + 20,typeY + wrap(typeLabel(value),33).length * 23 + 15,17,32,'#e0e5ec'),
      `<rect x="${x + 20}" y="${y + h - 37}" width="165" height="23" rx="5" fill="${color}"/>`,
      words(statuses[status],x + 28,y + h - 20,12,30,'#1c2027',true));
  }
  parts.push('</g>', `<path d="M42 ${footer - 8} H${width - 42}" stroke="#586171"/>`,
    words('Что: ' + view.what,42,footer + 28,20,footerLimit,'#edf0f4',true),
    words('Зачем: ' + view.why,42,whyY,19,footerLimit,'#bac4d1'), '</g></svg>');
  return parts.join('\n');
}

async function png(svg) {
  const {Resvg} = await runtime();
  const renderer = new Resvg(svg, {fitTo:{mode:'width', value:2200}, font:{fontBuffers:[
    fs.readFileSync(path.join(directory,'vendor/c4/NotoSans-Regular.ttf')),
    fs.readFileSync(path.join(directory,'vendor/c4/NotoSans-Bold.ttf'))], defaultFontFamily:'Noto Sans', loadSystemFonts:false}});
  try {
    const rendered = renderer.render();
    try {
      check(rendered.width <= 8192 && rendered.height <= 8192, 'Split this diagram: PNG exceeds AFM image dimensions');
      const bytes = rendered.asPng();
      check(bytes.length <= 10 * 1024 * 1024, 'Split this diagram: PNG exceeds AFM image size');
      return Buffer.from(bytes);
    } finally { rendered.free(); }
  } finally { renderer.free(); }
}

function immutable(file, bytes) {
  if (fs.existsSync(file)) check(fs.readFileSync(file).equals(Buffer.from(bytes)), 'Refusing to replace an existing C4 artifact');
  else atomic(file,bytes);
}

export function approvalMarkdown(model, manifest, presentation = 'compact') {
  if (!model.views.length) return `### Архитектура\n\n${markdown(model.skip_reason)}\n`;
  const url = name => `/api/stages/${encodeURIComponent(manifest.stage_id)}/artifacts/${name}`;
  const image = (view, state) => `[![C${view.level} · ${markdown(view.title)} · ${state === 'before' ? 'Было' : 'Стало'}](${url(manifest.views[view.id][state])})](${url(manifest.views[view.id][state])})`;
  const primary = model.views.find(view => view.id === model.primary_view);
  const output = [`### Архитектура · редакция ${model.revision}`, '', image(primary,'after'), '',
    `**Что:** ${markdown(primary.what)}`, '', `**Зачем:** ${markdown(primary.why)}`, '',
    '| Уровень и область | Было | Стало |', '| --- | --- | --- |'];
  for (const view of model.views) output.push(`| C${view.level} · ${markdown(view.title)} | [Открыть PNG](${url(manifest.views[view.id].before)}) | [Открыть PNG](${url(manifest.views[view.id].after)}) |`);
  if (presentation === 'all') for (const view of model.views) for (const state of ['before','after']) {
    if (view === primary && state === 'after') continue;
    output.push('', `#### C${view.level} · ${markdown(view.title)} · ${state === 'before' ? 'Было' : 'Стало'}`, '', image(view,state));
  }
  return output.join('\n') + '\n';
}

export async function renderPlan(session, root, presentation = 'compact') {
  session = fs.realpathSync(session);
  check(['compact','all'].includes(presentation), 'presentation must be compact or all');
  const model = validateModel(read(path.join(session,'c4.json')));
  const manifest = {schema_version:1, revision:model.revision, stage_id:path.basename(session),
    model_sha256:fileHash(path.join(session,'c4.json')), plan_sha256:fileHash(path.join(session,'dev-plan.md')),
    project_sha256:fileHash(path.join(session,'project.json')), source:sourceIdentity(root,[path.dirname(session)]),
    presentation, views:{}, files:{}};
  const key = hash(JSON.stringify(manifest)).slice(0,16);
  for (const view of model.views) {
    const layout = await layoutView(view);
    manifest.views[view.id] = {};
    for (const state of ['before','after']) {
      const svg = renderSvg(model,view,layout,state), bytes = await png(svg);
      const name = `c4-v${model.revision}-${view.id}-${state}-${key}-${hash(bytes).slice(0,10)}.png`;
      immutable(path.join(session,'artifacts',name),bytes);
      manifest.files[name] = hash(bytes); manifest.views[view.id][state] = name;
    }
  }
  const markdown = approvalMarkdown(model,manifest,presentation);
  manifest.markdown_sha256 = hash(markdown);
  immutable(path.join(session,'artifacts',`c4-model-${key}.json`),fs.readFileSync(path.join(session,'c4.json')));
  manifest.files[`c4-model-${key}.json`] = manifest.model_sha256;
  atomic(path.join(session,'c4-approval.md'),markdown);
  json(path.join(session,'c4-manifest.json'),manifest);
  return manifest;
}

export function verifyC4(session, requireQuestion = true) {
  session = fs.realpathSync(session);
  const manifest = read(path.join(session,'c4-manifest.json'));
  check(manifest.schema_version === 1 && manifest.stage_id === path.basename(session), 'Invalid C4 manifest');
  for (const [file,field] of [['c4.json','model_sha256'],['dev-plan.md','plan_sha256'],['project.json','project_sha256'],['c4-approval.md','markdown_sha256']])
    check(fileHash(path.join(session,file)) === manifest[field], 'C4 evidence is stale: ' + file);
  const model = validateModel(read(path.join(session,'c4.json')));
  check(model.revision === manifest.revision, 'C4 revision differs from the manifest');
  check(same(Object.keys(manifest.views).sort(),model.views.map(view => view.id).sort()), 'C4 manifest views differ from the model');
  check(['compact','all'].includes(manifest.presentation), 'Invalid C4 presentation');
  for (const view of model.views) for (const state of ['before','after']) {
    const name = manifest.views[view.id][state];
    check(typeof name === 'string' && name.endsWith('.png') && Object.hasOwn(manifest.files,name), 'Missing C4 image evidence');
  }
  check(hash(approvalMarkdown(model,manifest,manifest.presentation)) === manifest.markdown_sha256, 'C4 presentation differs from the model');
  for (const [name,expected] of Object.entries(manifest.files)) {
    check(/^[A-Za-z0-9._-]+$/.test(name) && !['.','..'].includes(name), 'Invalid C4 artifact name');
    check(fileHash(path.join(session,'artifacts',name)) === expected, 'C4 artifact changed: ' + name);
  }
  checkSource(manifest.source);
  if (requireQuestion) {
    check(manifest.question_file && path.dirname(fs.realpathSync(manifest.question_file)) === session, 'Bind the actual AFM approval question before verification');
    check(fileHash(manifest.question_file) === manifest.question_sha256, 'C4 approval question changed');
    check(read(manifest.question_file).question?.includes(fs.readFileSync(path.join(session,'c4-approval.md'),'utf8').trim()), 'Approval question does not contain this C4 presentation');
  }
  return manifest;
}

export function bindQuestion(session, questionFile) {
  session = fs.realpathSync(session); questionFile = fs.realpathSync(questionFile);
  check(path.dirname(questionFile) === session, 'C4 question must belong to this plan stage');
  const manifest = verifyC4(session,false), question = read(questionFile);
  check(question.id && question.question?.includes(fs.readFileSync(path.join(session,'c4-approval.md'),'utf8').trim()), 'Approval question does not contain this C4 presentation');
  manifest.question_file = questionFile; manifest.question_sha256 = fileHash(questionFile);
  json(path.join(session,'c4-manifest.json'),manifest);
  immutable(path.join(session,'artifacts',`c4-approval-${hash(JSON.stringify(manifest)).slice(0,24)}.json`),JSON.stringify(manifest,null,2) + '\n');
  return manifest;
}

async function main(args) {
  const command = args.shift(), flags = {};
  while (args.length) { const key = args.shift(); check(key.startsWith('--') && args.length, 'Expected --option value'); flags[key.slice(2)] = args.shift(); }
  check(Object.keys(flags).every(key => ['session','root','question','presentation'].includes(key)), 'Unknown C4 option');
  if (!command || command === '--help') return console.log('C4 toolkit: render --session DIR --root PROJECT [--presentation compact|all]; bind-question --session DIR --question FILE; verify --session DIR. See C4.md.');
  check(flags.session, '--session is required');
  if (command === 'render') {
    check(flags.root, '--root is required');
    const result = await renderPlan(flags.session,flags.root,flags.presentation);
    console.log(JSON.stringify({revision:result.revision, views:Object.keys(result.views), markdown:path.join(flags.session,'c4-approval.md')},null,2));
  } else if (command === 'bind-question') { check(flags.question,'--question is required'); bindQuestion(flags.session,flags.question); console.log('C4 images bound to the actual AFM approval question'); }
  else if (command === 'verify') { verifyC4(flags.session); console.log('C4 source, plan, images and approval question match'); }
  else throw new Error('Unknown C4 command');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
