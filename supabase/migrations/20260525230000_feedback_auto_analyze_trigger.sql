-- Wire analyze-feedback edge function to fire on every new feedback insert.
-- The existing on_feedback_insert trigger already calls notify-feedback (email).
-- This adds a second trigger using the same supabase_functions.http_request pattern.

drop trigger if exists on_feedback_insert_analyze on public.feedback;

create trigger on_feedback_insert_analyze
  after insert on public.feedback
  for each row
  execute function supabase_functions.http_request(
    'https://bzmvlraziqevqdyotvgy.supabase.co/functions/v1/analyze-feedback',
    'POST',
    '{"Content-type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bXZscmF6aXFldnFkeW90dmd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDQwNTUyNSwiZXhwIjoyMDg5OTgxNTI1fQ.YygDyd0FIRvsUQ0xI2K15311-9DvXDDmdqD96cU_4QE"}',
    '{}',
    '5000'
  );
