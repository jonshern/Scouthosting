// Photos API client — albums + cover images for the mobile Photos
// screen.

import { apiRequest, type ClientOptions } from "./client";

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
