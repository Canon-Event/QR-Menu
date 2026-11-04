-- Run after phase-ai-menu.sql for existing installations.
-- Expands the style allowlist; existing styles and menus are preserved.
begin;

create or replace function public.ai_menu_valid_style(p_style jsonb)
returns boolean language sql immutable set search_path=public,pg_temp as $$
  select coalesce(jsonb_typeof(p_style)='object' and p_style->>'font' in ('manrope','poppins','playfair')
    and p_style->>'density' in ('compact','comfortable')
    and p_style->>'accent' ~ '^#[a-fA-F0-9]{6}$' and p_style->>'background' ~ '^#[a-fA-F0-9]{6}$'
    and p_style->>'text' ~ '^#[a-fA-F0-9]{6}$'
    and (not (p_style ? 'layout') or p_style->>'layout' in ('editorial','cards'))
    and (not (p_style ? 'backdrop') or p_style->>'backdrop' in ('glow','dots','grid','none'))
    and (not (p_style ? 'motion') or p_style->>'motion' in ('none','gentle'))
    and (not (p_style ? 'showImages') or jsonb_typeof(p_style->'showImages')='boolean')
    and (not (p_style ? 'tagline') or (jsonb_typeof(p_style->'tagline')='string'
      and length(p_style->>'tagline')<=100 and p_style->>'tagline' !~ '[[:cntrl:]]'))
    and (not (p_style ? 'heroImage') or (jsonb_typeof(p_style->'heroImage')='string'
      and length(p_style->>'heroImage')<=2048 and (
        p_style->>'heroImage' in ('','/templates/green-bistro/cover-food.jpg','/templates/green-bistro/pasta.jpg','/templates/green-bistro/burrata.jpg')
        or p_style->>'heroImage' ~ '^https://[^/@[:space:][:cntrl:]]+(/[^[:space:][:cntrl:]]*)?$')))
    and p_style - array['font','density','accent','background','text','layout','backdrop','motion','showImages','tagline','heroImage'] = '{}'::jsonb,false)
$$;

revoke all on function public.ai_menu_valid_style(jsonb) from public,anon,authenticated;
commit;
