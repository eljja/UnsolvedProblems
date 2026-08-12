function descending(field) {
  return (left, right) => right[field] - left[field] || left.actionId.localeCompare(right.actionId);
}

function ascending(field) {
  return (left, right) => left[field] - right[field] || left.actionId.localeCompare(right.actionId);
}

export function rankState(state, policyId) {
  const actions = state.actions.map((action) => ({ ...action }));

  if (policyId === "R0") return actions.sort(ascending("randomPriority")).map(({ actionId }) => actionId);
  if (policyId === "R1") return actions.sort(descending("drivingForce")).map(({ actionId }) => actionId);
  if (policyId === "R3") return actions.sort(descending("calibratedInformationGain")).map(({ actionId }) => actionId);
  if (policyId !== "R2") throw new Error(`Unknown policy: ${policyId}`);

  const rejectedPaths = new Set(state.observedDetrimentalPaths);
  const eligible = actions.filter(({ path }) => !rejectedPaths.has(path));
  if (eligible.length === 0) return actions.sort(descending("drivingForce")).map(({ actionId }) => actionId);

  const rejected = actions.filter(({ path }) => rejectedPaths.has(path));
  return [...eligible.sort(descending("drivingForce")), ...rejected.sort(descending("drivingForce"))]
    .map(({ actionId }) => actionId);
}
