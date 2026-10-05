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
| Route | id, driverId, isDefault, startPlaceId, name | A driver can keep several routes; exactly one is the default |
| RouteStop | routeId, position, placeId | `position` is 0..n-1, contiguous, unique per route |
| Fare | routeId, fromPosition, toPosition, priceAgorot | Per seat, per leg, set by the driver, per route |
| ScheduleDay | driverId, weekday, working, startTime, endTime, routeId (null = default route) | The weekly schedule: at most one row per weekday. Urgent changes edit these same rows. `startTime` is that day's first trip |
| Place | id, osmType, osmId, nameAr, name, lat, lon | From OSM only (see places.md) |
| Booking | id, riderId, routeId, day, fromPosition, toPosition, seats, status | Status: `pending`, `confirmed`, `rejected`, `cancelled`. `routeId` is the route running that day. Shown to riders as a "trip leg" |
| SpecialRequest | id, riderId, fromPlaceId, toPlaceId, day, time, seats, status | Status: `open`, `accepted`, `closed` |
| Offer | id, requestId, driverId, priceAgorot, status | The vehicle is the driver's one vehicle. Status: `sent`, `accepted`, `declined` |
| ChatMessage | id, requestId or bookingId, senderId, body, sentAt | Append-only |
| LocationShare | id, bookingId or requestId, riderId, consentAt, endedAt | One record per consent; position points live only until `endedAt` |

- **Money** is always integer agorot.
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
5. **Route stops:** at least two; positions contiguous from 0; no duplicates.
6. **Capacity:** at least 1. Booked seats on a trip never exceed capacity. The server
   decides, and the first booking to arrive wins.
7. **Fares:** a fare is a positive integer in agorot, and only the route's driver can set
   it.
8. **Offers:** a special request has at most one accepted offer. Accepting one declines
   the rest.
9. **Rider phone:** visible to a driver only when a confirmed booking or an accepted offer
   links them.
10. **Live location:**
    - points can't be written without a consent record for that trip;
    - points are deleted when the trip ends;
    - a new trip needs new consent.
