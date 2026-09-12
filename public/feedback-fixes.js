(() => {
  "use strict";

  // Intentionally no response rewrite here.
  //
  // The server contract is explicit: for English input, a non-empty `suggestion`
  // means the learner's original sentence needed correction; a fully correct
  // original sentence returns suggestion="". Older UI compatibility code treated
  // every approved suggestion as optional polish and could therefore let an
  // incorrect original sentence pass. Apply Quality V3 now owns that distinction.
})();
