# Arabic copy: Palestinian, plain, kind

## Tone

- **Everyday Palestinian Arabic, not formal MSA.** Write the way people speak at the stop.
- **Short.** One idea per line. A button label is one or two words.
- **Say what happened and what to do next.** Never just "error".
- **Buttons are short verbs in the masculine generic form** (the common convention), used
  consistently. Don't mix forms on one screen.
- **Numbers, prices and dates go through the shared formatter** (Intl with the app
  locale), so digits stay consistent on a screen. Never build them by hand.
- **Wrap phone numbers and Latin text inside Arabic sentences in `<bdi>`** so they don't
  scramble.

## Glossary

| In code | Show riders |
|---|---|
| driver | سوّاق |
| rider / passenger | راكب، ركّاب |
| route / line | خط |
| stop | موقف، مواقف |
| seat | كرسي، كراسي |
| shekel | شيكل (₪) |
| car / bus / ajala | سيارة / باص / عجلة |
| special request | طلب خاص |
| offer | عرض، عروض |
| booking | حجز |
| trip | مشوار، رحلة |
| phone | جوال |
| your location | موقعك |
| photos | الصور |
| Wi-Fi | واي فاي |
| now / today / tomorrow | هلأ / اليوم / بكرة |

## Ready-made lines

| Situation | Text |
|---|---|
| Saved offline | انحفظ على جوالك، ورح ينبعت أول ما يرجع النت |
| No internet | ما في نت |
| Data age | آخر تحديث قبل ٥ دقايق |
| Booking confirmed | تأكد حجزك |
| Seats gone (lost the race) | الكراسي خلصت قبل ما يوصل طلبك |
| Another offer chosen (to the other drivers) | الراكب اختار عرض ثاني |
| Server problem | صار في مشكلة عندنا، جرّب بعد شوي |
| Where from / where to | من وين؟ / لوين؟ |
| How many seats | كم كرسي؟ |
| Book / send offer / accept | احجز / ابعت عرض / اقبل العرض |
| Chat | احكي مع السوّاق |
| Location consent (every trip) | بدك تشارك موقعك مع السوّاق لهاي الرحلة؟ — buttons: آه، شارك / لا |
| Sharing ended | وقفنا مشاركة موقعك |
| Download photos now | نزّل الصور هلأ |
| Send photos now (driver) | ابعت الصور هلأ |
| Photos-only-on-Wi-Fi setting | الصور بس على الواي فاي |
| Driver: the schedule window | أيام وساعات الشغل |
| Driver: working / not working (per day) | شغّال / مش شغّال |
| Driver: hours (per day) | من الساعة … للساعة … |
| Driver: that day's route | خط هاد اليوم |
| Driver: default route | الخط الأساسي |
| Driver: new route | خط جديد |
| Driver: vehicle in maintenance | السيارة بالتصليح |
| Driver: vehicle back in service | رجعت السيارة |
| Driver: before saving a change that hits bookings | في ٣ ركّاب حاجزين، رح نبلغهم إنه انلغى حجزهم |
| Rider: driver not working today | السوّاق مش طالع اليوم |
| Rider: vehicle in maintenance | السيارة بالتصليح هالفترة |
| Rider: different route today | السوّاق ماشي اليوم على خط ثاني |
| Rider: booking cancelled by a driver change | انلغى حجزك لأنه السوّاق غيّر شغله اليوم |
| Days of the week (Saturday first) | السبت، الأحد، الاثنين، الثلاثاء، الأربعاء، الخميس، الجمعة |
| Driver: the driving screen | أنا سايق |
| Driver: keep it open | خلّي مِشوار مفتوح وإنت سايق عشان الركّاب يشوفوك |
| Driver: off route (one tap) | شكلك طالع عن خطك، بدك تغيّر خط اليوم؟ |
| Rider: where is it now | وين السيارة هلأ؟ |
| Rider: arrival | بتوصل بعد حوالي ١٠ دقايق |
| Rider: position age | آخر مكان قبل ٣ دقايق |
| Rider: stale or no position | ما في مكان جديد للسيارة هلأ |
| Rider: vehicle left its route | السيارة طالعة عن خطها، احكي مع السوّاق |
| Rider: call the driver | اتصل بالسوّاق |
| Driver: before starting | قبل ما تطلع، تأكد من كل الركّاب |
| Driver: rider ready | جاهز |
| Driver: rider not ready | مش جاهز، الغي الحجز |
| Driver: start locked | ضل ركّاب ما تأكدت منهم |
| Driver: start trip | ابدأ الرحلة |
| Rider: driver confirmed you | السوّاق أكّد إنك جاهز |
| Rider: cancelled as not ready | السوّاق لغى حجزك: اتصل فيك وما كنت جاهز |

## Instead of… write…

- "فشلت المزامنة" (formal, technical) → "ما قدرنا نبعت، رح نجرب لما يرجع النت"
- "Error 500" → "صار في مشكلة عندنا، جرّب بعد شوي"
- "تم الحفظ بنجاح" (stiff) → "انحفظ"
