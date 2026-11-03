# Linked maps: an overview and its detail maps

A map that tries to show everything shows nothing. When the scope is too big for one readable map,
split it: an **overview** of the whole scope, and a **detail map** for each component that is a
value chain of its own. The overview's element links to its detail map by a relative address, so
the user clicks through from one to the other. Each map stays a complete Wardley map with its own
anchor, chain and evolution, written as its own file.

The syntax (the `url` line, how an address resolves, component or submap) is the `owm-dsl` skill's
"Links between maps". This file is about the method: when to split, how to lay out the set, and
what a review of a set checks.

## When to split

A submap is a component that is itself a value chain worth mapping: it has needs of its own, its
parts sit at different stages, and there are decisions inside it (what to build, what to buy, where
inertia sits). Signs that a map is too big:

- more than about 15 to 18 components, or labels that still collide after staggering the heights;
- one branch of the chain holds half the components, and the discussion keeps zooming into it;
- a component name that hides several stages ("Fulfilment" is partly built, partly bought);
- the map answers two strategic questions at once, for two audiences.

Do not split:

- a component you buy or outsource as a product or commodity. Its internals are the supplier's
  business; mapping them suggests choices you do not have. Map how you consume it, if that matters,
  on the overview;
- a component whose chain has only two or three parts: keep them on the overview;
- to hide a muddle. A wrong overview stays wrong when its details move elsewhere.

Rule of thumb: detail the components where you build, or where inertia sits. Most sets need one to
four detail maps; a set with ten is probably several overviews.

## Laying out the set

```text
maps/
  online-grocery.wmap        the overview, named after the subject
  details/
    fulfilment.wmap          one detail map per detailed component
    meal-planner.wmap
```

- The overview sits at the root of the set, named after the subject in kebab case.
- Every detail map sits in one `details/` folder, named after the component it details in kebab
  case. A detail of a detail goes there too, so the folder stays flat: detail maps link to each
  other by file name (`order-picking.wmap`), and every link back is `../<overview>.wmap`.
- On the overview, the detailed element carries the link:
  `url Fulfilment URL [details/fulfilment.wmap]` and `url(Fulfilment URL)` on its line. Draw it as
  a `submap` (a double square) when it stands for its detail map; keep it a `component` when the
  overview must also show its sourcing, its inertia or an `evolve` arrow, which a submap cannot
  carry.
- The detail map's **anchor is the overview's component it details**, spelt exactly the same. It is
  the "user" of this chain; the needs directly beneath it are what the component has to deliver.
  Put the anchor at the component's maturity on the overview, so both maps read alike.
- Its title is `<Overview title>: <Component>` (`Online Grocery: Fulfilment`).
- One name per thing across the set: the overview element, the detail map's anchor, its title and
  its file name all say the same thing. A component that appears on several maps (shared
  infrastructure, a catalogue several chains need) keeps its name and its maturity on all of them.
- Do not draw the detailed chain on the overview as well. The overview shows the component, the
  detail map its parts; only shared components appear on both.

## Linking back

A detail map can link back to the overview. It helps when people open detail maps directly (from
the file explorer, a link in a document) or when the set goes deeper than one level; a set that is
always read from the overview down does not need it. Either every detail map of a set links back or
none does.

An anchor cannot carry a link, so the link back is a `submap` of its own: named after the
overview's title, in the top-left corner at the anchor's height, with
`url Online Grocery URL [../online-grocery.wmap]` and **no dependency links**. It is navigation, not
part of the chain, and its maturity means nothing; a review does not count it as an orphan.

## Following the links depends on the host

The files always hold the links; whether a click follows one depends on the host that renders the
map. The VS Code extension does (**Open link** in the context pad opens the linked map in its own
tab, **Link to map…** writes the address of another map of the workspace). The web app does not: it
opens one file at a time, knows no folder, and says that it cannot follow the link; a share link
carries a single map. Miragon AI Design and other hosts follow relative links only if they
implement it. So hand a set over as files (a folder, a repository), and tell a web-app user to open
the set in VS Code to click through.

## Creating a linked set

1. Map the overview first: the normal workflow (`creating-maps.md`) on the whole scope at overview
   grain, 8 to 15 components, each detailed component as one element.
2. Pick what to detail with the criteria above, and decide component or submap for each.
3. Write one detail map per pick with the same workflow: anchored by the component, its needs
   below, evolution assessed with evidence. Reuse the overview's placement for every shared
   component.
4. Cross-check the set with the review checks below, and fix what you find.
5. Validate every file on its own (`owm-dsl` skill, `check-map.mjs`), then the links of the whole
   set (`owm-dsl` skill, `reference/api.md`, "Checking the links of a map set").
6. Write one commentary for the set: the overview's commentary, a short section per detail map, and
   which elements link where and how to follow them.

## Reviewing a linked set

Ask for the whole set: a detail map alone hides half its context. Review the overview first, then
each detail map it links, every map with the full `review-playbook.md`. Then check the set:

| Check                          | How to detect                                                                                                                                                                                               | Why it matters                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Broken links**               | A relative address that names no file, from the folder of the map that holds it: a typo, another case, a renamed or moved file, `%20`, a leading `/`, a backslash. Or a target that is no `.wmap` / `.owm`. | The click fails, or opens nothing, and the parser said nothing.                       |
| **Lost links**                 | Diagnostic `url(…) has no matching …`, often a literal `url(details/x.wmap)`; a `url` line nothing references.                                                                                              | The address is not on the element and disappears on the next save.                    |
| **Missing links**              | A detail map no map links to; a `submap` without `url(…)`; an element whose detail map exists in `details/` but carries no link.                                                                            | The user cannot reach the detail, or the double square promises a map that is absent. |
| **Name drift**                 | The detail map's anchor, title or file name differs from the overview element, usually after a rename on one map only.                                                                                      | The maps no longer say that they describe the same thing.                             |
| **Shared components disagree** | A component on two maps at different stages, or more than about `0.05` apart in maturity.                                                                                                                   | One of the two placements is wrong, and the set argues with itself.                   |
| **Evolution contradicts**      | The overview's component and its parts tell different stories (below).                                                                                                                                      | The overview's strategy rests on a placement its own detail does not support.         |
| **Duplicated chain**           | The detailed chain is drawn on the overview as well.                                                                                                                                                        | Two copies drift apart; the overview loses its grain.                                 |
| **Back links**                 | Some detail maps link back and others do not, or a back link names the wrong overview.                                                                                                                      | Navigation that works only sometimes is worse than none.                              |

A detail map **contradicts the overview's evolution** when:

- the overview places the component in Commodity or marks it `(buy)` / `(outsource)`, while its
  detail map builds Genesis or Custom-Built parts: either the overview overrates the component, or
  the detail map maps a supplier's internals;
- the overview calls the component a Custom-Built differentiator, while every part of its detail
  map is a bought product or commodity: there is no differentiation left, or the detail map misses
  the part that makes it Custom-Built;
- the overview gives the component an `evolve` arrow or `inertia`, while its detail map shows no
  part that moves or resists (or the other way round): name the part that carries the movement;
- the sourcing differs: `(buy)` on the overview, `(build)` on the parts that make it up.

Write each note in the map where the problem sits: a broken link red, next to the element that
holds it; a contradiction amber, in the detail map next to its anchor or the part concerned, naming
the other map ("Overview says buy"). The written assessment covers the set once, with a section
**Across the maps** for these findings.

## Worked example: `examples/online-grocery/`

An online grocer's overview with two detail maps, all three clean, canonical and linked:

```text
examples/online-grocery/
  online-grocery.wmap
  details/
    fulfilment.wmap
    meal-planner.wmap
```

```owm
title Online Grocery
url Meal Planner URL [details/meal-planner.wmap]
url Fulfilment URL [details/fulfilment.wmap]
anchor Household [0.95, 0.5]
component Online Order [0.85, 0.42]
component Home Delivery [0.85, 0.68]
submap Meal Planner [0.7, 0.22] url(Meal Planner URL)
component Payment [0.62, 0.82] (buy)
component Product Catalogue [0.55, 0.58]
component Fulfilment [0.45, 0.35] (build) inertia url(Fulfilment URL)
component Cloud Hosting [0.1, 0.85] (outsource)
note Differentiator: build it [0.64, 0.22] (color #0B7A55)
note Inertia: store picking [0.38, 0.28] (color #92610A)
evolve Fulfilment 0.5 (buy)
Household -> Online Order
Household -> Home Delivery
Online Order -> Meal Planner
Online Order -> Product Catalogue
Online Order -> Payment
Home Delivery -> Fulfilment
Meal Planner -> Product Catalogue
Product Catalogue -> Cloud Hosting
Fulfilment -> Cloud Hosting
```

- **Meal Planner** is the differentiator and a chain of its own (meal suggestions, ingredient
  matching, recipe content, a language model), so it is a `submap`. Its detail map shows why it is
  Custom-Built: the two parts the grocer builds sit in Genesis and Custom-Built.
- **Fulfilment** is detailed too, but stays a `component`: the overview has to show its `(build)`,
  its inertia and its expected move to a bought fulfilment platform. Its detail map carries the
  same story one level down: **Order Picking** in the grocer's own stores is the Custom-Built part
  with the inertia, and it has the same `evolve` arrow to 0.5 with `(buy)`.
- **Payment** is not detailed: it is a bought commodity, and its internals are the provider's.
- **Shared components agree:** Product Catalogue sits at 0.58 on the overview and in the meal
  planner, Cloud Hosting at 0.85 on all three maps.
- Each detail map is anchored by the component it details (`anchor Fulfilment [0.95, 0.35]`, at
  the overview's maturity), titled `Online Grocery: Fulfilment`, and links back with
  `submap Online Grocery` in its top-left corner, whose address is `../online-grocery.wmap`.
