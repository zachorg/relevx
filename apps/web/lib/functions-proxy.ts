import { NextResponse } from "next/server";

// Resolve the API base URL for the Render-hosted service (or local dev).
export function functionsBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8080";
  return base.replace(/\/$/, "");
}

// Minimal proxy that forwards auth header to the external API and returns JSON responses.
export async function foward_req_to_relevx_api(fnPath: string, req: RequestInit): Promise<Response> {
  try {
    const base = functionsBaseUrl();
    const url = `${base}${fnPath}`;
    // console.log("fetching", url, init);
    const res = await fetch(url, req);
    return res;
  } catch (err) {
    const msg =
      typeof (err as { message?: unknown })?.message === "string"
        ? (err as { message: string }).message
        : "Proxy error";
    if (process.env.NODE_ENV !== "production") {
      // Dev-only logging to help debug proxy failures
      // Avoid logging tokens or sensitive request bodies
      console.warn("functions proxy error", { fnPath, err });
    }
    return NextResponse.json({ error: { message: msg } }, { status: 500 });
  }
}
