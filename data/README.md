# Places data

Every stop and place name in Mishwar comes from the files in this folder. Nothing is
typed into the code.

| File | What | Who edits it |
|---|---|---|
| `gazetteer.json` | Named places in the Gaza Strip, copied from OpenStreetMap: towns, neighbourhoods and camps, junctions, squares, taxi and bus stands, hospitals, universities, markets | Nobody by hand. Regenerate it |
| `places-extra.json` | Places OSM doesn't have yet, checked on the ground | Ahmed, by hand |
| `gaza-strip.json` | The outline of the Gaza Strip from OpenStreetMap (relation 1473938). The map covers everything outside it | Nobody by hand. `npm run strip-outline` |

## Refresh from OpenStreetMap

```bash
npm run gazetteer        # node scripts/fetch-gazetteer.mjs, takes a few minutes
npm test                 # checks ids, the bounding box, and the QA seed route
```

The script asks the Overpass API for named features inside the five governorates and
rewrites `gazetteer.json`, one place per line so the diff is readable. `extractDate` is the
date of the OSM data it got, so "how old is this map" always has an answer. Names are
`name:ar`, falling back to `name`; coordinates are the element's own, never rounded.

To change what is fetched (for example to add fuel stations), edit the query at the top of
`scripts/fetch-gazetteer.mjs`.

## Add or fix a place by hand

The ground has changed a lot. When a stop people use is missing from OSM, add it to
`places-extra.json`. Same shape as the gazetteer, with a `manual/…` id and a `source`:

```json
[
  { "id": "manual/dawwar-example", "nameAr": "اسم الموقف", "kind": "junction", "lat": 31.5, "lon": 34.45, "source": "manual" }
]
```

- Take the coordinates from a real GPS reading at the place (or from OSM), not from memory.
- `kind` is one of: `city`, `town`, `village`, `suburb`, `junction`, `square`, `stand`,
  `hospital`, `university`, `marketplace`.
- Never reuse or change an id that routes already use: routes store the id.
- Better still, add the place to OpenStreetMap itself and refresh; then delete it here.

Both files are bundled into the app at build time, so a change goes live with the next
merge to main. No database step: places are not stored in Postgres, routes store the id.

## Attribution

© OpenStreetMap contributors, ODbL. The app shows this credit wherever places are listed.
