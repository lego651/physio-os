-- S305: Create patient-media storage bucket for MMS images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-media',
  'patient-media',
  false,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: patients can view their own media
CREATE POLICY "patients_read_own_media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'patient-media'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.patients WHERE auth_user_id = auth.uid()
    )
  );

-- RLS: service role can insert (used by SMS webhook with admin client)
-- No policy needed — service role bypasses RLS
