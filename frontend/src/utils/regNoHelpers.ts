/**
 * Helper function to format student name with registration number
 * Format: [RA221100301001] Ayush Kumar
 * or: Ayush Kumar (if regNo not assigned)
 */

export function formatStudentName(
  name: string,
  regNo?: string | null
): string {
  if (regNo) {
    return `[${regNo}] ${name}`;
  }
  return name;
}

/**
 * Helper to display registration number with fallback
 */
export function getDisplayRegNo(regNo?: string | null): string {
  return regNo || "Not Assigned";
}

/**
 * Helper to get CSS classes for regNo based on assignment status
 */
export function getRegNoClassName(regNo?: string | null): string {
  if (!regNo) {
    return "text-slate-400 bg-slate-900/80";
  }
  return "text-emerald-200 bg-emerald-500/15";
}
