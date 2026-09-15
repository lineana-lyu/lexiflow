const fs=require("fs");
const path=require("path");

function assert(condition,message){if(!condition)throw new Error(message);}
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

const index=read("public/index.html");
const tx=read("public/review-transaction-v3.js");
const session=read("public/review-session-v3.js");

assert(index.includes("review-transaction-v3.js"),"Review transaction recovery must load in index.html");
assert(index.indexOf("review-transaction-v3.js")<index.indexOf("review-session-v3.js"),"transaction wrapper must be installed before Review V3 starts writing");
assert(tx.includes("pendingCommit"),"a Review write must persist a local pending-commit marker before the network write");
assert(tx.includes("expectedReviewCount"),"recovery must identify the exact committed attempt by reviewCount");
assert(tx.includes("activityId"),"recovery must verify the exact V3 activity instead of trusting reviewCount alone");
assert(tx.includes("storageConfirms"),"a restart must reconcile pending cursor state against persisted learning data");
assert(tx.includes("session.repairTail.includes"),"recovered failed normal recalls must restore the same-day repair tail exactly once");
assert(tx.includes("session.cursor=Math.max"),"normal cursor recovery must be monotonic and idempotent");
assert(tx.includes("session.repairCursor=Math.max"),"repair cursor recovery must be monotonic and idempotent");
assert(tx.includes("PENDING_GRACE_MS=30000"),"GET races must retain an in-flight pending marker for a recovery grace period");
assert(tx.includes("if(pendingIsStale(pending))clearUncommittedPending(pending)"),"only stale unconfirmed pending writes may be abandoned by GET reconciliation");
assert(session.includes('reviewAuthority:"v3"'),"Review V3 must still mark authoritative persistence for the transaction wrapper");
assert(session.includes('authority:"review-session-v3"'),"Review V3 activity must carry an authority marker used by crash recovery");

console.log("Review Transaction V3 contract checks passed.");