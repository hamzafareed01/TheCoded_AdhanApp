export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/adhancast-logo.png"
        alt="AdhanNow logo"
        className="h-10 w-10 rounded-xl object-cover"
        onError={(e) => {
          // Fallback to pwa icon if logo missing
          (e.target as HTMLImageElement).src = "/pwa-192.png";
        }}
      />
      <div className="flex flex-col">
        <span className="text-lg font-semibold text-white">AdhanNow</span>
        <span className="text-xs text-white/60">by TheCoded Inc</span>
      </div>
    </div>
  );
}
