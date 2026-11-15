declare module "*.css";

// board-suite-editors/base is read as source, and it loads diagram-js's sheet under a query that
// keeps the build from emptying it there.
declare module "*.css?base";
