import * as React from "react";
function cx(...parts: Array<string | false | null | undefined>) { return parts.filter(Boolean).join(" "); }
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> { variant?: 'default'|'secondary'|'outline'|'destructive'; }
const variants={default:'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',secondary:'bg-slate-800 text-slate-300 border border-slate-700',outline:'bg-transparent text-slate-200 border border-slate-700',destructive:'bg-red-500/10 text-red-300 border border-red-500/30'};
export function Badge({className, variant='default', ...props}:BadgeProps){ return <span className={cx('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium', variants[variant], className)} {...props} />; }
