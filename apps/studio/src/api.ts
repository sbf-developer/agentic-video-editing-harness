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

export async function uploadFiles(
  projectId: string,
  files: FileList,
): Promise<{ assets: unknown[]; uploaded: number }> {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);

  let res: Response;
  try {
    res = await fetch(`/api/projects/${projectId}/upload`, { method: "POST", body: fd });
  } catch {
    throw new Error("Upload failed — is the Studio API running?");
  }

  let data: { error?: string; assets?: unknown[]; uploaded?: number };
  try {
    data = await res.json();
  } catch {
    throw new Error(`Upload failed (${res.status})`);
  }
  if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
  return { assets: data.assets ?? [], uploaded: data.uploaded ?? 0 };
}

