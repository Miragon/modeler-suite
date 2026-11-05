/**
 * The CSP Orca's isolated editor frame serves with every HTML document (plugin-isolated-frames.md,
 * Orca 1.4.248). The session itself denies the network, which the policy alone does not.
 */
export const ORCA_FRAME_POLICY =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self' data: blob:; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
