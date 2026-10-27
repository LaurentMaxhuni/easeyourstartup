import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { emptyDesignDocument, type DesignDocument } from "@/lib/design-studio/document";

// Real browser and real React editor; HTTP is the external persistence/AI boundary.
// Auth and workspace scoping are exercised separately by the API tests.
const DESIGN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe.skipIf(process.env.RUN_DESIGN_BROWSER_TESTS !== "true")("design workspace in Chromium", () => {
  let server: Server;
  let browser: Browser;
  let page: Page;
  let origin: string;
  let saved: DesignDocument | null = null;
  // The campaign's design as the persistence boundary stores it.
  let stored = { document: emptyDesignDocument(), revision: 1 };
  let generateRequest: Record<string, unknown> = {};
  let jobDocument: DesignDocument;
  let feedback: unknown[] = [];
  let warnings: string[] = [];
  let fixtureVariants: { id: string; name: string; document: DesignDocument; feedback: unknown[]; visionAvailable: boolean }[] | null = null;
  let responseStatus = "completed";
  let jobSequence = 0;
  let activeJobId = "";
  const failures: string[] = [];
  const directory = path.resolve("output/design-studio/workspace-test");
  beforeAll(async () => {
    await mkdir(directory, { recursive: true });
    const source = path.resolve("src/components/design-studio/design-studio.tsx").replaceAll("\\", "/");
    await writeFile(path.join(directory, "main.tsx"), `import React from 'react';import{createRoot}from'react-dom/client';import{DesignStudio}from ${JSON.stringify(source)};createRoot(document.getElementById('root')!).render(<DesignStudio storageKey="design-browser-test" campaign={{designId:${JSON.stringify(DESIGN_ID)},projectName:"Test product",briefPrompt:"",onSaved:()=>{},onBack:()=>{}}}/>);`);
    await writeFile(path.join(directory, "link.tsx"), "import React from 'react';export default function Link(props:React.AnchorHTMLAttributes<HTMLAnchorElement>){return <a {...props}/>}");
    const require = createRequire(import.meta.url);
    const vitestRequire = createRequire(require.resolve("vitest/package.json"));
    const vite = await import(vitestRequire.resolve("vite"));
    await vite.build({ configFile: false, root: process.cwd(), logLevel: "error", define: { "process.env.NODE_ENV": '"development"' },
      resolve: { alias: { "@": path.resolve("src"), "next/link": path.join(directory, "link.tsx") } },
      build: { outDir: path.join(directory, "dist"), emptyOutDir: false, cssCodeSplit: false,
        rolldownOptions: { input: path.join(directory, "main.tsx"), output: { entryFileNames: "main.js", assetFileNames: "[name][extname]" } } },
    });
    server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url || "/", "http://localhost");
        const json = (value: unknown) => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(value)); };
        const record = () => ({ id: DESIGN_ID, revision: stored.revision, title: stored.document.title, document: stored.document, updatedAt: new Date().toISOString() });
        if (url.pathname === "/api/design-studio" && request.method === "GET" && url.searchParams.get("designId") === DESIGN_ID) {
          return json({ design: record(), versions: [] });
        }
        if (url.pathname === "/api/design-studio" && request.method === "GET") {
          return json({ designs: [], brands: [], providers: [{ id: "groq", configured: true, status: "ready", models: [{ id: "test-coding-model", tasks: ["composition"], vision: false, streaming: true, structuredOutput: true }] }], usage: [], providerSettings: { enabled: true } });
        }
        if (url.pathname === "/api/design-studio" && request.method === "POST") {
          let body = ""; for await (const chunk of request) body += chunk;
          const data = JSON.parse(body);
          if (data.action === "save") {
            if (data.id !== DESIGN_ID || data.revision !== stored.revision) { response.statusCode = 409; return json({ error: "conflict" }); }
            saved = data.document;
            stored = { document: data.document, revision: stored.revision + 1 };
            return json({ design: record() });
          }
          if (data.action === "generate" || data.action === "edit") {
            activeJobId = `bbbbbbbb-bbbb-4bbb-8bbb-${String(++jobSequence).padStart(12, "0")}`;
            generateRequest = data;
            jobDocument = data.action === "edit" ? structuredClone(data.document) : emptyDesignDocument();
            jobDocument.pages[0].nodes[0].text = data.action === "edit" ? jobDocument.pages[0].nodes[0].text : "Groq.\nNow in your corner.";
            if (data.action === "edit") jobDocument.pages[0].nodes[0].y -= 20;
            return json({ job: { id: activeJobId, status: "queued", stage: "Interpreting brief" } });
          }
        }
        if (url.pathname.startsWith("/api/design-studio/jobs/")) return json({ job: { id: activeJobId, status: responseStatus, stage: responseStatus === "running" ? "Evaluating design" : "Ready to edit/export", result: { variants: fixtureVariants ?? [{ id: "editorial", name: "Editorial", document: jobDocument, feedback, visionAvailable: false }], usage: [], warnings } } });
        if (url.pathname === "/main.js" || url.pathname === "/style.css") { response.setHeader("Content-Type", url.pathname.endsWith(".js") ? "text/javascript" : "text/css"); response.end(await readFile(path.join(directory, "dist", url.pathname.slice(1)))); return; }
        if (url.pathname === "/font.woff2") { response.setHeader("Content-Type", "font/woff2"); response.end(await readFile("src/app/fonts/outfit-latin.woff2")); return; }
        response.setHeader("Content-Type", "text/html"); response.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>@font-face{font-family:Outfit;src:url(/font.woff2);font-weight:100 900}html,body{margin:0}body{--font-outfit:Outfit}button,a{color:inherit}</style></head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>');
      } catch { response.statusCode = 500; response.end("Test boundary failed"); }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Test server unavailable");
    origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ executablePath: process.env.DESIGN_CHROMIUM_EXECUTABLE_PATH, headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(7000);
    page.on("pageerror", (error) => { failures.push(error.message); });
  }, 60000);
  afterAll(async () => { await browser?.close(); if (server) await new Promise<void>((resolve) => server.close(() => resolve())); });
  afterEach(async () => {
    if (!page?.isClosed()) {
      await page.screenshot({ path: path.join(directory, "latest.png") });
      await writeFile(path.join(directory, "diagnostics.json"), JSON.stringify({ failures, text: await page.locator("body").innerText() }, null, 2));
    }
  });
  it("persists manual text, supports undo/redo, provider choice and incremental AI editing", async () => {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Saved", exact: true }).waitFor({ state: "visible" });
    await page.locator('[data-node-id="headline"]').click();
    await page.getByLabel("Text", { exact: true }).fill("A launch worth sharing.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForFunction(() => document.body.textContent?.includes("Saved revision 2."));
    expect(saved!.pages[0].nodes[0].text).toBe("A launch worth sharing.");
    await page.getByRole("button", { name: "Undo (Ctrl Z)", exact: true }).click();
    expect(await page.locator('[data-node-id="headline"]').innerText()).toBe("Your next\nbig idea.");
    await page.getByRole("button", { name: "Redo (Ctrl Shift Z)", exact: true }).click();
    expect(await page.locator('[data-node-id="headline"]').innerText()).toBe("A launch worth sharing.");
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-node-id="headline"]')?.textContent === "A launch worth sharing.");
    await page.getByRole("button", { name: /Models & generation settings/ }).click();
    await page.getByLabel("Preferred provider", { exact: true }).selectOption("groq");
    await page.getByLabel("What are we making?", { exact: true }).fill("Create a premium Groq announcement poster.");
    await page.getByRole("button", { name: "Create design", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-node-id="headline"]')?.textContent?.includes("Now in your corner."));
    expect(generateRequest.preferredProvider).toBe("groq");
    const before = await page.locator('[data-node-id="headline"]').getAttribute("style");
    await page.getByRole("tab", { name: "Refine", exact: true }).click();
    await page.getByLabel("Refine this design", { exact: true }).fill("Move the headline higher.");
    await page.getByRole("button", { name: "Apply refinement", exact: true }).click();
    await page.waitForFunction(() => (document.querySelector('[data-node-id="headline"]') as HTMLElement)?.style.top === "100px");
    expect(await page.locator('[data-node-id="headline"]').innerText()).toBe("Groq.\nNow in your corner.");
    expect(await page.locator('[data-node-id="headline"]').getAttribute("style")).not.toBe(before);
    await page.screenshot({ path: path.join(directory, "desktop.png"), fullPage: true });
    expect(failures).toEqual([]);
  }, 30000);
  it("keeps the canvas and properties usable at phone width without horizontal page overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Canvas", exact: true }).click();
    await page.getByRole("button", { name: "Fit canvas", exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: path.join(directory, "mobile.png"), fullPage: true });
    await page.getByRole("button", { name: "Layers & properties", exact: true }).click();
    await page.getByRole("button", { name: "properties", exact: true }).click();
    expect(await page.getByLabel("Slide name", { exact: true }).isVisible()).toBe(true);
  }, 15000);
  it("shows the latest real review, severity, suggestions, warnings and stale feedback after manual edits", async () => {
    feedback = [
      { round: 0, deterministic: [], vision: { score: 96, issues: [] }, visionStatus: "available" },
      { round: 1, deterministic: [{ pageId: "page-1", nodeId: "headline", code: "text_overflow", severity: "error", message: "The headline exceeds its text box." }], vision: { score: 61, issues: [{ pageId: "page-1", nodeId: "headline", severity: "warning", category: "hierarchy", message: "The headline competes with supporting copy.", suggestion: "Reduce the supporting copy size." }] }, visionStatus: "available", warning: "The revision limit was reached." },
    ];
    warnings = ["Reference analysis was skipped."];
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.getByLabel("What are we making?", { exact: true }).fill("Create a reviewed launch poster.");
    await page.getByRole("button", { name: "Create design", exact: true }).click();
    await page.getByRole("button", { name: "View review", exact: true }).click();
    await page.getByText("MODEL VISUAL SCORE", { exact: true }).waitFor();
    expect(await page.getByText("61", { exact: false }).count()).toBeGreaterThan(0);
    expect(await page.getByText("96", { exact: true }).count()).toBe(0);
    expect(await page.getByText("Pass 2", { exact: true }).isVisible()).toBe(true);
    expect(await page.getByText("error", { exact: true }).isVisible()).toBe(true);
    expect(await page.getByText("The headline exceeds its text box.", { exact: true }).isVisible()).toBe(true);
    expect(await page.getByText("Reduce the supporting copy size.", { exact: false }).isVisible()).toBe(true);
    expect(await page.getByText("The revision limit was reached.", { exact: true }).isVisible()).toBe(true);
    expect(await page.getByText("Reference analysis was skipped.", { exact: true }).isVisible()).toBe(true);
    await page.screenshot({ path: path.join(directory, "review.png"), fullPage: true });
    await page.getByRole("button", { name: "Poster · Headline", exact: true }).first().click();
    await page.getByLabel("Text", { exact: true }).fill("Manually corrected headline.");
    await page.getByRole("button", { name: "review", exact: true }).click();
    expect(await page.getByText(/These findings describe the last rendered direction/).isVisible()).toBe(true);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    expect(await page.getByRole("button", { name: "See findings and suggestions", exact: true }).isVisible()).toBe(true);
  }, 20000);
  it.each(["unavailable", "failed"])("reports %s vision without inventing a visual score", async (visionStatus) => {
    feedback = [{ round: 0, deterministic: [], vision: null, visionStatus }]; warnings = [];
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.getByLabel("What are we making?", { exact: true }).fill("Create a poster with layout checks.");
    await page.getByRole("button", { name: "Create design", exact: true }).click();
    await page.waitForFunction(() => document.body.textContent?.includes("1 creative direction(s) rendered"));
    await page.getByRole("button", { name: "review", exact: true }).click();
    expect(await page.getByText(visionStatus === "failed" ? "Visual review failed" : "Visual review unavailable", { exact: true }).isVisible()).toBe(true);
    expect(await page.getByText("MODEL VISUAL SCORE", { exact: true }).count()).toBe(0);
    expect(await page.getByText("No layout issues were reported in this render.", { exact: true }).isVisible()).toBe(true);
  }, 20000);
  it("keeps the explicitly selected direction and manual edits while later review passes arrive", async () => {
    const first = emptyDesignDocument(); first.pages[0].nodes[0].text = "Editorial first render.";
    const second = emptyDesignDocument(); second.pages[0].nodes[0].text = "Experimental composition.";
    const secondFeedback = [{ round: 0, deterministic: [], vision: { score: 89, issues: [] }, visionStatus: "available" }];
    fixtureVariants = [{ id: "editorial", name: "Editorial", document: first, feedback: [], visionAvailable: false }, { id: "experimental", name: "Experimental", document: second, feedback: secondFeedback, visionAvailable: true }];
    responseStatus = "running";
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.getByLabel("What are we making?", { exact: true }).fill("Explore two distinct directions.");
    await page.getByRole("button", { name: "Create design", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-node-id="headline"]')?.textContent === "Editorial first render.");
    await page.getByRole("button", { name: /02 Experimental/ }).click();
    await page.getByRole("button", { name: "review", exact: true }).click();
    expect(await page.getByLabel("Review direction", { exact: true }).inputValue()).toBe("experimental");
    expect(await page.getByText("89", { exact: false }).count()).toBeGreaterThan(0);
    await page.getByRole("button", { name: "properties", exact: true }).click();
    await page.locator('[data-node-id="headline"]').click();
    await page.getByLabel("Text", { exact: true }).fill("My chosen composition, refined by hand.");
    const revisedFirst = structuredClone(first); revisedFirst.pages[0].nodes[0].text = "Later automatic revision.";
    fixtureVariants[0] = { ...fixtureVariants[0], document: revisedFirst };
    responseStatus = "completed";
    await page.waitForFunction(() => document.body.textContent?.includes("2 creative direction(s) rendered"));
    expect(await page.locator('[data-node-id="headline"]').innerText()).toBe("My chosen composition, refined by hand.");
    await page.getByRole("button", { name: "review", exact: true }).click();
    expect(await page.getByLabel("Review direction", { exact: true }).inputValue()).toBe("experimental");
    expect(await page.getByText(/These findings describe the last rendered direction/).isVisible()).toBe(true);
    expect(failures).toEqual([]);
    fixtureVariants = null;
  }, 20000);
});
