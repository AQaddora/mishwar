// The scenarios, in the order a day in the city goes. A scenario is
//   { name, needs: [other scenario names], async run(sim) }
// and every step id it records starts with "<name>.". Add a file, add it here.
import driverSetup from "./driver-setup.mjs";
import driving from "./driving.mjs";
import riderMapSearch from "./rider-map-search.mjs";
import offline from "./offline.mjs";
import todo from "./todo.mjs";

export const SCENARIOS = [driverSetup, driving, riderMapSearch, offline, ...todo];
