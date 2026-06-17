export function CantonAvatar({ canton, color, size = 32 }: { canton?: string; color?: string; size?: number }) {
  return (
    <div
      className="flex items-center justify-center text-white font-bold leading-none"
      style={{
        width: size, height: size, minWidth: size,
        borderRadius: 4, backgroundColor: color || '#90a4ae',
        fontSize: size * 0.4,
      }}
    >
      {canton ? canton.toUpperCase() : '?'}
    </div>
  );
}

export function BskyAvatar({ size = 28 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center text-white leading-none"
      style={{
        width: size, height: size, minWidth: size,
        borderRadius: 4, backgroundColor: '#1185fe',
        fontSize: size * 0.55,
      }}
    >
      {'\ud83e\udd8b'}
    </div>
  );
}
