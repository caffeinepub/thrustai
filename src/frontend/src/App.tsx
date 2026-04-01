import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Toaster } from "@/components/ui/sonner";
import {
  ChevronDown,
  ChevronUp,
  Cpu,
  Flame,
  Loader2,
  MessageSquare,
  Save,
  Send,
  Trash2,
  Wind,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { EngineConfig } from "./backend.d.ts";
import { EngineDiagram3D } from "./components/EngineDiagram3D";
import {
  useDeleteConfig,
  useListConfigs,
  useLoadConfig,
  useSaveConfig,
} from "./hooks/useQueries";

// ─── ISA Lookup ───────────────────────────────────────────────────────────────
const ISA_TABLE = [
  { label: "Sea Level", pressure: 101325, temp: 288.15 },
  { label: "5,000 ft", pressure: 84307, temp: 278.24 },
  { label: "10,000 ft", pressure: 69682, temp: 268.34 },
  { label: "15,000 ft", pressure: 57182, temp: 258.43 },
  { label: "20,000 ft", pressure: 46563, temp: 248.53 },
  { label: "25,000 ft", pressure: 37600, temp: 238.62 },
  { label: "30,000 ft", pressure: 30090, temp: 228.71 },
  { label: "35,000 ft", pressure: 23842, temp: 218.81 },
  { label: "40,000 ft", pressure: 18754, temp: 216.65 },
];

// ─── Default Parameters ───────────────────────────────────────────────────────
const DEFAULTS = {
  massFlow: 220,
  exhaustVelocity: 650,
  flightSpeed: 250,
  exhaustPressure: 105000,
  ambientPressure: 101325,
  exitArea: 0.5,
  bypassRatio: 5.5,
  overallPressureRatio: 28,
  turbineInletTemp: 1650,
  fanPressureRatio: 1.6,
  compressorEfficiency: 0.88,
  turbineEfficiency: 0.9,
};

type Params = typeof DEFAULTS;

// ─── Performance Calculations ─────────────────────────────────────────────────
function calcPerformance(p: Params) {
  const netThrust =
    p.massFlow * (p.exhaustVelocity - p.flightSpeed) +
    (p.exhaustPressure - p.ambientPressure) * p.exitArea;
  const netThrustKN = netThrust / 1000;
  const specificThrust = netThrust / p.massFlow;
  const fuelFlow = p.massFlow * 0.025 * (p.turbineInletTemp / 1500);
  const tsfc = netThrust > 0 ? fuelFlow / netThrustKN : 0;
  const thermalEff =
    0.5 *
    (1 - 1 / p.overallPressureRatio ** ((1.4 - 1) / 1.4)) *
    p.compressorEfficiency *
    p.turbineEfficiency;
  const propEff =
    p.exhaustVelocity + p.flightSpeed > 0
      ? (2 * p.flightSpeed) / (p.exhaustVelocity + p.flightSpeed)
      : 0;
  const overallEff = thermalEff * propEff;
  return {
    netThrustKN,
    specificThrust,
    fuelFlow,
    tsfc,
    thermalEff,
    propEff,
    overallEff,
  };
}

// ─── AI Response Engine ───────────────────────────────────────────────────────
function getAIResponse(
  msg: string,
  params: Params,
  netThrustKN: number,
): string {
  const m = msg.toLowerCase();
  const TARGET = 120;

  if (
    m.includes("thrust") &&
    (m.includes("low") ||
      m.includes("increase") ||
      m.includes("more") ||
      m.includes("improve"))
  ) {
    return "To increase net thrust:\n(1) Increase mass flow rate — it has a linear effect on thrust\n(2) Increase exhaust velocity — widening the nozzle throat or increasing combustor temperature helps\n(3) Increase turbine inlet temperature — every 50K typically adds ~3-5% thrust\n(4) Reduce ambient pressure by flying at altitude for higher pressure ratio across the nozzle.";
  }
  if (
    (m.includes("tsfc") || m.includes("fuel")) &&
    (m.includes("efficiency") ||
      m.includes("reduce") ||
      m.includes("burn") ||
      m.includes("consumption"))
  ) {
    return "To reduce TSFC:\n(1) Increase bypass ratio (BPR) — modern high-BPR turbofans like GE90 achieve TSFC ~0.55 lb/lbf·hr\n(2) Increase OPR — every unit increase in OPR improves thermal efficiency by ~1-2%\n(3) Improve component efficiencies — compressor and turbine isentropic efficiency directly impacts cycle work. Target BPR ≥6 for subsonic cruise.";
  }
  if (m.includes("bypass") || m.includes("bpr")) {
    return "Bypass Ratio (BPR) is the ratio of bypass air to core air. High-BPR engines (5–12) are efficient at subsonic speeds — the large fan moves more air at lower velocity, improving propulsive efficiency. Low-BPR or turbojet engines (0–2) are better for supersonic flight. The CFM56 has BPR ~5.5, the GE90-115B runs at BPR ~8.4.";
  }
  if (
    m.includes("opr") ||
    m.includes("pressure ratio") ||
    m.includes("overall pressure")
  ) {
    return "Overall Pressure Ratio (OPR) is the total pressure rise from intake to combustor exit. Higher OPR improves thermal efficiency per the Brayton cycle. Modern engines run 40:1 (CFM LEAP) to 50:1 (GE9X). However, higher OPR demands higher-temperature turbine materials and tighter compressor tolerances. Above OPR ~40, diminishing returns set in.";
  }
  if (
    m.includes("tit") ||
    m.includes("turbine inlet") ||
    m.includes("temperature")
  ) {
    return "Turbine Inlet Temperature (TIT) is the limiting factor in thrust and efficiency. Every 100K increase in TIT can yield ~5-8% more thrust. Modern engines approach 1800-2000K at takeoff using single-crystal superalloy blades and thermal barrier coatings. Sustained operation above design TIT accelerates blade creep and reduces hot-section life significantly.";
  }
  if (
    m.includes("efficiency") &&
    (m.includes("compressor") || m.includes("turbine"))
  ) {
    return "Isentropic efficiency measures how close a component performs to ideal (isentropic) behavior. Modern compressors achieve 85-92% isentropic efficiency; turbines reach 88-93%. Every 1% improvement in compressor efficiency improves TSFC by ~0.3-0.5%. Efficiency drops rapidly near surge and choke limits on the compressor map.";
  }
  if (m.includes("altitude") || m.includes("cruise")) {
    return "At cruise altitude (35,000ft), ambient pressure drops to ~23.8 kPa and temperature to ~-56°C. Lower ambient pressure increases the pressure ratio across the nozzle, improving thrust efficiency. However, lower air density reduces mass flow — engines are typically derated at altitude. The net result: engines produce ~25-30% of sea-level thrust at cruise.";
  }
  if (m.includes("surge") || m.includes("stall")) {
    return "Compressor surge is an aerodynamic instability where flow reversal occurs in the compressor stages. It's caused by operating too far from the design point — high pressure ratio at low mass flow. Modern engines use bleed valves and variable stator vanes to maintain stall margin. Surge can cause loud bangs, flame-out, and structural damage.";
  }
  if (m.includes("120") || m.includes("target") || m.includes("requirement")) {
    if (netThrustKN >= TARGET) {
      return `Target met! Current thrust of ${netThrustKN.toFixed(1)} kN meets the 120 kN requirement. Key parameters contributing: mass flow ${params.massFlow} kg/s, exhaust velocity ${params.exhaustVelocity} m/s.`;
    }
    const deficit = TARGET - netThrustKN;
    const mDotNeeded = Math.ceil(
      (deficit * 1000) / (params.exhaustVelocity - params.flightSpeed),
    );
    const veNeeded = Math.ceil((deficit * 1000) / params.massFlow);
    return `Currently at ${netThrustKN.toFixed(1)} kN, ${deficit.toFixed(1)} kN short of target. To close the gap: increase mass flow by ~${mDotNeeded} kg/s OR increase exhaust velocity by ~${veNeeded} m/s OR both.`;
  }
  if (m.includes("hello") || m.includes("hi") || m.includes("help")) {
    return "ThrustAI online. I'm your jet engine cycle analysis assistant. Ask me about: thrust optimization, TSFC reduction, bypass ratio tradeoffs, OPR selection, turbine inlet temperature limits, compressor efficiency, altitude effects, or surge margin. What are you working on?";
  }
  return "Analyzing your query... For best results, ask about specific parameters: thrust, TSFC, bypass ratio (BPR), overall pressure ratio (OPR), turbine inlet temperature, or compressor/turbine efficiency. I can help optimize your engine configuration for your target thrust and efficiency goals.";
}

// ─── Collapsible Section ──────────────────────────────────────────────────────
function Section({
  title,
  badge,
  children,
  defaultOpen = true,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-secondary/60 transition-colors"
      >
        <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
          {title}
        </span>
        <div className="flex items-center gap-2">
          {badge && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 font-mono border-border text-muted-foreground"
            >
              {badge}
            </Badge>
          )}
          {open ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-3 py-3 space-y-3 border-t border-border">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Parameter Slider Row ─────────────────────────────────────────────────────
function ParamSlider({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
  ocid,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  ocid: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground truncate flex-1">
          {label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <Input
            data-ocid={`${ocid}.input`}
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
              const v = Number.parseFloat(e.target.value);
              if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
            }}
            className="w-20 h-6 text-right text-[11px] px-1.5 py-0 bg-input border-border font-mono text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-[10px] text-muted-foreground w-7">{unit}</span>
        </div>
      </div>
      <Slider
        data-ocid={ocid}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className="[&_[data-slot=slider-range]]:bg-primary [&_[data-slot=slider-thumb]]:border-primary [&_[data-slot=slider-thumb]]:bg-primary [&_[data-slot=slider-thumb]]:w-3 [&_[data-slot=slider-thumb]]:h-3"
      />
    </div>
  );
}

// ─── Metric Card ──────────────────────────────────────────────────────────────
function MetricCard({
  label,
  value,
  unit,
  color,
  sub,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-muted/30 border border-border rounded p-3 flex flex-col gap-1">
      <span className="text-[10px] tracking-widest uppercase text-muted-foreground">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span
          className={`text-xl font-bold font-mono tabular-nums leading-none ${color}`}
        >
          {value}
        </span>
        <span className="text-[10px] text-muted-foreground">{unit}</span>
      </div>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ─── Left Panel ───────────────────────────────────────────────────────────────
function LeftPanel({
  params,
  onParamChange,
}: {
  params: Params;
  onParamChange: (key: keyof Params, val: number) => void;
}) {
  const [altitude, setAltitude] = useState("0");

  const handleAltitude = (idx: string) => {
    setAltitude(idx);
    const entry = ISA_TABLE[Number(idx)];
    if (entry) {
      onParamChange("ambientPressure", entry.pressure);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Wind className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold tracking-widest uppercase text-foreground">
          Engine Parameters
        </span>
        <Badge className="ml-auto text-[9px] px-1.5 py-0 bg-primary/20 text-primary border-primary/30">
          LIVE
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-3 py-3 space-y-3">
          {/* Altitude */}
          <div className="bg-muted/20 border border-border rounded p-3 space-y-2">
            <span className="text-[10px] tracking-widest uppercase text-muted-foreground">
              ISA Altitude
            </span>
            <Select value={altitude} onValueChange={handleAltitude}>
              <SelectTrigger
                data-ocid="altitude.select"
                className="h-7 text-xs bg-input border-border text-foreground"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {ISA_TABLE.map((entry, i) => (
                  <SelectItem
                    key={entry.label}
                    value={String(i)}
                    className="text-xs"
                  >
                    {entry.label} — {(entry.pressure / 1000).toFixed(1)} kPa /{" "}
                    {entry.temp} K
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-[10px] text-muted-foreground">
              T = {ISA_TABLE[Number(altitude)]?.temp} K &nbsp;|&nbsp; P ={" "}
              {ISA_TABLE[Number(altitude)]?.pressure.toLocaleString()} Pa
            </div>
          </div>

          {/* Basic Thrust */}
          <Section title="Basic Thrust" badge="6 params">
            <ParamSlider
              label="Mass Flow"
              unit="kg/s"
              value={params.massFlow}
              min={50}
              max={500}
              step={1}
              onChange={(v) => onParamChange("massFlow", v)}
              ocid="mass_flow"
            />
            <ParamSlider
              label="Exhaust Velocity"
              unit="m/s"
              value={params.exhaustVelocity}
              min={200}
              max={2000}
              step={1}
              onChange={(v) => onParamChange("exhaustVelocity", v)}
              ocid="exhaust_velocity"
            />
            <ParamSlider
              label="Flight Speed"
              unit="m/s"
              value={params.flightSpeed}
              min={0}
              max={900}
              step={1}
              onChange={(v) => onParamChange("flightSpeed", v)}
              ocid="flight_speed"
            />
            <ParamSlider
              label="Exhaust Pressure"
              unit="Pa"
              value={params.exhaustPressure}
              min={90000}
              max={200000}
              step={100}
              onChange={(v) => onParamChange("exhaustPressure", v)}
              ocid="exhaust_pressure"
            />
            <ParamSlider
              label="Ambient Pressure"
              unit="Pa"
              value={params.ambientPressure}
              min={50000}
              max={101325}
              step={100}
              onChange={(v) => onParamChange("ambientPressure", v)}
              ocid="ambient_pressure"
            />
            <ParamSlider
              label="Exit Area"
              unit="m²"
              value={params.exitArea}
              min={0.1}
              max={2.0}
              step={0.01}
              onChange={(v) => onParamChange("exitArea", v)}
              ocid="exit_area"
            />
          </Section>

          {/* Turbofan Cycle */}
          <Section title="Turbofan Cycle" badge="6 params" defaultOpen={false}>
            <ParamSlider
              label="Bypass Ratio (BPR)"
              unit=""
              value={params.bypassRatio}
              min={0}
              max={12}
              step={0.1}
              onChange={(v) => onParamChange("bypassRatio", v)}
              ocid="bypass_ratio"
            />
            <ParamSlider
              label="Overall Pressure Ratio"
              unit=""
              value={params.overallPressureRatio}
              min={10}
              max={50}
              step={0.5}
              onChange={(v) => onParamChange("overallPressureRatio", v)}
              ocid="opr"
            />
            <ParamSlider
              label="Turbine Inlet Temp"
              unit="K"
              value={params.turbineInletTemp}
              min={1200}
              max={2000}
              step={10}
              onChange={(v) => onParamChange("turbineInletTemp", v)}
              ocid="tit"
            />
            <ParamSlider
              label="Fan Pressure Ratio"
              unit=""
              value={params.fanPressureRatio}
              min={1.2}
              max={2.5}
              step={0.05}
              onChange={(v) => onParamChange("fanPressureRatio", v)}
              ocid="fan_pr"
            />
            <ParamSlider
              label="Compressor η_is"
              unit=""
              value={params.compressorEfficiency}
              min={0.75}
              max={0.95}
              step={0.01}
              onChange={(v) => onParamChange("compressorEfficiency", v)}
              ocid="comp_eff"
            />
            <ParamSlider
              label="Turbine η_is"
              unit=""
              value={params.turbineEfficiency}
              min={0.75}
              max={0.95}
              step={0.01}
              onChange={(v) => onParamChange("turbineEfficiency", v)}
              ocid="turb_eff"
            />
          </Section>
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Center Panel ─────────────────────────────────────────────────────────────
function CenterPanel({
  params,
  perf,
  onLoadConfig,
}: {
  params: Params;
  perf: ReturnType<typeof calcPerformance>;
  onLoadConfig: (cfg: EngineConfig) => void;
}) {
  const [configName, setConfigName] = useState("");
  const { data: configs = [], isLoading: configsLoading } = useListConfigs();
  const saveConfig = useSaveConfig();
  const loadConfig = useLoadConfig();
  const deleteConfig = useDeleteConfig();

  const TARGET = 120;
  const thrustPct = Math.min(100, (perf.netThrustKN / TARGET) * 100);
  const thrustColor =
    perf.netThrustKN >= TARGET
      ? "text-success"
      : perf.netThrustKN >= 80
        ? "text-warning"
        : "text-destructive";

  const progressColor =
    perf.netThrustKN >= TARGET
      ? "[&>div]:bg-success"
      : perf.netThrustKN >= 80
        ? "[&>div]:bg-warning"
        : "[&>div]:bg-destructive";

  const handleSave = async () => {
    if (!configName.trim()) {
      toast.error("Enter a config name");
      return;
    }
    const config: EngineConfig = { name: configName.trim(), ...params };
    await saveConfig.mutateAsync(config);
    toast.success(`Config "${configName}" saved`);
    setConfigName("");
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Zap className="w-4 h-4 text-accent" />
        <span className="text-xs font-semibold tracking-widest uppercase text-foreground">
          Performance Dashboard
        </span>
      </div>

      {/* 3D Engine Diagram */}
      <div className="shrink-0 h-64 border-b border-border">
        <EngineDiagram3D
          massFlow={params.massFlow}
          turbineInletTemp={params.turbineInletTemp}
          netThrustKN={perf.netThrustKN}
          bypassRatio={params.bypassRatio}
        />
      </div>

      <ScrollArea className="flex-1">
        <div className="px-4 py-4 space-y-4">
          {/* Big thrust readout */}
          <div className="border border-border rounded bg-muted/20 p-4 text-center">
            <div className="text-[10px] tracking-widest uppercase text-muted-foreground mb-1">
              Net Thrust
            </div>
            <motion.div
              key={Math.round(perf.netThrustKN * 10)}
              initial={{ scale: 0.97, opacity: 0.7 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.15 }}
            >
              <span
                className={`text-5xl font-bold tabular-nums font-mono ${thrustColor}`}
              >
                {perf.netThrustKN.toFixed(2)}
              </span>
              <span className="text-lg text-muted-foreground ml-2">kN</span>
            </motion.div>

            {/* Target progress */}
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0 kN</span>
                <span>TARGET: {TARGET} kN</span>
                <span>{TARGET * 1.5} kN</span>
              </div>
              <Progress
                data-ocid="thrust.loading_state"
                value={thrustPct}
                className={`h-2 bg-secondary ${progressColor}`}
              />
              <div className="text-[10px] text-muted-foreground text-right">
                {thrustPct.toFixed(1)}% of {TARGET} kN target
              </div>
            </div>

            {/* Status */}
            <div className="mt-2">
              {perf.netThrustKN >= TARGET ? (
                <Badge
                  data-ocid="thrust.success_state"
                  className="bg-success/20 text-success border-success/30 text-[10px]"
                >
                  ✓ TARGET MET — +{(perf.netThrustKN - TARGET).toFixed(1)} kN
                  margin
                </Badge>
              ) : (
                <Badge
                  data-ocid="thrust.error_state"
                  className="bg-destructive/20 text-destructive border-destructive/30 text-[10px]"
                >
                  ✗ {(TARGET - perf.netThrustKN).toFixed(1)} kN SHORT OF TARGET
                </Badge>
              )}
            </div>
          </div>

          {/* Metric grid */}
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              label="Specific Thrust"
              value={perf.specificThrust.toFixed(1)}
              unit="N·s/kg"
              color="text-primary"
            />
            <MetricCard
              label="TSFC"
              value={perf.tsfc.toFixed(4)}
              unit="kg/s/kN"
              color="text-accent"
            />
            <MetricCard
              label="Thermal Eff."
              value={(perf.thermalEff * 100).toFixed(1)}
              unit="%"
              color="text-primary"
            />
            <MetricCard
              label="Propulsive Eff."
              value={(perf.propEff * 100).toFixed(1)}
              unit="%"
              color="text-accent"
            />
            <MetricCard
              label="Overall Eff."
              value={(perf.overallEff * 100).toFixed(1)}
              unit="%"
              color="text-success"
            />
            <MetricCard
              label="Fuel Flow"
              value={perf.fuelFlow.toFixed(2)}
              unit="kg/s"
              color="text-muted-foreground"
            />
          </div>

          <Separator className="border-border" />

          {/* Config Manager */}
          <div className="space-y-2">
            <div className="text-[10px] tracking-widest uppercase text-muted-foreground flex items-center gap-1">
              <Save className="w-3 h-3" /> Config Manager
            </div>
            <div className="flex gap-2">
              <Input
                data-ocid="config.input"
                placeholder="Config name..."
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                className="flex-1 h-7 text-xs bg-input border-border text-foreground placeholder:text-muted-foreground/60"
              />
              <Button
                data-ocid="config.save_button"
                size="sm"
                onClick={handleSave}
                disabled={saveConfig.isPending}
                className="h-7 px-3 text-xs bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30"
              >
                {saveConfig.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Save className="w-3 h-3" />
                )}
              </Button>
            </div>

            {/* Config list */}
            {configsLoading ? (
              <div
                data-ocid="config.loading_state"
                className="text-[11px] text-muted-foreground text-center py-2"
              >
                Loading configs...
              </div>
            ) : configs.length === 0 ? (
              <div
                data-ocid="config.empty_state"
                className="text-[11px] text-muted-foreground text-center py-3 border border-dashed border-border rounded"
              >
                No saved configs
              </div>
            ) : (
              <div className="space-y-1" data-ocid="config.list">
                {configs.map((name, i) => (
                  <div
                    key={name}
                    data-ocid={`config.item.${i + 1}`}
                    className="flex items-center justify-between bg-muted/20 border border-border rounded px-2 py-1.5 group"
                  >
                    <button
                      type="button"
                      className="text-xs text-foreground hover:text-primary transition-colors text-left truncate flex-1"
                      onClick={async () => {
                        const cfg = await loadConfig.mutateAsync(name);
                        onLoadConfig(cfg);
                        toast.success(`Loaded "${name}"`);
                      }}
                    >
                      {name}
                    </button>
                    <button
                      type="button"
                      data-ocid={`config.delete_button.${i + 1}`}
                      onClick={async () => {
                        await deleteConfig.mutateAsync(name);
                        toast.success(`Deleted "${name}"`);
                      }}
                      className="text-muted-foreground hover:text-destructive transition-colors ml-2 opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Right Panel (AI Chat) ────────────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "ai";
  text: string;
  ts: number;
}

const STARTER_PROMPTS = [
  "How do I reach 120 kN?",
  "Reduce fuel consumption",
  "Explain bypass ratio",
  "Cruise altitude effects",
];

function RightPanel({
  params,
  netThrustKN,
}: {
  params: Params;
  netThrustKN: number;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "ai",
      text: "ThrustAI online. I'm your jet engine cycle analysis assistant. Ask me about: thrust optimization, TSFC reduction, bypass ratio tradeoffs, OPR selection, turbine inlet temperature limits, compressor efficiency, altitude effects, or surge margin. What are you working on?",
      ts: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || typing) return;
      const userMsg: ChatMessage = {
        role: "user",
        text: text.trim(),
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setTyping(true);
      scrollToBottom();

      setTimeout(() => {
        const aiText = getAIResponse(text, params, netThrustKN);
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: aiText, ts: Date.now() },
        ]);
        setTyping(false);
        scrollToBottom();
      }, 800);
    },
    [typing, params, netThrustKN, scrollToBottom],
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Cpu className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold tracking-widest uppercase text-foreground">
          ThrustAI
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-cyan" />
          <span className="text-[10px] text-success">ONLINE</span>
        </div>
      </div>

      {/* Starter prompts */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex flex-wrap gap-1.5">
          {STARTER_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => sendMessage(p)}
              className="text-[10px] px-2 py-1 rounded border border-primary/30 text-primary/80 hover:bg-primary/10 hover:text-primary transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-3">
        <div className="py-3 space-y-3">
          {messages.map((msg) => (
            <motion.div
              key={msg.ts}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[90%] rounded px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-primary/20 text-primary border border-primary/20"
                    : "bg-muted/40 text-foreground border border-border"
                }`}
              >
                {msg.role === "ai" && (
                  <div className="flex items-center gap-1 mb-1">
                    <Cpu className="w-2.5 h-2.5 text-primary" />
                    <span className="text-[9px] text-primary tracking-widest uppercase">
                      ThrustAI
                    </span>
                  </div>
                )}
                {msg.text}
              </div>
            </motion.div>
          ))}

          {/* Typing indicator */}
          <AnimatePresence>
            {typing && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex justify-start"
              >
                <div className="bg-muted/40 border border-border rounded px-3 py-2">
                  <div className="flex items-center gap-1">
                    <div className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                    <div className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                    <div className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="px-3 py-3 border-t border-border shrink-0">
        <div className="flex gap-2">
          <Input
            data-ocid="chat.input"
            placeholder="Ask about thrust, TSFC, BPR, OPR..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            className="flex-1 h-8 text-[11px] bg-input border-border text-foreground placeholder:text-muted-foreground/50"
          />
          <Button
            data-ocid="chat.submit_button"
            size="sm"
            onClick={() => sendMessage(input)}
            disabled={typing || !input.trim()}
            className="h-8 w-8 p-0 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────
export default function App() {
  const [params, setParams] = useState<Params>({ ...DEFAULTS });
  const [showChat, setShowChat] = useState(false);

  const handleParamChange = useCallback((key: keyof Params, val: number) => {
    setParams((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleLoadConfig = useCallback((cfg: EngineConfig) => {
    setParams({
      massFlow: cfg.massFlow,
      exhaustVelocity: cfg.exhaustVelocity,
      flightSpeed: cfg.flightSpeed,
      exhaustPressure: cfg.exhaustPressure,
      ambientPressure: cfg.ambientPressure,
      exitArea: cfg.exitArea,
      bypassRatio: cfg.bypassRatio,
      overallPressureRatio: cfg.overallPressureRatio,
      turbineInletTemp: cfg.turbineInletTemp,
      fanPressureRatio: cfg.fanPressureRatio,
      compressorEfficiency: cfg.compressorEfficiency,
      turbineEfficiency: cfg.turbineEfficiency,
    });
  }, []);

  const perf = useMemo(() => calcPerformance(params), [params]);

  useEffect(() => {
    document.documentElement.style.setProperty("overflow", "hidden");
    return () => {
      document.documentElement.style.removeProperty("overflow");
    };
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background grid-noise overflow-hidden">
      <Toaster theme="dark" />

      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card/80 backdrop-blur shrink-0">
        <Flame className="w-5 h-5 text-accent" />
        <span className="text-sm font-bold tracking-wider uppercase text-foreground">
          ThrustAI
        </span>
        <Badge className="text-[9px] px-1.5 py-0 bg-accent/20 text-accent border-accent/30">
          WORKSTATION v2.0
        </Badge>
        <div className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="hidden sm:block">Fn = ṁ·(Vₑ−Vₐ) + (Pₑ−Pₐ)·Aₑ</span>
          <Separator orientation="vertical" className="h-4 hidden sm:block" />
          <span
            className={`font-mono font-bold ${
              perf.netThrustKN >= 120
                ? "text-success"
                : perf.netThrustKN >= 80
                  ? "text-warning"
                  : "text-destructive"
            }`}
          >
            {perf.netThrustKN.toFixed(2)} kN
          </span>
          <Button
            data-ocid="chat.open_modal_button"
            variant="ghost"
            size="sm"
            onClick={() => setShowChat((v) => !v)}
            className="h-7 px-2 text-[10px] text-muted-foreground hover:text-primary md:hidden"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </Button>
        </div>
      </header>

      {/* 3-panel workstation */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Panel */}
        <div className="w-[280px] xl:w-[300px] shrink-0 border-r border-border bg-card/40 flex flex-col overflow-hidden">
          <LeftPanel params={params} onParamChange={handleParamChange} />
        </div>

        {/* Center Panel */}
        <div className="flex-1 border-r border-border bg-card/20 flex flex-col overflow-hidden min-w-0">
          <CenterPanel
            params={params}
            perf={perf}
            onLoadConfig={handleLoadConfig}
          />
        </div>

        {/* Right Panel (AI) */}
        <div className="w-[300px] xl:w-[320px] shrink-0 bg-card/40 hidden md:flex flex-col overflow-hidden">
          <RightPanel params={params} netThrustKN={perf.netThrustKN} />
        </div>

        {/* Mobile AI overlay */}
        <AnimatePresence>
          {showChat && (
            <motion.div
              data-ocid="chat.modal"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 240 }}
              className="fixed inset-y-0 right-0 w-80 bg-card border-l border-border flex flex-col md:hidden z-50"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs font-semibold text-foreground tracking-widest uppercase">
                  ThrustAI
                </span>
                <button
                  type="button"
                  data-ocid="chat.close_button"
                  onClick={() => setShowChat(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>
              <RightPanel params={params} netThrustKN={perf.netThrustKN} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-card/60 text-[10px] text-muted-foreground shrink-0">
        <span>GE AEROSPACE · ROLLS-ROYCE · PRATT & WHITNEY CYCLE ANALYSIS</span>
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          © {new Date().getFullYear()} · Built with ❤ using caffeine.ai
        </a>
      </footer>
    </div>
  );
}
