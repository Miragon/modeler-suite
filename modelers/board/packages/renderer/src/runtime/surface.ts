/** what the overlay surface gets from the model node's frame */
export interface SurfaceProps {
  nodeId: string;
  file: string;
  armed: boolean;
  /** inner size of the node body in flow units (CSS px at board zoom 1) */
  width: number;
  height: number;
}

/** what a surface registers with the runtime */
export interface SurfaceApi {
  ready: Promise<void>;
  probe?: unknown;
  engine?: unknown;
  frameName?: string | undefined;
  /** resolves once the armed surface takes input */
  whenInteractive(): Promise<void>;
}
