export function ProgressIndicator({
  currentStep,
  totalSteps,
}: {
  currentStep: number;
  totalSteps: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-[80px] bg-slate-800 rounded-full h-1.5">
        <div
          className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-300"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        />
      </div>
      <span className="text-slate-400 text-sm whitespace-nowrap">
        Step {currentStep} of {totalSteps}
      </span>
    </div>
  );
}
