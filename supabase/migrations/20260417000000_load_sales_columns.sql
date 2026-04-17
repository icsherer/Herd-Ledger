alter table load_sales add column if not exists animal_ids jsonb default '[]';
alter table load_sales add column if not exists average_weight numeric;
alter table load_sales add column if not exists price_type text;
alter table load_sales add column if not exists price_value numeric;
alter table load_sales add column if not exists notes text;
