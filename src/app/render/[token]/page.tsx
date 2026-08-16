import { notFound } from "next/navigation";
import { RenderComposition } from "@/components/render-composition";
import { requirePageAuthentication } from "@/lib/auth/page";
import { verifyRenderToken } from "@/lib/server/render-token";

export const dynamic = "force-dynamic";

export default async function InternalRenderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  await requirePageAuthentication(`/render/${token}`);
  const composition = verifyRenderToken(token);
  if (!composition) notFound();
  return <RenderComposition composition={composition} />;
}
