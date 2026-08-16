import "server-only";

import { requireCurrentUser } from "@/lib/auth/server";
import {
  createDatabase,
  type DatabaseClient,
} from "@/lib/server/database";
import { PLAN_LIMITS, type Plan } from "@/lib/entitlements";

export async function ensureWorkspaceForUser(
  database: DatabaseClient,
  userId: string,
  workspaceName = "My workspace",
) {
  const [workspace] = await database`
    select public.ensure_workspace_for_user(${userId}, ${workspaceName}) as workspace_id
  `;
  const workspaceId = workspace?.workspace_id;
  if (typeof workspaceId !== "string") {
    throw new Error("Workspace could not be created.");
  }
  return workspaceId;
}

export async function requireWorkspaceContext() {
  const user = await requireCurrentUser();

  const database = createDatabase();
  if (!database) throw new Error("Database is not configured.");
  const workspaceId = await ensureWorkspaceForUser(
    database,
    user.id,
    user.name?.trim() || `${user.email?.split("@")[0] ?? "My"} workspace`,
  );

  const [subscription] = await database`
    select status
    from public.subscriptions
    where workspace_id = ${workspaceId}
    limit 1
  `;
  const plan: Plan =
    subscription &&
    ["active", "trialing"].includes(subscription.status)
      ? "pro"
      : "free";
  return {
    database,
    user,
    workspaceId,
    plan,
    limits: PLAN_LIMITS[plan],
  };
}
