export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      <img
        src="/adhancast-logo.png"
        alt="AdhanNow logo"
        className="h-9 w-9 rounded-xl object-cover flex-shrink-0"
        onError={(e) => {
          // Fallback to pwa icon if logo missing
          (e.target as HTMLImageElement).src = "/pwa-192.png";
        }}
      />
      <div className="flex flex-col min-w-0">
        <span className="text-base font-semibold text-white leading-tight truncate">
          AdhanNow
        </span>
        {/* Subtitle hidden on mobile so it doesn't crowd the nav; shows from sm up */}
        <span className="hidden sm:block text-xs text-white/60 leading-tight truncate">
          by TheCoded Inc
        </span>
      </div>
    </div>
  );
}
