-- Keep fulfill_scrape_requests callable from scrape-request-notify (service_role).
begin;
grant execute on function public.fulfill_scrape_requests() to service_role;
notify pgrst, 'reload schema';
commit;
