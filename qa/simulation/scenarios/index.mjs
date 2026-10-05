// The scenarios, in the order a day in the city goes: drivers set up and go out, riders
// look and plan, the network drops, seats are booked, the driver finds his riders, the
// trips run and end, a private trip is agreed by offers and chat, and at the end of the
// day everybody rates. A scenario is
//   { name, needs: [other scenario names], async run(sim) }
// and every step id it records starts with "<name>.". Add a file, add it here.
import driverSetup from "./driver-setup.mjs";
import driving from "./driving.mjs";
import riderMapSearch from "./rider-map-search.mjs";
import planner from "./planner.mjs";
import offline from "./offline.mjs";
import booking from "./booking.mjs";
import locationShare from "./location-share.mjs";
import trip from "./trip.mjs";
import specialRequest from "./special-request.mjs";
import historyRating from "./history-rating.mjs";

export const SCENARIOS = [driverSetup, driving, riderMapSearch, planner, offline, booking, locationShare, trip, specialRequest, historyRating];
