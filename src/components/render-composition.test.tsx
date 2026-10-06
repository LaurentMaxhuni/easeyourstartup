import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DEMO_COMPOSITION } from "@/lib/demo-data";
import { RenderComposition } from "./render-composition";

it("exports fallback designs without a free-preview watermark", () => {
  const composition = { ...DEMO_COMPOSITION, elements: undefined, designSource: undefined };
  const markup = renderToStaticMarkup(createElement(RenderComposition, { composition }));
  expect(markup).toContain(composition.text.headline);
  expect(markup).not.toContain("Free preview");
});
