-- ============================================================================
-- SQL Script: Delete Test Properties from Supabase Database
-- Виконати в Supabase SQL Editor
-- ============================================================================
-- 
-- ВАЖЛИВО: При видаленні properties автоматично видаляться всі пов'язані дані:
-- - inventory (JSONB в properties) - буде видалено разом з property
-- - meter_readings (JSONB в properties) - буде видалено разом з property
-- - meter_log (JSONB в properties) - буде видалено разом з property
-- - tenant (JSONB в properties) - буде видалено разом з property
-- - rental_history (JSONB в properties) - буде видалено разом з property
-- - rent_payments (JSONB в properties) - буде видалено разом з property
-- - repair_requests (JSONB в properties) - буде видалено разом з property
-- - events (JSONB в properties) - буде видалено разом з property
-- - owner_expense (JSONB в properties) - буде видалено разом з property
-- - future_payments (JSONB в properties) - буде видалено разом з property
-- 
-- А також пов'язані записи з інших таблиць (через foreign keys):
-- - bookings (якщо property_id вказує на видалену property)
-- - offers (якщо property_id вказує на видалену property)
-- - requests (якщо property_id вказує на видалену property)
-- - chat_rooms (якщо property_id вказує на видалену property)
--
-- ВСІ РОЗДІЛИ В КАРТЦІ КВАРТИРИ ЗАЛИШАТЬСЯ ДОСТУПНИМИ:
-- При створенні нової property всі JSONB поля автоматично ініціалізуються
-- порожніми значеннями (DEFAULT '[]'::jsonb або DEFAULT '{}'::jsonb),
-- тому всі розділи (інвентар, лічильники, орендар, договори, оплати,
-- історія, ремонти, документи) залишаться доступними в UI.
-- ============================================================================

-- Видалити тестові квартири за назвами (якщо ID в БД це UUID)
DELETE FROM properties 
WHERE title IN (
  'Apartment 1, Lviv',
  'House, Berlin',
  'Cottage, Odesa',
  'Apartment, Warsaw',
  'Studio, Krakow',
  'Apartment 2, Kyiv',
  'Office, Dnipro',
  'Mini-Studio, Lviv'
);

-- АЛЬТЕРНАТИВНО: Якщо ID в БД це текстові значення '1', '2', '3', тощо,
-- розкоментуйте наступний рядок замість попереднього:
-- DELETE FROM properties WHERE id IN ('1', '2', '3', '4', '5', '6', '7', '8');

-- Перевірити результат
SELECT COUNT(*) as remaining_properties FROM properties;

-- Перевірити структуру таблиці (всі JSONB поля мають DEFAULT значення)
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'properties' 
AND data_type = 'jsonb'
ORDER BY column_name;

