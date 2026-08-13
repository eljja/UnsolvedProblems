import process from "node:process";

const options = Object.fromEntries(process.argv.slice(2).map(item => {
  const [key, ...rest] = item.replace(/^--/, "").split("=");
  return [key, rest.join("=")];
}));
const receiver = options.receiver;
const sink = options.sink;
const sinkFault = options["sink-fault"] || "none";
const relayFault = options["relay-fault"] || "none";
const receiverAckFault = options["receiver-ack-fault"] || "none";

async function readJson(response) {
  try { return await response.json(); } catch { return null; }
}

async function main() {
  if (!receiver || !sink) throw new Error("--receiver and --sink are required");
  const pendingResponse = await fetch(`${receiver}/outbox/pending`);
  if (!pendingResponse.ok) throw new Error(`pending query failed: ${pendingResponse.status}`);
  const pending = await pendingResponse.json();
  if (!pending.events.length) {
    process.stdout.write(`${JSON.stringify({ status: "empty" })}\n`);
    return;
  }
  const event = pending.events[0];
  if (relayFault === "drop-before-sink") {
    process.stdout.write(`${JSON.stringify({ status: "dropped-before-sink", event })}\n`);
    process.exitCode = 101;
    return;
  }
  let sinkResponse;
  try {
    sinkResponse = await fetch(`${sink}/events/${event.eventId}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-rc37-fault": sinkFault },
      body: JSON.stringify({ outcomeSha256: event.outcomeSha256 })
    });
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: "sink-response-missing", event, error: error.message })}\n`);
    process.exitCode = 102;
    return;
  }
  const sinkBody = await readJson(sinkResponse);
  if (![200, 201].includes(sinkResponse.status)) {
    process.stdout.write(`${JSON.stringify({ status: "sink-rejected", event, sink: { status: sinkResponse.status, body: sinkBody } })}\n`);
    process.exitCode = 104;
    return;
  }
  if (relayFault === "crash-after-sink-response") {
    process.stdout.write(`${JSON.stringify({ status: "crash-after-sink-response", event, sink: { status: sinkResponse.status, body: sinkBody } })}\n`);
    process.exitCode = 103;
    return;
  }
  let receiverResponse;
  try {
    receiverResponse = await fetch(`${receiver}/outbox/${event.eventId}/ack`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-rc37-fault": receiverAckFault },
      body: JSON.stringify({ outcomeSha256: event.outcomeSha256 })
    });
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: "receiver-ack-missing", event, sink: { status: sinkResponse.status, body: sinkBody }, error: error.message })}\n`);
    process.exitCode = 105;
    return;
  }
  const receiverBody = await readJson(receiverResponse);
  process.stdout.write(`${JSON.stringify({ status: "delivered", event, sink: { status: sinkResponse.status, body: sinkBody }, receiver: { status: receiverResponse.status, body: receiverBody } })}\n`);
  if (![200, 201].includes(receiverResponse.status)) process.exitCode = 106;
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 110;
});
