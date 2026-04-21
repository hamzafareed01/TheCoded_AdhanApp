import * as React from "react";
function cx(...parts: Array<string | false | null | undefined>) { return parts.filter(Boolean).join(" "); }
export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(function Label({className,...props},ref){ return <label ref={ref} className={cx('text-sm font-medium text-slate-200', className)} {...props} />; });
