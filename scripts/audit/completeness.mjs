import { createHash } from "node:crypto";

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function recordDigest(record) {
  const { recordDigest: ignored, ...payload } = record;
  return sha256(canonical(payload));
}

export function manifestFor(records) {
  const names = ["execution", "rawObservation", "adjudication", "release"];
  return Object.fromEntries(names.map(name => {
    const counts = {};
    for (const record of records) {
      const status = record.stages[name].status;
      counts[status] = (counts[status] || 0) + 1;
    }
    return [name, counts];
  }));
}

export function campaignDigest(campaign) {
  return sha256(campaign.records.map(record => record.recordDigest).join(""));
}

export function validateCampaign(campaign) {
  const errors = [];
  const add = (code, experimentId = null) => errors.push({ code, experimentId });
  if (campaign.schemaVersion !== "0.1.0") add("schema-version");
  if (campaign.expectedExperimentCount !== campaign.records.length) add("expected-count-mismatch");
  if (new Set(campaign.records.map(record => record.experimentId)).size !== campaign.records.length) add("duplicate-experiment-id");
  const parse = value => value === null ? null : Date.parse(value);
  const needsReason = new Set(["failed", "not-run", "absent", "not-applicable", "withheld"]);
  const needsArtifact = new Set(["recorded", "completed", "present", "released"]);

  for (const record of campaign.records) {
    const id = record.experimentId;
    const registered = parse(record.registeredAt);
    const decision = record.stages.decision;
    const execution = record.stages.execution;
    const raw = record.stages.rawObservation;
    const adjudication = record.stages.adjudication;
    const release = record.stages.release;
    if (!Number.isFinite(registered)) add("invalid-registration-time", id);
    for (const [stageName, stage] of Object.entries(record.stages)) {
      const occurred = parse(stage.occurredAt);
      if (occurred !== null && registered > occurred) add(`late-registration:${stageName}`, id);
      if (needsReason.has(stage.status)) {
        if (!stage.reasonCode || !stage.reasonRecordedAt) add(`missing-reason:${stageName}`, id);
        if (stage.outcomeKnownWhenReasonRecorded !== false) add(`outcome-aware-reason:${stageName}`, id);
      }
      if (needsArtifact.has(stage.status) && !stage.artifactHash) add(`missing-artifact:${stageName}`, id);
      if (stage.reasonRecordedAt && adjudication.occurredAt && parse(stage.reasonRecordedAt) > parse(adjudication.occurredAt)) add(`post-adjudication-reason:${stageName}`, id);
    }
    if (decision.status !== "recorded") add("decision-not-recorded", id);
    if (raw.status === "present" && execution.status !== "completed") add("raw-without-completed-execution", id);
    if (adjudication.status === "recorded" && raw.status !== "present") add("adjudication-without-raw", id);
    if (release.status === "released" && adjudication.status !== "recorded") add("release-without-adjudication", id);
    if (record.outcome !== null && adjudication.status !== "recorded") add("outcome-without-adjudication", id);
    if (record.recordDigest !== recordDigest(record)) add("record-digest-mismatch", id);
  }
  if (canonical(campaign.manifest) !== canonical(manifestFor(campaign.records))) add("manifest-mismatch");
  if (campaign.campaignDigest !== campaignDigest(campaign)) add("campaign-digest-mismatch");
  return errors;
}
