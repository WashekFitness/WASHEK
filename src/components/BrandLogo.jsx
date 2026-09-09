export default function BrandLogo({
  size = 'md',
  showName = false,
  nameClassName = '',
  className = '',
}) {
  const sizes = {
    xs: 'w-6 h-6',
    sm: 'w-7 h-7',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
    hero: 'w-20 h-20',
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img
        src="/washek-fitness-logo.jpg"
        alt="WASHEK"
        className={`${sizes[size] || sizes.md} object-contain shrink-0 rounded-xl`}
      />

      {showName && (
        <span className={`font-heading font-bold ${nameClassName}`}>
          WASHEK
        </span>
      )}
    </div>
  );
}
