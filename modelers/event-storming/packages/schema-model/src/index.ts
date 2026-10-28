export type {
  Coordinate,
  ElementType,
  BoardElementBase,
  DomainEventElement,
  CommandElement,
  ActorElement,
  AggregateElement,
  PolicyElement,
  ReadModelElement,
  ExternalSystemElement,
  HotspotElement,
  NoteAlignHorizontal,
  NoteAlignVertical,
  NoteAlign,
  NoteElement,
  DrawingStrokeStyle,
  DrawingElement,
  BoardElement,
  Arrow,
  BoardEdge,
  BoardLevel,
  BoardConfig,
  EventStormingBoard,
} from "./types.js";

// Layout helpers — empty-board framing constant and deterministic timeline order
export { DEFAULT_BOARD_SIZE, sortByTimeline } from "./layout.js";

// Workshop levels — default level and the sticky kinds each level offers
export { DEFAULT_BOARD_LEVEL, LEVEL_STICKY_KINDS } from "./levels.js";

// Pinning — which sticky kinds can be attached and which can host them
export { ATTACHABLE_STICKY_KINDS, HOST_STICKY_KINDS } from "./attachments.js";

// Vocabulary: the names per sticky kind, compared after normalisation, and their spelling variants
export {
  VOCABULARY_STICKY_KINDS,
  DEFAULT_SUGGESTION_LIMIT,
  isVocabularyStickyKind,
  normalizeLabel,
  collectVocabulary,
  spellingVariants,
  suggestLabels,
} from "./vocabulary.js";
export type {
  VocabularyStickyKind,
  LabelledSticky,
  LabelSpelling,
  VocabularyTerm,
} from "./vocabulary.js";

// Aggregates: the commands and events of each aggregate, read from the arrows, by normalised name
export { groupByAggregate } from "./aggregates.js";
export type {
  PlacedSticky,
  ArrowEnds,
  AggregateBoard,
  NamedStickies,
  CommandEventPair,
  AggregateGroup,
} from "./aggregates.js";

export {
  validateBoard,
  loadBoard,
  parseBoardJSON,
  serializeBoard,
  createEmptyBoard,
} from "./serialize.js";

// The drawable range — what loadBoard and the canvas refuse rather than import half-way
export { LARGEST_DRAWABLE_NUMBER, UndrawableBoardError, assertDrawable } from "./drawable.js";

export { eventStormingBoardSchema, boardElementSchema, boardEdgeSchema } from "./schema.js";
export type { EventStormingBoardInput } from "./schema.js";

export { migrate, CURRENT_SCHEMA_VERSION } from "./migrations.js";
