function comesBefore(candidate, incumbent, policyId) {
  let candidateValue;
  let incumbentValue;

  if (policyId === "R0") {
    candidateValue = -candidate.randomPriority;
    incumbentValue = -incumbent.randomPriority;
  } else if (policyId === "R3") {
    candidateValue = candidate.calibratedInformationGain;
    incumbentValue = incumbent.calibratedInformationGain;
  } else {
    candidateValue = candidate.drivingForce;
    incumbentValue = incumbent.drivingForce;
  }

  return candidateValue > incumbentValue
    || (candidateValue === incumbentValue && candidate.actionId < incumbent.actionId);
}

function insertionRank(actions, policyId) {
  const ordered = [];
  for (const action of actions) {
    let position = 0;
    while (position < ordered.length && !comesBefore(action, ordered[position], policyId)) position += 1;
    ordered.splice(position, 0, action);
  }
  return ordered;
}

export function rankState(state, policyId) {
  if (!["R0", "R1", "R2", "R3"].includes(policyId)) throw new Error(`Unknown policy: ${policyId}`);
  if (policyId !== "R2") return insertionRank(state.actions, policyId).map((action) => action.actionId);

  const eligible = [];
  const rejected = [];
  for (const action of state.actions) {
    if (state.observedDetrimentalPaths.includes(action.path)) rejected.push(action);
    else eligible.push(action);
  }
  if (eligible.length === 0) return insertionRank(state.actions, "R1").map((action) => action.actionId);
  return [...insertionRank(eligible, "R1"), ...insertionRank(rejected, "R1")]
    .map((action) => action.actionId);
}
