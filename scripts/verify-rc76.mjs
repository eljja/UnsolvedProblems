import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {run,radius,feasible} from './run-rc76-continuous.mjs';
const root=new URL('../',import.meta.url),read=f=>fs.readFileSync(new URL(f,root),'utf8');
const saved=JSON.parse(read('research/reproducibility/rc76-continuous-result.json'));
assert.deepEqual(run(),saved);
assert.equal(saved.generalCoefficientCertificateCases,1152);
const audit=JSON.parse(read('research/reproducibility/rc76-independent-audit.json'));
assert.equal(audit.grid.caseCount,4320);assert.equal(audit.grid.subsetCheckCount,34452);assert.equal(audit.grid.mismatchCount,0);
for(const f of saved.fixtures){const other=audit.fixtures.find(x=>x.beta.join(',')===f.model.beta.join(','));assert.ok(other);for(const cell of other.cases){const match=f.faults.find(x=>x.g===cell.substitutions&&x.a===cell.erasures);assert.equal(match.radius,cell.worstRadius);}}
assert.equal(saved.observedDecision.joint.thresholdZero,'above');assert.equal(saved.observedDecision.marginal.thresholdZero,'abstain');
assert.equal(saved.robustDecision.lo,'1/10');assert.equal(saved.robustDecision.hi,'3/10');
const m=saved.fixtures[0].model;
assert.equal(feasible(m,[null,'0'],0,0).status,'out-of-budget');
assert.equal(feasible(m,['100','-100'],0,0).status,'model-inconsistent');
assert.equal(feasible(m,['0','0'],0,0).thresholdZero,'abstain');
assert.equal(feasible(m,['-1/2','1/10'],0,0).thresholdZero,'below');
assert.equal(radius({alpha:['0'],beta:['1'],eta:['0'],B:'1'},[0]).radius,'unbounded');
assert.throws(()=>feasible({alpha:['0'],beta:['1'],eta:['0'],B:'1'},['0'],0,0),/Unbounded branches/);
const s={window:{}};
for(const f of ['data.js','expansion-data.js','translations.js','priority-data.js','prize-data.js','research-context.js','solution-context.js','deep-solution-context.js','research-cycle-data.js',...fs.readdirSync(root).filter(f=>/^research-cycle-\d{2}-data.js$/.test(f)).sort()])vm.runInNewContext(read(f),s,{filename:f});
const cycle=s.window.RESEARCH_CYCLES.find(x=>x.id==='RC-2026-76');assert.ok(cycle);
for(const id of cycle.problemIds){const p=s.window.PROBLEMS.find(x=>x.id===id);assert.ok(p.researchHistory.some(x=>x.cycleId==='RC-2026-75'));assert.ok(p.researchHistory.some(x=>x.cycleId===cycle.id));}
for(const f of ['index.html','solve.html','research-log.html'])assert.ok(read(f).includes('research-cycle-76-data.js'));
for(const lang of ['ko','en'])assert.ok(read('sitemap.xml').includes(`RC-2026-76&amp;lang=${lang}`));
for(const a of cycle.artifacts)if(!/^https?:/.test(a.url))assert.ok(fs.existsSync(new URL(a.url,root)),a.url);
assert.ok(s.window.RESEARCH_CONNECTIONS.find(x=>x.id==='CONN-EVIDENCE-046'));
console.log('RC76 verified: exact primal/dual certificates, matching Python radii, explicit collisions, nonlinear feasible decisions, history and bilingual links.');
