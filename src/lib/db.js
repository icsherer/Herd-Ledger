// src/lib/db.js
import { supabase } from '../supabase';
import { DEFAULT_SETTINGS, DEFAULT_TAB_VISIBILITY } from './constants';

// ── LOAD ──────────────────────────────────────────────────────────────────────

export async function loadAllData(userId) {
  const { data, error } = await supabase.rpc('get_user_data', { p_user_id: userId });
  
  if (error) {
    console.error('[DB] RPC failed, falling back to parallel queries:', error);
    return loadAllDataFallback(userId);
  }

  const animalsRows       = data?.animals || [];
  const tasksRows         = data?.tasks || [];
  const gestRows          = data?.gestations || [];
  const contactRows       = data?.contacts || [];
  const expenseRows       = data?.expenses || [];
  const feederRows        = data?.feeder_programs || [];
  const salesRows         = data?.load_sales || [];
  const notesRows         = data?.notes || [];
  const pastureRows       = data?.pastures || [];
  const feedLogRows       = data?.pasture_feed_logs || [];
  const settingsRow       = data?.user_settings;
  const offspringRawData  = data?.offspring;

  return buildResult({
    animalsRows, tasksRows, gestRows, contactRows, expenseRows,
    feederRows, salesRows, notesRows, pastureRows, feedLogRows,
    settingsRow, offspringRawData,
  });
}

async function loadAllDataFallback(userId) {
  const [
    { data: animalsRows },
    { data: tasksRows },
    { data: gestRows },
    { data: contactRows },
    { data: expenseRows },
    { data: feederRows },
    { data: salesRows },
    { data: notesRows },
    { data: pastureRows },
    { data: feedLogRows },
    { data: settingsRow },
    { data: offspringRaw },
  ] = await Promise.all([
    supabase.from('animals').select('id,user_id,name,tag,species,breed,sex,dob,notes,extra_data,updated_at').eq('user_id', userId),
    supabase.from('tasks').select('*').eq('user_id', userId),
    supabase.from('gestations').select('*').eq('user_id', userId),
    supabase.from('contacts').select('*').eq('user_id', userId),
    supabase.from('expenses').select('*').eq('user_id', userId),
    supabase.from('feeder_programs').select('*').eq('user_id', userId),
    supabase.from('load_sales').select('*').eq('user_id', userId),
    supabase.from('notes').select('*').eq('user_id', userId),
    supabase.from('pastures').select('*').eq('user_id', userId),
    supabase.from('pasture_feed_logs').select('*').eq('user_id', userId),
    supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('user_data').select('data').eq('user_id', userId).eq('key', 'offspring').maybeSingle(),
  ]);
  return buildResult({
    animalsRows, tasksRows, gestRows, contactRows, expenseRows,
    feederRows, salesRows, notesRows, pastureRows, feedLogRows,
    settingsRow, offspringRawData: offspringRaw?.data,
  });
}

function buildResult({ animalsRows, tasksRows, gestRows, contactRows, expenseRows,
  feederRows, salesRows, notesRows, pastureRows, feedLogRows, settingsRow, offspringRawData }) {

  const animals = (animalsRows || []).map(r => ({
    ...(r.extra_data || {}),
    id: r.id, name: r.name, tag: r.tag, species: r.species,
    breed: r.breed, sex: r.sex, dob: r.dob, notes: r.notes,
  }));

  const tasks = (tasksRows || []).map(r => ({
    id: r.id, name: r.name, dueDate: r.due_date, dueTime: r.due_time,
    animalId: r.animal_id, category: r.category, priority: r.priority,
    recurring: r.recurring, pastureName: r.pasture_name, completed: r.completed,
  }));

  const gestations = (gestRows || []).map(r => {
    const g = {
      id: r.id, animalId: r.animal_id, sire: r.sire, notes: r.notes,
      status: r.status, dueDate: r.due_date, breedingDate: r.breeding_date,
      gestationDays: r.gestation_days, deliveredAt: r.delivered_at,
      createdAt: r.created_at_src,
      dueDateStart: r.due_date_start || null,
      dueDateEnd: r.due_date_end || null,
      breedingDateEnd: r.breeding_date_end || null,
      runningWithBull: r.running_with_bull || false,
      sireAnimalId: r.sire_animal_id || null,
    };
    const hasCalf = r.calf_notes != null || r.calf_stillborn != null ||
                    r.calf_birth_weight != null || r.calf_animal_id != null ||
                    r.calf_sex != null;
    if (hasCalf) {
      g.calf = {
        notes: r.calf_notes, stillborn: r.calf_stillborn,
        recordedAt: r.calf_recorded_at, birthWeight: r.calf_birth_weight,
        offspringCount: r.calf_offspring_count, sex: r.calf_sex,
        tag: r.calf_tag, name: r.calf_name, animalId: r.calf_animal_id,
      };
    }
    return g;
  });

  const contacts = (contactRows || []).map(r => ({
    id: r.id, name: r.name, email: r.email, phone: r.phone,
    ranchCompany: r.ranch_company, notes: r.notes,
  }));

  const expenses = (expenseRows || []).map(r => ({
    id: r.id, date: r.date, amount: r.amount,
    animalId: r.animal_id, category: r.category, description: r.description,
  }));

  const feederPrograms = (feederRows || []).map(r => ({
    id: r.id, penName: r.pen_name, animalId: r.animal_id, feedType: r.feed_type,
    startDate: r.start_date, adg: r.adg, feedConversionRatio: r.feed_conversion_ratio,
  }));

  const loadSales = (salesRows || []).map(r => ({
    id: r.id, date: r.date, species: r.species, buyerName: r.buyer_name,
    headCount: r.head_count, priceType: r.price_type, totalAmount: r.total_amount,
  }));

  const notes = (notesRows || []).map(r => ({
    id: r.id, title: r.title, body: r.body, date: r.date,
    animalId: r.animal_id, movementId: r.movement_id,
  }));

  const pastures = (pastureRows || []).map(r => r.name);

  const pastureFeedLogs = {};
  for (const r of (feedLogRows || [])) {
    if (!pastureFeedLogs[r.pasture_name]) pastureFeedLogs[r.pasture_name] = [];
    pastureFeedLogs[r.pasture_name].push({
      id: r.id, cost: r.cost, date: r.date, feedType: r.feed_type,
      quantity: r.quantity, expenseId: r.expense_id,
    });
  }

  const settings = settingsRow ? {
    ...DEFAULT_SETTINGS,
    farmName: settingsRow.farm_name ?? '',
    ownerName: settingsRow.owner_name ?? '',
    defaultSpecies: settingsRow.default_species ?? 'Cattle',
    tabVisibility: settingsRow.tab_visibility ?? { ...DEFAULT_TAB_VISIBILITY },
    farmLogo: settingsRow.farm_logo ?? null,
    animalsViewMode: settingsRow.animals_view_mode ?? 'tile',
    vaccinationProtocols: settingsRow.vaccination_protocols ?? [],
  } : { ...DEFAULT_SETTINGS };

  const offspring = offspringRawData && typeof offspringRawData === 'object'
    ? offspringRawData : {};

  return {
    animals, tasks, gestations, contacts, expenses, feederPrograms,
    loadSales, notes, pastures, pastureFeedLogs, settings, offspring,
  };
}


// ── SAVE HELPERS ──────────────────────────────────────────────────────────────

async function syncRows(table, userId, rows, idField = 'id') {
  if (rows.length === 0) return;

  // Chunk upserts to avoid statement timeouts on large tables
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: idField });
    if (error) { console.error(`[DB] ${table} upsert error:`, error); return; }
  }

  // Delete rows that no longer exist in current state
  const { data: existing } = await supabase
    .from(table).select(idField).eq('user_id', userId);
  const currentIds = new Set(rows.map(r => r[idField]));
  const toDelete = (existing || []).map(r => r[idField]).filter(id => !currentIds.has(id));
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from(table).delete().eq('user_id', userId).in(idField, toDelete);
    if (delErr) console.error(`[DB] ${table} delete error:`, delErr);
  }
}

export async function persistAnimals(userId, animals) {
  const rows = animals.map(a => {
    const { id, name, tag, species, breed, sex, dob, notes, ...rest } = a;
    // Strip photo from extra_data — too large to upsert on every save
    const { photo, ...restNoPhoto } = rest;
    return {
      id, user_id: userId, name: name ?? null, tag: tag ?? null,
      species: species ?? null, breed: breed ?? null, sex: sex ?? null,
      dob: dob || null, notes: notes ?? null,
      extra_data: Object.keys(restNoPhoto).length > 0 ? restNoPhoto : null,
      updated_at: new Date().toISOString(),
    };
  });
  await syncRows('animals', userId, rows);
}

export async function persistTasks(userId, tasks) {
  const rows = tasks.map(t => ({
    id: t.id, user_id: userId, name: t.name ?? null,
    due_date: t.dueDate || null, due_time: t.dueTime ?? null,
    animal_id: t.animalId ?? null, category: t.category ?? null,
    priority: t.priority ?? null, recurring: t.recurring ?? null,
    pasture_name: t.pastureName ?? null, completed: t.completed ?? false,
    updated_at: new Date().toISOString(),
  }));
  await syncRows('tasks', userId, rows);
}

export async function persistGestations(userId, gestations) {
  const rows = gestations.map(g => ({
    id: g.id, user_id: userId, animal_id: g.animalId ?? null,
    sire: g.sire ?? null, notes: g.notes ?? null, status: g.status ?? null,
    due_date: g.dueDate || null, breeding_date: g.breedingDate || null,
    due_date_start: g.dueDateStart || null,
    due_date_end: g.dueDateEnd || null,
    breeding_date_end: g.breedingDateEnd || null,
    running_with_bull: g.runningWithBull || false,
    sire_animal_id: g.sireAnimalId || null,
    gestation_days: g.gestationDays ?? null, delivered_at: g.deliveredAt ?? null,
    created_at_src: g.createdAt ?? null,
    calf_notes: g.calf?.notes ?? null,
    calf_stillborn: g.calf?.stillborn ?? null,
    calf_recorded_at: g.calf?.recordedAt ?? null,
    calf_birth_weight: g.calf?.birthWeight ?? null,
    calf_offspring_count: g.calf?.offspringCount ?? null,
    calf_sex: g.calf?.sex ?? null,
    calf_tag: g.calf?.tag ?? null,
    calf_name: g.calf?.name ?? null,
    calf_animal_id: g.calf?.animalId ?? null,
    updated_at: new Date().toISOString(),
  }));
  await syncRows('gestations', userId, rows);
}

export async function persistContacts(userId, contacts) {
  const rows = contacts.map(c => ({
    id: c.id, user_id: userId, name: c.name ?? null, email: c.email ?? null,
    phone: c.phone ?? null, ranch_company: c.ranchCompany ?? null, notes: c.notes ?? null,
    updated_at: new Date().toISOString(),
  }));
  await syncRows('contacts', userId, rows);
}

export async function persistExpenses(userId, expenses) {
  const rows = expenses.map(e => ({
    id: e.id, user_id: userId, date: e.date || null, amount: e.amount ?? null,
    animal_id: e.animalId ?? null, category: e.category ?? null,
    description: e.description ?? null, updated_at: new Date().toISOString(),
  }));
  await syncRows('expenses', userId, rows);
}

export async function persistFeederPrograms(userId, feederPrograms) {
  const rows = feederPrograms.map(f => ({
    id: f.id, user_id: userId, pen_name: f.penName ?? null,
    animal_id: f.animalId ?? null, feed_type: f.feedType ?? null,
    start_date: f.startDate || null, adg: f.adg ?? null,
    feed_conversion_ratio: f.feedConversionRatio ?? null,
    updated_at: new Date().toISOString(),
  }));
  await syncRows('feeder_programs', userId, rows);
}

export async function persistLoadSales(userId, loadSales) {
  const rows = loadSales.map(s => ({
    id: s.id, user_id: userId, date: s.date || null, species: s.species ?? null,
    buyer_name: s.buyerName ?? null, head_count: s.headCount ?? null,
    price_type: s.priceType ?? null, total_amount: s.totalAmount ?? null,
    updated_at: new Date().toISOString(),
  }));
  await syncRows('load_sales', userId, rows);
}

export async function persistNotes(userId, notes) {
  const rows = notes.map(n => ({
    id: n.id, user_id: userId, title: n.title ?? null, body: n.body ?? null,
    date: n.date || null, animal_id: n.animalId ?? null,
    movement_id: n.movementId ?? null, updated_at: new Date().toISOString(),
  }));
  await syncRows('notes', userId, rows);
}

export async function persistPastures(userId, pastures) {
  const rows = pastures.map(name => ({
    id: `${userId}-${name}`, user_id: userId, name,
    updated_at: new Date().toISOString(),
  }));
  await syncRows('pastures', userId, rows);
}

export async function persistPastureFeedLogs(userId, pastureFeedLogs) {
  const rows = [];
  for (const [pastureName, logs] of Object.entries(pastureFeedLogs)) {
    if (!Array.isArray(logs)) continue;
    for (const l of logs) {
      rows.push({
        id: l.id, user_id: userId, pasture_name: pastureName,
        cost: l.cost ?? null, date: l.date || null, feed_type: l.feedType ?? null,
        quantity: l.quantity ?? null, expense_id: l.expenseId ?? null,
        updated_at: new Date().toISOString(),
      });
    }
  }
  await syncRows('pasture_feed_logs', userId, rows);
}

export async function persistSettings(userId, settings) {
  const { error } = await supabase.from('user_settings').upsert({
    user_id: userId,
    farm_name: settings.farmName ?? '',
    owner_name: settings.ownerName ?? '',
    default_species: settings.defaultSpecies ?? 'Cattle',
    tab_visibility: settings.tabVisibility ?? {},
    farm_logo: settings.farmLogo ?? null,
    animals_view_mode: settings.animalsViewMode ?? 'tile',
    vaccination_protocols: settings.vaccinationProtocols ?? [],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) console.error('[DB] user_settings upsert error:', error);
}

export async function saveBillOfSale(supabase, userId, data) {
  const { data: bos, error } = await supabase.from('bill_of_sales').insert({
    user_id: userId,
    ...data,
  }).select().single();
  if (error) throw error;
  return bos;
}

export async function loadBillsOfSale(supabase, userId) {
  const { data, error } = await supabase
    .from('bill_of_sales')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function persistOffspring(userId, offspring) {
  const { error } = await supabase.from('user_data').upsert(
    { user_id: userId, key: 'offspring', data: offspring },
    { onConflict: 'user_id,key' }
  );
  if (error) console.error('[DB] offspring upsert error:', error);
}

// ── HAY INVENTORY ─────────────────────────────────────────────────────────────
//
// Run this SQL in Supabase to create the required tables:
//
// create table hay_inventory_lots (
//   id uuid primary key default gen_random_uuid(),
//   user_id uuid not null references auth.users(id) on delete cascade,
//   type text not null default 'Hay',
//   bale_type text not null default 'square',
//   quantity numeric not null default 0,
//   weight_per_bale_lbs numeric not null default 50,
//   cost_per_bale numeric not null default 0,
//   pasture_id text,
//   notes text,
//   created_at timestamptz not null default now()
// );
// alter table hay_inventory_lots enable row level security;
// create policy "Users manage own hay lots" on hay_inventory_lots
//   using (auth.uid() = user_id) with check (auth.uid() = user_id);
//
// create table hay_inventory_logs (
//   id uuid primary key default gen_random_uuid(),
//   user_id uuid not null references auth.users(id) on delete cascade,
//   lot_id uuid references hay_inventory_lots(id) on delete set null,
//   action text not null,
//   quantity numeric not null,
//   date date,
//   pasture_id text,
//   notes text,
//   created_at timestamptz not null default now()
// );
// alter table hay_inventory_logs enable row level security;
// create policy "Users manage own hay logs" on hay_inventory_logs
//   using (auth.uid() = user_id) with check (auth.uid() = user_id);

export async function loadHayInventory(userId) {
  const [{ data: lots, error: e1 }, { data: logs, error: e2 }] = await Promise.all([
    supabase.from('hay_inventory_lots').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('hay_inventory_logs').select('*').eq('user_id', userId).order('date', { ascending: false }),
  ]);
  if (e1) console.error('[DB] hay_inventory_lots load error:', e1);
  if (e2) console.error('[DB] hay_inventory_logs load error:', e2);
  return {
    hayLots: (lots || []).map(r => ({
      id: r.id, type: r.type, baleType: r.bale_type,
      quantity: Number(r.quantity), weightPerBale: Number(r.weight_per_bale_lbs),
      costPerBale: Number(r.cost_per_bale), pastureId: r.pasture_id || null,
      notes: r.notes || null, createdAt: r.created_at,
    })),
    hayLogs: (logs || []).map(r => ({
      id: r.id, lotId: r.lot_id, action: r.action, quantity: Number(r.quantity),
      date: r.date, pastureId: r.pasture_id || null, notes: r.notes || null,
      createdAt: r.created_at,
    })),
  };
}

export async function saveHayLot(userId, lot) {
  const { error } = await supabase.from('hay_inventory_lots').upsert({
    id: lot.id, user_id: userId, type: lot.type, bale_type: lot.baleType,
    quantity: lot.quantity, weight_per_bale_lbs: lot.weightPerBale,
    cost_per_bale: lot.costPerBale, pasture_id: lot.pastureId || null,
    notes: lot.notes || null,
  }, { onConflict: 'id' });
  if (error) console.error('[DB] saveHayLot error:', error);
}

export async function logHayTransaction(userId, log) {
  const { error } = await supabase.from('hay_inventory_logs').insert({
    id: log.id, user_id: userId, lot_id: log.lotId, action: log.action,
    quantity: log.quantity, date: log.date || null,
    pasture_id: log.pastureId || null, notes: log.notes || null,
  });
  if (error) console.error('[DB] logHayTransaction error:', error);
}

export async function deleteHayLot(userId, lotId) {
  const { error } = await supabase.from('hay_inventory_lots').delete()
    .eq('id', lotId).eq('user_id', userId);
  if (error) console.error('[DB] deleteHayLot error:', error);
}

export async function loadSubscription(userId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, grandfathered, plan')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[DB] loadSubscription error:', error);
    return { status: 'free', grandfathered: false, plan: null };
  }
  return {
    status: data?.status ?? 'free',
    grandfathered: data?.grandfathered ?? false,
    plan: data?.plan ?? null,
  };
}