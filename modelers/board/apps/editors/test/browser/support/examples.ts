/**
 * The example file of each of the seven modelers, as its own modeler ships it, and a BPMN process
 * of the board's own fixtures, under the path a board's model node would name.
 */
import businessModelCanvas from "../../../../../../business-model-canvas/example/miragon.bmc?raw";
import c4 from "../../../../../../c4/example/bookshop.c4?raw";
import contextMaps from "../../../../../../context-maps/example/sample.cm?raw";
import eventStorming from "../../../../../../event-storming/example/order-checkout.storm?raw";
import teamTopologies from "../../../../../../team-topologies/example/sample.tt?raw";
import valueChain from "../../../../../../value-chain/example/porter.vc.json?raw";
import wardley from "../../../../../../wardley-maps/example/tea.owm?raw";
import bpmn from "../../fixtures/order-to-cash.bpmn?raw";

export interface Example {
  /** the contract's `meta.notation` of the modeler that shows the file */
  readonly notation: string;
  readonly path: string;
  readonly text: string;
}

export const EXAMPLES: readonly Example[] = [
  { notation: "wardley", path: "models/tea.owm", text: wardley },
  { notation: "event-storming", path: "models/order-checkout.storm", text: eventStorming },
  { notation: "team-topologies", path: "models/sample.tt", text: teamTopologies },
  { notation: "context-maps", path: "models/sample.cm", text: contextMaps },
  { notation: "value-chain", path: "models/porter.vc.json", text: valueChain },
  { notation: "c4", path: "models/bookshop.c4", text: c4 },
  { notation: "business-model-canvas", path: "models/miragon.bmc", text: businessModelCanvas },
  { notation: "bpmn", path: "models/order-to-cash.bpmn", text: bpmn },
];

export function exampleOf(notation: string): Example {
  const example = EXAMPLES.find((one) => one.notation === notation);
  if (!example) throw new Error(`no example for the notation '${notation}'`);
  return example;
}
