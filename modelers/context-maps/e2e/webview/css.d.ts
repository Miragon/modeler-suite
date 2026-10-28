declare module "*.css";

declare module "*.woff2?dataurl" {
  const dataUrl: string;
  export default dataUrl;
}
