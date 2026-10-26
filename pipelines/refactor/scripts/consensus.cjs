const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const M = require('./model.cjs');

const bindingPath = path.join(__dirname, '..', 'bindings.json');
function modelsForRun() {
  const binding = JSON.parse(fs.readFileSync(bindingPath, 'utf8'));
  check(binding.schema_version === 1 && binding.pipeline === 'refactor' &&
    Object.keys(binding.roles || {}).sort().join(',') === 'architect_a,architect_b', 'Invalid reviewer bindings');
  return Object.fromEntries(Object.entries(binding.roles).map(([role, value]) => {
    check(text(value.model) && text(value.profile) && text(value.client), 'Incomplete binding: ' + role);
    return [role, value.model];
  }));
}
const files = ['source.json', 'architect_a-findings.json', 'architect_b-findings.json', 'architecture.json', 'consensus.json'];
const check = (ok, message) => {if (!ok) throw new Error(message);};
const text = value => typeof value === 'string' && value.trim().length > 0;
const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));

function digest(dir) {
  modelsForRun();
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(bindingPath));
  for (const name of files) {
    const bytes = fs.readFileSync(path.join(dir, name));
    hash.update(name + '\0' + bytes.length + '\0');
    hash.update(bytes);
  }
  return hash.digest('hex');
}

function sameIDs(actual, expected, context) {
  check(Array.isArray(actual) && actual.length === expected.length && new Set(actual).size === actual.length &&
    expected.every(id => actual.includes(id)), `Incomplete or duplicate ${context}`);
}

function priority(value, context) {
  check(value && [value.benefit, value.ease].every(n => Number.isInteger(n) && n >= 1 && n <= 5) &&
    text(value.reason), `Missing benefit/ease ranking: ${context}`);
}

function validate(dir) {
  const models = modelsForRun();
  const source = read(dir, 'source.json');
  const doc = M.validate(read(dir, 'architecture.json'));
  check(doc.revision === 1 && doc.addressed_event_id === 0, 'Initial consensus must precede workshop feedback');
  check(doc.source.fingerprint === source.fingerprint && doc.source.revision === source.revision, 'Architecture source mismatch');
  const reports = {};
  for (const [reviewer, model] of Object.entries(models)) {
    const report = read(dir, reviewer + '-findings.json');
    check(report.schema_version === 2 && report.reviewer === reviewer && report.model === model, `Wrong architect: ${reviewer}`);
    check(report.source?.fingerprint === source.fingerprint && report.source?.revision === source.revision, `Report source mismatch: ${reviewer}`);
    check(Array.isArray(report.findings) && Array.isArray(report.limitations) && text(report.architecture_notes), `Incomplete report: ${reviewer}`);
    const ids = new Set();
    for (const f of report.findings) {
      check(text(f.id) && !ids.has(f.id), `Duplicate/missing finding in ${reviewer}`);ids.add(f.id);
      check(text(f.title) && text(f.detail) && text(f.evidence), `Incomplete evidence: ${reviewer}/${f.id}`);
      priority(f.priority, reviewer + '/' + f.id);
    }
    reports[reviewer] = report;
  }
  for (const item of [...doc.findings, ...doc.proposals]) priority(item.priority, item.id);
  doc.proposals.forEach(M.explanation);
  const consensus = read(dir, 'consensus.json');
  check(consensus.schema_version === 2 && consensus.source_fingerprint === source.fingerprint &&
    consensus.ranking_policy === 'benefit_then_ease', 'Invalid consensus source or ranking policy');
  check(Array.isArray(consensus.dispositions) && Array.isArray(consensus.joint_findings) &&
    Array.isArray(consensus.open_questions) && text(consensus.summary), 'Incomplete consensus');
  const findingIDs = doc.findings.map(f => f.id), covered = new Set(), seen = new Set();
  for (const d of consensus.dispositions) {
    const key = d.reviewer + '/' + d.finding_id;
    check(reports[d.reviewer]?.findings.some(f => f.id === d.finding_id) && !seen.has(key), `Unknown/duplicate disposition: ${key}`);
    seen.add(key);
    check(['accepted', 'rejected', 'deferred'].includes(d.status) && text(d.reason) &&
      Array.isArray(d.merged_finding_ids), `Incomplete disposition: ${key}`);
    if (d.status === 'accepted') {
      check(d.merged_finding_ids.length > 0 && d.merged_finding_ids.every(id => findingIDs.includes(id)), `Accepted finding lacks a merged result: ${key}`);
      d.merged_finding_ids.forEach(id => covered.add(id));
    } else check(d.merged_finding_ids.length === 0, `Unresolved finding presented as agreed: ${key}`);
  }
  for (const [reviewer, report] of Object.entries(reports))
    for (const f of report.findings) check(seen.has(reviewer + '/' + f.id), `Finding silently dropped: ${reviewer}/${f.id}`);
  const joint = new Set();
  for (const item of consensus.joint_findings) {
    check(findingIDs.includes(item.finding_id) && !joint.has(item.finding_id) && text(item.reason) && text(item.evidence), 'Invalid joint finding');
    joint.add(item.finding_id);covered.add(item.finding_id);
  }
  check(findingIDs.every(id => covered.has(id)), 'Merged finding lacks provenance');
  const ranked = items => items.every((item, i) => i === 0 ||
    items[i - 1].priority.benefit > item.priority.benefit ||
    (items[i - 1].priority.benefit === item.priority.benefit && items[i - 1].priority.ease >= item.priority.ease));
  check(ranked(doc.findings) && ranked(doc.proposals), 'List is not ranked by benefit, then ease');
  const packet = digest(dir);
  for (const [reviewer, model] of Object.entries(models)) {
    const approval = read(dir, reviewer + '-approval.json');
    check(approval.reviewer === reviewer && approval.model === model, `Wrong approval author: ${reviewer}`);
    check(approval.packet_sha256 === packet, `Stale approval: ${reviewer}`);
    check(approval.verdict === 'pass' && approval.ranking_accepted === true && text(approval.rationale) &&
      Array.isArray(approval.blocking_issues) && approval.blocking_issues.length === 0, `Consensus not approved: ${reviewer}`);
    sameIDs(approval.finding_ids, findingIDs, reviewer + ' finding approval');
    sameIDs(approval.proposal_ids, doc.proposals.map(p => p.id), reviewer + ' proposal approval');
  }
  return {packet_sha256: packet, findings: doc.findings.length, proposals: doc.proposals.length};
}

module.exports = {digest, validate};
if (require.main === module) {
  try {
    const [command, flag, dir, ...extra] = process.argv.slice(2);
    check(['digest', 'check'].includes(command) && flag === '--stage' && dir && !extra.length,
      'Usage: node consensus.cjs digest|check --stage ANALYZE_DIRECTORY');
    console.log(command === 'digest' ? digest(dir) : JSON.stringify(validate(dir)));
  } catch (error) {console.error(error.message);process.exitCode = 1;}
}
