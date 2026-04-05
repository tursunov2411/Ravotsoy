import { createSupabasePrivilegedClient } from "../bots/shared.js";

const supabase = createSupabasePrivilegedClient();
const MEDIA_BUCKET = "media";

function sanitizePathPart(value) {
  return String(value ?? "file")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "file";
}

function getExtensionFromName(fileName, fallback = "bin") {
  const extension = String(fileName ?? "").trim().split(".").pop()?.toLowerCase();
  return extension && /^[a-z0-9]+$/i.test(extension) ? extension : fallback;
}

export async function listServiceMedia(resourceType = "") {
  let query = supabase
    .from("media")
    .select("id, type, url, resource_type, storage_path")
    .eq("type", "service")
    .order("created_at", { ascending: false });

  if (resourceType) {
    query = query.eq("resource_type", resourceType);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (Array.isArray(data) ? data : []).map((item) => ({
    id: String(item.id ?? ""),
    type: String(item.type ?? "service"),
    url: String(item.url ?? ""),
    resource_type: item.resource_type ? String(item.resource_type) : null,
    storage_path: item.storage_path ? String(item.storage_path) : null,
  }));
}

export async function getLatestServiceMedia(resourceType) {
  const items = await listServiceMedia(resourceType);
  return items[0] ?? null;
}

export async function deleteServiceMedia(resourceType) {
  const assets = await listServiceMedia(resourceType);

  if (assets.length === 0) {
    return 0;
  }

  const storagePaths = assets.map((item) => item.storage_path).filter(Boolean);

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage.from(MEDIA_BUCKET).remove(storagePaths);

    if (storageError) {
      console.error(storageError);
    }
  }

  const { error } = await supabase
    .from("media")
    .delete()
    .eq("type", "service")
    .eq("resource_type", resourceType);

  if (error) {
    throw error;
  }

  return assets.length;
}

export async function replaceServiceMedia(resourceType, file) {
  const normalizedType = String(resourceType ?? "").trim();

  if (!normalizedType) {
    throw new Error("resourceType is required");
  }

  if (!file?.buffer) {
    throw new Error("file buffer is required");
  }

  await deleteServiceMedia(normalizedType);

  const baseName = sanitizePathPart(file.originalName ?? file.fileName ?? `${normalizedType}.jpg`);
  const extension = getExtensionFromName(baseName, "jpg");
  const fileName = `${Date.now()}-${baseName.replace(/\.[a-z0-9]+$/i, "")}.${extension}`;
  const path = `services/${normalizedType}/${fileName}`;

  const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file.buffer, {
    contentType: file.contentType || "application/octet-stream",
    upsert: true,
  });

  if (uploadError) {
    throw uploadError;
  }

  const { data: publicUrlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  const { data, error } = await supabase
    .from("media")
    .insert({
      type: "service",
      url: publicUrlData.publicUrl,
      resource_type: normalizedType,
      storage_path: path,
    })
    .select("id, type, url, resource_type, storage_path")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: String(data.id ?? ""),
    type: String(data.type ?? "service"),
    url: String(data.url ?? ""),
    resource_type: data.resource_type ? String(data.resource_type) : null,
    storage_path: data.storage_path ? String(data.storage_path) : null,
  };
}
