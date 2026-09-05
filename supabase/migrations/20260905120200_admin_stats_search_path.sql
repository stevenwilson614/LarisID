-- Harden the latest admin_stats() body (20260825160000) without rewriting it.

alter function public.admin_stats() set search_path = public;
