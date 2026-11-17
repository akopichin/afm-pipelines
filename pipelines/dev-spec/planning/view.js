(() => {
  'use strict';
  const M = window.DevPlanningModel;
  const $ = id => document.getElementById(id);
  const bootstrap = JSON.parse($('planning-bootstrap').textContent);
  const readOnly = bootstrap.read_only;
  let state = M.restore(bootstrap.state);
  const storageKey = 'afm-dev-planning:' + state.document.session_id;
  const same = M.same;
  const error = value => { $('page-error').textContent = value.message || String(value); $('page-error').hidden = false; };
  const handle = action => event => { try { action(event); } catch (value) { error(value); } };
  try {
    const saved = !readOnly && localStorage.getItem(storageKey);
    if (saved) {
      const local = M.restore(JSON.parse(saved));
      if (!same(local.document.source, state.document.source)) throw new Error('Источник изменился. Сохраните старое обсуждение и откройте новую сессию.');
      const common = Math.min(local.events.length, state.events.length);
      if (!same(local.events.slice(0, common), state.events.slice(0, common))) throw new Error('Истории обсуждения расходятся. Нужна сверка checkpoint с агентом.');
      const supplied = state;
      if (local.events.length >= state.events.length) state = local;
      if (supplied.document.revision > state.document.revision) M.publish(state, supplied.document);
      if (local.document.revision > state.document.revision) M.publish(state, local.document);
      for (const reply of [...local.reply_history, ...supplied.reply_history]) {
        if (!state.reply_history.some(item => same(item, reply))) state.reply_history.push(reply);
      }
      state.drafts = local.drafts;
      if (supplied.locked && supplied.document.revision === state.document.revision && supplied.events.length === state.events.length) state.locked = true;
      state = M.restore(state);
    }
  } catch (value) {
    if (value.name !== 'SecurityError') { error(value); return; }
  }
  let currentID = state.view?.step_id || state.document.steps[0].id;
  let scope = state.view?.scope || 'step';
  let tab = state.view?.tab || 'functions';
  let compare = state.view?.compare || 'previous';
  let zoom = 1, panX = 0, panY = 0;
  let selected = null, trigger = null;
  const root = document.documentElement;
  const steps = () => [state.document.baseline, ...state.document.steps];
  const current = () => steps().find(item => item.id === currentID) || state.document.steps[0];
  const index = () => steps().findIndex(item => item.id === current().id);
  const previous = () => steps()[compare === 'baseline' ? 0 : Math.max(0, index() - 1)];
  const threadID = () => scope === 'plan' ? null : current().id;
  const draftKey = () => threadID() === null ? 'plan' : threadID();
  const draft = () => state.drafts[draftKey()] || {text: '', anchor: null};
  const anchorKinds = {node: 'Компонент', edge: 'Связь', function: 'Функция', contract: 'Контракт', check: 'Проверка'};

  function element(tag, className, content) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (content !== undefined) item.textContent = content;
    return item;
  }
  function svgElement(tag, attrs = {}, content) {
    const item = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, value);
    if (content !== undefined) item.textContent = content;
    return item;
  }
  function save() {
    state.view = {step_id: current().id, scope, tab, compare, theme: state.view?.theme};
    if (readOnly) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      $('storage-note').textContent = 'Агент читает комментарии и отвечает здесь, обновляя предложение.';
    } catch { $('storage-note').textContent = 'Сохранение в браузере недоступно. Держите страницу открытой, пока агент не сохранит checkpoint.'; }
  }
  function applyTheme(theme, remember = false) {
    if (!theme) return;
    if (!['graphite', 'goga'].includes(theme.skin) || !['light', 'dark'].includes(theme.mode)) throw new Error('Неизвестная тема');
    root.dataset.skin = theme.skin; root.dataset.theme = theme.mode;
    for (const key of M.colorTokens) root.style.removeProperty('--' + key);
    for (const [key, value] of Object.entries(theme.tokens || {})) {
      if (M.colorTokens.includes(key) && CSS.supports('color', value)) root.style.setProperty('--' + key, value);
    }
    $('skin').value = theme.skin;
    $('theme-toggle').setAttribute('aria-label', theme.mode === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
    $('theme-toggle').textContent = theme.mode === 'dark' ? '☼' : '☾';
    if (remember) { state.view = {...state.view, theme: M.copy(theme)}; save(); }
  }
  function diff(before, after) {
    const left = new Map(), right = new Map();
    const a = new Map(before.map(item => [item.id, item]));
    const b = new Map(after.map(item => [item.id, item]));
    const signature = item => JSON.stringify(Object.entries(item).filter(([key]) => !['x', 'y'].includes(key)).sort(([a], [b]) => a.localeCompare(b)));
    for (const item of before) {
      if (!b.has(item.id)) left.set(item.id, 'removed');
      else if (signature(item) !== signature(b.get(item.id))) { left.set(item.id, 'changed'); right.set(item.id, 'changed'); }
    }
    for (const item of after) if (!a.has(item.id)) right.set(item.id, 'added');
    return {left, right};
  }
  function positions() {
    const result = new Map();
    for (const step of steps()) for (const node of step.graph.nodes) if (!result.has(node.id)) {
      const ordinal = result.size;
      result.set(node.id, {x: node.x ?? 42 + ordinal % 3 * 230, y: node.y ?? 38 + Math.floor(ordinal / 3) * 145, w: 180, h: 78});
    }
    return result;
  }
  function bounds() {
    const items = [...positions().values()];
    return {width: Math.max(740, ...items.map(item => item.x + item.w + 45)), height: Math.max(495, ...items.map(item => item.y + item.h + 45))};
  }
  function route(edge, placement) {
    const a = placement.get(edge.from), b = placement.get(edge.to);
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
    if (edge.from === edge.to) return {path: `M${a.x + a.w} ${ay} h25 V${a.y - 16} H${ax} V${a.y}`, x: a.x + a.w + 18, y: a.y - 22};
    if (Math.abs(bx - ax) > Math.abs(by - ay)) {
      const sx = bx > ax ? a.x + a.w : a.x, ex = bx > ax ? b.x : b.x + b.w, middle = (sx + ex) / 2;
      return {path: `M${sx} ${ay} H${middle} V${by} H${ex}`, x: middle, y: (ay + by) / 2 - 13};
    }
    const sy = by > ay ? a.y + a.h : a.y, ey = by > ay ? b.y : b.y + b.h, middle = (sy + ey) / 2;
    return {path: `M${ax} ${sy} V${middle} H${bx} V${ey}`, x: (ax + bx) / 2 + 34, y: middle + 4};
  }
  function activate(item, type, id, side) {
    const show = () => { selected = {type, id, side}; trigger = item; select(); inspector(); };
    item.addEventListener('click', show);
    item.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); show(); } });
  }
  function diagram(id, graph, nodeDiff, edgeDiff, side) {
    const svg = $(id), placement = positions(), defs = svgElement('defs');
    svg.replaceChildren();
    for (const [status, color] of [['normal', 'text-muted'], ['added', 'success'], ['changed', 'attention'], ['removed', 'danger']]) {
      const marker = svgElement('marker', {id: `${side}-${status}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto'});
      marker.append(svgElement('path', {d: 'M1 1 L9 5 L1 9', fill: 'none', stroke: `var(--${color})`, 'stroke-width': 1.5})); defs.append(marker);
    }
    svg.append(defs);
    for (const edge of graph.edges) {
      const status = edgeDiff.get(edge.id) || 'normal', line = route(edge, placement);
      const group = svgElement('g', {class: `edge ${status}`, tabindex: 0, role: 'button', 'aria-label': `Связь: ${edge.label}`, 'data-id': edge.id, 'data-type': 'edge'});
      group.append(svgElement('title', {}, edge.label + '\n' + edge.description));
      group.append(svgElement('path', {class: 'edge-line', d: line.path, 'marker-end': `url(#${side}-${status})`}), svgElement('path', {class: 'edge-hit', d: line.path}));
      group.append(svgElement('text', {class: 'edge-label', x: line.x, y: line.y, 'text-anchor': 'middle'}, edge.label.length > 23 ? edge.label.slice(0, 21) + '…' : edge.label));
      activate(group, 'edge', edge.id, side); svg.append(group);
    }
    for (const node of graph.nodes) {
      const box = placement.get(node.id), status = nodeDiff.get(node.id) || 'normal';
      const group = svgElement('g', {class: `node ${status}`, transform: `translate(${box.x} ${box.y})`, tabindex: 0, role: 'button', 'aria-label': `${node.title}. ${node.note}`, 'data-id': node.id, 'data-type': 'node'});
      group.append(svgElement('title', {}, node.title + '\n' + node.description));
      group.append(svgElement('rect', {class: 'selection-ring', x: -5, y: -5, width: 190, height: 88, rx: 12}), svgElement('rect', {class: 'node-box', width: 180, height: 78, rx: 8}));
      for (const [className, y, content] of [['node-kind', 17, node.kind], ['node-title', 40, node.title], ['node-note', 59, node.note]]) group.append(svgElement('text', {class: className, x: 14, y}, content));
      if (status !== 'normal') group.append(svgElement('text', {class: 'node-status', x: 166, y: 18, 'text-anchor': 'end'}, {added: '+', changed: '~', removed: '−'}[status]));
      activate(group, 'node', node.id, side); svg.append(group);
    }
    for (const label of svg.querySelectorAll('.node-title, .node-note')) {
      const chars = [...label.textContent];
      while (chars.length > 1 && label.getComputedTextLength() > 152) { chars.pop(); label.textContent = chars.join('') + '…'; }
    }
  }
  function select() { document.querySelectorAll('.node, .edge').forEach(item => item.classList.toggle('selected', Boolean(selected && selected.id === item.dataset.id && selected.type === item.dataset.type))); }
  function selectionItem() {
    if (!selected) return null;
    const field = selected.type === 'node' ? 'nodes' : 'edges';
    return current().graph[field].find(item => item.id === selected.id) || previous().graph[field].find(item => item.id === selected.id);
  }
  function inspector() {
    const item = selectionItem();
    if (!item) return;
    const field = selected.type === 'node' ? 'nodes' : 'edges';
    const describe = value => value ? (value.title ? value.title + ' · ' + value.note : value.label) : 'Отсутствует';
    $('inspector-kicker').textContent = selected.type === 'node' ? 'Ответственность компонента' : 'Смысл связи';
    $('inspector-title').textContent = item.title || item.label;
    $('inspector-description').textContent = item.description;
    $('inspector-before').textContent = describe(previous().graph[field].find(value => value.id === item.id));
    $('inspector-after').textContent = describe(current().graph[field].find(value => value.id === item.id));
    $('inspector-refs').textContent = 'Основание:\n' + item.evidence.join('\n');
    $('inspector').hidden = false;
  }
  function closeInspector(focus = false) { $('inspector').hidden = true; selected = null; select(); if (focus && trigger?.isConnected) trigger.focus(); }
  function setContext(anchor) {
    if (readOnly || state.locked) return;
    scope = 'step';
    M.draft(state, threadID(), draft().text, anchor);
    save(); conversation(true);
    $('comment-input').focus({preventScroll: true}); $('comment-input').scrollIntoView({block: 'nearest'});
  }
  function technical() {
    const step = current();
    $('details-title').textContent = `Что меняется в коде · шаг ${String(index()).padStart(2, '0')}`;
    $('details-note').textContent = step.task_ids?.join(' · ') || 'Исходная архитектура';
    for (const category of ['functions', 'contracts', 'checks']) {
      const items = step[category] || [], panel = $(`panel-${category}`);
      $(`count-${category}`).textContent = items.length; panel.replaceChildren();
      if (!items.length) panel.append(element('p', 'empty-details', step.detail_notes?.[category] || 'Исходная карта: сначала сверяем устройство системы. Изменения будут описаны в следующих шагах.'));
      items.forEach((item, ordinal) => {
        const entry = element('details', 'detail-entry'); entry.dataset.detailId = item.id; entry.open = ordinal === 0;
        const summary = element('summary'), heading = element('div');
        summary.append(element('span', 'change-mark', category === 'checks' ? '→' : '~'));
        heading.append(element('div', 'detail-title', item.title), element('div', 'detail-file', item.file)); summary.append(heading); entry.append(summary);
        const content = element('div', 'detail-content');
        for (const [title, value] of [['Что', item.what], ['Зачем', item.why]]) {
          const p = element('p', 'detail-description'); p.append(element('strong', '', title + '. '), document.createTextNode(value)); content.append(p);
        }
        if (category === 'functions') {
          const signatures = element('div', 'signature-grid');
          for (const version of ['before', 'after']) {
            const signature = element('div', `signature ${version}`), pre = element('pre');
            signature.append(element('div', 'signature-label', version === 'before' ? 'До этого шага' : 'После этого шага')); pre.append(element('code', '', item[version])); signature.append(pre); signatures.append(signature);
          }
          content.append(signatures);
        } else if (category === 'contracts') {
          const values = element('dl', 'contract-grid');
          values.append(element('dt', '', 'Сейчас'), element('dd', '', item.before), element('dt', '', 'Будет'), element('dd', '', item.after)); content.append(values);
        } else content.append(element('p', 'test-scenario', 'Ожидаем: ' + item.expected));
        if (item.invariants?.length) content.append(element('p', 'detail-invariant', 'Сохраняем: ' + item.invariants.join(' ')));
        content.append(element('p', 'detail-invariant', 'Основание: ' + item.refs.join(' · ')));
        const actions = element('div', 'detail-context'), discuss = element('button', 'text-button', 'Обсудить с агентом →'); discuss.type = 'button'; discuss.disabled = readOnly || state.locked;
        discuss.addEventListener('click', handle(() => setContext({kind: {functions: 'function', contracts: 'contract', checks: 'check'}[category], id: item.id})));
        actions.append(discuss);
        if (item.node_ids.length) {
          const show = element('button', 'text-button detail-node-link', 'Показать на схеме'); show.type = 'button';
          show.addEventListener('click', () => { selected = {type: 'node', id: item.node_ids[0], side: 'after'}; select(); document.querySelector('.workspace').scrollIntoView({block: 'nearest'}); }); actions.append(show);
        }
        content.append(actions); entry.append(content); panel.append(entry);
      });
    }
    setTab(tab);
  }
  function setTab(name, focus = false) {
    tab = ['functions', 'contracts', 'checks'].includes(name) ? name : 'functions';
    for (const key of ['functions', 'contracts', 'checks']) {
      $(`tab-${key}`).setAttribute('aria-selected', String(tab === key)); $(`tab-${key}`).tabIndex = tab === key ? 0 : -1; $(`panel-${key}`).hidden = tab !== key;
    }
    if (focus) $(`tab-${tab}`).focus();
  }
  function message(author, value, anchor = null, metaText = '') {
    const article = element('article', `message ${author}`), meta = element('div', 'message-meta');
    meta.append(element('span', 'message-author', author === 'agent' ? 'Агент' : 'Вы'), element('span', '', metaText)); article.append(meta);
    if (anchor) article.append(element('div', 'message-anchor', `${anchorKinds[anchor.kind]} · ${anchor.label}`));
    article.append(element('div', 'message-text', value)); return article;
  }
  function conversation(scrollToEnd = false) {
    const thread = $('conversation-thread'), scroll = thread.scrollTop;
    thread.replaceChildren();
    const step = current(), status = M.status(state);
    thread.append(message('agent', scope === 'plan' ? state.document.goal : `Что: ${step.what}\n\nЗачем: ${step.why}`, null, `план r${state.document.revision}`));
    for (const event of state.events.filter(item => item.kind === 'comment' && item.step_id === threadID())) {
      thread.append(message('user', event.text, event.anchor, event.id <= state.acknowledged_event_id ? 'сохранено агентом' : 'ожидает чтения'));
      const replies = state.reply_history.filter(reply => reply.event_id === event.id);
      for (const reply of replies) thread.append(message('agent', reply.text, event.anchor, `ответ · r${reply.revision}`));
      if (!replies.length) { const pending = element('div', 'message pending'); pending.append(element('div', 'message-meta', 'Ожидаем ответ агента…')); thread.append(pending); }
    }
    const value = draft();
    $('conversation-step').textContent = scope === 'plan' ? 'Общие вопросы' : `Шаг ${String(index()).padStart(2, '0')}`;
    $('discussion-scope').value = scope;
    $('compose-context-label').textContent = value.anchor ? `${anchorKinds[value.anchor.kind]} · ${value.anchor.label}` : scope === 'plan' ? 'Комментарий ко всему плану' : `Комментарий к шагу ${String(index()).padStart(2, '0')}`;
    $('context-clear').hidden = !value.anchor; $('context-clear').disabled = state.locked;
    $('comment-input').value = value.text; $('comment-input').disabled = readOnly || state.locked;
    $('send-comment').disabled = readOnly || state.locked || !value.text.trim();
    $('agent-status').textContent = readOnly ? 'ОБЗОР' : state.locked ? 'ДИАЛОГ AFM' : status.pending_comment_ids.length ? 'ЖДЁМ АГЕНТА' : 'ОБСУЖДЕНИЕ';
    $('ready-for-approval').disabled = readOnly || state.locked || !state.document.plan || status.pending_comment_ids.length > 0 || Object.values(state.drafts).some(item => item.text.trim());
    $('ready-note').textContent = state.locked ? 'Эта версия зафиксирована. Подтвердите план в диалоге AFM.' : status.ready ? 'Агент подготовит штатный диалог утверждения этой версии.' : status.pending_comment_ids.length ? 'Сначала агент должен ответить на все комментарии.' : 'Окончательное утверждение — в диалоге AFM. Несохранённые черновики нужно отправить или очистить.';
    thread.scrollTop = scrollToEnd ? thread.scrollHeight : scroll;
  }
  function commentsCounts() {
    for (const button of document.querySelectorAll('.step')) {
      button.querySelector('.step-comments')?.remove();
      const count = state.events.filter(item => item.kind === 'comment' && item.step_id === button.dataset.step).length;
      if (count) button.querySelector('.step-label').append(element('span', 'step-comments', `${count} комм.`));
    }
  }
  function updateZoom() {
    const box = bounds(), width = box.width / zoom, height = box.height / zoom;
    document.querySelectorAll('.diagram').forEach(svg => { svg.setAttribute('viewBox', `${(box.width - width) / 2 + panX} ${(box.height - height) / 2 + panY} ${width} ${height}`); });
    $('zoom-reset').textContent = `${Math.round(zoom * 100)}%`; $('zoom-out').disabled = zoom <= .5; $('zoom-in').disabled = zoom >= 2.5;
  }
  function render() {
    currentID = current().id;
    $('plan-title').textContent = state.document.title; $('plan-goal').textContent = state.document.goal;
    document.title = state.document.title + ' · AFM'; $('document-revision').textContent = `Планирование · r${state.document.revision}`;
    document.body.classList.toggle('read-only', readOnly);
    const nav = document.querySelector('.steps'); nav.replaceChildren(); nav.style.setProperty('--step-count', steps().length);
    for (const [ordinal, step] of steps().entries()) {
      const button = element('button', 'step'); button.dataset.step = step.id;
      button.append(element('span', 'step-number', String(ordinal).padStart(2, '0')), element('span', 'step-label', step.title));
      if (step.id === currentID) button.setAttribute('aria-current', 'step');
      button.addEventListener('click', () => go(step.id)); nav.append(button);
    }
    const before = previous(), after = current(), nodes = diff(before.graph.nodes, after.graph.nodes), edges = diff(before.graph.edges, after.graph.edges);
    diagram('before-diagram', before.graph, nodes.left, edges.left, 'before'); diagram('after-diagram', after.graph, nodes.right, edges.right, 'after');
    $('before-title').textContent = index() === 0 ? 'Сейчас' : before.id === 'baseline' ? 'До · исходная архитектура' : 'До · ранее предложенное';
    $('after-title').textContent = index() === 0 ? 'Сначала сверяем исходную схему' : 'После · предлагаемое решение';
    $('before-version').textContent = `ШАГ ${String(steps().findIndex(item => item.id === before.id)).padStart(2, '0')}`; $('after-version').textContent = `ШАГ ${String(index()).padStart(2, '0')}`;
    $('summary-index').textContent = `${String(index()).padStart(2, '0')} / ${String(state.document.steps.length).padStart(2, '0')}`;
    $('summary-title').textContent = after.title; $('summary-what').textContent = after.what; $('summary-why').textContent = after.why;
    $('summary-what-label').textContent = 'Что меняется'; $('summary-why-label').textContent = 'Зачем';
    $('previous').disabled = index() === 0; $('next').disabled = index() === state.document.steps.length;
    $('compare-previous').setAttribute('aria-pressed', String(compare === 'previous')); $('compare-baseline').setAttribute('aria-pressed', String(compare === 'baseline'));
    $('comparison-note').textContent = index() === 0 ? 'Исходная карта подтверждается чтением кода.' : compare === 'previous' ? 'Цветом выделен только этот шаг. Ранее предложенное показано нейтрально.' : 'Цветом выделены все отличия от начала до выбранного шага.';
    technical(); conversation(); commentsCounts(); select(); updateZoom(); save();
  }
  function go(id) { if (!steps().some(step => step.id === id)) return; currentID = id; closeInspector(); render(); }
  function send() {
    if (readOnly) return;
    const value = draft(); M.comment(state, threadID(), $('comment-input').value, value.anchor); save(); conversation(true); commentsCounts();
  }

  $('previous').addEventListener('click', () => go(steps()[Math.max(0, index() - 1)].id));
  $('next').addEventListener('click', () => go(steps()[Math.min(steps().length - 1, index() + 1)].id));
  $('compare-previous').addEventListener('click', () => { compare = 'previous'; closeInspector(); render(); });
  $('compare-baseline').addEventListener('click', () => { compare = 'baseline'; closeInspector(); render(); });
  $('skin').addEventListener('change', handle(() => applyTheme({skin: $('skin').value, mode: root.dataset.theme}, true)));
  $('theme-toggle').addEventListener('click', handle(() => applyTheme({skin: root.dataset.skin, mode: root.dataset.theme === 'dark' ? 'light' : 'dark'}, true)));
  $('zoom-in').addEventListener('click', () => { zoom = Math.min(2.5, +(zoom + .1).toFixed(1)); updateZoom(); });
  $('zoom-out').addEventListener('click', () => { zoom = Math.max(.5, +(zoom - .1).toFixed(1)); updateZoom(); });
  $('zoom-reset').addEventListener('click', () => { zoom = 1; panX = 0; panY = 0; updateZoom(); });
  $('inspector-close').addEventListener('click', () => closeInspector(true));
  $('inspector-discuss').addEventListener('click', handle(() => { const anchor = {kind: selected.type, id: selected.id}; closeInspector(); setContext(anchor); }));
  $('discussion-scope').addEventListener('change', () => { scope = $('discussion-scope').value; conversation(true); save(); });
  $('context-clear').addEventListener('click', handle(() => { M.draft(state, threadID(), draft().text); save(); conversation(); $('comment-input').focus(); }));
  $('comment-input').addEventListener('input', handle(() => { M.draft(state, threadID(), $('comment-input').value, draft().anchor); save(); $('send-comment').disabled = !$('comment-input').value.trim(); const pending = M.status(state).pending_comment_ids.length; $('ready-for-approval').disabled = !state.document.plan || pending > 0 || Object.values(state.drafts).some(item => item.text.trim()); }));
  $('comment-input').addEventListener('keydown', handle(event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) { event.preventDefault(); send(); } }));
  $('comment-form').addEventListener('submit', handle(event => { event.preventDefault(); send(); }));
  $('ready-for-approval').addEventListener('click', handle(() => { M.ready(state); save(); conversation(); }));
  for (const key of ['functions', 'contracts', 'checks']) {
    $(`tab-${key}`).addEventListener('click', () => { setTab(key); save(); });
    $(`tab-${key}`).addEventListener('keydown', event => {
      const names = ['functions', 'contracts', 'checks']; let ordinal = names.indexOf(key);
      if (event.key === 'ArrowRight') ordinal = (ordinal + 1) % names.length;
      else if (event.key === 'ArrowLeft') ordinal = (ordinal + names.length - 1) % names.length;
      else if (event.key === 'Home') ordinal = 0; else if (event.key === 'End') ordinal = names.length - 1; else return;
      event.preventDefault(); setTab(names[ordinal], true); save();
    });
  }
  for (const svg of document.querySelectorAll('.diagram')) {
    let drag;
    svg.addEventListener('click', event => { if (!event.target.closest('.node, .edge')) closeInspector(); });
    svg.addEventListener('pointerdown', event => { if (event.button || event.target.closest('.node, .edge')) return; drag = {x: event.clientX, y: event.clientY, panX, panY, scale: svg.viewBox.baseVal.width / svg.getBoundingClientRect().width}; svg.setPointerCapture(event.pointerId); svg.classList.add('dragging'); });
    svg.addEventListener('pointermove', event => { if (!drag) return; panX = drag.panX - (event.clientX - drag.x) * drag.scale; panY = drag.panY - (event.clientY - drag.y) * drag.scale; updateZoom(); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) svg.addEventListener(type, () => { drag = null; svg.classList.remove('dragging'); });
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeInspector(true); return; }
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.target.closest('input, textarea, select, [contenteditable], [role="tablist"], .conversation-panel, .preferences')) return;
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); const ordinal = Math.max(0, Math.min(steps().length - 1, index() + (event.key === 'ArrowRight' ? 1 : -1))); go(steps()[ordinal].id); }
  });
  window.devPlanning = {
    status: () => ({...M.status(state), locked: state.locked, read_only: readOnly}),
    readEvents: cursor => M.readEvents(state, cursor), checkpoint: () => M.copy(state),
    acknowledge: id => { if (readOnly) throw new Error('Read-only report'); M.acknowledge(state, id); save(); conversation(); return M.status(state); },
    publish: doc => { if (readOnly) throw new Error('Read-only report'); M.publish(state, doc); closeInspector(); applyTheme(state.view?.theme || doc.theme); render(); $('announcement').textContent = `Агент опубликовал план r${doc.revision}.`; return M.status(state); },
    lock: (revision, eventID) => { if (readOnly) throw new Error('Read-only report'); M.lock(state, revision, eventID); render(); return M.copy(state); },
    setTheme: theme => { applyTheme(theme, true); return {skin: root.dataset.skin, mode: root.dataset.theme}; }
  };
  applyTheme(state.view?.theme || state.document.theme || {skin: 'graphite', mode: 'dark'});
  render();
})();
