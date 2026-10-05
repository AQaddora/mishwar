// Flows that arrive with milestones M6 and M7. Each one is registered so a run says, out
// loud, that it was skipped and why. To write one: copy booking.mjs into a new file with
// the same name as below, export { name, needs, run }, and replace the stub in index.mjs.
const todo = (name, needs, reason) => ({
  name,
  needs,
  async run(sim) {
    sim.skip(`${name}.todo`, `Scenario «${name}»`, reason);
  },
});

const todoScenarios = {
  specialRequest: todo("special-request", ["driver-setup"], "not written yet: request → offers → chat → accept (M6)"),
  historyRating: todo("history-rating", ["driver-setup", "driving", "booking", "location-share", "trip"], "not written yet: trip history for both sides and the 1–5 rating (M7)"),
};

export default todoScenarios;
