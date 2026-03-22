export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/adhancast-logo.png"
        alt="AdhanCast logo"
        className="h-10 w-10 rounded-xl object-cover"
      />
      <div className="flex flex-col">
        <span className="text-lg font-semibold text-white">AdhanCast</span>
        <span className="text-xs text-white/60">by TheCoded Inc</span>
      </div>
    </div>
  );
}
