export function FlagIcon({ flag, className = '' }) {
  if (!flag) return null;
  if (flag.iso) {
    return (
      <img
        src={`https://flagcdn.com/w20/${flag.iso}.png`}
        srcSet={`https://flagcdn.com/w40/${flag.iso}.png 2x`}
        alt={flag.label}
        title={flag.label}
        className={`w-5 h-[15px] object-cover rounded-[2px] shrink-0 ${className}`}
      />
    );
  }
  if (flag.flag) {
    return <span className={`text-sm leading-none shrink-0 ${className}`}>{flag.flag}</span>;
  }
  return null;
}
