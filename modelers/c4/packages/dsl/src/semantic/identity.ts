/*
 * Final element ids (SPEC 3.3): explicit identifiers as defined (hierarchical mode: the full
 * dotted key), then an implicit identifier for every anonymous element in document order,
 * derived against every identifier the register holds and the implicit ones before it.
 */
import { deriveIdentifier, type IdentifierRegister } from "@miragon/c4-schema-model";
import type { ElementRecord } from "./records.js";
import type { Build } from "./state.js";

const PLACEHOLDER = "\u0000";

export function assignIds(build: Build): void {
  const taken = new Set<string>();
  for (const key of build.register.keys()) {
    if (!key.includes(PLACEHOLDER)) taken.add(key);
  }
  const children = new Map<ElementRecord, ElementRecord[]>();
  for (const record of build.elements) {
    if (record.parent === undefined) continue;
    const list = children.get(record.parent) ?? [];
    list.push(record);
    children.set(record.parent, list);
  }
  const assigned = new Set<ElementRecord>();
  const assign = (record: ElementRecord, id: string) => {
    record.id = id;
    assigned.add(record);
    taken.add(id.toLowerCase());
  };
  /** An explicit element's id follows from its parent's once that one is known. */
  const assignExplicitBelow = (parent: ElementRecord) => {
    const pending = [...(children.get(parent) ?? [])];
    for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
      if (next.anonymous || assigned.has(next)) continue;
      assign(next, explicitId(next));
      pending.push(...(children.get(next) ?? []));
    }
  };
  for (const record of build.elements) {
    if (!record.anonymous && !hasAnonymousKeyAncestor(record)) assign(record, explicitId(record));
  }
  const register: IdentifierRegister = {
    taken,
    archetypes: new Set(
      [...build.archetypes.values()].flatMap((archetypes) => [...archetypes.keys()]),
    ),
  };
  for (const record of build.elements) {
    if (assigned.has(record)) continue;
    if (record.anonymous) {
      const parentId = record.parent?.id;
      const local = deriveIdentifier(record.name, record.kind, register, record.mode, parentId);
      assign(
        record,
        record.mode === "hierarchical" && parentId !== undefined ? `${parentId}.${local}` : local,
      );
    } else {
      assign(record, explicitId(record));
    }
    assignExplicitBelow(record);
  }
}

function explicitId(record: ElementRecord): string {
  const identifier = record.identifier ?? "";
  return record.mode === "hierarchical" && record.parent !== undefined
    ? `${record.parent.id}.${identifier}`
    : identifier;
}

/** In hierarchical mode an explicit element below an anonymous one is keyed under that one's id. */
function hasAnonymousKeyAncestor(record: ElementRecord): boolean {
  return record.registerKey.includes(PLACEHOLDER);
}
