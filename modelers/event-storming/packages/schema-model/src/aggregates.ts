/**
 * The board's aggregates with the commands they handle and the domain events they lead to, read
 * from the arrows of a design-level board: command → aggregate → event. "Repeat, never reuse"
 * puts an aggregate on the timeline once per step, so its behaviour lies scattered; grouping the
 * aggregates by name brings it back together. Names are compared with `normalizeLabel`, as the
 * vocabulary does, so `Order`, `order` and `Orders` are one aggregate, and a placeholder name such
 * as `Aggregate 2` names none. Derived from the board every time, never stored, so the schema and
 * the DSL stay unchanged.
 */

import type { Arrow, BoardElement } from "./types.js";
import { isPlaceholderLabel, normalizeLabel, type LabelSpelling } from "./vocabulary.js";

/** A sticky as the grouping reads it; every `BoardElement` fits. */
export type PlacedSticky = Pick<BoardElement, "id" | "elementType" | "label" | "position">;

/** An arrow as the grouping reads it; every `Arrow` fits. */
export type ArrowEnds = Pick<Arrow, "from" | "to">;

/** What `groupByAggregate` reads; an `EventStormingBoard` fits. */
export interface AggregateBoard {
  readonly elements: readonly PlacedSticky[];
  readonly edges: readonly ArrowEnds[];
}

/** The stickies of one kind that carry one name, in any spelling. */
export interface NamedStickies {
  /** `normalizeLabel` of the name; empty for a label without a word, which names nothing. */
  readonly key: string;
  /** The spelling most of the stickies use; on a tie, the one first on the timeline. */
  readonly label: string;
  /** Every spelling with the stickies that write it, the preferred one first. */
  readonly spellings: readonly LabelSpelling[];
  /** The stickies in timeline order. */
  readonly elementIds: readonly string[];
}

/** A command and an event that an arrow into and an arrow out of one aggregate sticky join. */
export interface CommandEventPair {
  /** One of the group's `commands`. */
  readonly command: NamedStickies;
  /** One of the group's `events`. */
  readonly event: NamedStickies;
}

/** One aggregate of the board, however often the timeline repeats it. */
export interface AggregateGroup {
  readonly aggregate: NamedStickies;
  /** The commands with an arrow into one of the aggregate's stickies, once per name. */
  readonly commands: readonly NamedStickies[];
  /** The domain events with an arrow from one of the aggregate's stickies, once per name. */
  readonly events: readonly NamedStickies[];
  /** Which command leads to which event, once per pair of names, in the order of the lists. */
  readonly pairs: readonly CommandEventPair[];
}

/** The order `sortByTimeline` gives: left to right, then top to bottom, then by id. */
function timelineOrder(first: PlacedSticky, second: PlacedSticky): number {
  return (
    first.position.x - second.position.x ||
    first.position.y - second.position.y ||
    first.id.localeCompare(second.id)
  );
}

interface NameDraft {
  readonly key: string;
  readonly spellings: Map<string, string[]>;
  readonly elementIds: string[];
}

/**
 * The names of `stickies`, given in timeline order, each with its stickies, in the order the names
 * are first met. A label without a word groups with no other sticky: two stickies called `?` are
 * two unknowns, not one.
 */
function namesOf(stickies: readonly PlacedSticky[]): Map<string, NamedStickies> {
  const drafts = new Map<string, NameDraft>();
  const nameIdOf = new Map<string, string>();
  for (const sticky of stickies) {
    const key = normalizeLabel(sticky.label);
    // A key holds letters and digits only, so an id behind a space never meets one.
    const nameId = key === "" ? ` ${sticky.id}` : key;
    nameIdOf.set(sticky.id, nameId);
    let draft = drafts.get(nameId);
    if (!draft) {
      draft = { key, spellings: new Map(), elementIds: [] };
      drafts.set(nameId, draft);
    }
    draft.elementIds.push(sticky.id);
    const spelledSo = draft.spellings.get(sticky.label);
    if (spelledSo) spelledSo.push(sticky.id);
    else draft.spellings.set(sticky.label, [sticky.id]);
  }
  const names = new Map<string, NamedStickies>();
  for (const [nameId, draft] of drafts) {
    const spellings = [...draft.spellings]
      .map(([label, elementIds]) => ({ label, elementIds }))
      .sort((first, second) => second.elementIds.length - first.elementIds.length);
    names.set(nameId, {
      key: draft.key,
      label: spellings[0]!.label,
      spellings,
      elementIds: draft.elementIds,
    });
  }
  const byStickyId = new Map<string, NamedStickies>();
  for (const [stickyId, nameId] of nameIdOf) byStickyId.set(stickyId, names.get(nameId)!);
  return byStickyId;
}

/** The distinct names among `named`, in the order they are first met. */
function distinct(named: Iterable<NamedStickies>): NamedStickies[] {
  return [...new Set(named)];
}

/**
 * The aggregates of `board`, each with the commands it handles and the events it leads to:
 *
 * - Aggregates whose labels `normalizeLabel` reads alike form one group, however far apart they
 *   stand and however often the timeline repeats them. Its `label` is the spelling most of them
 *   use.
 * - A command belongs to a group through an arrow from it into one of the group's aggregates, an
 *   event through an arrow from one of them to it. Only these count: an arrow the other way, a
 *   command's arrow straight to an event, and policies, read models, actors, external systems,
 *   hotspots and notes on either end leave the groups as they are, and so does an arrow to an
 *   aggregate of another name.
 * - Commands and events are listed once per name (again by `normalizeLabel`), with every sticky of
 *   that name an arrow joins to the group, so a command that reaches two aggregates is in both
 *   groups.
 * - A pair joins a command and an event that one and the same aggregate sticky connects: an arrow
 *   from the command into it, an arrow from it to the event. Two steps of the timeline with the
 *   same aggregate never pair the command of one with the event of the other.
 * - An aggregate without arrows still forms a group, with empty lists. Commands and events that
 *   reach no aggregate are in no group: only arrows join a sticky to an aggregate, never how near
 *   it stands.
 * - An aggregate whose label is still the placeholder a new sticky gets (`Aggregate`,
 *   `Aggregate 2`: `isPlaceholderLabel`) is no aggregate of the domain yet and forms no group, so
 *   commands and events that reach only such aggregates are in no group either. An empty
 *   aggregate counts as one, since a `.storm` file stores it as `Aggregate`.
 * - A label without a word (`?`; an empty command or event) names nothing, so its sticky groups
 *   with no other: each such aggregate is a group of its own, each such command or event an entry
 *   of its own. Its `key` is empty.
 *
 * The groups come in the order their first aggregate stands on the timeline (`sortByTimeline`:
 * left to right, then top to bottom), the commands and events of a group likewise, and the sticky
 * ids of every name in timeline order. Arrows to stickies the board does not hold are left out.
 */
export function groupByAggregate(board: AggregateBoard): AggregateGroup[] {
  const stickies = new Map<string, PlacedSticky>();
  for (const element of board.elements) {
    if (!stickies.has(element.id)) stickies.set(element.id, element);
  }
  const ordered = [...stickies.values()].sort(timelineOrder);
  const ofKind = (kind: PlacedSticky["elementType"]): PlacedSticky[] =>
    ordered.filter((sticky) => sticky.elementType === kind);

  const commandsInto = new Map<string, Set<string>>();
  const eventsOutOf = new Map<string, Set<string>>();
  const link = (links: Map<string, Set<string>>, aggregateId: string, otherId: string): void => {
    let others = links.get(aggregateId);
    if (!others) {
      others = new Set();
      links.set(aggregateId, others);
    }
    others.add(otherId);
  };
  for (const edge of board.edges) {
    const from = stickies.get(edge.from);
    const to = stickies.get(edge.to);
    if (!from || !to) continue;
    if (from.elementType === "command" && to.elementType === "aggregate") {
      link(commandsInto, to.id, from.id);
    } else if (from.elementType === "aggregate" && to.elementType === "event") {
      link(eventsOutOf, from.id, to.id);
    }
  }

  const aggregateNames = namesOf(
    ofKind("aggregate").filter((sticky) => !isPlaceholderLabel(sticky.elementType, sticky.label)),
  );
  return distinct(aggregateNames.values()).map((aggregate) => {
    const linked = (links: Map<string, Set<string>>): PlacedSticky[] => {
      const ids = new Set(aggregate.elementIds.flatMap((id) => [...(links.get(id) ?? [])]));
      return ordered.filter((sticky) => ids.has(sticky.id));
    };
    const commandNames = namesOf(linked(commandsInto));
    const eventNames = namesOf(linked(eventsOutOf));
    const commands = distinct(commandNames.values());
    const events = distinct(eventNames.values());

    const paired = new Map<NamedStickies, Set<NamedStickies>>();
    for (const aggregateId of aggregate.elementIds) {
      for (const commandId of commandsInto.get(aggregateId) ?? []) {
        const command = commandNames.get(commandId)!;
        let following = paired.get(command);
        if (!following) {
          following = new Set();
          paired.set(command, following);
        }
        for (const eventId of eventsOutOf.get(aggregateId) ?? []) {
          following.add(eventNames.get(eventId)!);
        }
      }
    }
    const pairs = commands.flatMap((command) =>
      events
        .filter((event) => paired.get(command)?.has(event))
        .map((event) => ({ command, event })),
    );
    return { aggregate, commands, events, pairs };
  });
}
