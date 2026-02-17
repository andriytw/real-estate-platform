/**
 * Manual-only meter readings: property_meters (Zählernummer) and property_meter_readings.
 * Tile "Показання Лічильників (Історія)" uses this service only; no task/reservation coupling.
 */

import { supabase } from '../utils/supabase/client';

export type MeterType = 'strom' | 'gas' | 'wasser' | 'heizung';

export interface PropertyMeterRow {
  id: string;
  property_id: string;
  type: MeterType;
  meter_number: string | null;
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

  async upsertMeter(propertyId: string, type: MeterType, meter_number: string | null): Promise<PropertyMeterRow> {
    const { data: existing } = await supabase
      .from('property_meters')
      .select('id')
      .eq('property_id', propertyId)
      .eq('type', type)
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await supabase
        .from('property_meters')
        .update({ meter_number })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as PropertyMeterRow;
    }
    const { data, error } = await supabase
      .from('property_meters')
      .insert([{ property_id: propertyId, type, meter_number }])
      .select()
      .single();
    if (error) throw error;
    return data as PropertyMeterRow;
  },
};

export { METER_TYPES };
