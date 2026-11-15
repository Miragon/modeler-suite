import "../../src/base.js";
import { contextMapsPadCase } from "./support/sheets.js";

// The order that broke before the base was loaded once: six sheets after Context Maps' own, each
// with a copy of diagram-js's rule for an open pad behind Context Maps' rule of the same weight.
contextMapsPadCase("first");
