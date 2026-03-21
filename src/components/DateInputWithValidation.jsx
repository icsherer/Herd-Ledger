import { Input } from "./ui.jsx";
import {
  isValidDate,
  todayLocalISODate,
  fixBreedingDueTwoDigitYear,
  DATE_WARN_INVALID,
  DATE_WARN_FUTURE_BIRTH,
} from "../lib/dateUtils.js";

export default function DateInputWithValidation({
  label,
  value,
  onValueChange,
  breedingDueTwoDigitYear,
  birthDate,
  style,
  ...rest
}) {
  const raw = value ?? "";
  const t = String(raw).trim();
  const invalid = t && !isValidDate(raw);
  const futureBirth = Boolean(birthDate && t && isValidDate(raw) && t > todayLocalISODate());
  return (
    <div style={style}>
      <Input
        label={label}
        type="date"
        value={value ?? ""}
        onChange={e => {
          let v = e.target.value;
          if (breedingDueTwoDigitYear) v = fixBreedingDueTwoDigitYear(v);
          onValueChange(v);
        }}
        {...rest}
      />
      {(invalid || futureBirth) && (
        <div style={{ fontSize: "12px", color: "#c0392b", marginTop: "4px" }}>
          {invalid ? DATE_WARN_INVALID : DATE_WARN_FUTURE_BIRTH}
        </div>
      )}
    </div>
  );
}
