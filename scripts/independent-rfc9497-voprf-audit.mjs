import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const A = P - 3n;
const B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const G = [0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n, 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n];
const mod = (value, modulus = P) => ((value % modulus) + modulus) % modulus;
const pow = (base, exponent, modulus) => { let result = 1n; for (base = mod(base, modulus); exponent; exponent >>= 1n, base = base * base % modulus) if (exponent & 1n) result = result * base % modulus; return result; };
const inverse = (value, modulus) => pow(value, modulus - 2n, modulus);
const equal = (left, right) => left === null ? right === null : right !== null && left[0] === right[0] && left[1] === right[1];

function add(left, right) {
  if (left === null) return right;
  if (right === null) return left;
  const [x1, y1] = left, [x2, y2] = right;
  if (x1 === x2 && mod(y1 + y2) === 0n) return null;
  const slope = equal(left, right) ? mod((3n * x1 * x1 + A) * inverse(2n * y1, P)) : mod((y2 - y1) * inverse(x2 - x1, P));
  const x3 = mod(slope * slope - x1 - x2);
  return [x3, mod(slope * (x1 - x3) - y1)];
}
function multiply(scalar, point) {
  let result = null, addend = point;
  for (scalar = mod(scalar, N); scalar; scalar >>= 1n, addend = add(addend, addend)) if (scalar & 1n) result = add(result, addend);
  return result;
}
const i2osp = (value, length) => { const hex = BigInt(value).toString(16).padStart(length * 2, "0"); return Buffer.from(hex, "hex"); };
function deserialize(bytes) {
  if (bytes.length !== 33 || ![2, 3].includes(bytes[0])) throw new Error("invalid P-256 element");
  const x = BigInt(`0x${bytes.subarray(1).toString("hex")}`);
  const rhs = mod(x ** 3n + A * x + B);
  let y = pow(rhs, (P + 1n) / 4n, P);
  if (mod(y * y) !== rhs) throw new Error("point is not on P-256");
  if (Number(y & 1n) !== (bytes[0] & 1)) y = P - y;
  return [x, y];
}
const serialize = point => Buffer.concat([Buffer.from([2 | Number(point[1] & 1n)]), i2osp(point[0], 32)]);
const sha256 = (...items) => crypto.createHash("sha256").update(Buffer.concat(items)).digest();
const xor = (left, right) => Buffer.from(left.map((value, index) => value ^ right[index]));
function expandXmd(message, dst, length) {
  const dstPrime = Buffer.concat([dst, i2osp(dst.length, 1)]);
  const b0 = sha256(Buffer.alloc(64), message, i2osp(length, 2), Buffer.from([0]), dstPrime);
  const blocks = [sha256(b0, Buffer.from([1]), dstPrime)];
  for (let index = 2; blocks.length * 32 < length; index++) blocks.push(sha256(xor(b0, blocks.at(-1)), Buffer.from([index]), dstPrime));
  return Buffer.concat(blocks).subarray(0, length);
}
const hashToScalar = (message, context) => BigInt(`0x${expandXmd(message, Buffer.concat([Buffer.from("HashToScalar-"), context]), 48).toString("hex")}`) % N;
function composites(publicKey, blinded, evaluated, context) {
  const publicBytes = serialize(publicKey);
  const seedDst = Buffer.concat([Buffer.from("Seed-"), context]);
  const seed = sha256(i2osp(publicBytes.length, 2), publicBytes, i2osp(seedDst.length, 2), seedDst);
  let mPoint = null, zPoint = null;
  for (let index = 0; index < blinded.length; index++) {
    const c = serialize(blinded[index]), d = serialize(evaluated[index]);
    const transcript = Buffer.concat([i2osp(seed.length, 2), seed, i2osp(index, 2), i2osp(c.length, 2), c, i2osp(d.length, 2), d, Buffer.from("Composite")]);
    const coefficient = hashToScalar(transcript, context);
    mPoint = add(mPoint, multiply(coefficient, blinded[index]));
    zPoint = add(zPoint, multiply(coefficient, evaluated[index]));
  }
  return [mPoint, zPoint];
}
function verifyProof(publicKey, blinded, evaluated, proof, context) {
  if (proof.length !== 64) return false;
  const challenge = BigInt(`0x${proof.subarray(0, 32).toString("hex")}`), response = BigInt(`0x${proof.subarray(32).toString("hex")}`);
  if (challenge >= N || response >= N) return false;
  const [mPoint, zPoint] = composites(publicKey, blinded, evaluated, context);
  const t2 = add(multiply(response, G), multiply(challenge, publicKey));
  const t3 = add(multiply(response, mPoint), multiply(challenge, zPoint));
  const items = [publicKey, mPoint, zPoint, t2, t3].map(serialize);
  const transcript = Buffer.concat([...items.flatMap(item => [i2osp(item.length, 2), item]), Buffer.from("Challenge")]);
  return hashToScalar(transcript, context) === challenge;
}
function finalize(input, blind, evaluated) {
  const issued = serialize(multiply(inverse(blind, N), evaluated));
  return sha256(i2osp(input.length, 2), input, i2osp(issued.length, 2), issued, Buffer.from("Finalize"));
}

const fixture = readJson("research/reproducibility/rfc9497-p256-voprf-vectors.json");
const pythonResult = readJson("research/reproducibility/rfc9497-p256-voprf-result.json");
const context = Buffer.concat([Buffer.from("OPRFV1-"), Buffer.from([fixture.mode]), Buffer.from(`-${fixture.suite}`)]);
const privateScalar = BigInt(`0x${fixture.serverPrivateScalar}`);
const publicKey = deserialize(Buffer.from(fixture.serverPublicElement, "hex"));
const vectors = fixture.vectors.map(vector => {
  const inputs = vector.inputs.map(value => Buffer.from(value, "hex"));
  const blinds = vector.blinds.map(value => BigInt(`0x${value}`));
  const blinded = vector.blindedElements.map(value => deserialize(Buffer.from(value, "hex")));
  const evaluated = vector.evaluationElements.map(value => deserialize(Buffer.from(value, "hex")));
  const proof = Buffer.from(vector.proof, "hex");
  const outputs = vector.outputs.map(value => Buffer.from(value, "hex"));
  const proofValid = verifyProof(publicKey, blinded, evaluated, proof, context);
  const outputMatches = inputs.every((input, index) => finalize(input, blinds[index], evaluated[index]).equals(outputs[index]));
  const wrongContextRejected = !verifyProof(publicKey, blinded, evaluated, proof, Buffer.from("OPRFV1-\x00-P256-SHA256", "binary"));
  const mutatedProof = Buffer.from(proof); mutatedProof[63] ^= 1;
  return { id: vector.id, proofValid, outputMatches, wrongContextRejected, mutatedProofRejected: !verifyProof(publicKey, blinded, evaluated, mutatedProof, context), serverEvaluationMatches: blinded.every((point, index) => equal(multiply(privateScalar, point), evaluated[index])) };
});
const checks = {
  contextMatches: context.toString("hex") === fixture.contextStringHex,
  serverKeyMatches: equal(multiply(privateScalar, G), publicKey),
  threeVectors: vectors.length === 3,
  proofsVerify: vectors.every(item => item.proofValid),
  outputsMatch: vectors.every(item => item.outputMatches),
  wrongContextsReject: vectors.every(item => item.wrongContextRejected),
  mutatedProofsReject: vectors.every(item => item.mutatedProofRejected),
  serverEvaluationsMatch: vectors.every(item => item.serverEvaluationMatches),
  pythonAuditAgrees: pythonResult.passed && pythonResult.vectors.every((item, index) => item.dleqProofValid === vectors[index].proofValid && item.outputsMatch === vectors[index].outputMatches)
};
const audit = {
  auditId: "INDEPENDENT-RFC9497-P256-VOPRF-JS-AUDIT-0.8",
  computedOn: "2026-08-14",
  passed: Object.values(checks).every(Boolean),
  checks,
  vectors,
  independenceBoundary: "This JavaScript audit does not execute the Python verifier and implements P-256 point arithmetic, XMD expansion, hash-to-scalar, batched DLEQ verification, and finalization separately. Both implementations are reference code in one repository and are not constant-time or institutionally independent.",
  conclusion: "JavaScript independently agrees with Python on all three published RFC 9497 P256-SHA256 VOPRF transcripts and negative context/proof controls; live interoperability and production privacy remain untested."
};
const output = path.join(root, "research/reproducibility/rfc9497-p256-voprf-js-audit.json");
if (process.argv.includes("--write")) fs.writeFileSync(output, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
else if (JSON.stringify(readJson("research/reproducibility/rfc9497-p256-voprf-js-audit.json")) !== JSON.stringify(audit)) throw new Error("Independent RFC 9497 JS audit differs from committed artifact.");
if (!audit.passed) throw new Error("Independent RFC 9497 JS audit failed.");
console.log(`Independent RFC 9497 JS audit: ${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} checks passed across ${vectors.length} official vectors.`);
