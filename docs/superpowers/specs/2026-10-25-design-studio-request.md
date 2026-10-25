# Build EaseYourStartup AI Design Studio

You are implementing a production-quality, AI-powered graphic design workflow inside the existing EaseYourStartup application.

Your objective is to create visually outstanding social media posters, advertisements, carousels, promotional graphics, and other brand assets using **HTML, CSS, SVG, and JavaScript**, rendered through a browser.

**Do not use image-generation models.** All designs must be generated as real, editable web-based compositions.

The results should look like professional work from an experienced creative agency, not generic AI-generated templates.

## 1. Inspect and integrate with the existing application

Before implementation:

- Inspect the repository, current framework, component structure, styling, API routes, database, and existing design functionality.
- Reuse existing infrastructure and dependencies whenever practical.
- Preserve existing functionality.
- Follow the project's established architecture and conventions.
- Build the actual working implementation, not a prototype or a collection of mock interfaces.
- Do not unnecessarily redesign unrelated parts of the application.

Use TypeScript, React, and the project's existing frontend/backend architecture where applicable.

## 2. Multi-provider AI infrastructure

Implement a modular LLM provider abstraction supporting:

1. Hetzner Inference
2. Z.AI
3. Google Gemini API
4. Groq
5. Cloudflare Workers AI
6. OpenRouter
7. Optional additional OpenAI-compatible providers

Use official SDKs or standards-compliant API clients where practical.

Each provider must support:

- Configurable endpoint and model ID
- Secure, server-side API credentials
- Configurable generation parameters
- Streaming responses when supported
- Token usage reporting where available
- Rate-limit management
- Request timeouts
- Exponential backoff for transient failures
- Fallback to another configured provider
- Accurate error reporting

Never assume that all providers expose identical capabilities.

Build a model registry recording:

- Text generation support
- Vision/image input support
- Structured output support
- Maximum context/output constraints
- Configurable rate limits
- Availability and operational status

Do not hardcode assumptions about free quotas or model availability. Make them configurable.

**Provider selection strategy:**

- Prefer available free-tier inference where permitted.
- Choose models based on task requirements, not provider priority alone.
- Reserve vision-capable models for screenshot analysis.
- Use faster, cheaper models for simple copy refinement.
- Prefer strong frontend coding models for HTML/CSS composition.
- Provide graceful fallback when limits are reached.

Implement a provider settings interface showing configured providers, available models, and usage information.

Keep all credentials on the server. Never expose API keys through browser code.

## 3. Build a genuine AI design pipeline

Do not simply send a single user prompt to an LLM and display its response.

Create a multi-stage creative production system.

### Stage A: Creative brief interpretation

Accept natural-language requests such as:

"Create a premium Instagram poster announcing that EaseYourStartup now supports Groq."

Extract:

- Design purpose
- Intended audience
- Primary message
- Brand identity
- Desired mood
- Visual inspiration
- Canvas size
- Required information
- Call to action
- Constraints

Use reasonable defaults when information is missing. Do not interrupt the user with unnecessary questions.

Produce a structured internal creative brief.

### Stage B: AI art direction

Before writing HTML or CSS, formulate a distinct visual concept.

Consider:

- Editorial design
- Swiss typography
- Contemporary tech advertising
- Modernist poster composition
- Brutalist and experimental layouts
- Premium SaaS campaigns
- Architectural grids
- Asymmetric composition
- High-impact typographic treatments
- Abstract geometric compositions
- Creative use of SVG and CSS graphics

Choose a direction based on the message and brand rather than randomly applying styles.

Generate a compact art-direction specification containing:

- Composition concept
- Typography choices
- Color relationships
- Grid structure
- Focal point
- Visual hierarchy
- Decorative elements
- Brand integration
- Spacing and alignment rules

**Crucially, do not repeatedly generate the same layout for different prompts.**

Create genuine variety in composition.

### Stage C: Design planning

Translate the creative direction into a concrete composition.

Plan:

- Canvas dimensions
- Content zones
- Grid and alignment coordinates
- Relative typography sizes
- Background treatments
- Shapes and supporting visual elements
- Layering and depth
- Contrast and negative space
- Placement of logos and CTAs

Use explicit design decisions rather than vague instructions like "make it attractive."

Ensure all major elements have a defined purpose.

### Stage D: HTML/CSS/SVG generation

Generate a complete, renderable design.

Allow:

- HTML5
- Modern CSS
- CSS Grid and Flexbox
- Absolute positioning within the fixed canvas
- SVG illustrations and decorative geometry
- CSS transforms, masks, gradients, and blending modes when appropriate
- Google Fonts or approved local fonts
- Icon libraries where licensing and rendering permit

Prefer CSS/SVG-generated visuals over external image dependencies.

Allow user-uploaded assets, logos, or approved photographs when explicitly supplied.

Use a consistent coordinate system for the design canvas.

Keep text, colors, layout properties, and graphical elements as editable as possible.

Avoid generating an entire poster as one raster image.

**Design quality requirements:**

- Intentional visual hierarchy
- Strong typography
- Clean alignment
- High-quality spacing
- Cohesive color theory
- Clear communication
- Balanced negative space
- Professional compositional rhythm
- Proper optical alignment
- No accidental overflow
- No distorted logos
- No meaningless decorative clutter

Avoid default AI design clichés, including unnecessary glow effects, generic floating cards, excessive gradients, random circles, and repetitive rounded rectangles.

Do not force every design into a dashboard-like aesthetic.

## 4. Browser rendering engine

Implement a reliable browser-based rendering system using Playwright and Chromium, or compatible infrastructure already present.

Support initial dimensions:

- Instagram portrait: 1080 × 1350
- Instagram square: 1080 × 1080
- Instagram story: 1080 × 1920
- Landscape: 1920 × 1080
- Custom dimensions

Render the generated document in an isolated environment.

Wait for fonts and required approved assets to load before capture.

Export PNG images at the requested dimensions, with optional 2× resolution or scale when supported.

Prevent untrusted generated code from accessing:

- Server secrets
- Internal endpoints
- Local filesystem resources
- Private network services
- Authenticated application sessions

Apply resource limits, execution timeouts, network restrictions, and isolation appropriate to the hosting environment.

Do not run arbitrary generated JavaScript with unrestricted privileges.

## 5. Automated visual feedback loop

This is a core feature, not an optional enhancement.

After initial generation:

1. Render the generated design.
2. Capture an actual screenshot.
3. Run deterministic layout checks.
4. Pass the screenshot to a compatible vision-capable model when configured.
5. Identify concrete visual deficiencies.
6. Generate targeted HTML/CSS improvements.
7. Render the revised design.
8. Repeat if necessary.

Deterministic checks should cover:

- Text overflow
- Clipping
- Missing assets
- Broken fonts
- Overlapping elements
- Canvas boundary violations
- Unexpected horizontal scrolling
- Invalid markup
- Rendering failures

The visual critic should evaluate:

- Typography
- Layout
- Visual hierarchy
- Contrast
- Readability
- Alignment
- Brand consistency
- Originality
- Overall compositional quality

Return structured feedback with specific actionable issues and suggested changes.

Use up to three revision rounds by default, with a configurable limit and token budget.

Avoid unnecessary full regenerations. Prefer targeted patches that preserve successful design decisions.

Do not fabricate visual critique when no vision-capable model is available. Use deterministic checks and clearly indicate that visual critique was unavailable.

## 6. Creative variation engine

Add a feature to generate multiple genuinely different creative directions from the same brief.

For example, the prompt:

"Announce that our platform now supports Groq."

Could produce:

**Direction 1: Editorial Minimalism**

Large typography, restrained palette, bold negative space, precise alignment.

**Direction 2: Experimental Technology**

Expressive typography, dynamic shapes, asymmetric composition, structured technical details.

**Direction 3: Premium Product Campaign**

Sophisticated branding, prominent headline, restrained product illustration, carefully balanced layout.

These must be visually distinct compositions, not merely palette swaps.

Allow users to select a direction and refine it further.

## 7. Interactive design editor

Build a functional visual editing interface with:

- Live canvas preview
- Zoom and pan
- Canvas size controls
- Editable text
- Font selection
- Font size and weight
- Color editing
- Element positioning
- Layer ordering
- Alignment controls
- Visibility toggles
- Undo/redo
- Design duplication
- Version history
- Asset upload
- Export controls

The generated HTML/CSS must remain the source of truth or be represented through a reliable editable document model.

Do not fake editing by applying changes only to screenshots.

Allow both manual editing and AI-assisted editing.

## 8. Conversational AI refinement

Add an AI design assistant that supports requests such as:

- "Make the typography more aggressive."
- "Use less decorative geometry."
- "Move the headline slightly higher."
- "Make this look like a premium Swiss design studio."
- "Keep everything but redesign the CTA."
- "Generate three alternative layouts."
- "Increase contrast without changing the brand colors."
- "Make the composition less generic."

Changes should be applied to the existing design, preserving everything that the user did not request to change.

Maintain the current document, user instructions, brand information, and design history as structured context.

Use incremental edits where possible.

Do not rewrite the entire composition for a small modification.

## 9. Brand kit integration

Implement reusable brand profiles containing:

- Brand name
- Logo assets
- Primary and secondary colors
- Typography
- Spacing preferences
- Brand personality
- Approved visual motifs
- Design references
- Preferred content formats

Ensure that every generation uses the selected brand kit.

Allow users to upload reference posters and describe which aspects to draw inspiration from.

Analyze the references with vision when available, extracting compositional characteristics without simply reproducing another design.

Enable persistent brand-specific design memory through the application's existing storage architecture.

## 10. Model orchestration and efficiency

Create separate AI tasks for:

- Brief interpretation
- Creative direction
- Layout planning
- HTML/CSS composition
- Visual critique
- Incremental editing
- Copywriting

Use structured JSON schemas between stages.

Validate and repair malformed model responses.

Control context size and avoid repeatedly sending unnecessary source files.

Cache reusable brand and design instructions.

Track requests, latency, token consumption, errors, and fallbacks.

Support concurrent design jobs within configured operational limits.

Persist job progress so interrupted workflows can recover.

Never allow one failed provider request to corrupt or delete a working design.

## 11. User experience

Design an actual polished creative workspace.

Suggested layout:

- Left: creative brief, brand assets, AI conversation
- Center: large interactive design canvas
- Right: properties, layers, typography, colors
- Top: design variants, undo/redo, export

Provide useful generation states:

1. Interpreting brief
2. Developing art direction
3. Building composition
4. Rendering preview
5. Evaluating design
6. Refining composition
7. Ready to edit/export

Allow the user to view the first successfully rendered composition without waiting for every revision pass to finish.

Provide cancel and retry controls.

Avoid decorative or nonfunctional UI elements.

Use an established icon library. Maintain the application's existing visual identity.

Ensure the editor remains usable on mobile, even if advanced editing is more comfortable on desktop.

## 12. Required testing

Implement and test the complete pipeline with actual example prompts:

1. Premium Groq integration announcement poster.
2. Minimalist startup launch graphic.
3. Experimental typography-based technology advertisement.
4. Product feature announcement.
5. Three-slide Instagram carousel.

Check that:

- All examples render correctly.
- Designs have visibly different compositions.
- Typography remains readable.
- Logo and text positioning remain accurate.
- Exported images match the canvas.
- Manual edits persist correctly.
- AI edits preserve unrelated elements.
- Provider switching works.
- Rate-limit and provider failures are handled.
- An unavailable vision model does not break generation.
- Server secrets cannot be accessed by generated documents.

Use real browser screenshots for visual inspection.

## 13. Implementation requirements

Implement working code, backend services, API routes, UI components, persistence, and tests.

Reuse existing packages and project infrastructure whenever possible.

Do not add unnecessary dependencies or replace working application architecture without justification.

Document required environment variables in `.env.example` without including secrets.

Include setup instructions for each provider.

If a production dependency or deployment platform cannot support unrestricted Chromium execution, implement an appropriate isolated rendering service or compatible alternative.

Do not claim features are complete unless they actually function.

## 14. Final quality standard

The final system must not be a generic text-to-HTML generator.

It should behave like a creative production pipeline:

**Creative brief → Art direction → Composition planning → HTML/CSS generation → Browser rendering → Visual evaluation → Targeted refinement → Editable design → High-resolution export**

Prioritize design quality, reliability, brand consistency, creative variation, and editability over flashy interfaces.

A great design is not one with the most visual effects. It is one where typography, layout, hierarchy, color, and concept work together intentionally.

Build the complete workflow inside the existing application. Inspect the codebase first, then implement the system incrementally, validate each working stage, and finish with functional end-to-end testing.