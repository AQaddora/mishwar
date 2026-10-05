// Flows that arrive with milestones M4–M7. Each one is registered so a run says, out
// loud, that it was skipped and why. To write one: copy rider-map-search.mjs into a new
// file with the same name as below, export { name, needs, run }, and replace the stub in
// index.mjs with it.
const todo = (name, needs, reason) => ({
  name,
  needs,
  async run(sim) {
    sim.skip(`${name}.todo`, `Scenario «${name}»`, reason);
  },
});

const todoScenarios = [
  todo("planner", ["driver-setup", "driving"], "not written yet: the trip planner (M4): direct trip, a change of vehicle, no route"),
  todo("booking", ["driver-setup", "driving"], "not written yet: booking a seat, the driver's call / ready / cancel, start trip (M5)"),
  todo("location-share", ["booking"], "not written yet: the driver asks for the rider's location, yes / no, automatic end (M5)"),
  todo("special-request", ["driver-setup"], "not written yet: request → offers → chat → accept (M6)"),
  todo("history-rating", ["booking"], "not written yet: trip history for both sides and the 1–5 rating (M7)"),
];

export default todoScenarios;
