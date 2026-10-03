# review module

Review decisions, risk/manual-review state, moderation transitions.

## What this module owns

The artisan's review surface for one of their products, and the single rule
that gates approval: **a product may be approved only when nothing is
outstanding in its review.**

Concretely:

- `GET /catalog/products/:id/review` — canonical values, every undecided
  valid AI proposal with its provenance, confidence, risk, staleness and the
  value it would replace, plus the ordered list of what blocks approval.
- `POST /catalog/products/:id/review/approve` — approval, refused and
  explained while anything is outstanding.

## What this module deliberately cannot do

It holds no product store and no proposal store, so it cannot write either.
Reading a suggestion and naming it as a blocker is the whole of its authority
over AI output. Applying a suggestion is the AI module's decision API, and
writing the product is the Catalog module's `approve`/`publish` operations.

That is the ADR-002 boundary expressed as a type rather than as a
convention: the Review module can see a proposal and can refuse to let a
product past it, and cannot make it canonical.

## Dependencies

`Catalog ← Review` and `AI → Review`, joined only in `composition.ts`.
Neither dependency knows the other exists:

- Catalog cannot depend on AI, because the rule that approval requires an
  empty review queue is only knowable with AI's proposals, and making
  publication wait on an AI read would let an AI outage block manual product
  creation. ADR-002 requires the opposite.
- AI cannot depend on Review, because the AI module generates proposals and
  has no authority over whether a product is cleared for publication.

`getSuggestionsPort` resolves an unconfigured AI environment to "no
suggestions" rather than failing, so an AI outage never becomes a publication
outage. Anything other than that specific refusal still propagates: an
approval must not proceed on a review surface that cannot see AI at all.

## Known gap

The readiness check, the suggestion read, and the approve write are not one
atomic step, so a proposal written in that window would not be seen. Closing
it needs a single guard spanning `catalog_products.state` and `ai_proposals` —
either of which makes one module's SQL read the other's tables or share its
lock discipline. That is a change to the module-boundary contract and is
recorded in `docs/agent/m5-review-publish-task.md` rather than taken here.

What bounds it today: the AI module refuses to *enqueue* for a product
outside its working states, and `APPROVED` is deliberately not one of them,
so the only remaining interleaving is a job enqueued before the approval and
still running when it happened; and approval and publication are separate
explicit operations, so an affected product stays `APPROVED` rather than
buyer-visible until a second, deliberate publish.

Moderation is **not** implemented here. `AGENTS.md` §10 requires mandatory
moderation for prohibited claims, policy-sensitive content, and fraud
indicators. This slice is the artisan reviewing their own product; the
moderation role is a later slice.
