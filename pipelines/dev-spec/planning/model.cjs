(function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
  const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value) && !['constructor', 'prototype', '__proto__'].includes(value);
  const categories = ['functions', 'contracts', 'checks'];
  const colorTokens = ['surface-canvas', 'surface-raised', 'surface-overlay', 'text-primary', 'text-secondary', 'text-muted', 'accent-primary', 'attention', 'success', 'danger', 'separator-subtle', 'control-border'];

  function strings(value, label, nonempty = false) {
    check(Array.isArray(value) && (!nonempty || value.length > 0) && value.every(text), `${label}: expected ${nonempty ? 'nonempty ' : ''}text array`);
  }
  function unique(items, label) {
    check(Array.isArray(items), `${label}: expected array`);
    const ids = new Set();
    for (const item of items) {
      check(item && identifier(item.id) && !ids.has(item.id), `${label}: invalid or duplicate id`);
      ids.add(item.id);
    }
    return ids;
  }
  function explanation(item, label) {
    check(text(item.what) && text(item.why), `${label}: both what and why are required`);
  }
  function graph(value, label) {
    check(value && typeof value === 'object', `${label}: missing graph`);
    const nodes = unique(value.nodes, `${label}.nodes`);
    unique(value.edges, `${label}.edges`);
    for (const node of value.nodes) {
      for (const field of ['title', 'note', 'kind', 'description']) check(text(node[field]), `${label}.${node.id}: missing ${field}`);
      strings(node.evidence, `${label}.${node.id}.evidence`, true);
      for (const coord of ['x', 'y']) if (node[coord] !== undefined) check(Number.isFinite(node[coord]) && node[coord] >= 0 && node[coord] <= 10000, `Invalid coordinate: ${node.id}.${coord}`);
    }
    for (const edge of value.edges) {
      check(nodes.has(edge.from) && nodes.has(edge.to), `${label}: dangling edge ${edge.id}`);
      check(text(edge.label) && text(edge.description), `${label}.${edge.id}: missing relation meaning`);
      strings(edge.evidence, `${label}.${edge.id}.evidence`, true);
    }
    return value;
  }
  function validate(doc) {
    check(doc && doc.schema_version === 1 && identifier(doc.session_id), 'Expected schema_version 1 and stable session_id');
    check(Number.isSafeInteger(doc.revision) && doc.revision > 0, 'Expected positive revision');
    check(text(doc.title) && text(doc.goal), 'Missing title or goal');
    check(doc.source && text(doc.source.root) && text(doc.source.revision) && hash(doc.source.fingerprint), 'Missing source identity');
    strings(doc.source.exclusions, 'source.exclusions');
    check(doc.baseline && doc.baseline.id === 'baseline' && text(doc.baseline.title), 'Missing baseline');
    explanation(doc.baseline, 'baseline');
    graph(doc.baseline.graph, 'baseline');
    const ids = unique(doc.steps, 'steps');
    check(doc.steps.length > 0 && !ids.has('baseline') && !ids.has('plan'), 'At least one step with an unreserved id is required');
    for (const step of doc.steps) {
      check(text(step.title), `Missing title: ${step.id}`);
      explanation(step, step.id);
      graph(step.graph, step.id);
      strings(step.task_ids, `${step.id}.task_ids`, true);
      const availableNodes = new Set([doc.baseline, ...doc.steps].flatMap(item => item.graph.nodes).map(node => node.id));
      const detailIDs = new Set();
      for (const category of categories) {
        unique(step[category], `${step.id}.${category}`);
        if (!step[category].length) check(text(step.detail_notes?.[category]), `${step.id}: explain why ${category} is empty`);
        for (const detail of step[category]) {
          check(!detailIDs.has(detail.id), `Duplicate detail id in step: ${detail.id}`);
          detailIDs.add(detail.id);
          check(text(detail.title) && text(detail.file), `${detail.id}: missing symbol/contract title or source location`);
          explanation(detail, detail.id);
          strings(detail.refs, `${detail.id}.refs`, true);
          strings(detail.node_ids, `${detail.id}.node_ids`);
          check(detail.node_ids.every(id => availableNodes.has(id)), `Unknown component reference: ${detail.id}`);
          if (category === 'checks') check(text(detail.expected), `${detail.id}: missing expected observation`);
          else check(text(detail.before) && text(detail.after), `${detail.id}: before and after are required`);
          if (detail.invariants !== undefined) strings(detail.invariants, `${detail.id}.invariants`);
        }
      }
    }
    check(Array.isArray(doc.replies), 'replies must be an array');
    const replied = new Set();
    for (const reply of doc.replies) {
      check(reply && Number.isSafeInteger(reply.event_id) && reply.event_id > 0 && text(reply.text) && !replied.has(reply.event_id), 'Invalid or duplicate reply event_id');
      replied.add(reply.event_id);
    }
    if (doc.plan) check(hash(doc.plan.sha256) && hash(doc.plan.project_sha256), 'Invalid plan binding');
    if (doc.theme) {
      check(['graphite', 'goga'].includes(doc.theme.skin) && ['dark', 'light'].includes(doc.theme.mode), 'Invalid theme');
      for (const [key, value] of Object.entries(doc.theme.tokens || {})) check(colorTokens.includes(key) && typeof value === 'string' && /^(#[a-f\d]{3,8}|rgba?\([\d.,%\s/]+\))$/i.test(value), `Invalid theme token: ${key}`);
    }
    return doc;
  }
  function create(doc) {
    validate(doc);
    check(doc.replies.length === 0, 'A new session cannot contain replies without comment events');
    return {schema_version: 1, document: copy(doc), events: [], acknowledged_event_id: 0, drafts: {}, reply_history: [], locked: false};
  }
  function restore(checkpoint) {
    check(checkpoint && checkpoint.schema_version === 1, 'Invalid checkpoint');
    validate(checkpoint.document);
    check(typeof checkpoint.locked === 'boolean', 'Missing approval lock state');
    check(Array.isArray(checkpoint.events) && Array.isArray(checkpoint.reply_history), 'Missing discussion history');
    for (const [index, event] of checkpoint.events.entries()) {
      check(event && event.id === index + 1 && ['comment', 'ready'].includes(event.kind) && Number.isSafeInteger(event.revision) && event.revision > 0 && event.revision <= checkpoint.document.revision, 'Invalid event sequence');
      if (event.kind === 'comment') {
        check(text(event.text) && (event.step_id === null || identifier(event.step_id)), 'Invalid comment');
        if (event.anchor) check(identifier(event.anchor.id) && text(event.anchor.label) && ['node', 'edge', 'function', 'contract', 'check'].includes(event.anchor.kind), 'Invalid comment anchor');
      }
    }
    check(Number.isSafeInteger(checkpoint.acknowledged_event_id) && checkpoint.acknowledged_event_id >= 0 && checkpoint.acknowledged_event_id <= checkpoint.events.length, 'Invalid saved cursor');
    for (const reply of checkpoint.reply_history) {
      check(checkpoint.events[reply.event_id - 1]?.kind === 'comment' && Number.isSafeInteger(reply.revision) && reply.revision > 0 && reply.revision <= checkpoint.document.revision && text(reply.text), 'Reply does not belong to a comment');
    }
    for (const reply of checkpoint.document.replies) check(checkpoint.reply_history.some(item => item.event_id === reply.event_id && item.text === reply.text), 'Published reply missing from history');
    check(checkpoint.drafts && typeof checkpoint.drafts === 'object' && !Array.isArray(checkpoint.drafts), 'Missing drafts');
    for (const draft of Object.values(checkpoint.drafts)) check(draft && typeof draft.text === 'string' && draft.text.length <= 12000, 'Invalid draft');
    return copy(checkpoint);
  }
  function scope(doc, stepID) {
    if (stepID === null) return null;
    if (stepID === 'baseline') return doc.baseline;
    const step = doc.steps.find(item => item.id === stepID);
    check(step, 'Unknown discussion step');
    return step;
  }
  function anchorFor(doc, stepID, anchor) {
    if (!anchor) return null;
    const step = scope(doc, stepID);
    check(step, 'An element comment needs a step');
    const graphs = [doc.baseline.graph, ...doc.steps.map(item => item.graph)];
    let item;
    if (anchor.kind === 'node') item = graphs.flatMap(value => value.nodes).find(value => value.id === anchor.id);
    else if (anchor.kind === 'edge') item = graphs.flatMap(value => value.edges).find(value => value.id === anchor.id);
    else {
      const category = {function: 'functions', contract: 'contracts', check: 'checks'}[anchor.kind];
      check(category, 'Unknown anchor kind');
      item = (step[category] || []).find(value => value.id === anchor.id);
    }
    check(item, 'Unknown comment target');
    return {kind: anchor.kind, id: item.id, label: item.title || item.label};
  }
  function draft(state, stepID, value, anchor = null) {
    check(!state.locked, 'This revision is awaiting the AFM approval dialog');
    scope(state.document, stepID);
    check(typeof value === 'string' && value.length <= 12000, 'Comment is too long');
    state.drafts[stepID === null ? 'plan' : stepID] = {text: value, anchor: anchorFor(state.document, stepID, anchor)};
  }
  function comment(state, stepID, value, anchor = null) {
    check(!state.locked, 'This revision is awaiting the AFM approval dialog');
    scope(state.document, stepID);
    check(text(value) && value.length <= 12000, 'Empty or oversized comment');
    const event = {id: state.events.length + 1, kind: 'comment', revision: state.document.revision, step_id: stepID,
      text: value.trim(), anchor: anchorFor(state.document, stepID, anchor)};
    state.events.push(event);
    draft(state, stepID, '', anchor);
    return copy(event);
  }
  function status(state) {
    const answered = new Set(state.reply_history.map(reply => reply.event_id));
    const pending = state.events.filter(event => event.kind === 'comment' && !answered.has(event.id)).map(event => event.id);
    const last = state.events.at(-1);
    const ready = Boolean(last?.kind === 'ready' && last.revision === state.document.revision && !pending.length && !Object.values(state.drafts).some(item => item.text.trim()));
    return {session_id: state.document.session_id, revision: state.document.revision, last_event_id: state.events.length,
      acknowledged_event_id: state.acknowledged_event_id, pending_comment_ids: pending, ready,
      ready_event_id: ready ? last.id : null};
  }
  function ready(state) {
    check(!state.locked, 'This revision is already awaiting approval');
    check(state.document.plan, 'Bind dev-plan.md and project.json before continuing to approval');
    check(!status(state).pending_comment_ids.length, 'Wait for the agent to address all comments');
    check(!Object.values(state.drafts).some(item => item.text.trim()), 'Send or clear unfinished drafts before continuing');
    const event = {id: state.events.length + 1, kind: 'ready', revision: state.document.revision};
    state.events.push(event);
    return copy(event);
  }
  function publish(state, doc) {
    validate(doc);
    check(doc.session_id === state.document.session_id && same(doc.source, state.document.source), 'Source/session changed; keep the old discussion and start a new session');
    check(same(doc.baseline, state.document.baseline), 'The baseline is frozen for this source snapshot');
    check(doc.revision > state.document.revision, 'Publish a newer revision');
    for (const event of state.events) if (event.kind === 'comment' && event.step_id && event.step_id !== 'baseline') check(doc.steps.some(item => item.id === event.step_id), 'Keep commented step IDs; describe withdrawn steps explicitly');
    for (const [stepID, value] of Object.entries(state.drafts)) if (value.text.trim() && !['baseline', 'plan'].includes(stepID)) check(doc.steps.some(item => item.id === stepID), 'Keep steps with unfinished drafts');
    const additions = [];
    for (const reply of doc.replies) {
      check(state.events[reply.event_id - 1]?.kind === 'comment', 'A reply must reference the original comment event');
      if (!state.reply_history.some(item => item.event_id === reply.event_id && item.text === reply.text)) additions.push({...copy(reply), revision: doc.revision});
    }
    state.document = copy(doc);
    state.reply_history.push(...additions);
    state.locked = false;
    return status(state);
  }
  function readEvents(state, after = 0) {
    check(Number.isSafeInteger(after) && after >= 0 && after <= state.events.length, 'Invalid event cursor');
    return copy(state.events.filter(event => event.id > after));
  }
  function acknowledge(state, id) {
    check(Number.isSafeInteger(id) && id >= state.acknowledged_event_id && id <= state.events.length, 'Invalid acknowledgement');
    state.acknowledged_event_id = id;
  }
  function lock(state, revision, eventID) {
    const current = status(state);
    check(current.ready && revision === current.revision && eventID === current.last_event_id, 'Readiness changed; reread user feedback');
    state.locked = true;
    return copy(state);
  }
  const api = {validate, create, restore, draft, comment, ready, publish, status, readEvents, acknowledge, lock, copy, same, colorTokens};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DevPlanningModel = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
