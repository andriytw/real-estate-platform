/**
 * Property media assets: gallery photos, Magic Plan reports, floor plans, 3D tour.
 * Table: property_media_assets. Bucket: property-media.
 */

import { supabase } from '../utils/supabase/client';

const PROPERTY_MEDIA_BUCKET = 'property-media';

export type PropertyMediaAssetType = 'photo' | 'magic_plan_report' | 'floor_plan' | 'tour3d';

export interface PropertyMediaAssetRow {
  id: string;
  property_id: string;
  type: PropertyMediaAssetType;
  file_name: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  external_url: string | null;
  created_at: string;
  updated_at: string;
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
}

function buildStoragePath(propertyId: string, type: PropertyMediaAssetType, assetId: string, file: File): string {
  const ts = Date.now();
  const safe = safeFilename(file.name);
  return `property/${propertyId}/${type}/${assetId}/${ts}_${safe}`;
}

function getUploadContentType(file: File): string {
  const name = file.name || '';
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (ext === 'obj') return 'application/octet-stream';
  if (ext === 'glb') return 'model/gltf-binary';
  if (file.type && file.type.trim().length > 0) return file.type;
  return 'application/octet-stream';
}

export const propertyMediaService = {
  async listAssets(propertyId: string): Promise<PropertyMediaAssetRow[]> {
    const { data, error } = await supabase
      .from('property_media_assets')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as PropertyMediaAssetRow[];
  },

  async listAssetsByType(propertyId: string, type: PropertyMediaAssetType): Promise<PropertyMediaAssetRow[]> {
    const { data, error } = await supabase
      .from('property_media_assets')
      .select('*')
      .eq('property_id', propertyId)
      .eq('type', type)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as PropertyMediaAssetRow[];
  },

  async uploadAssetFiles(
    propertyId: string,
    type: PropertyMediaAssetType,
    files: File[]
  ): Promise<PropertyMediaAssetRow[]> {
    const created: PropertyMediaAssetRow[] = [];
    for (const file of files) {
      const assetId = crypto.randomUUID();
      const storagePath = buildStoragePath(propertyId, type, assetId, file);
      const contentType = getUploadContentType(file);
      const { error: uploadError } = await supabase.storage
        .from(PROPERTY_MEDIA_BUCKET)
        .upload(storagePath, file, { upsert: false, contentType });
      if (uploadError) throw uploadError;
      const row = {
        id: assetId,
        property_id: propertyId,
        type,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: contentType,
        size_bytes: file.size,
        external_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('property_media_assets')
        .insert([row])
        .select()
        .single();
      if (error) {
        try {
          await supabase.storage.from(PROPERTY_MEDIA_BUCKET).remove([storagePath]);
        } catch {
          // best effort
        }
        throw error;
      }
      created.push(data as PropertyMediaAssetRow);
    }
    return created;
  },

  async createTour3d(propertyId: string, url: string): Promise<PropertyMediaAssetRow> {
    const { data: existing } = await supabase
      .from('property_media_assets')
      .select('id')
      .eq('property_id', propertyId)
      .eq('type', 'tour3d')
      .maybeSingle();
    const now = new Date().toISOString();
    if (existing?.id) {
      const { data, error } = await supabase
        .from('property_media_assets')
        .update({ external_url: url, updated_at: now })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as PropertyMediaAssetRow;
    }
    const { data, error } = await supabase
      .from('property_media_assets')
      .insert([
        {
          property_id: propertyId,
          type: 'tour3d',
          external_url: url,
          file_name: null,
          storage_path: null,
          mime_type: null,
          size_bytes: null,
          created_at: now,
          updated_at: now,
        },
      ])
      .select()
      .single();
    if (error) throw error;
    return data as PropertyMediaAssetRow;
  },

  async deleteAsset(assetId: string): Promise<void> {
    const { data: row, error: fetchError } = await supabase
      .from('property_media_assets')
      .select('storage_path, external_url')
      .eq('id', assetId)
      .single();
    if (fetchError || !row) throw fetchError || new Error('Asset not found');
    if (row.storage_path) {
      const { error: removeError } = await supabase.storage.from(PROPERTY_MEDIA_BUCKET).remove([row.storage_path]);
      if (removeError) throw removeError;
    }
    const { error: deleteError } = await supabase.from('property_media_assets').delete().eq('id', assetId);
    if (deleteError) throw deleteError;
    // If only external_url (tour3d), no storage to remove; delete row only
  },

  async getSignedUrl(storagePath: string, expires = 3600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(PROPERTY_MEDIA_BUCKET)
      .createSignedUrl(storagePath, expires);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error('No signed URL returned');
    return data.signedUrl;
  },

  async getCoverPhotoAssetId(propertyId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('properties')
      .select('cover_photo_asset_id')
      .eq('id', propertyId)
      .single();
    if (error) throw error;
    const id = (data as { cover_photo_asset_id?: string | null } | null)?.cover_photo_asset_id;
    return id ?? null;
  },

  async setCoverPhoto(propertyId: string, assetId: string | null): Promise<void> {
    const { data: prop } = await supabase
      .from('properties')
      .select('cover_photo_asset_id')
      .eq('id', propertyId)
      .single();
    const previousCoverId = (prop as { cover_photo_asset_id?: string | null } | null)?.cover_photo_asset_id ?? null;

    if (assetId == null) {
      if (previousCoverId) {
        await supabase
          .from('property_media_assets')
          .update({ is_public: false })
          .eq('id', previousCoverId);
      }
      const { error } = await supabase
        .from('properties')
        .update({ cover_photo_asset_id: null })
        .eq('id', propertyId);
      if (error) throw error;
      return;
    }

    const { data: exists } = await supabase
      .from('property_media_assets')
      .select('id')
      .eq('id', assetId)
      .eq('property_id', propertyId)
      .eq('type', 'photo')
      .maybeSingle();
    if (!exists?.id) return;

    if (previousCoverId) {
      await supabase
        .from('property_media_assets')
        .update({ is_public: false })
        .eq('id', previousCoverId);
    }
    const { error: propError } = await supabase
      .from('properties')
      .update({ cover_photo_asset_id: assetId })
      .eq('id', propertyId);
    if (propError) throw propError;
    await supabase
      .from('property_media_assets')
      .update({ is_public: true })
      .eq('id', assetId);
  },

  async getPhotoSignedUrls(assets: PropertyMediaAssetRow[], expires = 3600): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    await Promise.all(
      assets
        .filter((a) => a.storage_path)
        .map(async (a) => {
          const url = await propertyMediaService.getSignedUrl(a.storage_path!, expires);
          out[a.id] = url;
        })
    );
    return out;
  },

  async getCoverPhotoSignedUrlsForProperties(
    propertyIds: string[],
    expiresInSeconds = 3600
  ): Promise<Record<string, string>> {
    if (propertyIds.length === 0) return {};
    const { data: properties, error: propError } = await supabase
      .from('properties')
      .select('id, cover_photo_asset_id')
      .in('id', propertyIds)
      .not('cover_photo_asset_id', 'is', null);
    if (propError) throw propError;
    const rows = (properties ?? []) as { id: string; cover_photo_asset_id: string }[];
    if (rows.length === 0) return {};
    const coverIds = [...new Set(rows.map((r) => r.cover_photo_asset_id))];
    const { data: assets, error: assetError } = await supabase
      .from('property_media_assets')
      .select('id, storage_path')
      .in('id', coverIds);
    if (assetError) throw assetError;
    const assetList = (assets ?? []) as { id: string; storage_path: string | null }[];
    const pathById = new Map<string, string>();
    assetList.forEach((a) => {
      if (a.storage_path) pathById.set(a.id, a.storage_path);
    });
    const propertyIdByAssetId = new Map<string, string>();
    rows.forEach((r) => propertyIdByAssetId.set(r.cover_photo_asset_id, r.id));
    const out: Record<string, string> = {};
    await Promise.all(
      Array.from(pathById.entries()).map(async ([assetId, storagePath]) => {
        const url = await propertyMediaService.getSignedUrl(storagePath, expiresInSeconds);
        const pid = propertyIdByAssetId.get(assetId);
        if (pid) out[pid] = url;
      })
    );
    return out;
  },

  /**
   * Marketplace property detail: all photo URLs for gallery (cover-first, then by created_at DESC).
   * coverAssetId optional: put this asset first when is_public ordering is not enough.
   */
  async getMarketplacePhotoUrlsForProperty(
    propertyId: string,
    expiresInSeconds = 3600,
    coverAssetId?: string | null
  ): Promise<string[]> {
    const { data: rows, error } = await supabase
      .from('property_media_assets')
      .select('id, storage_path, created_at, is_public')
      .eq('property_id', propertyId)
      .eq('type', 'photo')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const assets = (rows ?? []) as { id: string; storage_path: string | null; created_at: string; is_public?: boolean }[];
    const withPath = assets.filter((a) => a.storage_path);
    if (withPath.length === 0) return [];
    // Cover first: is_public, then coverAssetId, then created_at desc
    const sorted = [...withPath].sort((a, b) => {
      if (a.is_public && !b.is_public) return -1;
      if (!a.is_public && b.is_public) return 1;
      if (coverAssetId && a.id === coverAssetId && b.id !== coverAssetId) return -1;
      if (coverAssetId && a.id !== coverAssetId && b.id === coverAssetId) return 1;
      return 0;
    });
    const urls = await Promise.all(
      sorted.map((a) => propertyMediaService.getSignedUrl(a.storage_path!, expiresInSeconds))
    );
    return urls;
  },

  async getMarketplaceFloorPlanUrl(
    propertyId: string,
    expiresInSeconds = 60 * 30
  ): Promise<string | null> {
    const assets = await propertyMediaService.listAssetsByType(propertyId, 'floor_plan');
    const latest = assets.find((a) => a.storage_path);
    if (!latest?.storage_path) return null;
    try {
      return await propertyMediaService.getSignedUrl(latest.storage_path, expiresInSeconds);
    } catch {
      return null;
    }
  },

  async getMarketplaceMagicPlanReportUrl(
    propertyId: string,
    expiresInSeconds = 60 * 30
  ): Promise<string | null> {
    const assets = await propertyMediaService.listAssetsByType(propertyId, 'magic_plan_report');
    const latest = assets.find((a) => a.storage_path);
    if (!latest?.storage_path) return null;
    try {
      return await propertyMediaService.getSignedUrl(latest.storage_path, expiresInSeconds);
    } catch {
      return null;
    }
  },

  async getMarketplaceTour3dUrl(
    propertyId: string,
    expiresInSeconds = 60 * 30
  ): Promise<string | null> {
    const assets = await propertyMediaService.listAssetsByType(propertyId, 'tour3d');
    const first = assets[0];
    if (!first) return null;
    if (first.storage_path) {
      try {
        return await propertyMediaService.getSignedUrl(first.storage_path, expiresInSeconds);
      } catch {
        return null;
      }
    }
    return first.external_url ?? null;
  },
};
