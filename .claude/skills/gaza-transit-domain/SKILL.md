---
name: gaza-transit-domain
description: Domain rules for Mishwar, the public-transport app for the Gaza Strip. Use whenever you design, model, name, seed, write user-facing Arabic text for, or review anything touching vehicles (car, bus or minibus, ajala عجلة) and vehicle maintenance, drivers and their routes, the weekly work schedule (days, hours and route per day) and urgent changes to it, the driver dashboard, who is running right now, live vehicle positions and arrival times, a vehicle drifting off its route, the no-fares rule, stops, journeys with more than one vehicle, special requests (طلب خاص) and offers, in-app chat, phone numbers, location sharing, or place names and coordinates. This includes Prisma models, API shapes, seed data and screen copy. Not for styling, sync mechanics or deployment.
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
  - a start point.
- **The stop order is part of the data.** Keep it explicit, and never re-sort stops by
  name or distance.
- **Drivers go back and forth.** Every route runs in both directions, A → B and B → A.
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

## No fares

- **The app never stores, shows, computes or suggests route fares.** Prices differ from
  driver to driver and by vehicle; rider and driver settle them between themselves.
- **The one price in the app is a driver's quote on a special-request offer.** It's that
  driver's own number for one private trip, stored as integer agorot and shown in shekels
  (₪).

## Where is my ride

- **Positions come only from the driver's phone GPS, and only during an active trip
  while online.**
  - The driver starts the trip and ends it; positions go out only in between.
  - Positions are never queued offline: a stale point is worse than none.
  - They're sent from the driving screen while Mishwar is open.
  - The screen keeps the display awake.
  - Web apps can't send location in the background on iPhone or Android; native apps may
    come later.
  - **Never estimate a position from the schedule or the route.**
- **Keep only the latest position per vehicle,** overwritten on each update, and always
  show its age. Older than 5 minutes is stale: say so plainly.
- **Arrival time comes only from a fresh live position:** the distance along the route to
  the rider's stop, at the phone's reported speed (or a typical speed when it reports
  none), labelled «تقريباً». No fresh position, no arrival time.
- **A journey may need more than one vehicle.** Each leg has its own driver.

## Starting a trip

- **Before a trip, the driver confirms every booked rider.** On the today screen, each
  rider has a call button, then **ready** or **not ready: cancel**.
  - "Not ready: cancel" appears only after the driver has tapped call for that rider.
- **"Start trip" stays locked until every booking for the trip is ready or cancelled.**
  It's also offered only near the start point at the start time, and needs a tap.
- **A driver's cancel:**
  - frees the seat;
  - records the reason (`rider_not_ready`);
  - tells the rider plainly («السوّاق لغى حجزك: اتصل فيك وما كنت جاهز»).

## Routes change on the road

Drivers change their route on the road without updating the app.

- **When a running vehicle with bookings moves more than 500 m from its route line for 2
  minutes:**
  - tell every rider booked on it, with a call-the-driver button;
  - offer the driver a one-tap "change today's route".
- **The route line** is drawn stop to stop, so the threshold is generous on purpose.

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
- **Driver's position:** sent only from the driving screen, and only the latest point is
  kept.
- **Rider's live location:**
  - shared only when the driver asks and the rider says yes, every time;
  - there is no "always allow";
  - sharing ends when the trip starts or after 15 minutes, whichever comes first.
- **No location history:**
  - delete the rider's shared position the moment sharing ends;
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
