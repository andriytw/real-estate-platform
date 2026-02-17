/**
 * Manual-only meter readings: property_meters (Zählernummer) and property_meter_readings.
 * Tile "Показання Лічильників (Історія)" uses this service only; no task/reservation coupling.
 * Photos: property_meter_photos + storage bucket property-meter-photos.
 */

import { supabase } from '../utils/supabase/client';

const PROPERTY_METER_PHOTOS_BUCKET = 'property-meter-photos';

export type MeterType = 'strom' | 'gas' | 'wasser' | 'heizung';

export interface PropertyMeterPhotoRow {
  id: string;
  reading_id: string;
  storage_path: string;
  created_at: string;
}

export interface PropertyMeterRow {
  id: string;
  property_id: string;
  type: MeterType;
  meter_number: string | null;
  unit?: string | null;
  price_per_unit?: number | null;
  created_at: string;
}

export interface PropertyMeterReadingRow {
  id: string;
  property_id: string;
  reading_date: string;
  strom: number | null;
  gas: number | null;
  wasser: number | null;
  heizung: number | null;
  note: string | null;
  created_at: string;
}

export interface CreateReadingPayload {
  reading_date: string;
  strom?: number | null;
  gas?: number | null;
  wasser?: number | null;
  heizung?: number | null;
  note?: string | null;
}

const METER_TYPES: MeterType[] = ['strom', 'gas', 'wasser', 'heizung'];

function safeFilename(name: string): string {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  const safe = base.replace(/[^a-zA-Z0-9]/g, '_');
  return (safe || 'file') + ext;
}

export const propertyMeterService = {
  async listReadings(propertyId: string): Promise<PropertyMeterReadingRow[]> {
    const { data, error } = await supabase
      .from('property_meter_readings')
      .select('*')
      .eq('property_id', propertyId)
      .order('reading_date', { ascending: false });
    if (error) throw error;
    return (data ?? []) as PropertyMeterReadingRow[];
  },

  async createReading(propertyId: string, payload: CreateReadingPayload): Promise<PropertyMeterReadingRow> {
    const row = {
      property_id: propertyId,
      reading_date: payload.reading_date,
      strom: payload.strom ?? null,
      gas: payload.gas ?? null,
      wasser: payload.wasser ?? null,
      heizung: payload.heizung ?? null,
      note: payload.note ?? null,
    };
    const { data, error } = await supabase
      .from('property_meter_readings')
      .insert([row])
      .select()
      .single();
    if (error) throw error;
    return data as PropertyMeterReadingRow;
  },

  async updateReading(
    id: string,
    patch: Partial<Pick<PropertyMeterReadingRow, 'reading_date' | 'strom' | 'gas' | 'wasser' | 'heizung' | 'note'>>
  ): Promise<PropertyMeterReadingRow> {
    const { data, error } = await supabase
      .from('property_meter_readings')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as PropertyMeterReadingRow;
  },

  async deleteReading(id: string): Promise<void> {
    try {
      const photos = await this.listReadingPhotos(id);
      for (const p of photos) {
        try {
          await supabase.storage.from(PROPERTY_METER_PHOTOS_BUCKET).remove([p.storage_path]);
        } catch {
          // best-effort: log but continue
        }
      }
      const { error: photosDeleteError } = await supabase.from('property_meter_photos').delete().eq('reading_id', id);
      if (photosDeleteError) {
        // continue to delete reading
      }
    } catch {
      // best-effort cleanup; proceed to delete reading
    }
    const { error } = await supabase.from('property_meter_readings').delete().eq('id', id);
    if (error) throw error;
  },

  async listMeters(propertyId: string): Promise<PropertyMeterRow[]> {
    const { data, error } = await supabase
      .from('property_meters')
      .select('*')
      .eq('property_id', propertyId);
    if (error) throw error;
    return (data ?? []) as PropertyMeterRow[];
  },

  async upsertMeter(
    propertyId: string,
    type: MeterType,
    meter_number: string | null,
    unit?: string | null,
    price_per_unit?: number | null
  ): Promise<PropertyMeterRow> {
    const payload: { meter_number: string | null; unit?: string | null; price_per_unit?: number | null } = { meter_number };
    if (unit !== undefined) payload.unit = unit;
    if (price_per_unit !== undefined) payload.price_per_unit = price_per_unit;

    const { data: existing } = await supabase
      .from('property_meters')
      .select('id')
      .eq('property_id', propertyId)
      .eq('type', type)
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await supabase
        .from('property_meters')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as PropertyMeterRow;
    }
    const { data, error } = await supabase
      .from('property_meters')
      .insert([{ property_id: propertyId, type, ...payload }])
      .select()
      .single();
    if (error) throw error;
    return data as PropertyMeterRow;
  },

  async uploadReadingPhotos(
    propertyId: string,
    readingId: string,
    files: File[]
  ): Promise<PropertyMeterPhotoRow[]> {
    const created: PropertyMeterPhotoRow[] = [];
    for (const file of files) {
      const ts = Date.now();
      const name = safeFilename(file.name);
      const storagePath = `property/${propertyId}/meter_readings/${readingId}/${ts}_${name}`;
      const { error: uploadError } = await supabase.storage
        .from(PROPERTY_METER_PHOTOS_BUCKET)
        .upload(storagePath, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { data: row, error: insertError } = await supabase
        .from('property_meter_photos')
        .insert([{ reading_id: readingId, storage_path: storagePath }])
        .select()
        .single();
      if (insertError) throw insertError;
      created.push(row as PropertyMeterPhotoRow);
    }
    return created;
  },

  async listReadingPhotos(readingId: string): Promise<PropertyMeterPhotoRow[]> {
    const { data, error } = await supabase
      .from('property_meter_photos')
      .select('*')
      .eq('reading_id', readingId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as PropertyMeterPhotoRow[];
  },

  async listPhotosByReadingIds(readingIds: string[]): Promise<PropertyMeterPhotoRow[]> {
    if (readingIds.length === 0) return [];
    const { data, error } = await supabase
      .from('property_meter_photos')
      .select('*')
      .in('reading_id', readingIds);
    if (error) throw error;
    return (data ?? []) as PropertyMeterPhotoRow[];
  },

  async getPhotoSignedUrl(storagePath: string, expirySeconds = 3600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(PROPERTY_METER_PHOTOS_BUCKET)
      .createSignedUrl(storagePath, expirySeconds);
    if (error) throw new Error(error.message || 'Failed to create signed URL');
    if (!data?.signedUrl) throw new Error('No signed URL returned');
    return data.signedUrl;
  },

  async deleteReadingPhoto(photoId: string, storagePath: string): Promise<void> {
    const { error: storageError } = await supabase.storage.from(PROPERTY_METER_PHOTOS_BUCKET).remove([storagePath]);
    if (storageError) throw storageError;
    const { error: dbError } = await supabase.from('property_meter_photos').delete().eq('id', photoId);
    if (dbError) throw dbError;
  },
};

export { METER_TYPES };
