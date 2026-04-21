import * as React from "react";
function cx(...parts: Array<string | false | null | undefined>) { return parts.filter(Boolean).join(" "); }
export function Card({className, ...props}: React.HTMLAttributes<HTMLDivElement>){ return <div className={cx('rounded-2xl border border-slate-800 bg-slate-900/50', className)} {...props} />; }
export function CardHeader({className,...props}: React.HTMLAttributes<HTMLDivElement>){ return <div className={cx('p-5 pb-2', className)} {...props} />; }
export function CardTitle({className,...props}: React.HTMLAttributes<HTMLHeadingElement>){ return <h3 className={cx('text-base font-semibold', className)} {...props} />; }
export function CardContent({className,...props}: React.HTMLAttributes<HTMLDivElement>){ return <div className={cx('p-5 pt-2', className)} {...props} />; }
