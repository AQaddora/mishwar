# Places from OpenStreetMap

## Source

- **Use an OpenStreetMap extract clipped to the Gaza Strip,** and store the extract date
  next to the data. The ground changes often, so "how old is this map" must be
  answerable.
- **Map tiles and place data come from the same extract,** so names on the map match names
  in lists.

## Names

- **Display:** `name:ar`, falling back to `name`.
- **Code and logs:** keep `name:en` when it exists.
- **If a place has no Arabic name,** show `name` as-is. Don't translate or transliterate it
  yourself.

## Identity and coordinates

- **Keep the OSM element type and id** (for example `node/123456`) on every Place. That
  makes the stop traceable and updatable from a newer extract.
- **Take coordinates from the OSM element.**
  - Never type a coordinate by hand.
  - Never let a model "recall" one.
  - Never round to make it look tidy.
- **Main roads (Salah al-Din Road, al-Rashid coastal road) are OSM ways.** Find them in the
  extract by their name tags; don't hardcode their geometry.

## Tests and seed data

- **Seed data uses real rows copied from the extract,** with their OSM ids.
- **When a test only needs a shape,** use clearly fake fixtures that can never be mistaken
  for real places:
  - names like «موقف تجريبي ١»;
  - coordinates far outside the Gaza Strip;
  - a `fake: true` marker.

## Attribution

OSM data is licensed under the ODbL. The map must show "© OpenStreetMap contributors".
