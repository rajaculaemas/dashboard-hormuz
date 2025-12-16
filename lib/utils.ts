import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Assignee list (must match frontend ASSIGNEES)
const ASSIGNEES_MAP = {
  unassigned: "Unassigned",
  abimantara: "Abdi Bimantara",
  ahafiz: "Habib",
  ambarfitri: "Ambar",
  araffly: "Rafly Cireng",
  ariful: "Ariful",
  asap: "Asap",
  azamzami: "Ahmad Zaid Zam Zami",
  bimarizki: "Bima",
  fannisa: "Jawir",
  fazzahrah: "Farah",
  ffadhillah: "Fikri",
  fnurelia: "Firda",
  gandarizky: "Ganda",
  haikalrahman: "Haikal",
  hnurjannah: "Habil dan Qabil",
  mtaufik: "Taufik",
  radhitia: "Raihan",
  shizbullah: "Said Bajaj Bajuri",
}

export function getAssigneeName(assigneeId: string | null): string | null {
  if (!assigneeId) return null
  return ASSIGNEES_MAP[assigneeId as keyof typeof ASSIGNEES_MAP] || assigneeId || null
}

