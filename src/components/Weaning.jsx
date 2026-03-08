import { getExpectedWeaningDate, getAnimalName, fmt, getAgeInMonths } from "../lib/helpers.js";
import { SPECIES } from "../lib/constants.js";
import { Card, Btn, SectionTitle } from "./ui.jsx";

export default function Weaning({ animals, setAnimals, offspring, setOffspring, setViewingAnimal, setTab }) {
  const todayStr = new Date().toISOString().split("T")[0];

  const activeAnimals = (animals || []).filter(a => !a.deceased && !a.sale);
  const notWeanedWithDate = activeAnimals
    .filter(a => !a.weaningDate)
    .map(a => ({ animal: a, expectedDate: getExpectedWeaningDate(a) }))
    .filter(({ expectedDate }) => expectedDate != null);

  const upcoming = notWeanedWithDate
    .filter(({ expectedDate }) => expectedDate >= todayStr)
    .sort((a, b) => (a.expectedDate || "").localeCompare(b.expectedDate || ""));

  const overdue = notWeanedWithDate
    .filter(({ expectedDate }) => expectedDate < todayStr)
    .sort((a, b) => (b.expectedDate || "").localeCompare(a.expectedDate || ""));

  const past = (animals || [])
    .filter(a => a.weaningDate && (getAgeInMonths(a.dob) == null || getAgeInMonths(a.dob) < 12))
    .sort((a, b) => (b.weaningDate || "").localeCompare(a.weaningDate || ""));

  function markAsWeaned(animal, dateStr = todayStr) {
    setAnimals(prev =>
      prev.map(a => (a.id === animal.id ? { ...a, weaningDate: dateStr } : a))
    );
    if (setOffspring && offspring) {
      const motherId = animal.damId ?? animal.motherId;
      if (motherId && offspring[motherId]) {
        setOffspring(prev => {
          const base = { ...prev };
          const list = (base[motherId] || []).map(c =>
            c.id === animal.id ? { ...c, weaningDate: dateStr } : c
          );
          return { ...base, [motherId]: list };
        });
      }
    }
  }

  function getMotherName(animal) {
    const damId = animal?.damId ?? animal?.motherId;
    if (!damId || !animals?.length) return null;
    const mother = animals.find(a => a.id === damId);
    return mother ? getAnimalName(mother) : null;
  }

  return (
    <div className="hl-page hl-fade-in">
      <SectionTitle>Weaning</SectionTitle>
      <p style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "24px" }}>
        All animals with a date of birth get a suggested weaning date (by species). Adjust the target date on each animal&apos;s profile; mark as weaned when done.
      </p>

      {/* Overdue Weanings */}
      {overdue.length > 0 && (
        <Card style={{ padding: "0", marginBottom: "24px", overflow: "hidden", borderLeft: "4px solid var(--danger2)" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--cream2)", fontSize: "14px", fontWeight: 600, color: "var(--danger2)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
            Overdue Weanings
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {overdue.map(({ animal: a, expectedDate }) => (
              <div
                key={a.id}
                style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid var(--cream2)",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span>{SPECIES[a.species]?.emoji}</span>
                    <span style={{ fontWeight: 600 }}>{getAnimalName(a)}</span>
                    {a.tag && <span style={{ color: "var(--muted)", fontSize: "13px" }}>#{a.tag}</span>}
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                    {a.species || "—"} · DOB {a.dob ? fmt(a.dob) : "—"}
                    {getMotherName(a) && ` · Dam ${getMotherName(a)}`}
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--danger2)", fontWeight: 600, marginTop: "4px" }}>
                    Weaning date was {fmt(expectedDate)}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {setViewingAnimal && setTab && (
                    <Btn size="sm" variant="ghost" onClick={() => { setViewingAnimal(a); setTab("animals"); }}>View</Btn>
                  )}
                  <Btn size="sm" onClick={() => markAsWeaned(a)}>Mark as Weaned</Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Upcoming Weanings */}
      <Card style={{ padding: "0", marginBottom: "24px", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--cream2)", fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
          Upcoming Weanings
        </div>
        {upcoming.length === 0 ? (
          <div style={{ padding: "24px", color: "var(--muted)", fontSize: "14px" }}>No animals with a weaning date in the future.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {upcoming.map(({ animal: a, expectedDate }) => (
              <div
                key={a.id}
                style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid var(--cream2)",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span>{SPECIES[a.species]?.emoji}</span>
                    <span style={{ fontWeight: 600 }}>{getAnimalName(a)}</span>
                    {a.tag && <span style={{ color: "var(--muted)", fontSize: "13px" }}>#{a.tag}</span>}
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                    {a.species || "—"} · DOB {a.dob ? fmt(a.dob) : "—"}
                    {getMotherName(a) && ` · Dam ${getMotherName(a)}`}
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--green)", fontWeight: 600, marginTop: "4px" }}>
                    Weaning date: {fmt(expectedDate)}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {setViewingAnimal && setTab && (
                    <Btn size="sm" variant="ghost" onClick={() => { setViewingAnimal(a); setTab("animals"); }}>View</Btn>
                  )}
                  <Btn size="sm" onClick={() => markAsWeaned(a)}>Mark as Weaned</Btn>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Past Weanings */}
      <Card style={{ padding: "0", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--cream2)", fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
          Past Weanings
        </div>
        {past.length === 0 ? (
          <div style={{ padding: "24px", color: "var(--muted)", fontSize: "14px" }}>No weaned animals recorded yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {past.map(a => (
              <div
                key={a.id}
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid var(--cream2)",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span>{SPECIES[a.species]?.emoji}</span>
                <span style={{ fontWeight: 600 }}>{getAnimalName(a)}</span>
                {a.tag && <span style={{ color: "var(--muted)", fontSize: "13px" }}>#{a.tag}</span>}
                <span style={{ color: "var(--muted)", fontSize: "13px" }}>{a.species} · DOB {a.dob ? fmt(a.dob) : "—"}</span>
                {getMotherName(a) && <span style={{ color: "var(--muted)", fontSize: "13px" }}>· Dam {getMotherName(a)}</span>}
                <span style={{ marginLeft: "auto", fontSize: "13px", color: "var(--green)" }}>Weaned {a.weaningDate ? fmt(a.weaningDate) : "—"}</span>
                {setViewingAnimal && setTab && (
                  <Btn size="sm" variant="ghost" onClick={() => { setViewingAnimal(a); setTab("animals"); }}>View</Btn>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
