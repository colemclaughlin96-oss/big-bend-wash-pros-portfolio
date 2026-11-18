export const VARIABLE_TYPES = [
  { key: "flat", label: "Flat (no variable)" },
  { key: "square_footage", label: "Square Footage" },
  { key: "windows", label: "Number of Windows" },
  { key: "linear_feet", label: "Linear Feet" },
  { key: "stories", label: "Number of Stories" },
  { key: "rooms", label: "Number of Rooms" },
  { key: "units", label: "Units / Quantity" },
];

export function variableLabelFor(key: string): string {
  return VARIABLE_TYPES.find((v) => v.key === key)?.label ?? "Quantity";
}
