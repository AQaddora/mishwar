---
name: gaza-transit-domain
description: Domain rules for Mishwar, the public-transport app for the Gaza Strip. Use whenever you design, model, name, seed, write user-facing Arabic text for, or review anything touching vehicles (car, bus or minibus, ajala عجلة) and vehicle maintenance, drivers and their routes, the weekly work schedule (days, hours and route per day) and urgent changes to it, the driver dashboard, who is running right now, stops, fares in shekels, journeys with more than one vehicle, special requests (طلب خاص) and offers, in-app chat, phone numbers, location sharing, or place names and coordinates. This includes Prisma models, API shapes, seed data and screen copy. Not for styling, sync mechanics or deployment.
---

# Gaza transit domain

Mishwar helps people in the Gaza Strip find a seat on vehicles that already run along the
main roads, and arrange private trips. Riders are not technical, and many have old phones
with weak, paid data. Get the domain right before writing code: a wrong word confuses
riders, and a leaked phone number or location can put a real person at risk.

## Vehicles

| Type | Arabic | Seats |
|---|---|---|
| car | سيارة | usually 4–7 |
| bus / minibus | باص | varies |
| ajala | عجلة | a car towing an open passenger cart, the most common today |

- **One vehicle per driver account.** Keep it simple: no fleets, no switching vehicles.
- **Capacity is whatever the driver sets.** Never derive it from the vehicle type.
- **Vehicle in maintenance:** the vehicle is out of service from a date, until a date or
  until the driver says it's back. While it's out, the driver isn't running and can't send
  offers.
- **Every vehicle has photos taken by its own driver**, so riders can recognise it on the
  street. Never use stock images or realistic-looking placeholders.

## Drivers, routes and the weekly schedule

- **A driver can keep more than one route,** and one of them is the default (for example
  A → B). Each route has:
  - an ordered list of stops along a main road (Salah al-Din Road, al-Rashid coastal road)
    and the cross streets that join them;
  - a start point;
  - its own fares.
- **The stop order is part of the data.** Keep it explicit, and never re-sort stops by
  name or distance.
- **The driver sets a weekly schedule, and it's the one place they plan their work.** For
  each day of the week:
  - working or not;
  - hours: a start and an end time. The start time is that day's first trip;
  - which route: the default, another saved route, or a new one made on the spot.
- **Changing a day's route is a real change, not just a skip.** On Tuesday a driver can
  drive C → D instead of A → B, with different hours.
- **Urgent changes use the same window.** "Not working today", "only until noon today",
  "a different route today": the driver edits that day in the schedule.
  - There is no separate day-off or temporary-route feature.
  - An edit stays until the driver changes it again.
- **"Today" and weekdays use Asia/Gaza time.** Show the week starting on Saturday.
- **Who is running right now** is resolved in this order:
  1. Vehicle in maintenance: not running.
  2. Today isn't a working day in the schedule: not running.
  3. Outside today's hours: not running.
  4. Otherwise: running today's route.
- **Riders must never be shown a driver who isn't running.** The server rejects bookings
  outside the driver's schedule or hours, during maintenance, or on a stop that day's route
  skips.
- **When a schedule or maintenance change hits existing bookings:**
  - Before saving, show the driver how many riders are affected.
  - After saving, cancel those bookings, free the seats, and tell each rider why.
  - A booking survives a route change only if both of its stops are on the new route,
    inside the new hours.

## Fares and journeys

- **Fares are per seat, per leg, set by the driver, in shekels (ILS, ₪).**
  - Store them as integer agorot (1 ₪ = 100 agorot); display them in shekels.
  - A fare is never computed or suggested by the app.
- **A journey may need more than one vehicle.**
  - Each leg has its own driver and fare.
  - The rider's total is the sum of the legs, times the number of seats.

## Special requests (طلب خاص)

1. **The rider posts a private trip:** from, to, day, time, seats.
2. **Owners of private cars send offers with a price.**
3. **The rider sees each offer** with the driver's name, vehicle, photos and phone number.
   They can chat with the driver inside the app.
4. **The rider accepts one offer.** That closes the request: the other offers are declined
   and their drivers are told.

## Language

- **The UI is Palestinian Arabic, right to left,** written for people who are not
  technical: short, warm, everyday words.
- **English technical terms stay in code only:** identifiers, logs, comments.
  - Riders never see "sync", "offline mode", "error 500" or "token".
- Read `references/arabic-copy.md` before writing any screen text.

## Privacy (not negotiable)

Location is sensitive here. Store the minimum.

- **Driver's phone:** shown with their offer.
- **Rider's phone:** shown to a driver only after a booking or an accepted offer links
  them, and only to that driver.
- **Rider's live location:**
  - shared only after the rider says yes, every time, for that one trip;
  - there is no "always allow";
  - sharing stops when the trip ends.
- **No location history after a trip ends:**
  - delete live-location points at trip end;
  - no GPS trails;
  - no analytics on positions.
- **Never log** phone numbers or coordinates.

## Places

**Place names and coordinates come from OpenStreetMap data for the Gaza Strip.** Never
invent a place, stop name or coordinate anywhere: not in seed data, tests, examples or
copy. If a place you need is not in the data, say so and leave it out. Read
`references/places.md` before seeding stops or showing place names.

## Reference files

- `references/data-model.md`: entities, fields, and the invariants worth unit-testing.
  Read before writing Prisma models or API routes.
- `references/arabic-copy.md`: glossary, tone and ready-made lines. Read before writing
  screen text.
- `references/places.md`: how to use the OSM data, attribution, and fake test data. Read
  before touching stops or the map.
