import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='research/reproducibility/';
const read=f=>JSON.parse(fs.readFileSync(dir+f,'utf8'));
const normalizedHash=text=>crypto.createHash('sha256').update(text.replaceAll('\r\n','\n'),'utf8').digest('hex');
const hash=f=>normalizedHash(fs.readFileSync(dir+f,'utf8'));
assert.equal(normalizedHash('{\r\n"a":1\r\n}'),normalizedHash('{\n"a":1\n}'));
assert.notEqual(normalizedHash('{"a":1}'),normalizedHash('{"a":2}'));
const r=read('rc74-aperture-decomposition.json'), a=read('rc74-independent-aperture-audit.json');
assert(r.hashPolicy.includes('CRLF normalized to LF') && a.hashPolicy.includes('CRLF normalized to LF'));
assert.equal(r.inputResultSha256,hash('rc73-nircam-calibration-result.json'));
assert.equal(a.inputSha256,hash('rc74-aperture-pixels.json'));
assert.equal(r.rows.length,24);
assert.equal(new Set(r.rows.map(x=>x.filename)).size,24);
assert.equal(r.cacheHashes.length,24);
assert(r.cacheHashes.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
assert.equal(r.rows.filter(x=>x.exactR5===null).length,2);
assert(r.rows.filter(x=>x.exactR5===null).every(x=>x.group.includes('NRCA3') && x.missingPixelsR5===1 && x.missingAreaR5>0));
assert.equal(r.groups.exactR5['WDFS2317-29|NRCA3|F090W'].n,3);
assert.equal(r.groups.exactR5['WDFS2317-29|NRCA3|F150W'].maximumExcursion,null);
assert(r.groups.exactR5['WDFS0458-56|NRCB1|F090W'].maximumExcursion>.02);
assert(r.matchedPatterns.exactR5.F090W>.01);
assert(r.matchedPatterns.exactR5.F150W<.01);
assert(r.finiteFamilyEnvelope.optimisticPattern2Deficit>.02);
assert(Math.abs(a.optimisticPattern2Deficit-r.finiteFamilyEnvelope.optimisticPattern2Deficit)<1e-12);
assert(a.reproduced && a.maxRelativeFluxDifference<1e-8 && a.maxDiskAreaError<1e-10);
assert.equal(r.rows.find(x=>x.group==='WDFS0458-56|NRCB1|F090W' && x.pattern===2).bit4PixelsR2,0);
// Recompute from committed pixels on CI; do not trust the saved success flag.
execFileSync(process.execPath,['scripts/independent-rc74-aperture-audit.mjs'],{stdio:'pipe'});
const record=read('rc74-research-record.json');
assert(record.failuresPreserved.length>=4 && record.sources.length>=5);
assert(record.nextStart.includes('Program 7565'));
assert.equal(record.prize.amount,null);
const box={window:{}};
for(const f of ['data.js','expansion-data.js','translations.js','priority-data.js','prize-data.js','research-context.js','solution-context.js','deep-solution-context.js','research-cycle-data.js',...Array.from({length:72},(_,i)=>`research-cycle-${String(i+3).padStart(2,'0')}-data.js`)]) vm.runInNewContext(fs.readFileSync(f,'utf8'),box,{filename:f});
const cycle=box.window.RESEARCH_CYCLES.find(x=>x.id==='RC-2026-74');
assert.deepEqual(Array.from(cycle.problemIds),['UP-003','UP-625']);
for(const pid of cycle.problemIds) {
  const problem=box.window.PROBLEMS.find(p=>p.id===pid), current=problem.cycleResearch;
  assert.equal(current.cycleId,cycle.id);
  assert(problem.researchHistory.some(x=>x.cycleId==='RC-2026-73'));
  for(const key of ['centralQuestion','resolutionCriterion','updatedDefinition','knownBoundary','bottleneck','minimumAdvance','decisiveTest','unresolved']) {
    assert(current[key].text.length>30 && current[key].textEn.length>60,`${pid} ${key}`);
  }
  assert(current.hypotheses.length>=3 && current.causalChain.length===4);
  assert(current.workPackages.length>=3 && current.uncertaintyBudget.length>=3);
}
assert.equal(new Set(cycle.problemIds.map(pid=>box.window.PROBLEMS.find(p=>p.id===pid).cycleResearch.updatedDefinition.text)).size,2);
for(const lang of ['ko','en']) assert(fs.readFileSync('sitemap.xml','utf8').includes(`cycle=RC-2026-74&amp;lang=${lang}`));
for(const page of ['index.html','solve.html','research-log.html']) assert(fs.readFileSync(page,'utf8').includes('research-cycle-74-data.js?v=20260909-cycle74'));
// Regression for historical matrix rows stored as strings instead of language pairs.
const renderer=fs.readFileSync('research-log.js','utf8');
const pairLine=renderer.match(/const pair = item => ([^\n]+);/)[1];
for(const lang of ['ko','en']) {
  const pair=vm.runInNewContext(`item => ${pairLine}`,{lang});
  assert.equal(pair('MAXIMUM EXCURSION'),'MAXIMUM EXCURSION');
  assert.equal(pair({text:'결손',textEn:'deficit'}),lang==='ko'?'결손':'deficit');
}
for(const phrase of ['전공자 포인트','1단계','아래 시도는 개별 논문','개수를 맞']) assert(!fs.readFileSync('research-cycle-74-data.js','utf8').includes(phrase));
console.log('RC74 verified: pixel-level independent integration, null support, finite-family rejection, preserved history, bilingual pages and matrix-label regression.');
