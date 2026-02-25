/** Single source of truth for Ausstattung categories (apartment card + PropertyDetails). */
export const AMENITY_GROUPS: { groupLabel: string; keys: string[] }[] = [
  { groupLabel: 'Küche & Haushalt', keys: ['Kochmöglichkeit', 'Kühlschrank', 'Mikrowelle', 'Wasserkocher', 'Kochutensilien', 'Spülmaschine', 'Kaffeemaschine'] },
  { groupLabel: 'Sanvuzol & Komfort', keys: ['Privates Bad', 'Dusche', 'WC', 'Handtücher inkl.', 'Hygiene Produkte', 'Waschmaschine', 'Trockner'] },
  { groupLabel: 'Sleeping & Living', keys: ['Getrennte Betten', 'Bettwäsche inkl.', 'Zustellbett möglich', 'Arbeitsplatz', 'Spind / Safe'] },
  { groupLabel: 'Technologie & Media', keys: ['TV', 'W-LAN', 'Radio', 'Streaming Dienste'] },
  { groupLabel: 'Building & Access', keys: ['Aufzug', 'Barrierefrei', 'Ruhige Lage'] },
  { groupLabel: 'Outdoor & Location', keys: ['Terrasse', 'Gute Verkehrsanbindung', 'Geschäfte in der Nähe'] },
  { groupLabel: 'Parking', keys: ['PKW-Parkplatz', 'LKW-Parkplatz'] },
  { groupLabel: 'Freizeit / Extras', keys: ['Sauna', 'Grillmöglichkeit', 'Tisch-Fußball', 'Billardtisch', 'Dart'] },
  { groupLabel: 'Services', keys: ['24h-Rezeption', 'Frühstück', 'Lunchpaket (gg. Aufpreis)'] },
  { groupLabel: 'Rules / Shared', keys: ['Raucher', 'Gemeinschaftsbad', 'Gemeinschaftsraum'] },
];
