/*
  # Fix contact_requests UPDATE permissions for admins

  1. Changes
    - Drop old restrictive policies
    - Add proper UPDATE policy for admins based on profiles.role
    - Ensure admins can update all contact_requests fields

  2. Security
    - Only users with role='admin' in profiles table can update
    - Public can still insert (contact form)
    - Users can view their own requests
*/

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Admins can manage all contact requests v2" ON contact_requests;
DROP POLICY IF EXISTS "Admins can view all contact requests" ON contact_requests;
DROP POLICY IF EXISTS "Anyone can submit contact requests" ON contact_requests;
DROP POLICY IF EXISTS "Users can view their own contact requests" ON contact_requests;
DROP POLICY IF EXISTS "Admins can update all contact requests" ON contact_requests;
DROP POLICY IF EXISTS "Admins can delete contact requests" ON contact_requests;

-- Policy for public to insert contact requests (contact form)
CREATE POLICY "Anyone can submit contact requests"
  ON contact_requests
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Policy for admins to SELECT all contact requests
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

-- Policy for admins to UPDATE all contact requests
CREATE POLICY "Admins can update all contact requests"
  ON contact_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy for admins to DELETE contact requests
CREATE POLICY "Admins can delete contact requests"
  ON contact_requests
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy for users to view their own contact requests
CREATE POLICY "Users can view their own contact requests"
  ON contact_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Ensure RLS is enabled
ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;
