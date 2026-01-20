-- ============================================================================
-- Create Companies from constants.ts data
-- Run this BEFORE migration_booking_numbers.sql
-- ============================================================================

-- Insert companies if they don't exist (based on name uniqueness)
INSERT INTO public.companies (name, address, iban, tax_id, email)
VALUES 
    (
        'Sotiso GmbH',
        'Alexanderplatz 1, 10178 Berlin, Germany',
        'DE55 1001 0010 1234 5678 90',
        'DE123456789',
        'billing@sotiso.com'
    ),
    (
        'Wonowo Sp. z o.o.',
        'Ul. Prosta 20, 00-850 Warsaw, Poland',
        'PL99 1020 3040 5060 7080 9010 1112',
        'PL987654321',
        'billing@wonowo.com'
    ),
    (
        'NowFlats Inc.',
        '15 Main St, Dublin, Ireland',
        'IE22 AIBK 9311 5212 3456 78',
        'IE555666777',
        'billing@nowflats.com'
    )
ON CONFLICT (name) DO NOTHING;

-- Verify companies were created
SELECT id, name, email FROM public.companies ORDER BY created_at ASC;
