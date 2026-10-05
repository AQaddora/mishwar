import { Screen } from "@/components/Screen";
import { getPlace, pickerPlaces } from "@/lib/places";
import { isTime } from "@/lib/time";
import { SearchClient } from "./SearchClient";

// Search by time, from and to. Open to guests. The page honours a query string, so a
// search can be linked: /search?from=node/1&to=node/2&when=tomorrow&time=08:00
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : null);
  const place = (key: string) => {
    const id = one(key);
    return id && getPlace(id) ? id : null;
  };
  const when = one("when");
  const time = one("time");

  return (
    <Screen title="دوّر على مشوار" back={{ href: "/", label: "الرئيسية" }}>
      <SearchClient
        places={pickerPlaces()}
        initial={{
          from: place("from"),
          to: place("to"),
          when: when === "today" || when === "tomorrow" ? when : "now",
          time: isTime(time) ? time : null,
        }}
      />
    </Screen>
  );
}
