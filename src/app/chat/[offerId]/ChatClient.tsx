"use client";
// One offer's chat thread: the messages in the phone's copy plus the ones still waiting in
// the outbox, a refresh every 10 seconds while the screen is open, and sending through the
// outbox so a message typed with no network goes out later.

import { useEffect, useRef, useState } from "react";
import { DataAge } from "@/components/DataAge";
import { useOutbox } from "@/components/OutboxStatus";
import { BackLink } from "@/components/Screen";
import { seatsText, whenText } from "@/lib/booking-copy";
import { newId } from "@/lib/outbox";
import { placeName } from "@/lib/places";
import { PENDING_SEND, priceText } from "@/lib/request-copy";
import { MAX_MESSAGE, threadIsOpen } from "@/lib/request-rules";
import { formatTime, gazaNow } from "@/lib/time";
import { refreshData, usePublicData } from "@/lib/use-public-data";
import { usePendingWrites, useSeenThreads } from "@/lib/use-requests";

const CHECK_EVERY_MS = 10_000;

export function ChatClient({ offerId, role }: { offerId: string; role: "rider" | "driver" }) {
  const { data, ready, lastSyncAt, offline, now } = usePublicData();
  const { send, pending } = useOutbox();
  const { markSeen } = useSeenThreads();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const offer = data.offers.find((o) => o.id === offerId);
  const request = offer && data.requests.find((r) => r.id === offer.requestId);
  const messages = data.messages.filter((m) => m.offerId === offerId).sort((a, b) => a.at.localeCompare(b.at));
  const sentIds = new Set(messages.map((m) => m.id));
  const waiting = usePendingWrites<{ id: string; offerId: string; body: string }>("message.send", now).filter((w) => w.offerId === offerId && !sentIds.has(w.id));
  const newest = messages.at(-1)?.at ?? "";
  const today = gazaNow(new Date(now)).day;

  // New messages are looked for every 10 seconds while the thread is open.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refreshData();
    }, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, []);
  // What is on screen has been read; and the newest message stays in view.
  useEffect(() => {
    if (newest) markSeen(offerId, newest);
    end.current?.scrollIntoView({ block: "end" });
  }, [newest, waiting.length, offerId, markSeen]);

  const back = role === "driver" ? { href: "/driver/requests", label: "الطلبات" } : { href: request ? `/requests/${request.id}` : "/requests", label: "طلبك" };
  const open = !!offer && !!request && threadIsOpen({ offerStatus: offer.status, requestStatus: request.status, completedAt: request.completedAt });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    setProblem(null);
    const outcome = await send("message.send", { id: newId(), offerId, body });
    if (outcome.status === "rejected") setProblem(outcome.message ?? "ما انبعتت الرسالة");
    refreshData();
  }

  return (
    <main className="flex min-h-app flex-col px-4 pt-safe pb-tab-bar">
      <BackLink href={back.href} label={back.label} />
      <h1 className="text-title">{offer && request ? (role === "rider" ? `السوّاق ${offer.name}` : `الراكب ${request.name ?? ""}`) : "المحادثة"}</h1>
      {offer && request && (
        <p className="text-caption text-text-muted">
          من {placeName(request.from)} لـ{placeName(request.to)} · {whenText(request, today)} · {seatsText(request.seats)} · العرض <bdi>{priceText(offer.price)}</bdi>
        </p>
      )}
      <DataAge lastSyncAt={lastSyncAt} offline={offline} now={now} />

      {!ready ? (
        <div className="skeleton mt-3 h-[88px] rounded-card" aria-hidden="true" />
      ) : !offer || !request ? (
        <p className="mt-3 text-text-muted">هاي المحادثة مش على جوالك.</p>
      ) : (
        <>
          <ol aria-label="الرسائل" className="mt-3 flex flex-1 flex-col justify-end gap-2">
            {messages.length === 0 && waiting.length === 0 && <li className="text-center text-text-muted">لسّا ما في رسائل. اسأل عن اللي بدك إياه.</li>}
            {messages.map((m) => (
              <li key={m.id} className={`flex max-w-[85%] flex-col gap-1 rounded-card px-3 py-2 ${m.mine ? "self-start bg-accent text-on-accent" : "self-end bg-surface"}`}>
                <span className="break-words whitespace-pre-wrap">{m.body}</span>
                <bdi className={`text-caption ${m.mine ? "opacity-80" : "text-text-muted"}`}>{formatTime(gazaNow(new Date(m.at)).time)}</bdi>
              </li>
            ))}
            {waiting.map((w) => (
              <li key={w.id} className="flex max-w-[85%] flex-col gap-1 self-start rounded-card border-2 border-pending bg-surface px-3 py-2">
                <span className="break-words whitespace-pre-wrap">{w.body}</span>
                <span className="text-caption font-medium text-pending">{PENDING_SEND}</span>
              </li>
            ))}
          </ol>
          <div ref={end} />
          {problem && (
            <p role="alert" className="mt-2 font-medium text-danger">
              {problem}
            </p>
          )}
          {open ? (
            <form onSubmit={submit} // While something waits on the phone, the "saved on this phone" line sits above the tab bar: stay clear of it.
              className={`sticky -mx-4 mt-3 flex items-end gap-2 border-t border-separator bg-bg px-4 py-2 ${pending > 0 ? "bottom-[calc(var(--tab-bar-space)+48px)]" : "bottom-(--tab-bar-space)"}`}>
              <label htmlFor="chat-text" className="sr-only">
                اكتب رسالة
              </label>
              <input
                id="chat-text"
                type="text"
                value={text}
                maxLength={MAX_MESSAGE}
                onChange={(e) => setText(e.target.value)}
                placeholder="اكتب رسالة"
                autoComplete="off"
                enterKeyHint="send"
                className="min-h-11 min-w-0 flex-1 rounded-control border border-separator bg-surface px-3 py-2 text-body"
              />
              <button type="submit" disabled={!text.trim()} className="min-h-11 shrink-0 rounded-control bg-accent px-4 py-2 font-bold text-on-accent disabled:opacity-60">
                ابعت
              </button>
            </form>
          ) : (
            <p className="mt-3 rounded-card bg-surface p-3 text-center text-text-muted">المحادثة تسكّرت، بتقدر تقراها بس.</p>
          )}
        </>
      )}
    </main>
  );
}
