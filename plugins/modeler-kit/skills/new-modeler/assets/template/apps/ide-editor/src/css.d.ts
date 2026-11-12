declare module '*.css';

// The esbuild config inlines a `?dataurl` import as a data: URL string.
declare module '*.woff2?dataurl' {
  const dataUrl: string;
  export default dataUrl;
}
