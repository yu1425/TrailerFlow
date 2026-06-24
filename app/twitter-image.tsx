// Twitter card reuses the same provisional image renderer as Open Graph.
// Config values are declared as literals here (rather than re-exported) so
// Next.js can statically analyze them.
export const runtime = "nodejs";
export const alt = "TrailerFlow — 映画館の予告編タイムを、ずっと。";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export { default } from "./opengraph-image";
