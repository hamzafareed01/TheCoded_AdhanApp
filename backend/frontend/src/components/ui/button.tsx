import * as React from "react";

type Variant = "default" | "secondary" | "outline" | "ghost" | "destructive";
type Size = "default" | "sm" | "lg" | "icon";

function cx(...parts: Array<string | false | null | undefined>) { return parts.filter(Boolean).join(" "); }

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

const variantClasses: Record<Variant,string> = {
  default: "bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-500/40",
  secondary: "bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700",
  outline: "bg-transparent text-slate-100 hover:bg-slate-800 border border-slate-700",
  ghost: "bg-transparent text-slate-200 hover:bg-slate-800 border border-transparent",
  destructive: "bg-red-600 text-white hover:bg-red-500 border border-red-500/40",
};
const sizeClasses: Record<Size,string> = {
  default: "h-10 px-4 py-2 text-sm",
  sm: "h-9 px-3 py-1.5 text-sm",
  lg: "h-11 px-6 py-2.5 text-base",
  icon: "h-10 w-10 p-0 inline-flex items-center justify-center",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant='default', size='default', asChild, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
});
