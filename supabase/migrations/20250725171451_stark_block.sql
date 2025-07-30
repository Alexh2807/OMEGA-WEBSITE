/*
  # Fix user statistics calculation for cancelled orders

  1. Updates
    - Modify update_user_stats function to exclude cancelled orders
    - Recalculate existing user statistics
    - Update trigger to handle all order status changes

  2. Security
    - Maintains existing RLS policies
    - No changes to permissions
*/

-- Drop existing function and trigger
DROP TRIGGER IF EXISTS update_user_stats_trigger ON orders;
DROP FUNCTION IF EXISTS update_user_stats();

-- Create improved function that excludes cancelled orders
CREATE OR REPLACE FUNCTION update_user_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle INSERT and UPDATE operations
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Update stats for the user, excluding cancelled orders
    UPDATE profiles 
    SET 
      total_orders = (
        SELECT COUNT(*) 
        FROM orders 
        WHERE user_id = NEW.user_id 
        AND status IN ('confirmed', 'shipped', 'delivered')
      ),
      total_spent = (
        SELECT COALESCE(SUM(total), 0) 
        FROM orders 
        WHERE user_id = NEW.user_id 
        AND status IN ('confirmed', 'shipped', 'delivered')
      )
    WHERE id = NEW.user_id;
    
    RETURN NEW;
  END IF;
  
  -- Handle DELETE operations
  IF TG_OP = 'DELETE' THEN
    -- Update stats for the user, excluding cancelled orders
    UPDATE profiles 
    SET 
      total_orders = (
        SELECT COUNT(*) 
        FROM orders 
        WHERE user_id = OLD.user_id 
        AND status IN ('confirmed', 'shipped', 'delivered')
      ),
      total_spent = (
        SELECT COALESCE(SUM(total), 0) 
        FROM orders 
        WHERE user_id = OLD.user_id 
        AND status IN ('confirmed', 'shipped', 'delivered')
      )
    WHERE id = OLD.user_id;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER update_user_stats_trigger
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_user_stats();

-- Recalculate all existing user statistics to fix incorrect data
UPDATE profiles 
SET 
  total_orders = (
    SELECT COUNT(*) 
    FROM orders 
    WHERE orders.user_id = profiles.id 
    AND status IN ('confirmed', 'shipped', 'delivered')
  ),
  total_spent = (
    SELECT COALESCE(SUM(total), 0) 
    FROM orders 
    WHERE orders.user_id = profiles.id 
    AND status IN ('confirmed', 'shipped', 'delivered')
  )
WHERE id IN (
  SELECT DISTINCT user_id 
  FROM orders 
  WHERE user_id IS NOT NULL
);