import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { studioStateSchema, type StudioState } from "@/lib/contracts";
import { DEMO_ANGLES, DEMO_BRAND, DEMO_COMPOSITION, DEMO_SCAN } from "@/lib/demo-data";
import type { DesignDocument } from "@/lib/design-studio/document";

const PROJECT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AI_JOB_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const brand = { ...DEMO_BRAND, claims: DEMO_BRAND.claims.map((claim) => ({ ...claim, approvalState: "approved" as const })) };
function initialState() {
  return studioStateSchema.parse({
    step: "campaign", projectId: PROJECT_ID, scan: { ...DEMO_SCAN, profile: brand }, brand,
    draft: { kind: "feature_update", goal: "Announce the new export workflow", updateDetails: "Export your project in one click. Available in your workspace today.", audience: "Product teams", launchDate: "", cta: "Try the update", angle: DEMO_ANGLES[0], channels: ["linkedin"] },
    generation: null, selectedCreativeId: "", outputs: [], composition: DEMO_COMPOSITION,
  });
}

// Real React studio and editor; only HTTP persistence, capture, and AI are fixtures.
describe.skipIf(process.env.RUN_DESIGN_BROWSER_TESTS !== "true")("instant campaign previews in Chromium", () => {
  let browser: Browser;
  let page: Page;
  let server: Server;
  let origin: string;
  let state: StudioState;
  let revision = 1;
  let sequence = 0;
  let saveAttempts = 0;
  let failSave = 0;
  let releaseSaves: (() => void) | undefined;
  let saveGate: Promise<void> | undefined;
  let aiStatus = "running";
  let generationRequests: Record<string, unknown>[] = [];
  let campaignRequest: { campaign?: { updateDetails: string } } | undefined;
  let captureRequests = 0;
  const snapshots: StudioState[] = [];
  const rows = new Map<string, { state: StudioState; revision: number }>();
  let snapshotGate: Promise<void> | undefined;
  let releaseSnapshot: (() => void) | undefined;
  let snapshotHeld = false;
  const designs = new Map<string, { id: string; revision: number; document: DesignDocument; title: string }>();
  const errors: string[] = [];
  const directory = path.resolve("output/instant-campaign-previews/studio");

  beforeAll(async () => {
    await mkdir(directory, { recursive: true });
    const source = path.resolve("src/components/studio/studio-shell.tsx").replaceAll("\\", "/");
    const css = path.resolve("src/app/globals.css").replaceAll("\\", "/");
    await writeFile(path.join(directory, "main.tsx"), `import React from 'react';import{createRoot}from'react-dom/client';import{StudioShell}from ${JSON.stringify(source)};import ${JSON.stringify(css)};createRoot(document.getElementById('root')!).render(<StudioShell initialAuthenticated profile={{name:'Test founder',email:'founder@example.test',image:null}}/>);`);
    await writeFile(path.join(directory, "link.tsx"), "import React from 'react';export default function Link({prefetch,...props}:any){return <a {...props}/>} ");
    await writeFile(path.join(directory, "navigation.ts"), `import{useSyncExternalStore}from'react';let previous='',params=new URLSearchParams();const subscribe=(callback:()=>void)=>{addEventListener('popstate',callback);return()=>removeEventListener('popstate',callback)};const router={push:(url:string)=>{history.pushState(null,'',url);dispatchEvent(new PopStateEvent('popstate'))},replace:(url:string)=>{history.replaceState(null,'',url);dispatchEvent(new PopStateEvent('popstate'))},refresh:()=>{}};export const useRouter=()=>router;export const useSearchParams=()=>{const search=useSyncExternalStore(subscribe,()=>location.search);if(search!==previous){previous=search;params=new URLSearchParams(search)}return params};export const usePathname=()=>'/studio';`);
    const require = createRequire(import.meta.url);
    const vite = await import(createRequire(require.resolve("vitest/package.json")).resolve("vite"));
    await vite.build({ configFile: false, root: process.cwd(), logLevel: "error", define: { "process.env.NODE_ENV": '"development"' },
      resolve: { alias: { "@": path.resolve("src"), "next/link": path.join(directory, "link.tsx"), "next/navigation": path.join(directory, "navigation.ts") } },
      build: { outDir: path.join(directory, "dist"), emptyOutDir: false, cssCodeSplit: false,
        rolldownOptions: { input: path.join(directory, "main.tsx"), output: { entryFileNames: "main.js", assetFileNames: "[name][extname]" } } },
    });
    server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url || "/", "http://localhost");
        const json = (value: unknown, status = 200) => { response.statusCode = status; response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(value)); };
        const body = async () => { let text = ""; for await (const chunk of request) text += chunk; return JSON.parse(text); };
        if (url.pathname === "/api/studio/state") {
          if (request.method === "GET") {
            const row = rows.get(url.searchParams.get("projectId") || PROJECT_ID)!;
            state = row.state;
            return json({ state: row.state, revision: row.revision, storageKey: "preview-browser-test", persistence: "database" });
          }
          const data = await body();
          const incoming = studioStateSchema.parse(data.state);
          const row = rows.get(incoming.projectId!)!;
          if (data.expectedRevision !== row.revision) return json({ error: "This project changed in another tab" }, 409);
          if (snapshotGate && incoming.projectId === PROJECT_ID && incoming.concepts.length === 3) { snapshotHeld = true; await snapshotGate; }
          row.state = incoming; row.revision++;
          if (state.projectId === incoming.projectId) state = incoming;
          snapshots.push(incoming);
          return json({ revision: row.revision });
        }
        if (url.pathname === "/api/entitlements") return json({ plan: "pro", canExportLaunchKit: true });
        if (url.pathname === "/api/studio/suggest") return json({ channels: ["linkedin"], updateDetails: state.draft.updateDetails });
        if (url.pathname.startsWith("/api/capture")) { captureRequests++; return json({ error: "No capture in fixture" }, 503); }
        if (url.pathname.startsWith("/api/design-studio/jobs/")) {
          const first = [...designs.values()][0];
          const document = first ? structuredClone(first.document) : undefined;
          if (document) document.pages[0].nodes.find((node) => node.role === "headline")!.text = "A custom AI direction";
          return json({ job: { id: AI_JOB_ID, status: aiStatus, stage: "Creating custom designs", error: aiStatus === "failed" ? "AI provider unavailable" : undefined,
            result: aiStatus === "completed" ? { variants: [{ id: "custom", name: "Custom AI design", message: "An optional custom direction", document }], warnings: [], usage: [] } : undefined } });
        }
        if (url.pathname === "/api/design-studio") {
          if (request.method === "GET") {
            const id = url.searchParams.get("designId");
            return id ? json({ design: designs.get(id), versions: [] }) : json({ designs: [], brands: [], providers: [], usage: [] });
          }
          const data = await body();
          if (data.action === "generate") { generationRequests.push(data); return json({ job: { id: AI_JOB_ID, status: "queued" } }); }
          if (data.action === "cancel") { aiStatus = "cancelled"; return json({}); }
          if (data.action === "save") {
            const attempt = ++saveAttempts;
            if (saveGate && !data.id) await saveGate;
            if (attempt === failSave) return json({ error: "Template save temporarily unavailable" }, 503);
            const existing = data.id ? designs.get(data.id) : undefined;
            if (existing && existing.revision !== data.revision) return json({ error: "Revision conflict" }, 409);
            const id = data.id || `cccccccc-cccc-4ccc-8ccc-${String(++sequence).padStart(12, "0")}`;
            const record = { id, revision: (existing?.revision ?? 0) + 1, document: data.document, title: data.document.title };
            designs.set(id, record);
            return json({ design: record });
          }
        }
        if (url.pathname === "/api/jobs/generate") { campaignRequest = await body(); return json({ error: "Campaign boundary reached" }, 400); }
        if (url.pathname === "/main.js" || url.pathname === "/style.css") {
          response.setHeader("Content-Type", url.pathname.endsWith(".js") ? "text/javascript" : "text/css");
          response.end(await readFile(path.join(directory, "dist", url.pathname.slice(1)))); return;
        }
        if (url.pathname === "/font.woff2") { response.setHeader("Content-Type", "font/woff2"); response.end(await readFile("src/app/fonts/outfit-latin.woff2")); return; }
        if (url.pathname.startsWith("/design-fonts/")) { response.setHeader("Content-Type", "font/woff2"); response.end(await readFile(path.join("public", url.pathname))); return; }
        if (url.pathname.startsWith("/api/")) return json({ error: "Unconfigured fixture boundary" }, 404);
        response.setHeader("Content-Type", "text/html");
        response.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>@font-face{font-family:Outfit;src:url(/font.woff2);font-weight:100 900}body{--font-outfit:Outfit}</style></head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>');
      } catch (error) { errors.push(String(error)); response.statusCode = 500; response.end("Fixture failed"); }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Fixture server unavailable");
    origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ executablePath: process.env.DESIGN_CHROMIUM_EXECUTABLE_PATH, headless: true });
  }, 60_000);

  beforeEach(async () => {
    releaseSaves?.();
    releaseSnapshot?.();
    await page?.close();
    state = initialState(); revision = 1; sequence = 0; saveAttempts = 0; failSave = 0;
    saveGate = undefined; releaseSaves = undefined; generationRequests = []; campaignRequest = undefined; captureRequests = 0; aiStatus = "running";
    designs.clear(); errors.length = 0; snapshots.length = 0; rows.clear();
    rows.set(PROJECT_ID, { state, revision });
    snapshotGate = undefined; releaseSnapshot = undefined; snapshotHeld = false;
    page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.setDefaultTimeout(10_000);
    page.on("pageerror", (error) => errors.push(error.message));
  });
  afterAll(async () => { releaseSaves?.(); releaseSnapshot?.(); await browser?.close(); if (server) await new Promise<void>((resolve) => server.close(() => resolve())); });
  afterEach(async () => {
    if (!page?.isClosed()) {
      await writeFile(path.join(directory, "diagnostics.json"), JSON.stringify({ errors, text: await page.locator("body").innerText() }, null, 2));
      await page.screenshot({ path: path.join(directory, "latest.png"), fullPage: true });
    }
  });

  async function openTemplates() {
    await page.goto(`${origin}/studio?projectId=${PROJECT_ID}`);
    await page.getByRole("button", { name: "Choose a post concept", exact: true }).click();
    await page.getByRole("heading", { name: "Choose a post concept", exact: true }).waitFor();
  }
  async function waitForSavedTemplates() {
    await page.waitForFunction(() => document.querySelectorAll('input[name="campaign-concept"]:enabled').length === 3);
  }

  it("shows three previews before saves finish and makes no AI or capture request on the default path", async () => {
    saveGate = new Promise<void>((resolve) => { releaseSaves = resolve; });
    await openTemplates();
    await page.getByRole("img", { name: /Preview of/ }).first().waitFor();
    expect(await page.getByRole("img", { name: /Preview of/ }).count()).toBe(3);
    expect(await page.getByRole("radio").first().isDisabled()).toBe(true);
    expect(generationRequests).toHaveLength(0);
    expect(captureRequests).toBe(0);
    releaseSaves!(); saveGate = undefined;
    await waitForSavedTemplates();
    expect(state.concepts).toHaveLength(3);
    expect(state.selectedConceptId).toBe(state.concepts[0].id);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.screenshot({ path: path.join(directory, `ready-${width}.png`), fullPage: true });
      const overflowing = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((element) => {
        const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.right > innerWidth + 1;
      }).slice(0, 12).map((element) => ({ tag: element.tagName, classes: element.className, width: element.getBoundingClientRect().width })));
      await writeFile(path.join(directory, `overflow-${width}.json`), JSON.stringify(overflowing, null, 2));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole("radio").first().focus();
    await page.keyboard.press("ArrowRight");
    expect(await page.getByRole("radio").nth(1).isChecked()).toBe(true);
    expect(errors).toEqual([]);
  }, 30_000);

  it("reuses successful template saves after one fails and restores the selected design on reload", async () => {
    failSave = 2;
    await openTemplates();
    await page.getByRole("alert").filter({ hasText: "Template save temporarily unavailable" }).waitFor();
    expect(designs.size).toBe(2);
    expect(await page.getByRole("img", { name: /Preview of/ }).count()).toBe(3);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await waitForSavedTemplates();
    expect(saveAttempts).toBe(4);
    expect(designs.size).toBe(3);
    await page.getByRole("radio").nth(2).check();
    const selected = await page.getByRole("radio").nth(2).getAttribute("value");
    await page.getByRole("button", { name: /Edit concept:/ }).nth(2).click();
    await page.getByRole("button", { name: "Back to my posts", exact: true }).waitFor();
    await page.getByRole("button", { name: "Back to my posts", exact: true }).click();
    await expect.poll(() => state.selectedConceptId).toBe(selected);
    await page.reload();
    await waitForSavedTemplates();
    expect(await page.locator(`input[value="${selected}"]`).isChecked()).toBe(true);
    expect(generationRequests).toHaveLength(0);
    expect(errors).toEqual([]);
  }, 30_000);

  it("keeps a template editable during AI generation and preserves its selection and edited text when custom results arrive", async () => {
    await openTemplates(); await waitForSavedTemplates();
    await page.getByRole("button", { name: "Create with AI", exact: true }).click();
    await page.getByText("Creating custom AI concepts.", { exact: false }).waitFor();
    await expect.poll(() => generationRequests.length).toBe(1);
    await page.getByRole("radio").nth(2).check();
    const selectedId = await page.getByRole("radio").nth(2).getAttribute("value");
    const selected = state.concepts.find((concept) => concept.id === selectedId)!;
    await page.getByRole("button", { name: /Edit concept:/ }).nth(2).click();
    await page.locator('[data-node-id="headline"]').click();
    await page.getByLabel("Text", { exact: true }).fill("A founder-edited template headline");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForFunction(() => document.body.textContent?.includes("Saved revision 2."));
    await page.getByRole("button", { name: "Back to my posts", exact: true }).click();
    aiStatus = "completed";
    await page.getByRole("heading", { name: "Custom AI design", exact: true }).waitFor();
    expect(await page.locator(`input[value="${selectedId}"]`).isChecked()).toBe(true);
    await expect.poll(() => state.previousConcepts.find((concept) => concept.id === selectedId)?.designRevision).toBe(2);
    await page.getByRole("button", { name: "Generate posts", exact: true }).click();
    await page.getByText("Campaign boundary reached").waitFor();
    expect(state.design).toEqual({ id: selected.designId, revision: 2 });
    expect(campaignRequest?.campaign?.updateDetails).toContain("A founder-edited template headline");
    expect(errors).toEqual([]);
  }, 30_000);

  it("preserves distinct saved designs when a founder changes a brief and later returns to its original wording", async () => {
    await openTemplates(); await waitForSavedTemplates();
    const original = state.draft.updateDetails;
    for (const message of ["Share a new workspace with your team. The new board is ready.", original]) {
      await page.getByRole("button", { name: "Back to announcement", exact: true }).click();
      await page.getByLabel("What should people know?", { exact: true }).fill(message);
      await page.getByRole("button", { name: "Choose a post concept", exact: true }).click();
      await expect.poll(() => state.concepts[0]?.message).toBe(message);
    }
    const all = [...state.concepts, ...state.previousConcepts];
    expect(all).toHaveLength(9);
    expect(new Set(all.map((concept) => concept.id)).size).toBe(9);
    expect(new Set(all.map((concept) => concept.designId)).size).toBe(9);
  }, 30_000);

  it("keeps ready templates usable after optional AI generation fails", async () => {
    await openTemplates(); await waitForSavedTemplates();
    aiStatus = "failed";
    await page.getByRole("button", { name: "Create with AI", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "AI provider unavailable" }).waitFor();
    expect(await page.getByRole("button", { name: "Generate posts", exact: true }).isEnabled()).toBe(true);
    expect(await page.getByRole("radio").first().isEnabled()).toBe(true);
    expect(await page.getByRole("button", { name: /Edit concept:/ }).first().isEnabled()).toBe(true);
    expect(errors).toEqual([]);
  }, 30_000);

  it("does not save an old brief over edits made while its template saves were pending", async () => {
    saveGate = new Promise<void>((resolve) => { releaseSaves = resolve; });
    await openTemplates();
    await page.getByRole("button", { name: "Back to announcement", exact: true }).click();
    const message = "Share a new workspace with your team. The new board is ready.";
    await page.getByLabel("What should people know?", { exact: true }).fill(message);
    await expect.poll(() => state.draft.updateDetails).toBe(message);
    const beforeRelease = snapshots.length;
    const lastSave = page.waitForResponse((response) => response.url().endsWith("/api/design-studio") && response.request().postDataJSON()?.action === "save");
    releaseSaves!(); saveGate = undefined;
    await lastSave;
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(snapshots.slice(beforeRelease).every((snapshot) => snapshot.draft.updateDetails === message && snapshot.step === "campaign")).toBe(true);
  }, 30_000);

  it("archives the latest edited message and revision when an older concept is edited during a template refresh", async () => {
    await openTemplates(); await waitForSavedTemplates();
    const original = state.concepts[0];
    saveGate = new Promise<void>((resolve) => { releaseSaves = resolve; });
    await page.getByRole("button", { name: "Back to announcement", exact: true }).click();
    await page.getByLabel("What should people know?", { exact: true }).fill("Share the new workspace with your team. The new board is ready.");
    await page.getByRole("button", { name: "Choose a post concept", exact: true }).click();
    await page.getByRole("heading", { name: "Choose a post concept", exact: true }).waitFor();
    await page.locator('button[aria-label^="Edit concept:"]:enabled').first().click();
    await page.locator('[data-node-id="headline"]').click();
    await page.getByLabel("Text", { exact: true }).fill("Edited while the new previews were saving");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForFunction(() => document.body.textContent?.includes("Saved revision 2."));
    await page.getByRole("button", { name: "Back to my posts", exact: true }).click();
    await expect.poll(() => state.concepts.find((concept) => concept.id === original.id)?.message).toContain("Edited while the new previews were saving");
    releaseSaves!(); saveGate = undefined;
    await expect.poll(() => state.previousConcepts.find((concept) => concept.id === original.id)?.message).toContain("Edited while the new previews were saving");
    expect(state.previousConcepts.find((concept) => concept.id === original.id)?.designRevision).toBe(2);
  }, 30_000);

  it("does not let a late template snapshot response change the revision used to save another project", async () => {
    const secondId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const second = studioStateSchema.parse({ ...initialState(), projectId: secondId, brand: { ...brand, projectName: "Second project" } });
    rows.set(secondId, { state: second, revision: 41 });
    snapshotGate = new Promise<void>((resolve) => { releaseSnapshot = resolve; });
    await openTemplates();
    await expect.poll(() => snapshotHeld).toBe(true);
    await page.evaluate((id) => { history.pushState(null, "", `/studio?projectId=${id}`); dispatchEvent(new PopStateEvent("popstate")); }, secondId);
    await page.getByText("Second project", { exact: true }).first().waitFor();
    const oldResponse = page.waitForResponse((response) => response.url().includes("/api/studio/state") && response.request().method() === "PUT" && response.request().postDataJSON()?.state.projectId === PROJECT_ID);
    releaseSnapshot!(); snapshotGate = undefined;
    await oldResponse;
    const newResponse = page.waitForResponse((response) => response.url().includes("/api/studio/state") && response.request().method() === "PUT" && response.request().postDataJSON()?.state.projectId === secondId);
    await page.getByLabel("What should people know?", { exact: true }).fill("The second project has an updated announcement.");
    expect((await newResponse).status()).toBe(200);
    expect(rows.get(secondId)!.state.draft.updateDetails).toBe("The second project has an updated announcement.");
    expect(rows.get(secondId)!.state.concepts).toHaveLength(0);
    expect(errors).toEqual([]);
  }, 30_000);

  it("preserves a selection made while the refreshed template snapshot is still saving", async () => {
    await openTemplates(); await waitForSavedTemplates();
    snapshotGate = new Promise<void>((resolve) => { releaseSnapshot = resolve; });
    await page.getByRole("button", { name: "Back to announcement", exact: true }).click();
    await page.getByLabel("What should people know?", { exact: true }).fill("Share the new workspace with your team. The new board is ready.");
    await page.getByRole("button", { name: "Choose a post concept", exact: true }).click();
    await expect.poll(() => snapshotHeld).toBe(true);
    const radio = page.locator('input[name="campaign-concept"]:enabled').nth(1);
    const selected = await radio.getAttribute("value");
    await radio.check();
    releaseSnapshot!(); snapshotGate = undefined;
    await page.waitForFunction(() => document.querySelectorAll('input[name="campaign-concept"]:enabled').length === 6);
    expect(await page.locator(`input[value="${selected}"]`).isChecked()).toBe(true);
    await expect.poll(() => state.selectedConceptId).toBe(selected);
    expect(errors).toEqual([]);
  }, 30_000);
});
