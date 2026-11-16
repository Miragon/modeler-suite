// A file's text as a module, as Vite reads `?raw` and as the extension's build does
// (esbuild.config.mjs): the example folder's files are in the host bundle this way.
declare module "*?raw" {
  const text: string;
  export default text;
}
