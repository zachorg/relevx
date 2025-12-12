// Lightweight API client with Firebase ID token auth and typed helpers
// NOTE: Do not log or persist plaintext API keys. Only use keyPrefix beyond creation.

import { auth } from "@/lib/firebase";
import { foward_req_to_relevx_api } from "./functions-proxy";

export type ApiErrorEnvelope = { error?: { message?: string } };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type Json = Record<string, unknown> | undefined;
type HeaderMap = Record<string, string> | undefined;

/**
 * Get Firebase ID token for the current user
 * @returns Promise<string | null> - The ID token or null if not authenticated
 */
export async function getIdToken(): Promise<string | null> {
  try {
    if (!auth || !auth.currentUser) {
      return null;
    }

    return await auth.currentUser.getIdToken(true);
  } catch (error) {
    console.error("Error getting Firebase ID token:", error);
    return null;
  }
}

export async function relevx_api_fetch<T>(
  reqPath: string,
  init?: RequestInit
): Promise<T> {
  const idToken = await getIdToken();

  const req: RequestInit = {
    ...init,
    headers: {
      ...(init?.headers || {}),
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`
    },
    cache: "no-store",
  };
  // console.log("🔑 request: ", JSON.stringify(req, null, 2));
  const res = await foward_req_to_relevx_api(reqPath, req);
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    // Fall through with raw text when JSON parse fails
  }
  if (!res.ok) {
    const message =
      (data as ApiErrorEnvelope | undefined)?.error?.message ||
      (typeof text === "string" && text) ||
      `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export const relevx_api = {
  get<T>(path: string, headers?: HeaderMap): Promise<T> {
    return relevx_api_fetch<T>(path, { method: "GET", headers });
  },
  post<T>(
    path: string,
    body?: Json,
    headers?: HeaderMap
  ): Promise<T> {
    return relevx_api_fetch<T>(path, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
      headers,
    });
  },
  delete<T>(
    path: string,
    body?: Json,
    headers?: HeaderMap
  ): Promise<T> {
    // Next.js route supports DELETE with a JSON body
    return relevx_api_fetch<T>(path, {
      method: "DELETE",
      body: JSON.stringify(body ?? {}),
      headers,
    });
  },
};
