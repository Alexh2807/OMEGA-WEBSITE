/*
  # Fix product_reviews user_id relation

  1. Changes
    - Change user_id foreign key from auth.users to profiles
    - This allows proper joins with profiles table in queries

  2. Security
    - Maintain all existing RLS policies
*/

-- Drop the existing foreign key constraint
ALTER TABLE product_reviews
  DROP CONSTRAINT IF EXISTS product_reviews_user_id_fkey;

-- Add new foreign key constraint to profiles
ALTER TABLE product_reviews
  ADD CONSTRAINT product_reviews_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES profiles(id)
  ON DELETE CASCADE;
