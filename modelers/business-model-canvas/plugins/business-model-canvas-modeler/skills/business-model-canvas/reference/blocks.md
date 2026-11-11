# The nine blocks in depth

Miragon's own explanation of each block, the questions to put to a team and the mistakes that come
up most. The block ids are those of the `.bmc` format (`bmc-dsl` skill).

## Customer Segments (`customer-segments`)

The groups of people or organisations the model creates value for. Two groups are separate
segments when they need something different, are reached differently or pay differently.

- Ask: who would miss the offer most? Who pays, and is that the same person who uses it? Which
  group would we serve first if we could serve only one?
- Write: one sticky per segment, specific ("Cafés that buy wholesale", not "B2B"), with a short
  `id` and, when the canvas colours by segment, a palette `color` of its own.
- Mistakes: "everyone" as a segment; a payer and a user merged into one segment; segments no other
  sticky serves.

## Value Propositions (`value-propositions`)

What a segment gets: the job it gets done, the pain that goes away, the gain it did not have.
A proposition is for someone, so it serves at least one segment: in its colour, or named in its
text.

- Ask: why would this segment switch from what it does today? What does it get from us that it
  cannot get elsewhere, or not as well?
- Write: the benefit, not the feature list ("Fresh bread before 7 am", not "Ovens").
- Mistakes: a proposition for no segment; one proposition claimed for every segment without a
  reason.

## Channels (`channels`)

How a segment hears of the offer, judges it, buys it, receives it and gets help afterwards.

- Ask: where does this segment look for a solution today? Which channel reaches it at the lowest
  cost, and which one does it trust?
- Write: the concrete channel ("Shop at the train station", "VS Code Marketplace").
- Mistakes: a segment without a channel; only the sales step, no delivery or support.

## Customer Relationships (`customer-relationships`)

How the model wins a segment, keeps it and sells it more: personal help, self-service, a
community, a subscription that runs on its own.

- Ask: what does this segment expect from us after the first purchase? What makes it stay?
- Mistakes: a relationship that costs more than the segment brings in, with no note about it.

## Revenue Streams (`revenue-streams`)

What each segment pays for, and how: a one-off sale, a subscription, usage fees, licences,
commissions.

- Ask: what is this segment willing to pay for, and how does it prefer to pay? Which stream carries
  the model?
- Mistakes: a segment with no stream and no stated reason (a free tier can be deliberate, then say
  so); prices nobody has tested, without a note that names the assumption.

## Key Resources (`key-resources`)

The assets the model cannot run without: people and skills, technology and data, rights and
brands, money and premises.

- Ask: what would stop us tomorrow if we lost it? What is hard for others to copy?
- Mistakes: a resource list that does not explain any proposition; resources with no cost.

## Key Activities (`key-activities`)

What the organisation itself must do well so the propositions hold: making, solving problems,
running a platform, building a community.

- Ask: which activities make or break the propositions? Which of them do we do better than others?
- Mistakes: the whole to-do list of the company; activities that belong to a partner.

## Key Partners (`key-partners`)

Who supplies or does part of the work, and why: to lower cost or risk, or to get a resource the
organisation cannot build itself.

- Ask: what do we buy, borrow or share? Which partner could we not replace quickly?
- Mistakes: customers listed as partners; a critical partner without a note that names the
  assumption while the agreement is still open.

## Cost Structure (`cost-structure`)

The largest costs of running the model, fixed and variable, and what drives them.

- Ask: which activities and resources cost the most? Does the model compete on cost or on value?
- Mistakes: costs that no activity or resource explains; expensive activities with no cost.
