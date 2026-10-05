# Data model sketch

This is a map of the domain, not a schema to build all at once. Build only what the
current milestone needs (see the ship-safely skill), and keep these names so the code
matches the domain.

## Entities

| Entity | Key fields | Notes |
|---|---|---|
| User | id, name, phone, role (`rider`, `driver`) | The phone is private: see the visibility rules below |
| Vehicle | id, driverId, type (`car`, `bus`, `ajala`), capacity, photos[] | Capacity is set by the driver; photos are referenced by content hash |
| Route | id, driverId (unique), startPlaceId, firstTripTime | One main route per driver |
| RouteStop | routeId, position, placeId | `position` is 0..n-1, contiguous, unique per route |
| Place | id, osmType, osmId, nameAr, name, lat, lon | From OSM only (see places.md) |
| Fare | routeId, fromPosition, toPosition, priceAgorot | Per seat, per leg, set by the driver |
| Booking | id, riderId, routeId, day, fromPosition, toPosition, seats, status | Status: `pending`, `confirmed`, `rejected`, `cancelled`. Also called a "trip leg" when shown to riders |
| SpecialRequest | id, riderId, fromPlaceId, toPlaceId, day, time, seats, status | Status: `open`, `accepted`, `closed` |
| Offer | id, requestId, driverId, vehicleId, priceAgorot, status | Status: `sent`, `accepted`, `declined` |
| ChatMessage | id, requestId or bookingId, senderId, body, sentAt | Append-only |
| LocationShare | id, bookingId or requestId, riderId, consentAt, endedAt | One record per consent; position points live only until `endedAt` |

Money is always integer agorot. Times use Asia/Gaza for display; store them as UTC instants
or as plain local times for timetable data (for example, a first-trip time).

## Invariants worth a unit test

Each milestone needs at least one test for its hardest rule. These are the usual
candidates:

1. **One main route per driver.**
2. **Route stops:** at least two; positions contiguous from 0; no duplicates.
3. **Capacity:** at least 1. Booked seats on a trip never exceed capacity. The server
   decides, and the first booking to arrive wins.
4. **Fares:** a fare is a positive integer in agorot, and only the route's driver can set
   it.
5. **Offers:** a special request has at most one accepted offer. Accepting one declines
   the rest.
6. **Rider phone:** visible to a driver only when a confirmed booking or an accepted offer
   links them.
7. **Live location:**
   - points can't be written without a consent record for that trip;
   - points are deleted when the trip ends;
   - a new trip needs new consent.
