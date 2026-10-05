# Data model sketch

This is a map of the domain, not a schema to build all at once. Build only what the
current milestone needs (see the ship-safely skill), and keep these names so the code
matches the domain.

## Entities

| Entity | Key fields | Notes |
|---|---|---|
| User | id, name, phone, role (`rider`, `driver`) | The phone is private: see the visibility rules below |
| Vehicle | id, driverId (unique), type (`car`, `bus`, `ajala`), capacity, photos[] | One vehicle per driver account. Capacity is set by the driver; photos are referenced by content hash |
| Maintenance | id, vehicleId, fromDay, untilDay (null = until the driver says it's back) | The vehicle is out of service, so the driver isn't running and can't send offers |
| Route | id, driverId, isDefault, startPlaceId, name | A driver can keep several routes; exactly one is the default. Runs both ways. No fares |
| RouteStop | routeId, position, placeId | `position` is 0..n-1, contiguous, unique per route |
| VehiclePosition | vehicleId (unique), lat, lon, speed, at | GPS from the driving screen only. One row per vehicle, overwritten, never a history |
| ScheduleDay | driverId, weekday, working, startTime, endTime, routeId (null = default route) | The weekly schedule: at most one row per weekday. Urgent changes edit these same rows. `startTime` is that day's first trip |
| Place | id, osmType, osmId, nameAr, name, lat, lon | From OSM only (see places.md) |
| Booking | id (from the rider's phone), riderId, driverId, routeId, day, time, fromPosition, toPosition, fromPlaceId, toPlaceId, seats, status, calledAt, readyAt, cancelReason, tripId, startedAt, completedAt, offRouteNotifiedAt | Status: `pending`, `confirmed`, `ready`, `rejected`, `cancelled`. `cancelReason`: `rider_not_ready`, `schedule_change`, `maintenance`, `by_rider`. `routeId` is the route running that day; either direction. Shown to riders as a "trip leg". `pending` exists only on the phone, while the booking waits in the outbox. Live = `confirmed` or `ready` with no `completedAt`; completed = its trip ended. Seats are counted per route per day |
| SpecialRequest | id, riderId, fromPlaceId, toPlaceId, day, time, seats, note, status, completedAt | Status: `open`, `accepted`, `closed`. An accepted request is the agreed private trip between its rider and the accepted offer's driver; `completedAt` is set when that driver says it's done |
| Offer | id, requestId, driverId, priceAgorot, status | One per driver per request. The vehicle is the driver's one vehicle. Status: `sent`, `accepted`, `declined` |
| Message | id, offerId, senderId, body, sentAt | The chat thread of one offer, between its driver and the request's rider. Append-only |
| LocationShare | id, bookingId, riderId, askedAt, answer, expiresAt, lat, lon | One record per driver ask. Position cleared at trip start or `expiresAt` (asked + 15 min) |

- **Money:** the only money is the offer price, in integer agorot. Routes have no fares.
- **Times** are shown in Asia/Gaza.
  - Store real moments as UTC instants.
  - Store timetable values (`startTime`, `endTime`) as plain local times.
  - "Today" and the weekday are computed in Asia/Gaza.
- **Weekday:** store it as ISO 1–7 (Monday = 1); show the week starting on Saturday.

## Invariants worth a unit test

Each milestone needs at least one test for its hardest rule. These are the usual
candidates:

1. **Routes:**
   - every driver with a schedule has exactly one default route;
   - a ScheduleDay can only point at that driver's own routes.
2. **Schedule:**
   - at most one row per weekday;
   - on a working day, `endTime` is after `startTime`.
3. **Who is running.** A single function decides, in this order:
   1. Vehicle in maintenance: not running.
   2. Today isn't a working day in the schedule: not running.
   3. Outside today's hours: not running.
   4. Otherwise: running today's route, which is the default when `routeId` is null.

   Test the edges:
   - the minute today's hours end;
   - maintenance with no end day;
   - today switched off by an urgent edit;
   - today's route switched from A → B to C → D.
4. **Bookings follow availability.**
   - The server rejects a booking outside the schedule or hours, during maintenance, or on
     a stop that day's route skips.
   - A schedule or maintenance change that hits existing bookings cancels them, frees the
     seats, and tells each rider why.
   - A booking survives a route change only if both its stops are on the new route, inside
     the new hours.
5. **Route stops:** at least two; positions contiguous from 0; no duplicates. A booking
   may go in either direction (from a later stop to an earlier one).
6. **Capacity:** at least 1. Booked seats on a trip never exceed capacity. The server
   decides, and the first booking to arrive wins.
7. **Starting a trip:**
   - "Start trip" is refused while any booking for that trip is still `confirmed`. Each
     one must be `ready` or `cancelled`.
   - A driver's `rider_not_ready` cancel is refused unless `calledAt` is set.
   - Every cancel frees the seat and notifies the rider with the reason.
8. **Positions and arrival:**
   - a VehiclePosition is written only from the driver's own driving screen, and keeps
     one row per vehicle;
   - older than 5 minutes is stale;
   - no fresh position means no arrival time. Never fall back to the schedule.
9. **Off route:**
   - a running vehicle more than 500 m from its route line for 2 minutes notifies each
     booked rider once (`offRouteNotifiedAt`);
   - a single GPS jump doesn't count;
   - coming back and leaving again notifies again.
10. **Offers:** a special request has at most one accepted offer. Accepting one declines
   the rest. The offer price is the only money in the app.
11. **Rider phone:** visible to a driver only when a live booking (confirmed or ready) or an accepted
    offer links them.
12. **Live location:**
    - a position can't be written without a yes to that ask;
    - it's cleared at trip start or 15 minutes after the ask, whichever comes first;
    - the next ask needs a new yes.
