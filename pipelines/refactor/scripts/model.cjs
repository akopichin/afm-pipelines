/* Shared validation keeps the browser and exported plan on the same contract. */
(function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const list = value => Array.isArray(value);
  const unique = (items, label) => {
    check(list(items), `${label}: expected an array`);
    const ids = new Set();
    for (const item of items) {
      check(item && text(item.id) && !ids.has(item.id), `${label}: missing or duplicate id`);
      ids.add(item.id);
    }
    return ids;
  };

  function graph(graph) {
    const ids = unique(graph.nodes, 'nodes');
    unique(graph.edges, 'edges');
    const nodes = new Map(graph.nodes.map(node => [node.id, node]));
    for (const node of graph.nodes) {
      check(text(node.label), `Missing label: ${node.id}`);
      check(['subsystem', 'package', 'file', 'symbol'].includes(node.kind), `Invalid kind: ${node.id}`);
      const seen = new Set([node.id]);
      let parent = node.parent;
      while (parent) {
        check(ids.has(parent) && !seen.has(parent), `Invalid parent or containment cycle: ${node.id}`);
        seen.add(parent);
        parent = nodes.get(parent).parent;
      }
      for (const [key, value] of Object.entries(node.metrics || {})) {
        check(['loc', 'complexity', 'rp', 'op'].includes(key) && Number.isFinite(value) && value >= 0,
          `Invalid metric: ${node.id}.${key}`);
      }
    }
    for (const edge of graph.edges) {
      check(ids.has(edge.source) && ids.has(edge.target), `Unknown edge endpoint: ${edge.id}`);
      if (edge.symbols !== undefined) check(list(edge.symbols) && edge.symbols.every(text), `Invalid edge symbols: ${edge.id}`);
      if (edge.description !== undefined) check(text(edge.description), `Invalid edge description: ${edge.id}`);
      check(text(edge.kind) && text(edge.evidence), `Missing edge kind/evidence: ${edge.id}`);
      check(['confirmed', 'inferred'].includes(edge.confidence), `Missing confidence: ${edge.id}`);
    }
    return graph;
  }

  function order(doc, selected) {
    const proposals = new Map(doc.proposals.map(p => [p.id, p]));
    const chosen = new Set(selected);
    check(chosen.size === selected.length, 'Duplicate selection');
    const visiting = new Set(), done = new Set(), sorted = [];
    function visit(id) {
      check(proposals.has(id), `Unknown proposal: ${id}`);
      check(!visiting.has(id), `Proposal dependency cycle: ${id}`);
      if (done.has(id)) return;
      visiting.add(id);
      const proposal = proposals.get(id);
      for (const dep of proposal.depends_on) {
        check(chosen.has(dep), `Select prerequisite ${dep} before ${id}`);
        visit(dep);
      }
      for (const other of proposal.conflicts_with) {
        check(!chosen.has(other), `Conflicting proposals: ${id} / ${other}`);
      }
      visiting.delete(id);
      done.add(id);
      sorted.push(id);
    }
    selected.forEach(visit);
    return sorted;
  }

  function target(doc, selected) {
    const result = copy(doc.baseline);
    for (const id of order(doc, selected)) {
      const p = doc.proposals.find(item => item.id === id);
      const change = p.changes;
      const nodeIDs = new Set(result.nodes.map(node => node.id));
      const edgeIDs = new Set(result.edges.map(edge => edge.id));
      for (const removed of change.remove_edges) check(edgeIDs.has(removed), `Unknown removed edge: ${removed}`);
      for (const removed of change.remove_nodes) check(nodeIDs.has(removed), `Unknown removed node: ${removed}`);
      result.edges = result.edges.filter(edge => !change.remove_edges.includes(edge.id));
      result.nodes = result.nodes.filter(node => !change.remove_nodes.includes(node.id));
      for (const patch of change.update_nodes) {
        const node = result.nodes.find(item => item.id === patch.id);
        check(node, `Unknown updated node: ${patch.id}`);
        check(Object.keys(patch).every(key => ['id', 'label', 'parent', 'description'].includes(key)),
          'Only label, parent and description can be projected; future metrics are unknown');
        Object.assign(node, patch);
      }
      result.nodes.push(...copy(change.add_nodes));
      result.edges.push(...copy(change.add_edges));
      graph(result);
    }
    return result;
  }

  function validate(doc) {
    check(doc && doc.schema_version === 1 && text(doc.session_id), 'Expected schema_version=1 and session_id');
    check(Number.isInteger(doc.revision) && doc.revision > 0, 'Expected a positive revision');
    check(Number.isInteger(doc.addressed_event_id) && doc.addressed_event_id >= 0, 'Invalid addressed_event_id');
    check(text(doc.title) && text(doc.goal) && list(doc.constraints), 'Missing project brief');
    check(doc.source && text(doc.source.revision) && text(doc.source.fingerprint) && list(doc.source.limitations),
      'Missing source revision/fingerprint/limitations');
    graph(doc.baseline);
    const nodes = new Set(doc.baseline.nodes.map(n => n.id));
    function priority(item) {
      if (item.priority === undefined) return;
      check(item.priority && [item.priority.benefit, item.priority.ease].every(n => Number.isInteger(n) && n >= 1 && n <= 5) &&
        text(item.priority.reason), `Invalid benefit/ease priority: ${item.id}`);
    }
    const findings = unique(doc.findings, 'findings');
    for (const finding of doc.findings) {
      priority(finding);
      check(text(finding.title) && text(finding.detail) && text(finding.evidence), 'Incomplete finding');
      check(['high', 'medium', 'low'].includes(finding.severity), 'Invalid finding severity');
      check(list(finding.node_ids) && finding.node_ids.every(id => nodes.has(id)), 'Unknown finding node');
    }
    const proposals = unique(doc.proposals, 'proposals');
    for (const p of doc.proposals) {
      priority(p);
      if (p.explanation !== undefined) explanation(p);
      for (const field of ['title', 'rationale', 'effort']) check(text(p[field]), `Missing ${p.id}.${field}`);
      for (const field of ['depends_on', 'conflicts_with', 'finding_ids', 'node_ids', 'steps', 'verification', 'risks']) {
        check(list(p[field]), `Missing ${p.id}.${field}`);
      }
      check(p.steps.length && p.verification.length && p.steps.every(text) && p.verification.every(text),
        `Concrete steps and verification required: ${p.id}`);
      check(p.node_ids.every(id => nodes.has(id)) && p.finding_ids.every(id => findings.has(id)), `Unknown evidence: ${p.id}`);
      check([...p.depends_on, ...p.conflicts_with].every(id => proposals.has(id) && id !== p.id), `Unknown proposal relation: ${p.id}`);
      check(p.changes, `Missing changes: ${p.id}`);
      for (const field of ['add_nodes', 'remove_nodes', 'update_nodes', 'add_edges', 'remove_edges']) {
        check(list(p.changes[field]), `Missing ${p.id}.changes.${field}`);
      }
      check(p.changes.add_nodes.every(node => !node.metrics || Object.keys(node.metrics).length === 0),
        'Do not invent measured metrics for proposed nodes');
    }
    if (doc.replies !== undefined) {
      check(list(doc.replies), 'replies must be an array');
      const topics = new Set();
      for (const reply of doc.replies) {
        check(reply && (reply.proposal_id === null || text(reply.proposal_id)) && text(reply.text), 'Invalid discussion reply');
        check(!topics.has(reply.proposal_id), 'Duplicate discussion reply topic');
        topics.add(reply.proposal_id);
      }
    }
    // Validate each alternative with its prerequisites, without combining conflicting alternatives.
    for (const proposal of doc.proposals) {
      const closure = new Set();
      function add(id) {
        if (closure.has(id)) return;
        closure.add(id);
        doc.proposals.find(p => p.id === id).depends_on.forEach(add);
      }
      add(proposal.id);
      target(doc, [...closure]);
    }
    return doc;
  }

  function explanation(proposal) {
    const value = proposal.explanation;
    check(value && typeof value === 'object', `Missing ${proposal.id}.explanation`);
    for (const [key, limit] of [['why',160],['problem',360],['before',360],['after',360]])
      check(text(value[key]) && value[key].length <= limit, `Expected concise ${proposal.id}.explanation.${key} (up to ${limit} characters)`);
    for (const key of ['before_refs','after_refs']) if (value[key] !== undefined)
      check(list(value[key]) && value[key].length <= 8 && value[key].every(v => text(v) && v.length <= 200), `Invalid ${proposal.id}.explanation.${key}`);
    return value;
  }

  function documentReplies(doc, events, previous = 0) {
    let entries = doc.replies;
    if (!entries?.length && text(doc.reply)) {
      const topics = [...new Set(events.filter(e => e.kind === 'comment' && e.id > previous && e.id <= doc.addressed_event_id).map(e => e.proposal_id || null))];
      entries = (topics.length ? topics : [null]).map(proposal_id => ({proposal_id, text:doc.reply}));
    }
    return (entries || []).map(r => ({...copy(r), revision:doc.revision, through:doc.addressed_event_id}));
  }

  function replies(state) {
    const history = copy(state.reply_history || []);
    if (!history.some(r => r.revision === state.document.revision))
      history.push(...documentReplies(state.document, state.events, Math.max(0,...history.map(r=>r.through))));
    return history;
  }

  function create(doc) {
    validate(doc);
    check(doc.addressed_event_id === 0, 'Initial document must address event 0');
    return {schema_version: 1, document: copy(doc), selected: [], events: [], acknowledged: 0, approval: null, sealed: false};
  }

  function event(state, kind, fields = {}) {
    state.events.push({id: state.events.length + 1, kind, revision: state.document.revision,
      at: new Date().toISOString(), ...fields});
    state.approval = null;
  }

  function plans(state) {
    const groups = copy(state.plan_groups || [{id:'plan-1', title:'План 1', proposal_ids:[...state.selected]}]);
    const ids = unique(groups, 'plans'), owner = new Map();
    check(groups.length > 0, 'Нужен хотя бы один план');
    for (const group of groups) {
      check(/^[a-zA-Z0-9_-]+$/.test(group.id) && text(group.title) && group.title.length <= 120 && list(group.proposal_ids), 'Некорректное название плана');
      for (const id of group.proposal_ids) {
        check(state.selected.includes(id) && !owner.has(id), 'Этап должен быть выбран и входить ровно в один план');
        owner.set(id, group.id);
      }
    }
    check(state.selected.every(id => owner.has(id)), 'Распределите все выбранные этапы по планам');
    const dependencies = new Map(groups.map(g => [g.id, new Set()]));
    for (const p of state.document.proposals.filter(p => owner.has(p.id)))
      for (const dep of p.depends_on) if (owner.get(dep) !== owner.get(p.id)) {
        check(owner.has(dep), 'Сначала выберите обязательные этапы');
        dependencies.get(owner.get(p.id)).add(owner.get(dep));
      }
    const visiting = new Set(), done = new Set(), result = [], ordered = order(state.document, state.selected);
    function visit(id) {
      check(!visiting.has(id), 'Планы зависят друг от друга по кругу. Перенесите связанные этапы в один план или измените группировку.');
      if (done.has(id)) return;
      visiting.add(id);dependencies.get(id).forEach(visit);visiting.delete(id);done.add(id);
      const group = groups.find(g => g.id === id);
      result.push({...group, proposal_ids:ordered.filter(p => owner.get(p) === id), depends_on:[...dependencies.get(id)]});
    }
    ids.forEach(visit);
    return result;
  }

  function setPlans(state, groups) {
    check(!state.sealed, 'Session is sealed');
    const next = {...copy(state), plan_groups:copy(groups)};
    plans(next);
    event(next, 'plans', {plan_groups:copy(groups)});
    return next;
  }

  function select(state, id, enabled, planID) {
    check(!state.sealed, 'Session is sealed');
    const next = copy(state);
    const selected = enabled ? [...new Set([...next.selected, id])] : next.selected.filter(value => value !== id);
    target(next.document, selected);
    next.selected = order(next.document, selected);
    if (next.plan_groups) {
      for (const group of next.plan_groups) group.proposal_ids = group.proposal_ids.filter(p => selected.includes(p));
      if (enabled && !next.plan_groups.some(g => g.proposal_ids.includes(id))) {
        const prerequisites=next.document.proposals.find(p=>p.id===id).depends_on;
        const preceding=plans(state).filter(g=>g.proposal_ids.some(p=>prerequisites.includes(p))).at(-1);
        const group = next.plan_groups.find(g => g.id === (planID||preceding?.id)) || next.plan_groups[0];
        group.proposal_ids.push(id);
      }
      plans(next);
    }
    event(next, 'selection', {proposal_id: id, enabled});
    return next;
  }

  function comment(state, message, proposalID = null) {
    check(!state.sealed && text(message) && message.length <= 20000, 'Enter a comment (up to 20,000 characters)');
    check(!proposalID || state.document.proposals.some(p => p.id === proposalID), 'Unknown proposal');
    const next = copy(state);
    event(next, 'comment', {text: message, proposal_id: proposalID});
    return next;
  }

  function approve(state) {
    check(!state.sealed, 'Session is sealed');
    const unanswered = state.events.some(e => e.kind === 'comment' && e.id > state.document.addressed_event_id);
    check(!unanswered, 'Wait for the agent to address your comments before approving');
    target(state.document, state.selected);
    plans(state);
    const next = copy(state);
    const grouping = next.plan_groups ? {plan_groups:copy(next.plan_groups)} : {};
    event(next, 'approval', {selected: [...next.selected], ...grouping});
    next.approval = {revision: next.document.revision, event_id: next.events.length, selected: [...next.selected], ...grouping};
    return next;
  }

  function publish(state, doc) {
    validate(doc);
    check(!state.sealed, 'Session is sealed');
    check(doc.session_id === state.document.session_id, 'Different session');
    if (JSON.stringify(doc) === JSON.stringify(state.document)) return copy(state);
    check(doc.revision > state.document.revision, 'Stale document revision');
    check(JSON.stringify(doc.baseline) === JSON.stringify(state.document.baseline) &&
      JSON.stringify(doc.source) === JSON.stringify(state.document.source), 'Baseline is immutable; start a new session for a rescan');
    check(doc.addressed_event_id >= state.document.addressed_event_id && doc.addressed_event_id <= state.events.length,
      'Invalid addressed event cursor');
    if (state.document.proposals.length && state.document.proposals.every(p=>p.explanation)) doc.proposals.forEach(explanation);
    const addressed = state.events.filter(e=>e.kind==='comment' && e.id>state.document.addressed_event_id && e.id<=doc.addressed_event_id);
    if (doc.replies !== undefined) for (const comment of addressed)
      check(doc.replies.some(r=>r.proposal_id===(comment.proposal_id||null)), 'Missing reply for discussion: '+(comment.proposal_id||'general'));
    const reply_history = [...replies(state), ...documentReplies(doc, state.events, state.document.addressed_event_id)];
    const changed = ['proposals','findings','goal','constraints'].some(key=>JSON.stringify(doc[key])!==JSON.stringify(state.document[key]));
    return {...copy(state), document: copy(doc), reply_history, selected:changed?[]:copy(state.selected), approval: null,
      ...(state.plan_groups ? {plan_groups:state.plan_groups.map(g => ({...copy(g),proposal_ids:changed?[]:copy(g.proposal_ids)}))} : {})};
  }

  function restore(state) {
    check(state && state.schema_version === 1 && list(state.events) && list(state.selected), 'Invalid checkpoint');
    validate(state.document);
    if (state.reply_history !== undefined) {
      check(list(state.reply_history), 'Invalid reply history');
      for (const reply of state.reply_history) check(reply && text(reply.text) &&
        (reply.proposal_id===null || text(reply.proposal_id)) && Number.isInteger(reply.revision) && reply.revision>0 && reply.revision<=state.document.revision &&
        Number.isInteger(reply.through) && reply.through>=0 && reply.through<=state.document.addressed_event_id, 'Invalid saved discussion reply');
    }
    state.events.forEach((e, index) => check(e.id === index + 1 && text(e.kind), 'Invalid event sequence'));
    check(Number.isInteger(state.acknowledged) && state.acknowledged >= 0 && state.acknowledged <= state.events.length,
      'Invalid acknowledgement');
    check(state.document.addressed_event_id <= state.events.length, 'Invalid addressed event cursor');
    target(state.document, state.selected);
    plans(state);
    if (state.approval) {
      const a = state.approval, last = state.events.at(-1);
      check(a.revision === state.document.revision && a.event_id === last?.id && last.kind === 'approval' &&
        last.revision === a.revision && JSON.stringify(last.selected) === JSON.stringify(state.selected) &&
        JSON.stringify(a.selected) === JSON.stringify(state.selected), 'Stale or invalid approval');
      check(JSON.stringify(a.plan_groups) === JSON.stringify(state.plan_groups) &&
        JSON.stringify(last.plan_groups) === JSON.stringify(state.plan_groups), 'Plan grouping changed after approval');
      check(!state.events.some(e => e.kind === 'comment' && e.id > state.document.addressed_event_id), 'Unanswered comments');
    }
    check(typeof state.sealed === 'boolean' && (!state.sealed || state.approval), 'Sealed checkpoint needs approval');
    return copy(state);
  }

  function seal(state, revision, approvalEventID) {
    restore(state);
    check(state.approval && state.document.revision === revision && state.approval.event_id === approvalEventID,
      'Approval changed; read the latest user decision');
    return {...copy(state), sealed: true};
  }

  const api = {validate, explanation, replies, graph, order, target, create, select, plans, setPlans, comment, approve, publish, restore, seal};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RefactorModel = api;
})(globalThis);
