alter table restaurants add column if not exists description text;
alter table restaurants add column if not exists address text;
alter table restaurants add column if not exists phone text;
alter table restaurants add column if not exists currency text not null default 'INR';
alter table restaurants add column if not exists qr_foreground text not null default '#000000';
alter table restaurants add column if not exists qr_background text not null default '#ffffff';
alter table restaurants add column if not exists qr_margin int not null default 2;
alter table restaurants add column if not exists template_settings jsonb not null default '{}'::jsonb;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('restaurant-logos','restaurant-logos',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=2097152,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "owners_upload_restaurant_logos" on storage.objects;
create policy "owners_upload_restaurant_logos" on storage.objects for insert to authenticated with check (
  bucket_id='restaurant-logos' and (storage.foldername(name))[1] in (select id::text from restaurants where owner_id=auth.uid())
);
drop policy if exists "owners_update_restaurant_logos" on storage.objects;
create policy "owners_update_restaurant_logos" on storage.objects for update to authenticated using (
  bucket_id='restaurant-logos' and (storage.foldername(name))[1] in (select id::text from restaurants where owner_id=auth.uid())
) with check (
  bucket_id='restaurant-logos' and (storage.foldername(name))[1] in (select id::text from restaurants where owner_id=auth.uid())
);

alter table restaurants drop constraint if exists restaurants_currency_check;
alter table restaurants add constraint restaurants_currency_check check (currency in ('INR','USD','EUR','GBP','AED'));
alter table restaurants drop constraint if exists restaurants_qr_foreground_check;
alter table restaurants add constraint restaurants_qr_foreground_check check (qr_foreground ~ '^#[0-9a-fA-F]{6}$');
alter table restaurants drop constraint if exists restaurants_qr_background_check;
alter table restaurants add constraint restaurants_qr_background_check check (qr_background ~ '^#[0-9a-fA-F]{6}$');
alter table restaurants drop constraint if exists restaurants_qr_margin_check;
alter table restaurants add constraint restaurants_qr_margin_check check (qr_margin between 0 and 8);
