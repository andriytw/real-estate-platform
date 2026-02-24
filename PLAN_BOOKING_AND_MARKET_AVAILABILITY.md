# План: Booking Pipeline + /market Availability (RLS-safe)

Повний текст у [docs/BOOKING_PIPELINE_AND_MARKET_AVAILABILITY.md](docs/BOOKING_PIPELINE_AND_MARKET_AVAILABILITY.md).

**Виконати (розділ 6.9):**

1. **api/market/blocked-bookings.ts** — повертати `{ property_ids: string[] }`; обмеження 60 днів; валідація; cache headers.
2. **services/marketAvailabilityService.ts** — прибрати клієнтський Supabase; завжди викликати API; парсити `response.property_ids`.
3. **components/MarketMap.tsx** — підписи "From (check-in)", "To (check-out)" для двох date inputs.
