/**
 * The folder `modelers/board/example` inside the extension host's bundle: the board file, and
 * every model and picture beside it under the path a node stores. Each file is named here,
 * since the host's bundler reads no folder; `test/example.test.ts` fails for a file of the
 * folder that is missing here and for one that is no text.
 */
import board from "../../../example/example.board?raw";
import logo from "../../../example/assets/miragon-komet-blau.svg?raw";
import bookshop from "../../../example/models/bookshop.c4?raw";
import miragon from "../../../example/models/miragon.bmc?raw";
import orderCheckout from "../../../example/models/order-checkout.storm?raw";
import porter from "../../../example/models/porter.vc.json?raw";
import contextMap from "../../../example/models/sample.cm?raw";
import teamTopology from "../../../example/models/sample.tt?raw";
import tea from "../../../example/models/tea.owm?raw";

export interface ExampleRepository {
  /** the text of `example.board` */
  readonly board: string;
  /** every other file of the folder, by its path from the folder, as its text */
  readonly files: Readonly<Record<string, string>>;
}

export const EXAMPLE: ExampleRepository = {
  board,
  files: {
    "assets/miragon-komet-blau.svg": logo,
    "models/bookshop.c4": bookshop,
    "models/miragon.bmc": miragon,
    "models/order-checkout.storm": orderCheckout,
    "models/porter.vc.json": porter,
    "models/sample.cm": contextMap,
    "models/sample.tt": teamTopology,
    "models/tea.owm": tea,
  },
};
