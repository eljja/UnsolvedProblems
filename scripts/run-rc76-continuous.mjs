import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

// Exact rational arithmetic: certificates never depend on a floating-point tolerance.
const gcd=(a,b)=>b===0n?(a<0n?-a:a):gcd(b,a%b);
export function q(x) { if(Array.isArray(x))return x; const [a,b='1']=String(x).split('/');let n=BigInt(a),d=BigInt(b);assert.notEqual(d,0n);if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return[n/g,d/g]; }
const add=(a,b)=>{a=q(a);b=q(b);return qnorm(a[0]*b[1]+b[0]*a[1],a[1]*b[1]);};
const qnorm=(n,d)=>q(`${n}/${d}`);
const neg=a=>{a=q(a);return[-a[0],a[1]];};
const sub=(a,b)=>add(a,neg(b));
const mul=(a,b)=>{a=q(a);b=q(b);return qnorm(a[0]*b[0],a[1]*b[1]);};
const div=(a,b)=>{a=q(a);b=q(b);return qnorm(a[0]*b[1],a[1]*b[0]);};
const cmp=(a,b)=>{a=q(a);b=q(b);const d=a[0]*b[1]-b[0]*a[1];return d<0n?-1:d>0n?1:0;};
const abs=a=>cmp(a,0)<0?neg(a):q(a);
export const str=a=>{a=q(a);return a[1]===1n?String(a[0]):`${a[0]}/${a[1]}`;};
const sum=a=>a.reduce(add,q(0));
const dot=(a,b)=>sum(a.map((x,i)=>mul(x,b[i])));
export function combinations(n,k){if(k<0||k>n)return[];const out=[];function rec(p,start){if(p.length===k){out.push(p);return;}for(let i=start;i<n;i++)rec([...p,i],i+1);}rec([],0);return out;}
function model(alpha,beta,eta,B){assert(alpha.length>0&&beta.length===alpha.length&&eta.length===alpha.length);assert(alpha.some(x=>cmp(x,0)!==0));assert(cmp(B,0)>=0&&eta.every(x=>cmp(x,0)>=0));return{alpha:alpha.map(str),beta:beta.map(str),eta:eta.map(str),B:str(B)};}
function constraints(m,K,y=null){const out=[];for(const i of K){out.push({v:[q(m.alpha[i]),q(m.beta[i])],h:add(y?y[i]:0,m.eta[i]),label:`+${i}`});out.push({v:[neg(m.alpha[i]),neg(m.beta[i])],h:sub(m.eta[i],y?y[i]:0),label:`-${i}`});}out.push({v:[q(0),q(1)],h:q(m.B),label:'+b'},{v:[q(0),q(-1)],h:q(m.B),label:'-b'});return out;}
function solve2(a,b,r,s){const det=sub(mul(a[0],b[1]),mul(a[1],b[0]));if(cmp(det,0)===0)return null;return[div(sub(mul(r,b[1]),mul(a[1],s)),det),div(sub(mul(a[0],s),mul(r,b[0])),det)];}
function vertices(C){const out=[];for(const [i,j]of combinations(C.length,2)){const x=solve2(C[i].v,C[j].v,C[i].h,C[j].h);if(x&&C.every(c=>cmp(dot(c.v,x),c.h)<=0)&&!out.some(v=>v.every((z,k)=>cmp(z,x[k])===0)))out.push(x);}return out;}
export function radius(m,K){
  if(!K.some(i=>cmp(m.alpha[i],0)!==0))return{radius:'unbounded',K};
  const C=constraints(m,K),V=vertices(C);assert(V.length);
  const x=V.reduce((a,b)=>cmp(a[0],b[0])>=0?a:b);
  // A dual basic solution has <=2 positive multipliers in this two-variable LP.
  const candidates=[];
  for(let i=0;i<C.length;i++)if(cmp(C[i].v[1],0)===0&&cmp(C[i].v[0],0)>0)candidates.push([{index:i,lambda:div(1,C[i].v[0])}]);
  for(const [i,j]of combinations(C.length,2)){const l=solve2([C[i].v[0],C[j].v[0]],[C[i].v[1],C[j].v[1]],1,0);if(l&&l.every(z=>cmp(z,0)>=0))candidates.push([{index:i,lambda:l[0]},{index:j,lambda:l[1]}]);}
  assert(candidates.length);
  const objective=l=>sum(l.map(z=>mul(z.lambda,C[z.index].h)));
  const dual=candidates.reduce((a,b)=>cmp(objective(a),objective(b))<=0?a:b);
  assert.equal(cmp(objective(dual),x[0]),0);
  for(let j=0;j<2;j++)assert.equal(cmp(sum(dual.map(z=>mul(z.lambda,C[z.index].v[j]))),j===0?1:0),0);
  return{K,radius:str(x[0]),halfDifference:{t:str(x[0]),b:str(x[1])},dual:dual.map(z=>({constraint:C[z.index].label,multiplier:str(z.lambda)})),exactGap:'0'};
}
export function faultRadius(m,g,a){assert(Number.isInteger(g)&&g>=0&&Number.isInteger(a)&&a>=0);const k=Math.max(0,m.alpha.length-2*g-a),cells=combinations(m.alpha.length,k).map(K=>radius(m,K));const worst=cells.reduce((x,y)=>x.radius==='unbounded'?x:y.radius==='unbounded'?y:cmp(x.radius,y.radius)>=0?x:y);return{g,a,retained:k,radius:worst.radius,worst,cells};}
export function feasible(m,y,g,a){
  assert(y.length===m.alpha.length);assert(Number.isInteger(g)&&g>=0&&Number.isInteger(a)&&a>=0);
  const available=y.map((v,i)=>v===null?-1:i).filter(i=>i>=0);if(y.length-available.length>a)return{status:'out-of-budget'};
  const pieces=[];for(const positions of combinations(available.length,Math.max(0,available.length-g))){const K=positions.map(i=>available[i]);if(!K.some(i=>cmp(m.alpha[i],0)!==0))throw Error('Unbounded branches require an explicit unbounded-feasibility solver');const C=constraints(m,K,y),V=vertices(C);if(!V.length)continue;const low=V.reduce((x,z)=>cmp(x[0],z[0])<=0?x:z),high=V.reduce((x,z)=>cmp(x[0],z[0])>=0?x:z);pieces.push({K,lo:str(low[0]),hi:str(high[0]),loWitness:low.map(str),hiWitness:high.map(str)});}
  if(!pieces.length)return{status:'model-inconsistent',pieces};const lo=pieces.reduce((x,z)=>cmp(x,z.lo)<=0?x:z.lo,pieces[0].lo),hi=pieces.reduce((x,z)=>cmp(x,z.hi)>=0?x:z.hi,pieces[0].hi);return{status:'feasible',lo,hi,estimate:str(div(add(lo,hi),2)),pieces,thresholdZero:cmp(lo,0)>=0?'above':cmp(hi,0)<0?'below':'abstain'};
}
function collision(m,f){assert.notEqual(f.radius,'unbounded');const d=q(f.worst.halfDifference.t),c=q(f.worst.halfDifference.b),K=new Set(f.worst.K);const residual=m.alpha.map((x,i)=>add(mul(x,d),mul(m.beta[i],c)));const healthyPlus=residual.map((r,i)=>K.has(i)?q(0):r),healthyMinus=healthyPlus.map(neg);const outside=m.alpha.map((_,i)=>i).filter(i=>!K.has(i)),E=outside.slice(0,Math.min(f.a,outside.length)),remaining=outside.filter(i=>!E.includes(i)),P=remaining.slice(0,f.g);const y=healthyPlus.map((v,i)=>E.includes(i)?null:str(P.includes(i)?healthyMinus[i]:v));
  const worlds=[1,-1].map(sign=>({t:str(mul(sign,d)),b:str(mul(sign,c)),noise:residual.map((r,i)=>str(K.has(i)?mul(-sign,r):0)),healthy:(sign===1?healthyPlus:healthyMinus).map(str)}));
  for(const w of worlds){assert(cmp(abs(w.b),m.B)<=0);let errors=0;w.noise.forEach((e,i)=>{assert(cmp(abs(e),m.eta[i])<=0);assert.equal(cmp(add(add(mul(m.alpha[i],w.t),mul(m.beta[i],w.b)),e),w.healthy[i]),0);if(y[i]!==null&&cmp(y[i],w.healthy[i])!==0)errors++;});assert(errors<=f.g);w.substitutions=errors;}
  assert(E.length<=f.a);return{observation:y,worlds,erasures:E};
}
export function run(){
  const named=[['opposite-pair',[1,-1]],['same-sign-pair',[1,1]],['four-balanced',[1,1,-1,-1]],['six-balanced',[1,1,1,-1,-1,-1]],['eight-balanced',[1,1,1,1,-1,-1,-1,-1]]];
  const fixtures=named.map(([name,beta])=>{const m=model(beta.map(()=>1),beta,beta.map(()=>'1/10'),1);const faults=[0,1].flatMap(g=>[0,1].map(a=>faultRadius(m,g,a)));return{name,model:m,faults:faults.map(f=>({...f,collision:f.radius==='unbounded'?null:collision(m,f)}))};});
  let grid=0;for(const a0 of[-2,-1,1,2])for(const a1 of[-2,-1,1,2])for(const b0 of[-1,0,1])for(const b1 of[-1,0,1])for(const e0 of[0,'1/10'])for(const e1 of[0,'1/10'])for(const B of[0,1]){radius(model([a0,a1],[b0,b1],[e0,e1],B),[0,1]);grid++;}
  const m=fixtures[0].model,observation=['1/2','-1/10'];
  const joint=feasible(m,observation,0,0);
  const intervals=observation.map((v,i)=>{const width=add(mul(abs(m.beta[i]),m.B),m.eta[i]);return{lo:str(sub(v,width)),hi:str(add(v,width))};});
  const marginal={lo:intervals.reduce((v,z)=>cmp(v,z.lo)>=0?v:z.lo,intervals[0].lo),hi:intervals.reduce((v,z)=>cmp(v,z.hi)<=0?v:z.hi,intervals[0].hi),thresholdZero:'abstain'};
  assert.equal(marginal.lo,'-3/5');assert.equal(marginal.hi,'1');
  assert.equal(joint.lo,'1/10');assert.equal(joint.hi,'3/10');
  const robust=feasible(fixtures[3].model,['10','1/2','1/2','-1/10','-1/10','-1/10'],1,0);
  assert.equal(robust.lo,'1/10');assert.equal(robust.hi,'3/10');
  const zeroMargin={observation:['0','0'],worlds:[{t:'1/20',b:'0',noise:['-1/20','-1/20']},{t:'-1/20',b:'0',noise:['1/20','1/20']}]};
  for(const w of zeroMargin.worlds)w.noise.forEach((e,i)=>{assert.equal(cmp(add(mul(m.alpha[i],w.t),e),0),0);assert(cmp(abs(e),m.eta[i])<=0);});
  return{cycle:'RC-2026-76',arithmetic:'exact reduced BigInt rationals; no tolerance',generalCoefficientCertificateCases:grid,fixtures,observedDecision:{observation,joint,marginal},robustDecision:robust,zeroMargin,interpretation:'Conditional minimax and counterexamples in an exact known bounded model; not physical calibration, novel theory or arbitrary-shift coverage.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=run();if(process.argv.includes('--write'))fs.writeFileSync(new URL('../research/reproducibility/rc76-continuous-result.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({certificateCases:result.generalCoefficientCertificateCases,fixtures:result.fixtures.map(f=>({name:f.name,radii:f.faults.map(x=>[x.g,x.a,x.radius])})),joint:result.observedDecision.joint,robust:result.robustDecision},null,2));}
