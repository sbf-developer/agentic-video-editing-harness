export async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new Error("Cannot reach Studio API — run npm run studio and ensure port 3847 is up");
  }
  let data: { error?: string; details?: { message?: string }[] };
  try {
    data = await res.json();
  } catch {
    throw new Error(res.ok ? "Invalid API response" : `API error (${res.status})`);
  }
  if (!res.ok) throw new Error(data.error ?? data.details?.[0]?.message ?? res.statusText);
  return data as T;
}

