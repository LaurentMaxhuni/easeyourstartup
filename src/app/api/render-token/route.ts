import { NextResponse } from "next/server";

export async function POST(request: Request) {
  void request;
  return NextResponse.json(
    { error: "Composition rendering is available only through a saved campaign export job." },
    { status: 410 },
  );
}
