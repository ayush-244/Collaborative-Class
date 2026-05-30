import React from "react";
import { cn } from "../../utils/cn";
import { GraduationCap } from "lucide-react";

interface RegNoBadgeProps {
  regNo?: string | null;
  variant?: "inline" | "standalone";
  className?: string;
}

/**
 * Display Registration Number in a badge format
 * Shows "Not Assigned" for students without regNo
 */
export const RegNoBadge: React.FC<RegNoBadgeProps> = ({
  regNo,
  variant = "inline",
  className
}) => {
  const displayValue = regNo || "Not Assigned";
  const isEmpty = !regNo;

  if (variant === "standalone") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium",
          isEmpty
            ? "bg-slate-900/80 text-slate-400"
            : "bg-emerald-500/15 text-emerald-200",
          className
        )}
      >
        <GraduationCap className="h-3.5 w-3.5" />
        <span>{displayValue}</span>
      </div>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium",
        isEmpty
          ? "bg-slate-900/80 text-slate-400"
          : "bg-emerald-500/15 text-emerald-200",
        className
      )}
    >
      <GraduationCap className="h-3 w-3" />
      {displayValue}
    </span>
  );
};
