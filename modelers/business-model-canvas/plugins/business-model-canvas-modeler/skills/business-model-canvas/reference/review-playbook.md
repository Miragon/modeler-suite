# Review playbook

How to review a `.bmc` canvas: what to check, how to word the notes and what to say in chat. The
format of notes is in the `bmc-dsl` skill.

## 1. Read before you judge

List the segments with their ids and colours, then, for each segment, the stickies that serve it,
block by block: those in its colour, when the canvas colours by segment, else those whose text
names it. A colour means what the team made it mean; when the canvas does not say, ask, or read
the texts. Note the stickies on the right half that serve no segment, and the notes that already
name an assumption.

## 2. The checks

| Check                   | Passes when                                                                                                                                                     | Note when it fails                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Every segment is served | Each segment has a value proposition, a channel, a relationship and a revenue stream for it, in its colour or named in the text                                 | Under the segment: "Gap: …", naming the missing blocks; no revenue is a gap or a subsidy to explain |
| No orphans              | Every proposition serves a segment; on a canvas that colours by segment, no colour stands for a segment the canvas lacks                                        | Under the sticky: "Gap: serves no segment"                                                          |
| Costs trace back        | Every large cost follows from an activity or resource, and each expensive one of those has a cost                                                               | In the `notes` of Cost Structure, or under the activity                                             |
| Risk is marked          | Stickies the model stands or falls with (a new segment's willingness to pay, a partner's commitment, an untried channel) carry a note that names the assumption | Under the sticky: "Assumption: …"                                                                   |
| Stickies are short      | One idea, a few words, concrete ("Monthly invoices", not "Revenue")                                                                                             | Under the sticky: suggest a shorter wording                                                         |
| Left fits right         | Activities and resources explain how the propositions are delivered; partners cover gaps, not everything                                                        | In the `notes` of Key Activities or Key Resources                                                   |
| Revenue against cost    | The streams plausibly cover the costs, or the gap is stated                                                                                                     | In the `notes` of Revenue Streams: "Risk: …" or the gap                                             |
| The model as a whole    | The canvas answers its business question; the riskiest assumption is named                                                                                      | In `canvas.notes`: the riskiest assumption, "Assumption: …"                                         |

Mark strengths too: a specific proposition backed by evidence or a segment served end to end
deserves a note that says so ("Strength: …"). When the evidence is in, rewrite an assumption's
note to say what was learned: that it held, or that it turned out false. A review with only
problems is harder to act on.

## 3. Wording the notes

- One line each, a few words, saying what to do or look at:

  ```yaml
  - text: "Gap: which channel reaches hotels?"
  ```

- In the `notes` of the item it is about, in the block's own `notes` (next to its `items`) for a
  finding about the block as a whole, or in `canvas.notes` (after the title) for one about
  the canvas as a whole, such as the assumption to test first.
- A note is only its text, and the canvas shows every note alike, so the text says what it is.
  Start it with that when it helps the reader: "Strength: …", "Risk: …", "Gap: …",
  "Assumption: …" or "Next: …". Quote such a text, since it holds a colon and a space. Never a `#`
  comment: the canvas drops it.
- Never reword, move or delete the team's stickies in a review; suggest it in a note.

## 4. The written assessment

After writing the notes, summarise in chat, with the findings grouped:

1. Strengths: what is clear and backed by evidence.
2. Weaknesses and risks: unserved segments, untraced costs, untested assumptions the model
   depends on.
3. Test first: the two or three assumptions whose failure would change the model most, each
   with a quick way to test it.
