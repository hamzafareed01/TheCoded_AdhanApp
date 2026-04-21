import * as React from "react";
function cx(...parts: Array<string | false | null | undefined>) { return parts.filter(Boolean).join(" "); }
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({className,...props},ref){ return <input ref={ref} className={cx('flex h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40', className)} {...props}/>; });
