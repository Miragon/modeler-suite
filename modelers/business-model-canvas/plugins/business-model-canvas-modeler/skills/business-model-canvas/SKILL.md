---
name: business-model-canvas
description: >-
  Explains the Business Model Canvas (the nine building blocks, customer segments and the stickies
  that serve them, colour as a team convention, assumptions to test), creates a canvas from a
  business question and reviews one with feedback notes written into the .bmc file. Use when
  creating, reviewing or improving a business model canvas or explaining its blocks; for the `.bmc`
  text format use the `bmc-dsl` skill.
---

# Business Model Canvas

The Business Model Canvas describes **how an organisation creates, delivers and captures value** on
one page: nine building blocks, each filled with short sticky notes. The right half is about the
customers (who they are, what they get, how they are reached, kept and pay), the left half about
what it takes to deliver (activities, resources, partners), and the bottom row weighs revenue
against cost. This skill lets you (1) **explain** the method, (2) **create** a canvas from a
business question and (3) **review** a canvas and return actionable feedback in the file.

The Business Model Canvas is by Strategyzer AG and licensed under CC BY-SA 3.0. Every canvas the
modeler draws and exports carries the line "The Business Model Canvas by Strategyzer AG,
strategyzer.com, CC BY-SA 3.0"; keep it when you describe or reproduce the canvas elsewhere. The
explanations here are Miragon's own words, not the official guiding questions. The Value
Proposition Canvas is a separate, protected work and out of scope: do not reproduce it.

## The canvas is a file: write it, never draw it

A canvas lives as a plain-text `.bmc` file. The Business Model Canvas Modeler draws it: the VS Code
extension `miragon-gmbh.business-model-canvas-modeler`, its Orca plugin, its web app and Miragon AI
Design render the file you write.

- Creating or reviewing a canvas **always means writing the `.bmc` file**. Do not render it
  yourself: no HTML, SVG, images or ASCII tables of the canvas.
- Without a file system (plain chat), give the complete file in one fenced block and tell the user
  to save it as `<name>.bmc` and open it in VS Code or the web app.
- The **`bmc-dsl` skill** (shipped alongside this one) owns the format: the YAML fields, items,
  notes, diagnostics. Load it whenever you read or write a file.

## The nine blocks

| Block                  | What goes in                                                               |
| ---------------------- | -------------------------------------------------------------------------- |
| Customer Segments      | The groups the model serves, each one sticky with a short id               |
| Value Propositions     | What each segment gets: the problem solved, the gain                       |
| Channels               | How a segment learns of the offer, buys it, receives it and gets help      |
| Customer Relationships | How the model wins a segment, keeps it and grows it                        |
| Revenue Streams        | What each segment pays, and how: sale, subscription, fee, licence          |
| Key Resources          | The assets the model cannot run without: people, technology, rights, money |
| Key Activities         | What the organisation must do well for the propositions to hold            |
| Key Partners           | Who supplies or does part of the work, and why that beats doing it alone   |
| Cost Structure         | The largest costs, and which activities and resources cause them           |

More on each block, with the questions to ask a team, is in `reference/blocks.md`.

## Conventions the modeler supports

- Colour as tape. `color` on a sticky shows as one strip of tape across its top edge; the paper
  stays white. What a colour means is the team's to decide: a customer segment, a theme, an owner.
  The usual convention is one colour per customer segment, on the segment and on every sticky that
  serves only that segment, so a segment can be followed across the blocks. A sticky that serves
  several segments stays without. Say which convention a canvas uses in a `canvas` note.
- Assumptions as notes. An assumption the team has not tested yet, or a doubt, is a note on its
  sticky (`text: "Assumption: …"`), as Strategyzer writes assumptions on their own stickies around
  the canvas. When the evidence is in, rewrite the note to say what was learned: that it held, or
  that it turned out false. Keep a sticky that proved wrong, with its note, until the canvas is
  revised: it records what was learned.
- Order is priority. Stickies are laid out in the order of their block's `items`, so the most
  important one comes first.

## Handling requests

| The user says…                         | Do this                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| "What goes into Key Resources?"        | Explain from the table above and `reference/blocks.md`, with an example in chat.       |
| "Create a business model canvas for X" | Follow **Creating a canvas** below, write the `.bmc`, then a short commentary in chat. |
| "Review / critique this canvas"        | Follow **Reviewing a canvas** below: notes into the file, assessment in chat.          |
| "Add / move / rename X"                | Edit the file in place (`bmc-dsl` rules); keep every other entry as it was.            |
| "Compare today with the plan"          | Ask for or write one file for today and one for the plan; list what changes, by block. |
| A photo or screenshot of a canvas      | Transcribe it into a `.bmc`, then confirm segments and colours with the user.          |

If the business question or the segments are unclear, ask: a canvas is only as good as the team's
knowledge of its customers. If the user wants a quick draft anyway, give what you guessed a
note that names it as an assumption and say so.

## Creating a canvas

1. The question first. What decision should the canvas support (launch, pivot, pricing, a new
   segment)? Put it in the `title`, and whether it is today's model or a plan.
2. Segments. Two to four segments that differ in what they need or how they pay. Give each a
   short id and its own palette `color` (see `bmc-dsl`).
3. Right half, per segment. For every segment: at least one value proposition, one channel, one
   relationship and one revenue stream, each in the segment's `color` when it serves only that
   segment.
4. Left half. The activities and resources the propositions depend on, then the partners that
   cover what the organisation does not do itself.
5. Costs. The largest costs, each traceable to an activity or a resource.
6. Mark the risk. Everything not backed by evidence gets a note that names the assumption
   (`text: "Assumption: …"`); those notes are the team's test plan.
7. Check your own canvas with the checks in `reference/review-playbook.md` before presenting it.
   Keep it lean: three to six stickies per block, a few words each.

## Reviewing a canvas

1. Read the file and build a picture: the segments, which stickies serve each (by colour, if the
   canvas uses one per segment, else by their text), which serve none.
2. Run the checks of `reference/review-playbook.md`, which also words the notes: every segment is
   served, no orphans, costs trace back, risk is marked, stickies are short, left fits right,
   revenue against cost, the model as a whole.
3. Write the feedback into the file as notes, next to what they are about: a sticky, a block or,
   in `canvas.notes`, the canvas as a whole.
4. Summarise in chat, with the findings grouped: strengths, weaknesses and risks, the assumptions
   to test first.

When you review, **change nothing but the notes** unless the user asks you to: do not move,
reword or delete stickies, and keep the fields you do not know. Suggest changes in the notes and
let the team decide. A note from an earlier review that is resolved may be removed.

```bmc
version: 1
canvas:
  title: Neighbourhood bakery
  notes:
    - text: "Next: test whether hotels pay for breakfast baskets"
customer-segments:
  items:
    - id: commuters
      text: Commuters on the way to work
      color: sky
    - id: hotels
      text: Hotels nearby
      color: peach
      notes:
        - text: "Gap: no revenue stream names this segment"
value-propositions:
  items:
    - id: bread-before-7
      text: Fresh bread before 7 am
      color: sky
      notes:
        - text: "Strength: clear, tested, specific"
    - id: breakfast-baskets
      text: Breakfast baskets
      color: peach
      notes:
        - text: "Assumption: hotels order baskets every day"
cost-structure:
  items:
    - id: rent
      text: Rent and energy
  notes:
    - text: "Gap: wages are missing, yet baking at night is a key activity"
```

## Reference files (read on demand)

- `reference/blocks.md`: each block in depth, the questions to ask a team, common mistakes.
- `reference/review-playbook.md`: the checklist with example notes, the written assessment.
- The **`bmc-dsl` skill**: the `.bmc` format itself. Load it whenever you read or write a file.
