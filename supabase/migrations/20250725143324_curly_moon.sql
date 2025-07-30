/*
  # Fix orders-profiles relationship

  1. Database Changes
    - Add foreign key constraint between orders.user_id and profiles.id
    - This enables Supabase to resolve the relationship when querying

  2. Security
    - No RLS changes needed as existing policies remain valid
*/

-- Add foreign key constraint to link orders to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'orders_user_id_profiles_fkey'
  ) THEN
    ALTER TABLE orders 
    ADD CONSTRAINT orders_user_id_profiles_fkey 
    FOREIGN KEY (user_id) REFERENCES profiles(id);
  END IF;
END $$;