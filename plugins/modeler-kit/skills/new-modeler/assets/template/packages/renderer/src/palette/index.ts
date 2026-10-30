import type { ModuleDeclaration } from 'didi';
import CreateModule from 'diagram-js/lib/features/create';
import HandToolModule from 'diagram-js/lib/features/hand-tool';
import LassoToolModule from 'diagram-js/lib/features/lasso-tool';
import PaletteModule from 'diagram-js/lib/features/palette';
import { hoverTooltipTeardownModule } from './HoverTooltipTeardown.js';
import PaletteProvider from './PaletteProvider.js';

export const paletteModule: ModuleDeclaration = {
  __depends__: [
    PaletteModule,
    hoverTooltipTeardownModule,
    CreateModule,
    HandToolModule,
    LassoToolModule,
  ],
  __init__: ['paletteProvider'],
  paletteProvider: ['type', PaletteProvider],
};

export type { PaletteConfig } from './PaletteProvider.js';
