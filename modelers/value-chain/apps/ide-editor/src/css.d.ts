declare module "*.css";

// `?dataurl` imports are inlined by the esbuild config as a data: URL string.
declare module "*.woff2?dataurl" {
  const dataUrl: string;
  export default dataUrl;
}
