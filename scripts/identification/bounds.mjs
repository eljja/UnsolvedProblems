export function selectionOdds(mean, observedPositive, observedNegative) {
  const q1 = observedPositive / mean;
  const q0 = observedNegative / (1 - mean);
  if (q1 === 1 && q0 < 1) return Infinity;
  if (q0 === 1 && q1 < 1) return 0;
  return (q1 / (1 - q1)) / (q0 / (1 - q0));
}

function meanAtOdds(odds, observedPositive, observedNegative) {
  if (odds === Infinity) return observedPositive;
  if (odds === 0) return 1 - observedNegative;
  return observedPositive * (1 - observedNegative + odds * observedNegative)
    / (observedPositive + odds * observedNegative);
}

export function selectionSensitivityBounds(responseRate, observedPositiveRate, gamma) {
  const observedPositive = responseRate * observedPositiveRate;
  const observedNegative = responseRate * (1 - observedPositiveRate);
  if (gamma === "unbounded" || gamma === Infinity) {
    return { lower: observedPositive, upper: 1 - observedNegative };
  }
  if (!(gamma >= 1)) throw new Error("Gamma must be at least one");
  return {
    lower: meanAtOdds(gamma, observedPositive, observedNegative),
    upper: meanAtOdds(1 / gamma, observedPositive, observedNegative)
  };
}

function logChoose(n, k) {
  let total = 0;
  for (let i = 1; i <= k; i += 1) total += Math.log(n - k + i) - Math.log(i);
  return total;
}

function binomialProbability(n, k, p) {
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  return Math.exp(logChoose(n, Math.min(k, n - k)) + k * Math.log(p) + (n - k) * Math.log1p(-p));
}

function binomialCdf(n, k, p) {
  if (k < 0) return 0;
  if (k >= n) return 1;
  let sum = 0;
  for (let i = 0; i <= k; i += 1) sum += binomialProbability(n, i, p);
  return Math.min(1, sum);
}

function bisectIncreasing(fn, target) {
  let lower = 0;
  let upper = 1;
  for (let i = 0; i < 80; i += 1) {
    const middle = (lower + upper) / 2;
    if (fn(middle) < target) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
}

function bisectDecreasing(fn, target) {
  let lower = 0;
  let upper = 1;
  for (let i = 0; i < 80; i += 1) {
    const middle = (lower + upper) / 2;
    if (fn(middle) > target) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
}

export function clopperPearson(successes, trials, alpha = 0.05) {
  if (trials === 0) return { lower: 0, upper: 1 };
  const lower = successes === 0
    ? 0
    : bisectIncreasing(p => 1 - binomialCdf(trials, successes - 1, p), alpha / 2);
  const upper = successes === trials
    ? 1
    : bisectDecreasing(p => binomialCdf(trials, successes, p), alpha / 2);
  return { lower, upper };
}

export function aggregateBounds(bounds, weights) {
  return bounds.reduce((total, interval, index) => ({
    lower: total.lower + weights[index] * interval.lower,
    upper: total.upper + weights[index] * interval.upper
  }), { lower: 0, upper: 0 });
}
