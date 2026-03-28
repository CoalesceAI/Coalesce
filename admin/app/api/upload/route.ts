import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const allowed = ["application/pdf", "text/markdown", "text/plain"];
  if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|md|txt)$/i)) {
    return NextResponse.json(
      { error: "Only PDF, Markdown, and text files are supported" },
      { status: 400 },
    );
  }

  const blob = await put(file.name, file, { access: "public" });

  return NextResponse.json({ blobUrl: blob.url, filename: file.name });
}
