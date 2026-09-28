import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthenticationRequiredError,
  getAuthenticatedUser,
} from "@/lib/auth/server";
import { createDatabase } from "@/lib/server/database";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import {
  assertSameOrigin,
  readJsonBody,
} from "@/lib/server/request-security";
import { scanWebsite } from "@/lib/server/scanner";
import { curateScannedClaims } from "@/lib/server/campaign-generator";
import { analyzeBrandIntelligence } from "@/lib/server/brand-intelligence";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";
import {
  createOrUpdateProjectForScan,
  persistScanResultForProject,
} from "@/lib/server/project-storage";
import { parsePublicHttpUrl } from "@/lib/server/url-security";

export const runtime = "nodejs";

const requestSchema = z.object({
  url: z.string().max(2048).optional(),
  projectName: z.string().min(1).max(120).optional(),
  projectId: z.uuid().optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await getAuthenticatedUser();
    if (!auth.user) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status },
      );
    }

    const identity = getRequestIdentity(request, auth.user.id);
    const limit = await rateLimit(`scan:${identity}`, {
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Scan limit reached. Try again later." },
        { status: 429 },
      );
    }

    const body = requestSchema.parse(await readJsonBody(request, 16_000));
    if (!body.url) {
      return NextResponse.json(
        { error: "A public website URL is required." },
        { status: 400 },
      );
    }

    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Direct scans are disabled in production. Queue a durable scan from the studio." },
        { status: 410 },
      );
    }

    const safeUrl = parsePublicHttpUrl(body.url).toString();
    const result = await curateScannedClaims(await scanWebsite(safeUrl));
    result.profile.brandIntelligence = await analyzeBrandIntelligence(result);
    const database = createDatabase();
    if (!database) {
      return NextResponse.json({ error: "Database persistence is not configured." }, { status: 503 });
    }

    const context = await requireWorkspaceContext();
    const projectId = await createOrUpdateProjectForScan(database, {
      workspaceId: context.workspaceId,
      activeProjectLimit: context.limits.activeProjects,
      projectId: body.projectId,
      projectName: body.projectName ?? result.profile.projectName,
      publicUrl: safeUrl,
    });
    await persistScanResultForProject(database, {
      workspaceId: context.workspaceId,
      projectId,
      result,
    });

    return NextResponse.json({ ...result, projectId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The website could not be scanned.";
    const status =
      error instanceof AuthenticationRequiredError ? error.status : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
