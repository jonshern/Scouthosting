// Photos API client — albums + cover images for the mobile Photos
// screen.

import { ApiError, type ClientOptions } from "./client";
import { hostForOrg, DEFAULT_API_CONFIG } from "./config";
import { apiRequest } from "./client";

export type AlbumPreview = {
  id: string;
  title: string;
  visibility: "public" | "members";
  takenAt: string | null;
  totalPhotos: number;
  coverFilename: string | null;
  preview: { id: string; filename: string; caption: string | null; takenAt: string | null }[];
};

export type PhotosResponse = { albums: AlbumPreview[] };

export async function fetchAlbums(client: ClientOptions, orgId: string): Promise<PhotosResponse> {
  return apiRequest<PhotosResponse>(client, `/orgs/${orgId}/photos`);
}

export type UploadedPhoto = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Upload one photo from a local file:// URI (camera roll or capture)
 * into an existing album. Uses multipart/form-data instead of the JSON
 * apiRequest helper since `fetch` on RN handles native FormData append
 * with a {uri,type,name} object directly.
 */
export async function uploadPhotoToAlbum(
  client: ClientOptions,
  orgId: string,
  albumId: string,
  asset: { uri: string; mimeType?: string | null; fileName?: string | null },
): Promise<UploadedPhoto> {
  const { orgSlug, token, config = DEFAULT_API_CONFIG, fetchImpl = fetch } = client;
  if (!token) throw new ApiError(401, "missing_token");

  const url = new URL(
    `/api/v1/orgs/${orgId}/albums/${albumId}/photos`,
    hostForOrg(orgSlug, config),
  );

  const form = new FormData();
  // RN's FormData accepts the {uri,type,name} shape that the platform
  // file-upload pipeline understands. The cast keeps TypeScript happy
  // since the lib.dom FormData typings only know about Blob/string.
  form.append(
    "photo",
    {
      uri: asset.uri,
      name: asset.fileName || asset.uri.split("/").pop() || "photo.jpg",
      type: asset.mimeType || "image/jpeg",
    } as unknown as Blob,
  );

  const res = await fetchImpl(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      // Don't set Content-Type — let fetch fill in the multipart
      // boundary from FormData.
    },
    body: form as unknown as BodyInit,
  });

  let payload: unknown = null;
  try { payload = await res.json(); } catch { /* tolerate empty body */ }
  if (!res.ok) {
    const data = (payload || {}) as Record<string, unknown>;
    const code = String(data.error || `http_${res.status}`);
    throw new ApiError(res.status, code, code, data);
  }
  return ((payload || {}) as { photo: UploadedPhoto }).photo;
}
