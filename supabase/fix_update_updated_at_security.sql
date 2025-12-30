-- ============================================================================
-- FIX: Function Search Path Mutable для update_updated_at_column()
-- ============================================================================
-- Цей скрипт виправляє попередження Security Advisor про небезпеку
-- "Function Search Path Mutable" для функції update_updated_at_column()
-- 
-- Проблема: Функція не має встановленого search_path, що може призвести
-- до SQL injection атак через зміну search_path під час виконання.
-- 
-- Рішення: Додаємо SET search_path = '' до функції
-- ============================================================================

-- Виправляємо функцію update_updated_at_column()
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Перевірка, що функція виправлена
SELECT 
  proname as function_name,
  prosecdef as is_security_definer,
  proconfig as search_path_config
FROM pg_proc 
WHERE pronamespace = 'public'::regnamespace
  AND proname = 'update_updated_at_column';

