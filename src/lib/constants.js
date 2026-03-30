// ── Species Data ──────────────────────────────────────────────────────────────
// days = nominal gestation; minDays/maxDays = range for due-date window when only turn-out date is recorded.
export const SPECIES = {
  Cattle:  { days: 283, minDays: 273, maxDays: 293, emoji: "🐄" },
  Bison:   { days: 283, minDays: 273, maxDays: 293, emoji: "🦬" },
  Chicken: { days: 21,  minDays: 20,  maxDays: 23,  emoji: "🐓" },
  Horse:   { days: 340, minDays: 330, maxDays: 350, emoji: "🐎" },
  Pig:     { days: 114, minDays: 109, maxDays: 120, emoji: "🐖" },
  Sheep:   { days: 147, minDays: 142, maxDays: 152, emoji: "🐑" },
  Goat:    { days: 150, minDays: 145, maxDays: 155, emoji: "🐐" },
  Llama:   { days: 350, minDays: 340, maxDays: 360, emoji: "🦙" },
  Alpaca:  { days: 345, minDays: 335, maxDays: 355, emoji: "🦙" },
  Donkey:  { days: 365, minDays: 355, maxDays: 375, emoji: "🫏" },
  Mule:    { days: 360, minDays: 350, maxDays: 370, emoji: "🐴" },
  Rabbit:  { days: 31,  minDays: 28,  maxDays: 35,  emoji: "🐇" },
  Dog:     { days: 63,  minDays: 58,  maxDays: 68,  emoji: "🐕" },
  Cat:     { days: 65,  minDays: 60,  maxDays: 70,  emoji: "🐈" },
};

/** All species can be assigned to pastures; mixed-species pastures allowed. */
export const PASTURE_SPECIES = Object.keys(SPECIES);

/** Species tabs for Register Animals form (Other = remaining species via dropdown). */
export const REGISTER_SPECIES_TABS = ["Cattle", "Horse", "Sheep", "Goat", "Pig", "Rabbit", "Chicken", "Other"];

/** Species options when "Other" tab is selected. */
export const REGISTER_OTHER_SPECIES = ["Bison", "Llama", "Alpaca", "Donkey", "Mule", "Dog", "Cat"];

/** Horse discipline options for registration. */
export const HORSE_DISCIPLINES = ["Barrel Racing", "Cutting", "Reining", "Trail", "Ranch Work", "Roping", "Dressage", "Jumping", "Other"];

/** Suggested equine vaccines for horse vaccination form. */
export const EQUINE_VACCINE_SUGGESTIONS = ["West Nile", "Rabies", "EEE/WEE", "Influenza", "Rhinopneumonitis", "Strangles"];

export const IMPORT_HL_FIELDS = ["Name", "Tag", "Species", "Breed", "Sex", "Date of Birth", "Color", "Purchase Date", "Notes"];

/** Cull flag reason options for "Mark for Cull" on animal profiles. */
export const CULL_REASONS = ["Prolapse", "Poor Mother", "Reproductive Issue", "Injury", "Age", "Temperament", "Low Production", "Other"];

export const TREATMENT_TYPES = ["Illness", "Injury", "Medication", "Deworming", "Vitamin/Supplement", "Vet Visit", "Other"];
/** Treatment type → expense category for auto-created expense when cost is entered */
export const TREATMENT_TYPE_TO_EXPENSE_CATEGORY = {
  "Vet Visit": "Veterinary",
  "Illness": "Veterinary",
  "Injury": "Veterinary",
  "Medication": "Medicine",
  "Deworming": "Medicine",
  "Vitamin/Supplement": "Medicine",
  "Other": "Medicine",
};

export const SPECIES_SEX_OPTIONS = {
  Cattle: ["Bull", "Cow", "Heifer", "Steer"],
  Bison: ["Bull", "Cow", "Heifer", "Steer"],
  Chicken: ["Rooster", "Hen", "Capon"],
  Horse: ["Stallion", "Mare", "Gelding"],
  Pig: ["Boar", "Sow", "Gilt", "Barrow"],
  Sheep: ["Ram", "Ewe", "Wether"],
  Goat: ["Buck", "Doe", "Wether"],
  Llama: ["Male", "Female"],
  Alpaca: ["Male", "Female"],
  Donkey: ["Jack", "Jenny", "Gelding"],
  Mule: ["Jack", "Jenny", "Gelding"],
  Rabbit: ["Buck", "Doe"],
  Dog: ["Male", "Female"],
  Cat: ["Male", "Female"],
};

export const SEX_TERM_GENDER = {
  Bull: "Male", Cow: "Female", Heifer: "Female", Steer: "Male", Calf: "Female",
  "Heifer Calf": "Female", "Bull Calf": "Male",
  Rooster: "Male", Hen: "Female", Pullet: "Female", Capon: "Male", Chick: "Female", Cockerel: "Male",
  Stallion: "Male", Mare: "Female", Filly: "Female", Colt: "Male", Gelding: "Male",
  "Filly Foal": "Female", "Colt Foal": "Male",
  Boar: "Male", Sow: "Female", Gilt: "Female", Barrow: "Male", Piglet: "Female",
  Ram: "Male", Ewe: "Female", "Ewe Lamb": "Female", "Ram Lamb": "Male", Wether: "Male", Lamb: "Female",
  Buck: "Male", Doe: "Female", Doeling: "Female", Buckling: "Male", Kid: "Female",
  Male: "Male", Female: "Female", Cria: "Female", "Female Cria": "Female", "Male Cria": "Male",
  Jack: "Male", Jenny: "Female", Foal: "Female",
  "Doe Kit": "Female", "Buck Kit": "Male", Kitten: "Female", Kit: "Female",
  "Female Puppy": "Female", "Male Puppy": "Male", "Female Kitten": "Female", "Male Kitten": "Male",
};

/** Young/offspring sex options only (no adult terms like Bull, Cow). Use in Add Offspring form. */
export const OFFSPRING_SEX_OPTIONS = {
  Cattle: ["Heifer Calf", "Bull Calf"],
  Bison: ["Heifer Calf", "Bull Calf"],
  Chicken: ["Pullet", "Cockerel"],
  Horse: ["Filly", "Colt"],
  Pig: ["Gilt", "Barrow"],
  Sheep: ["Ewe Lamb", "Ram Lamb"],
  Goat: ["Doeling", "Buckling"],
  Llama: ["Female Cria", "Male Cria"],
  Alpaca: ["Female Cria", "Male Cria"],
  Donkey: ["Filly Foal", "Colt Foal"],
  Mule: ["Filly Foal", "Colt Foal"],
  Rabbit: ["Doe Kit", "Buck Kit"],
  Dog: ["Female Puppy", "Male Puppy"],
  Cat: ["Female Kitten", "Male Kitten"],
};

/** Default young female term per species for new offspring. */
export const OFFSPRING_DEFAULT_SEX = {
  Cattle: "Heifer Calf",
  Bison: "Heifer Calf",
  Chicken: "Pullet",
  Horse: "Filly",
  Pig: "Gilt",
  Sheep: "Ewe Lamb",
  Goat: "Doeling",
  Llama: "Female Cria",
  Alpaca: "Female Cria",
  Rabbit: "Doe Kit",
  Donkey: "Filly Foal",
  Mule: "Filly Foal",
  Dog: "Female Puppy",
  Cat: "Female Kitten",
};

export const OFFSPRING_TERM_BY_SPECIES = {
  Cattle: "Calf",
  Bison: "Calf",
  Horse: "Foal",
  Pig: "Piglet",
  Sheep: "Lamb",
  Goat: "Kid",
  Llama: "Cria",
  Alpaca: "Cria",
  Donkey: "Foal",
  Mule: "Foal",
  Rabbit: "Kitten",
  Dog: "Puppy",
  Cat: "Kitten",
  Chicken: "Chick",
};

/** Heat cycle length in days (used for next expected heat). Cattle 21, Pigs 21, Sheep 17, Goats 21, Horses 21. */
export const HEAT_CYCLE_DAYS_BY_SPECIES = {
  Cattle: 21,
  Bison: 21,
  Pig: 21,
  Sheep: 17,
  Goat: 21,
  Horse: 21,
  Llama: 21,
  Alpaca: 21,
  Donkey: 21,
  Rabbit: 21,
  Chicken: 21,
  Dog: 21,
  Cat: 21,
};
export const HEAT_CYCLE_DAYS_DEFAULT = 21;

/** Default weaning age in days from birth (used when animal has no targetWeaningDate). */
export const WEANING_AGE_DAYS_BY_SPECIES = {
  Cattle: 210,
  Horse: 150,
  Pig: 28,
  Sheep: 60,
  Goat: 60,
  Rabbit: 35,
  Chicken: 35,
};
export const WEANING_AGE_DAYS_DEFAULT = 60;

export const BREEDING_MALE_SEX_TERMS = ["Bull", "Stallion", "Boar", "Ram", "Buck", "Rooster"];
export const BREEDING_MALE_TO_SPECIES = { Bull: "Cattle", Stallion: "Horse", Boar: "Pig", Ram: "Sheep", Buck: "Goat", Rooster: "Chicken" };

export const MOON_ICONS  = ["🌑","🌒","🌓","🌔","🌕","🌖","🌗","🌘"];
export const MOON_NAMES  = ["New Moon","Waxing Crescent","First Quarter","Waxing Gibbous","Full Moon","Waning Gibbous","Last Quarter","Waning Crescent"];

export const ALMANAC_WISDOM_QUOTES = [
  "The farmer is the only man in our economy who buys everything at retail, sells everything at wholesale, and pays the freight both ways. — John F. Kennedy",
  "A bad year for the farmer is a bad year for everybody. — Old farming proverb",
  "When the well is dry, we know the worth of water. — Benjamin Franklin",
  "He that by the plow would thrive, himself must either hold or drive. — Benjamin Franklin",
  "The cattle are lowing, the baby awakes — tend your herd and your blessings will multiply. — Old stockman proverb",
  "A calf born in the storm is tougher than one born in the sunshine. — Ranch proverb",
  "Count your calves before you count your profits. — Cattle rancher saying",
  "A fence that keeps cattle in also keeps trouble out. — Ranch proverb",
  "The best fertilizer is the farmer's shadow. — Old farming proverb",
  "Good grass makes good cattle. — Rancher proverb",
  "A wet spring and a dry summer makes a full barn. — Old weather proverb",
  "The morning hour has gold in its mouth. — German farming proverb",
  "A barn full of hay is better than a field full of promises. — Farming proverb",
  "Take care of the land and the land will take care of you. — Native American proverb",
  "Bulls may come and go but the herd goes on forever. — Old stockman saying",
  "The strength of the herd is the individual animal, and the strength of the individual animal is the herd. — Adapted ranch proverb",
  "He who sows courtesy reaps friendship, and he who plants kindness gathers love. — Saint Basil",
];

export const TIPS = {
  Winter: ["A ring round the moon foretells rain within three days.", "Feed extra grain when the cold bites deep.", "Trust the woolly bear — a thick coat means hard winter ahead.", "Count your stores twice; winter is long and forgiving of nothing.", ...ALMANAC_WISDOM_QUOTES],
  Spring: ["Plant above-ground crops under a waxing moon.", "A warm March foretells a cold May — do not thin your stores early.", "Spring lambs born at full moon tend to grow the sturdiest.", "Listen to the robins; when they return, the last frost is near.", ...ALMANAC_WISDOM_QUOTES],
  Summer: ["When cows lie down before noon, rain comes soon.", "Morning dew means a dry afternoon.", "Shear before the Dog Days — shorn sheep fare better in heat.", "Watch the swallows; low flight means rain before nightfall.", ...ALMANAC_WISDOM_QUOTES],
  Autumn: ["Mark your breeding dates carefully — spring arrives quickly.", "Stock the hayloft full; winter feeds the heaviest animals hardest.", "Thicker woolly bears predict harsher winters.", "Harvest when the moon wanes for longest storage.", ...ALMANAC_WISDOM_QUOTES],
};

export const CASTRATED_TERM_BY_SPECIES = {
  Cattle: "Steer",
  Chicken: "Capon",
  Pig: "Barrow",
  Sheep: "Wether",
  Goat: "Wether",
  Horse: "Gelding",
  Donkey: "Gelding",
  Mule: "Gelding",
};

/** Intact male sex term per species — used when reverting after castration record is deleted */
export const INTACT_MALE_TERM_BY_SPECIES = {
  Cattle: "Bull",
  Chicken: "Rooster",
  Pig: "Boar",
  Sheep: "Ram",
  Goat: "Buck",
  Horse: "Stallion",
  Donkey: "Jack",
  Mule: "Jack",
  Rabbit: "Buck",
};

export const FEMALE_MAIDEN_BY_SPECIES = {
  Cattle: "Heifer",
  Chicken: "Pullet",
  Pig: "Gilt",
  Sheep: "Ewe Lamb",
  Goat: "Doeling",
};

export const FEMALE_BRED_BY_SPECIES = {
  Cattle: "Cow",
  Chicken: "Hen",
  Pig: "Sow",
  Sheep: "Ewe",
  Goat: "Doe",
};

export const FEED_TYPES = ["Corn", "Silage", "Hay", "Mixed Ration", "Custom"];

// ── Global Styles ─────────────────────────────────────────────────────────────
export const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Source+Sans+3:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --green:    #1B3A2B;
    --green2:   #254D39;
    --green3:   #2E6347;
    --brass:    #C9952A;
    --brass2:   #A67A1E;
    --brass3:   #F0C060;
    --cream:    #F7F2E8;
    --cream2:   #EDE6D6;
    --cream3:   #E0D5C0;
    --ink:      #141A14;
    --ink2:     #2C3A2C;
    --muted:    #7A8C7A;
    --danger:   #8B2020;
    --danger2:  #C0392B;
    --white:    #FFFFFF;
    --shadow:   0 1px 3px rgba(20,26,20,0.10), 0 4px 12px rgba(20,26,20,0.06);
    --shadow2:  0 2px 8px rgba(20,26,20,0.14), 0 8px 24px rgba(20,26,20,0.08);
    --radius:   6px;
    --radius2:  10px;
  }

  body {
    background: var(--cream);
    color: var(--ink);
    font-family: 'Source Sans 3', sans-serif;
    font-size: 15px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  button { cursor: pointer; font-family: 'Source Sans 3', sans-serif; }
  input, select, textarea { font-family: 'Source Sans 3', sans-serif; }

  /* Date/time inputs: single-tap to open picker on mobile, no double-tap */
  input[type="date"],
  input[type="datetime-local"],
  input[type="time"] {
    touch-action: manipulation;
    -webkit-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    min-height: 44px;
  }

  .hl-fade-in { animation: fadeIn 0.3s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--cream2); }
  ::-webkit-scrollbar-thumb { background: var(--cream3); border-radius: 3px; }

  /* Print: hide nav and interactive UI, show only print-only content */
  .print-only { display: none !important; }
  @media print {
    .no-print { display: none !important; }
    .print-only { display: block !important; }
    body { background: #fff; }
    .hl-print-root { background: #fff; color: #141A14; padding: 0; max-width: none; }
  }
`;

// ── Settings / App ─────────────────────────────────────────────────────────────
export const TAB_OPTIONS = [
  { id: "dashboard", label: "Dashboard", icon: "⊞" },
  { id: "animals", label: "Animals", icon: "🐄" },
  { id: "gestation", label: "Gestation", icon: "📅" },
  { id: "feeder", label: "Feeder Program", icon: "🌾" },
  { id: "pastures", label: "Pastures", icon: "🟩" },
  { id: "notes", label: "Journal", icon: "📖" },
  { id: "expenses", label: "Expenses", icon: "💰" },
  { id: "sales", label: "Sales", icon: "📋" },
  { id: "tasks", label: "Tasks", icon: "✓" },
  { id: "weaning", label: "Weaning", icon: "🥛" },
  { id: "hay", label: "Hay & Forage", icon: "🌾" },
];

export const USER_DATA_KEYS = ["animals", "gestations", "notes", "offspring", "settings", "feederPrograms", "pastures", "pastureFeedLogs", "expenses", "loadSales", "tasks", "contacts"];
export const GUEST_STORAGE_KEY = "herd_ledger_guest_data";
export const GUEST_USER = { id: "guest", isGuest: true };

export const DEFAULT_TAB_VISIBILITY = { dashboard: true, animals: true, gestation: true, notes: true, feeder: false, pastures: true, expenses: true, sales: true, tasks: true, weaning: true, hay: true };
export const TASK_CATEGORIES = ["Feeding", "Vaccination", "Breeding", "Castration", "Pasture Move", "Weaning", "Vet Visit", "Treatment", "General", "Other"];
export const TASK_PRIORITIES = ["High", "Medium", "Low"];
export const RECURRING_OPTIONS = ["One time", "Daily", "Weekly", "Monthly"];
export const EXPENSE_CATEGORIES = ["Feed", "Veterinary", "Medicine", "Equipment", "Supplies", "Labor", "Fuel", "Land/Lease", "Other"];
/** Horse health section → expense category for auto-created expenses. */
export const HORSE_HEALTH_EXPENSE_CATEGORY = { vet: "Veterinary", farrier: "Supplies", worming: "Medicine", dental: "Veterinary", supplement: "Supplies" };
/** Vaccine route options for protocols and vaccination records. */
export const VACCINE_ROUTES = [
  "IM (Intramuscular)",
  "SQ (Subcutaneous)",
  "IV (Intravenous)",
  "Pour On",
  "Oral",
  "Topical",
  "Intranasal",
  "Ear Tag",
  "Other",
];

export const DEFAULT_SETTINGS = {
  farmName: "",
  ownerName: "",
  defaultSpecies: "Cattle",
  tabVisibility: { ...DEFAULT_TAB_VISIBILITY },
  animalsViewMode: "tile",
  vaccinationProtocols: [],
};
