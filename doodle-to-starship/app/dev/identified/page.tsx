import VisionIdentified from "@/components/VisionIdentified";
import type { SketchReading } from "@/lib/design";

const READING: SketchReading = {
  design: {
    name: "Falcon 9",
    stages: [
      { label: "Stage 1", engines: [{ engine: "merlin-1d", count: 9 }], propellant: "kerolox", tankVolumeM3: 400 },
      { label: "Stage 2", engines: [{ engine: "merlin-vacuum", count: 1 }], propellant: "kerolox", tankVolumeM3: 100 },
    ],
    payloadMassKg: 2000,
    destination: "leo",
    features: [],
    heightM: 70,
    diameterM: 3.7,
  },
  parts: [
    { kind: "nose", label: "Payload fairing", box: [0.45, 0.05, 0.1, 0.1], stageIndex: 1 },
    { kind: "fin", label: "Grid fins", box: [0.4, 0.35, 0.2, 0.04], stageIndex: 0 },
    { kind: "engine", label: "Merlin", box: [0.45, 0.85, 0.1, 0.06], stageIndex: 0 },
  ],
};

export default function IdentifiedDev() {
  return (
    <main className="flex min-h-dvh flex-col items-end gap-3 bg-black p-8">
      <div className="w-[380px]">
        <VisionIdentified reading={READING} source="grok" />
      </div>
      <div className="w-[380px]">
        <VisionIdentified reading={null} source="geometry" />
      </div>
    </main>
  );
}
