import { NextResponse } from "next/server";

const ZONES = [
  { value: "LA_BOCCA", label: "La Bocca", type: "intermediate" },
  { value: "PALAIS_DES_FESTIVALS", label: "Palais des festivals", type: "final" },
  { value: "PANTIERO", label: "Pantiero", type: "intermediate" },
  { value: "MACE", label: "Macé", type: "intermediate" },
];

export async function GET() {
  return NextResponse.json(ZONES);
}
