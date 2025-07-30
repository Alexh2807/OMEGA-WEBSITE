/*
  # Fix contact_requests RLS policies

  1. Security Changes
    - Drop existing problematic policies that reference auth.users table
    - Create new policies that use auth.uid() directly
    - Allow admins to view all contact requests using profiles table
    - Allow public to insert contact requests
    - Allow users to view their own contact requests

  2. Policy Details
    - Admin access: Check role in profiles table using auth.uid()
    - Public insert: Anyone can submit contact requests
    - User access: Users can view their own requests
*/

-- Drop existing policies that might be causing issues
DROP POLICY IF EXISTS "Admins can view all contact requests" ON contact_requests;
DROP POLICY IF EXISTS "Anyone can submit contact requests" ON contact_requests;
DROP POLICY IF EXISTS "Users can view their own contact requests" ON contact_requests;

-- Create new policies that don't reference auth.users table
CREATE POLICY "Admins can view all contact requests"
  ON contact_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Anyone can submit contact requests"
  ON contact_requests
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Users can view their own contact requests"
  ON contact_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Ensure RLS is enabled
ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;