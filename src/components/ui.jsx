function var2(name) { return `var(--${name})`; }

export function Card({ children, style = {}, className = "", ...rest }) {
  return (
    <div className={`hl-card ${className}`.trim()} style={{
      background: "#fff",
      borderRadius: var2("radius2"),
      boxShadow: "var(--shadow)",
      border: "1px solid var(--cream3)",
      ...style
    }} {...rest}>{children}</div>
  );
}

export function Badge({ children, color = "var(--green)" }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "2px 10px",
      borderRadius: "20px",
      fontSize: "12px",
      fontWeight: 600,
      background: color,
      color: "#fff",
      letterSpacing: "0.3px",
    }}>{children}</span>
  );
}

export function ProgressBar({ value, color = "var(--green3)", height = 6 }) {
  return (
    <div style={{ background: "var(--cream2)", height, borderRadius: 99, overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.5s ease" }} />
    </div>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <div className="hl-section-title">
      <h2 style={{ fontFamily: "'Playfair Display'", fontSize: "24px", fontWeight: 700, color: "var(--ink)" }}>{children}</h2>
      {action}
    </div>
  );
}

export function Btn({ children, onClick, variant = "primary", disabled, size = "md" }) {
  const sizes = { sm: "6px 14px", md: "9px 20px", lg: "12px 28px" };
  const styles = {
    primary:   { background: "var(--green)",  color: "#fff",           border: "none" },
    secondary: { background: "transparent",   color: "var(--green)",   border: "1.5px solid var(--green)" },
    brass:     { background: "var(--brass)",   color: "#fff",           border: "none" },
    danger:    { background: "var(--danger2)", color: "#fff",           border: "none" },
    ghost:     { background: "transparent",   color: "var(--muted)",   border: "none" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...styles[variant],
      padding: sizes[size],
      borderRadius: "var(--radius)",
      fontSize: size === "sm" ? "13px" : "14px",
      fontWeight: 600,
      letterSpacing: "0.2px",
      transition: "all 0.15s",
      opacity: disabled ? 0.6 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
    }}
    onMouseEnter={e => { if (!disabled) e.currentTarget.style.filter = "brightness(1.1)"; }}
    onMouseLeave={e => { e.currentTarget.style.filter = ""; }}
    >{children}</button>
  );
}

export function Input({ label, type, style = {}, onFocus: onFocusProp, onBlur: onBlurProp, ...props }) {
  const isDateOrTime = type === "date" || type === "datetime-local" || type === "time";
  return (
    <div style={{ width: "100%", maxWidth: "100%" }}>
      {label && <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "5px" }}>{label}</label>}
      <input
        type={type ?? "text"}
        {...props}
        className="hl-input"
        style={{
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
          padding: "9px 12px",
          border: "1.5px solid var(--cream3)",
          borderRadius: "var(--radius)",
          fontSize: "14px",
          color: "var(--ink)",
          background: "#fff",
          outline: "none",
          transition: "border-color 0.15s",
          minHeight: "44px",
          ...(isDateOrTime && {
            touchAction: "manipulation",
            WebkitUserSelect: "none",
            userSelect: "none",
            WebkitTapHighlightColor: "transparent",
          }),
          ...style,
        }}
        onFocus={e => { onFocusProp?.(e); e.target.style.borderColor = "var(--green3)"; }}
        onBlur={e => { onBlurProp?.(e); e.target.style.borderColor = "var(--cream3)"; }}
      />
    </div>
  );
}

export function PastureCombo({ label, value, onChange, options = [], placeholder, id: listId, style = {}, onFocus: onFocusProp, onBlur: onBlurProp, ...props }) {
  const lid = listId || "pasture-list-" + Math.random().toString(36).slice(2);
  return (
    <div>
      {label && <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "5px" }}>{label}</label>}
      <input
        {...props}
        type="text"
        list={lid}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="hl-input"
        style={{
          width: "100%",
          padding: "9px 12px",
          border: "1.5px solid var(--cream3)",
          borderRadius: "var(--radius)",
          fontSize: "14px",
          color: "var(--ink)",
          background: "#fff",
          outline: "none",
          transition: "border-color 0.15s",
          minHeight: "44px",
          ...style,
        }}
        onFocus={e => { onFocusProp?.(e); e.target.style.borderColor = "var(--green3)"; }}
        onBlur={e => { onBlurProp?.(e); e.target.style.borderColor = "var(--cream3)"; }}
      />
      <datalist id={lid}>
        {options.map(n => <option key={n} value={n} />)}
      </datalist>
    </div>
  );
}

export function Select({ label, children, ...props }) {
  return (
    <div>
      {label && <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "5px" }}>{label}</label>}
      <select {...props} className="hl-select" style={{
        width: "100%", padding: "9px 12px",
        border: "1.5px solid var(--cream3)",
        borderRadius: "var(--radius)",
        fontSize: "14px", color: "var(--ink)",
        background: "#fff", outline: "none",
        minHeight: "44px",
        ...props.style,
      }}>{children}</select>
    </div>
  );
}

export function Textarea({ label, onFocus: onFocusProp, onBlur: onBlurProp, ...props }) {
  return (
    <div>
      {label && <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "5px" }}>{label}</label>}
      <textarea {...props} className="hl-textarea" style={{
        width: "100%", padding: "9px 12px",
        border: "1.5px solid var(--cream3)",
        borderRadius: "var(--radius)",
        fontSize: "14px", color: "var(--ink)",
        background: "#fff", outline: "none",
        resize: "vertical",
        minHeight: "44px",
        ...props.style,
      }}
      onFocus={e => { onFocusProp?.(e); e.target.style.borderColor = "var(--green3)"; }}
      onBlur={e => { onBlurProp?.(e); e.target.style.borderColor = "var(--cream3)"; }}
      />
    </div>
  );
}
