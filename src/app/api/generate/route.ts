import { NextResponse } from "next/server";
export async function POST(request: Request) {
  void request;
  return NextResponse.json(
    { error: "Direct campaign generation is disabled. Queue a campaign from its saved project." },
    { status: 410 },
  );
}
