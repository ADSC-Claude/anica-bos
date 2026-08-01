# Add-ons and the five-minute interval

**Status: recorded, not built.** This is the owner's rule, written down so it
is not lost. The code does not implement the named list yet. Ask before
building it.

## The rule, in the owner's words

> EARCANDLING, and if the services is both in the same bed, or in the same
> chair services, this setup doesnt need complication and can push through with
> just 5mins interval just to prepare for the next service.
>
> But if add ons, no need for 5mins interval.
> Single word like this: **Head, Hand, Back, Foot, Hot Stone, Ventosa, Shower**
>
> this is the only thing that if add up into anything doesnt need interval.

## What that means

Three separate claims. The first two are built and live; the third is not.

### 1. Same kind of place, back to back — one place, five minutes ✅ built

Two bed treatments in a row are **one bed, held right through**. She lies down
once. The five minutes between them is the therapist changing linen around her,
not an invitation for a stranger to book the bed she is on.

Ear candling is the example the owner gave: a massage then ear candling is one
bed, five minutes apart, one hold. The same is true of two chair treatments.

Shipped in #43. See `placeRuns` in `src/lib/itinerary.ts` and
`tests/place-runs.test.ts`.

### 2. Changing the kind of place — two holds ✅ built

Bed to sauna, chair to bed: she gets up and walks, so the first place is
released and the second is taken. Five minutes between them, as above.

### 3. The seven add-ons — no interval at all ❌ not built

**Head, Hand, Back, Foot, Hot Stone, Ventosa, Shower.**

Added to any treatment, these run straight on from it: no five-minute interval
in front of them, and in the same place, because the guest never gets up.
Swedish 60 + Back would be 75 minutes on one bed, not 80.

The mechanism exists — `Service.isAddOn`, honoured by `gapBetween` and
`placeRuns` — but **no service is flagged and there is no way to flag one from
the portal**. Today those seven behave like ordinary treatments and take the
five-minute interval.

## Two traps, if this is built later

**Match the whole name, never a substring.** The catalogue also holds
*Foot Massage (30 min)*, *Foot Massage (60 min)*, *Foot Spa (45 min)* and
*Hot Stone Massage (90 min)* — full treatments on their own chair or bed. A
`LIKE '%foot%'` or `LIKE '%hot stone%'` rule would give a ninety-minute massage
no changeover and force it to share the previous guest's bed.

**The category cannot decide this.** The spa keeps those seven on the same
heading as Sauna and Ear Candling, which a guest books on her own, and does not
want them split — splitting would leave ear candling in a category by itself.
So a category-wide flag cannot express the catalogue; it has to be per service.
`ServiceCategory.isAddOns` exists from the reverted attempt and is read by
nothing.

**A sauna session can never be an add-on**, however it is marked. An add-on
happens wherever the treatment before it happened; the sauna is a walk to
another room that is then held for her alone.

## History

- **#43** — same-place runs, the five-minute interval, and the day list
  checking every treatment against the place it needs. In scope, kept.
- **#44** — flagged the seven and added portal controls. Built from this note
  before the owner asked for it, and **reverted**. `Service.isAddOn` and
  `ServiceCategory.isAddOns` remain in the schema; the columns were kept rather
  than dropped because dropping one mid-deploy breaks the code still serving
  requests.
