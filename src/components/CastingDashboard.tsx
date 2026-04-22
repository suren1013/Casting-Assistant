import React, { useState, useMemo, useEffect } from 'react';
import { 
  Box, 
  Settings2, 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  TrendingUp, 
  Scale, 
  Layers,
  RefreshCw,
  HelpCircle,
  Zap,
  Flame,
  ChevronRight,
  LightbulbIcon,
  Undo,
  Brain,
  Sparkles,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { GoogleGenAI, Type } from "@google/genai";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import RiserSchematic3D from './RiserSchematic3D';

// --- Types ---

type ShapeType = 'cube' | 'plate' | 'cylinder';

interface DesignParams {
  shape: ShapeType;
  a: number; // for cube
  l: number; // for plate
  w: number; // for plate
  t: number; // for plate/thickness
  d: number; // for cylinder
  h: number; // for cylinder
  safetyFactor: number;
  riserOverrideFactor: number; // 0.5 to 2.0
  density: number;
  costPerKg: number; // Dynamic price based on material
  isCustomMaterial?: boolean; // tracks if custom is selected
}

// --- Logic Helpers ---

const calculateCasting = (params: DesignParams) => {
  let volume = 0;
  let area = 0;
  let thickness = 0;

  switch (params.shape) {
    case 'cube':
      volume = Math.pow(params.a, 3);
      area = 6 * Math.pow(params.a, 2);
      thickness = params.a;
      break;
    case 'plate':
      volume = params.l * params.w * params.t;
      area = 2 * (params.l * params.w + params.w * params.t + params.l * params.t);
      thickness = params.t;
      break;
    case 'cylinder':
      volume = (Math.PI / 4) * Math.pow(params.d, 2) * params.h;
      area = Math.PI * params.d * params.h + (Math.PI / 2) * Math.pow(params.d, 2);
      thickness = Math.min(params.d, params.h);
      break;
  }

  const modulus = volume / area;
  return { volume, area, modulus, thickness };
};

const calculateRiser = (cModulus: number, safetyFactor: number, overrideFactor: number) => {
  const reqModulus = cModulus * safetyFactor;
  // Standard Riser (H=D) Modulus = D/6
  const baseDiameter = 6 * reqModulus;
  const actualDiameter = baseDiameter * overrideFactor;
  const actualHeight = actualDiameter; // assuming H=D for simplicity
  const actualVolume = (Math.PI / 4) * Math.pow(actualDiameter, 2) * actualHeight;
  const actualArea = Math.PI * actualDiameter * actualHeight + (Math.PI / 2) * Math.pow(actualDiameter, 2);
  const actualModulus = actualVolume / actualArea;

  return { 
    requiredModulus: reqModulus, 
    baseDiameter, 
    actualDiameter, 
    actualHeight, 
    actualVolume, 
    actualModulus 
  };
};

const getStatus = (cModulus: number, rModulus: number) => {
  const cModSq = Math.pow(cModulus, 2);
  const rModSq = Math.pow(rModulus, 2);
  
  if (rModSq > 1.1 * cModSq) return 'safe';
  if (rModSq >= cModSq) return 'borderline';
  return 'fail';
};

interface AIInsights {
  failureAnalysis: string;
  designAdvice: string;
  recommendation: string;
}

// --- Main Component ---

export default function CastingDashboard() {
  const [params, setParams] = useState<DesignParams>({
    shape: 'plate',
    a: 100,
    l: 300,
    w: 200,
    t: 20,
    d: 100,
    h: 150,
    safetyFactor: 1.2,
    riserOverrideFactor: 1.0,
    density: 7.85, // g/cm3 for steel
    costPerKg: 60, // INR/kg for steel
    isCustomMaterial: false
  });

  const [showExplanation, setShowExplanation] = useState(false);
  const [lastSafeFactor, setLastSafeFactor] = useState(1.0);
  const [aiInsights, setAIInsights] = useState<AIInsights | null>(null);
  const [isAILoading, setIsAILoading] = useState(false);

  // Gemini AI initialization
  const ai = useMemo(() => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
  }, []);

  // Derived calculations
  const designResults = useMemo(() => {
    const casting = calculateCasting(params);
    const riser = calculateRiser(casting.modulus, params.safetyFactor, params.riserOverrideFactor);
    const yieldPercentage = (casting.volume / (casting.volume + riser.actualVolume)) * 100;
    const status = getStatus(casting.modulus, riser.actualModulus);
    
    // Optimal point estimation (where ratio is just passing `~1.1x`)
    let optFactor = params.riserOverrideFactor;
    let fallbackRiser = riser;
    const currentRatioSq = Math.pow(riser.actualModulus / casting.modulus, 2);
    
    // We only shrink if we're well above safe.
    if (currentRatioSq > 1.1) {
      // Find the theoretical override factor that gives exactly M_r^2 = 1.1 * M_c^2
      // baseDiameter * optFactor = required actualDiameter
      // -> Modulus is proportional to diameter.
      optFactor = params.riserOverrideFactor * Math.sqrt(1.1 / currentRatioSq);
      // Give it a tiny 1% buffer
      optFactor *= 1.01;
    }
    
    // Evaluate smart-step optimized design:
    const smartStep = currentRatioSq > 1.3 ? 0.9 : 0.97; // 10% vs 3% reduction
    const stepFactor = params.riserOverrideFactor * smartStep;
    
    const optimizedRiser = calculateRiser(casting.modulus, params.safetyFactor, optFactor);
    const optimizedYield = (casting.volume / (casting.volume + optimizedRiser.actualVolume)) * 100;
    const optimizedStatus = getStatus(casting.modulus, optimizedRiser.actualModulus);

    // Baseline stats for improvement calculations
    const initialRiser = calculateRiser(casting.modulus, params.safetyFactor, 1.0);
    const initialYield = (casting.volume / (casting.volume + initialRiser.actualVolume)) * 100;

    // Checks
    const fdRisk = params.shape === 'plate' ? params.l > 4.5 * params.t : params.shape === 'cylinder' ? params.h > 4.5 * params.d : false;
    
    // Cost estimation
    const excessVolume = Math.max(0, riser.actualVolume - optimizedRiser.actualVolume);
    const materialWastedKg = (excessVolume * params.density) / 1000;
    const estimatedExtraCost = materialWastedKg * params.costPerKg;

    // Auto Riser Selection
    const recommendedRiserType = casting.thickness < 30 ? 'Open Riser' : 'Blind Riser';

    // Failure Predictions
    const failures = [];
    if (params.shape === 'plate' && params.t < 15) {
      failures.push({
        id: 'shrinkage',
        title: 'Centerline Shrinkage risk',
        desc: 'Plate thickness below 15mm often leads to premature solidification in the center.',
        suggestion: 'Increase casting thickness or ensure adequate riser volume.',
        type: 'warning'
      });
    }
    if (params.shape === 'cube' && yieldPercentage > 85) {
      failures.push({
        id: 'hotspot',
        title: 'Hotspot Alert',
        desc: 'High yield in cubic geometries risks internal shrinkage cavities.',
        suggestion: 'Review riser placement and ensure sufficient riser modulus.',
        type: 'critical'
      });
    }

    return {
      casting,
      riser,
      yieldPercentage,
      status,
      recommendedRiserType,
      failures,
      optimized: {
        yield: optimizedYield,
        status: optimizedStatus,
        riser: optimizedRiser,
        nextSafeFactor: optFactor,
        smartStepFactor: stepFactor
      },
      baseline: { yield: initialYield },
      analysis: {
        currentRatioSq,
        fdRisk,
        materialWastedKg,
        estimatedExtraCost
      }
    };
  }, [params]);

  // Track the last completely safe override configuration
  useEffect(() => {
    if (designResults.status === 'safe') {
      setLastSafeFactor(params.riserOverrideFactor);
    }
  }, [designResults.status, params.riserOverrideFactor]);

  // AI Insights Fetching
  useEffect(() => {
    if (!ai) return;

    const fetchAIInsights = async () => {
      setIsAILoading(true);
      try {
        const prompt = `As a casting foundry expert, analyze this design:
Geometry: ${params.shape} (${params.shape === 'cube' ? `a=${params.a}` : params.shape === 'plate' ? `L=${params.l}, W=${params.w}, T=${params.t}` : `D=${params.d}, H=${params.h}`})
Density: ${params.density} g/cm3
Yield: ${designResults.yieldPercentage.toFixed(1)}%
Status: ${designResults.status}
Calculated M_c: ${designResults.casting.modulus.toFixed(2)}
Calculated M_r: ${designResults.riser.actualModulus.toFixed(2)}
Recommended Riser: ${designResults.recommendedRiserType}

Provide:
1. Short failure analysis (max 15 words)
2. Design advice based on data (max 15 words)
3. Riser type/size recommendation (max 15 words)

Return ONLY JSON with keys: failureAnalysis, designAdvice, recommendation.`;

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                failureAnalysis: { type: Type.STRING },
                designAdvice: { type: Type.STRING },
                recommendation: { type: Type.STRING },
              },
              required: ["failureAnalysis", "designAdvice", "recommendation"]
            }
          }
        });

        const resultText = response.text;
        if (resultText) {
          const parsed = JSON.parse(resultText);
          setAIInsights(parsed);
        }
      } catch (error) {
        console.error("AI Insight Error:", error);
      } finally {
        setIsAILoading(false);
      }
    };

    const timer = setTimeout(fetchAIInsights, 1500); // Debounce AI calls
    return () => clearTimeout(timer);
  }, [ai, params, designResults]);

  // Chart Data: Simulating solidification curve
  // t = k * (V/A)^2 = k * M^2
  const chartData = useMemo(() => {
    const data = [];
    const castingMod = designResults.casting?.modulus ?? 0;
    const riserMod = designResults.riser?.actualModulus ?? 0;
    
    // Scale k to something human readable for a chart
    const k = 10; 
    const tCast = k * Math.pow(castingMod, 2);
    const tRiser = k * Math.pow(riserMod, 2);

    for (let i = 0; i <= 100; i++) {
        const x = i / 100;
        // Simple cooling curves: Temp = 1500 * exp(-time / T_solidify)
        data.push({
            time: (i * Math.max(tCast, tRiser) * 1.5) / 100,
            castingTemp: 1550 * Math.exp(-(i * 1.5 / 100) * (Math.max(tCast, tRiser) / tCast)),
            riserTemp: 1550 * Math.exp(-(i * 1.5 / 100) * (Math.max(tCast, tRiser) / tRiser)),
            solidus: 1450 // Approximate solidus for steel
        });
    }
    return data;
  }, [designResults]);

  const handleInputChange = (key: keyof DesignParams, value: any) => {
    setParams(prev => {
      // Prevent infinite re-renders if the value hasn't actually changed
      if (prev[key] === value) return prev;
      return { ...prev, [key]: value };
    });
  };

  const resetToDefaults = () => {
    setParams({
        shape: 'plate',
        a: 100,
        l: 300,
        w: 200,
        t: 20,
        d: 100,
        h: 150,
        safetyFactor: 1.2,
        riserOverrideFactor: 1.0,
        density: 7.85,
        costPerKg: 60,
        isCustomMaterial: false
    });
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans flex flex-col selection:bg-emerald-500/30">
      <TooltipProvider>
        {/* Top Navigation Header */}
        <header className="h-16 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between px-6 shrink-0 sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center">
              <Layers className="w-5 h-5 text-zinc-950" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">Casting Assistant</h1>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Engineering Simulation & Riser Design Tool</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowExplanation(true)} className="h-8 px-3 py-1.5 text-xs font-medium border-emerald-800 bg-emerald-950/30 rounded hover:bg-emerald-900/50 text-emerald-400">
              <Info className="w-3 h-3 mr-2" /> Engineering Explanation
            </Button>
            <Button variant="outline" size="sm" onClick={resetToDefaults} className="h-8 px-3 py-1.5 text-xs font-medium border-zinc-800 bg-zinc-900 rounded hover:bg-zinc-800 text-zinc-300">
              <RefreshCw className="w-3 h-3 mr-2" /> Reset Defaults
            </Button>
          </div>
        </header>

        {/* Main Dashboard Layout */}
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-0 border-b border-zinc-800 print:grid-cols-1">
          
          {/* Left Column: Input Controls */}
          <aside className="border-r border-zinc-800 p-4 space-y-6 bg-zinc-950/50 overflow-y-auto print:hidden">
            <div className="space-y-3">
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Casting Geometry</label>
              <div className="flex gap-1 p-1 bg-zinc-900 rounded-lg border border-zinc-800">
                {(['plate', 'cylinder', 'cube'] as ShapeType[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleInputChange('shape', s)}
                    className={cn(
                      "flex-1 py-1.5 text-[11px] font-medium transition-all rounded",
                      params.shape === s ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-400"
                    )}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 bg-zinc-900/50 p-3 border border-zinc-800 rounded-lg">
              <AnimatePresence mode="wait">
                <motion.div
                  key={params.shape}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-4"
                >
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="material" className="text-[10px] text-zinc-500 uppercase">Material</Label>
                      <Select 
                        value={params.isCustomMaterial ? "custom" : `${params.density}-${params.costPerKg}`} 
                        onValueChange={(val) => {
                          if (val === 'custom') {
                            setParams(prev => ({ ...prev, isCustomMaterial: true }));
                          } else {
                            const [d, c] = val.split('-');
                            setParams(prev => ({ ...prev, isCustomMaterial: false, density: parseFloat(d), costPerKg: parseFloat(c) }));
                          }
                        }}>
                        <SelectTrigger className="h-9 bg-zinc-950 border-zinc-800 text-zinc-200 font-mono text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-950 border-zinc-800 text-zinc-200">
                          <SelectItem value="7.85-60">Carbon Steel (7850 kg/m³, ₹60/kg)</SelectItem>
                          <SelectItem value="7.2-120">Gray Iron (7200 kg/m³, ₹120/kg)</SelectItem>
                          <SelectItem value="2.7-250">Aluminum (2700 kg/m³, ₹250/kg)</SelectItem>
                          <SelectItem value="8.96-750">Copper (8960 kg/m³, ₹750/kg)</SelectItem>
                          <SelectItem value="custom">Custom...</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {params.isCustomMaterial && (
                      <div className="space-y-4 text-xs border-l-2 border-emerald-500 pl-3 ml-1 animate-in fade-in slide-in-from-left-2 pb-1">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-zinc-400">
                            <span>Custom Density (g/cm³)</span>
                          </div>
                          <Input 
                            type="number" 
                            step="0.01" 
                            min="0.1"
                            value={params.density}
                            onChange={(e) => handleInputChange('density', parseFloat(e.target.value) || 0.1)}
                            className="h-8 bg-zinc-950 border-zinc-800 text-zinc-200 font-mono text-xs"
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-zinc-400">
                            <span>Cost per kg (₹/kg)</span>
                          </div>
                          <Input 
                            type="number" 
                            step="0.01" 
                            min="0"
                            value={params.costPerKg}
                            onChange={(e) => handleInputChange('costPerKg', parseFloat(e.target.value) || 0)}
                            className="h-8 bg-zinc-950 border-zinc-800 text-zinc-200 font-mono text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {params.shape === 'cube' && (
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center text-zinc-400">
                        <span>Side Length (a)</span>
                        <span className="font-mono text-zinc-200">{params.a?.toFixed(1)} mm</span>
                      </div>
                      <Slider 
                        value={params.a} 
                        min={10} max={500} step={1} 
                        indicatorClassName="bg-emerald-500"
                        onValueChange={(v) => handleInputChange('a', Array.isArray(v) ? v[0] : v)} 
                      />
                    </div>
                  )}
                  {params.shape === 'plate' && (
                    <>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center text-zinc-400">
                          <span>Length (L)</span>
                          <span className="font-mono text-zinc-200">{params.l?.toFixed(1)} mm</span>
                        </div>
                        <Slider 
                          value={params.l} min={50} max={1000} step={1} 
                          indicatorClassName="bg-emerald-500"
                          onValueChange={(v) => handleInputChange('l', Array.isArray(v) ? v[0] : v)} 
                        />
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center text-zinc-400">
                          <span>Width (W)</span>
                          <span className="font-mono text-zinc-200">{params.w?.toFixed(1)} mm</span>
                        </div>
                        <Slider 
                          value={params.w} min={50} max={1000} step={1} 
                          indicatorClassName="bg-emerald-500"
                          onValueChange={(v) => handleInputChange('w', Array.isArray(v) ? v[0] : v)} 
                        />
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center text-zinc-400">
                          <span>Thickness (T)</span>
                          <span className="font-mono text-zinc-200">{params.t?.toFixed(1)} mm</span>
                        </div>
                        <Slider 
                          value={params.t} min={5} max={200} step={1} 
                          indicatorClassName="bg-emerald-500"
                          onValueChange={(v) => handleInputChange('t', Array.isArray(v) ? v[0] : v)} 
                        />
                      </div>
                    </>
                  )}
                  {params.shape === 'cylinder' && (
                    <>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center text-zinc-400">
                          <span>Diameter (D)</span>
                          <span className="font-mono text-zinc-200">{params.d?.toFixed(1)} mm</span>
                        </div>
                        <Slider 
                          value={params.d} min={10} max={500} step={1} 
                          indicatorClassName="bg-emerald-500"
                          onValueChange={(v) => handleInputChange('d', Array.isArray(v) ? v[0] : v)} 
                        />
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center text-zinc-400">
                          <span>Height (H)</span>
                          <span className="font-mono text-zinc-200">{params.h?.toFixed(1)} mm</span>
                        </div>
                        <Slider 
                          value={params.h} min={10} max={1000} step={1} 
                          indicatorClassName="bg-emerald-500"
                          onValueChange={(v) => handleInputChange('h', Array.isArray(v) ? v[0] : v)} 
                        />
                      </div>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Safety Factor</label>
                <span className="text-xs text-emerald-400 font-mono tracking-tighter">{params.safetyFactor?.toFixed(2)}x</span>
              </div>
              <Slider 
                value={params.safetyFactor} min={1.0} max={1.5} step={0.01} 
                indicatorClassName="bg-emerald-500"
                onValueChange={(val) => handleInputChange('safetyFactor', Array.isArray(val) ? val[0] : val)} 
                className="accent-emerald-500" 
              />
            </div>

            <div className="pt-4 space-y-3 border-t border-zinc-800">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Riser D-Override</label>
                  <Tooltip>
                    <TooltipTrigger>
                      <span className="text-zinc-600 cursor-help text-[10px]">ⓘ</span>
                    </TooltipTrigger>
                    <TooltipContent className="bg-zinc-900 border-zinc-800 text-[10px] max-w-[200px]">
                      Manually scale the riser diameter predicted by the Modulus Method.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-xs font-mono text-zinc-300">{Math.round(params.riserOverrideFactor * 100)}%</span>
              </div>
              <Slider 
                value={params.riserOverrideFactor} min={0.5} max={2.0} step={0.01} 
                indicatorClassName={cn(
                  params.riserOverrideFactor < 1.2 ? "bg-emerald-500" :
                  params.riserOverrideFactor < 1.6 ? "bg-yellow-500" : "bg-red-500"
                )}
                thumbClassName={cn(
                  params.riserOverrideFactor < 1.2 ? "border-emerald-500" :
                  params.riserOverrideFactor < 1.6 ? "border-yellow-500" : "border-red-500"
                )}
                onValueChange={(val) => handleInputChange('riserOverrideFactor', Array.isArray(val) ? val[0] : val)} 
              />
            </div>
          </aside>

          {/* Middle Column: Main Focus */}
          <section className="p-6 flex flex-col gap-6 overflow-y-auto print:p-0">
            {/* Top Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 border border-zinc-800 rounded-xl bg-zinc-950 shadow-none">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Modulus (M<sub>c</sub>)</span>
                  <Tooltip>
                    <TooltipTrigger>
                      <span className="text-zinc-600 cursor-help text-[10px]">?</span>
                    </TooltipTrigger>
                    <TooltipContent className="bg-zinc-900 border-zinc-800 text-[10px]">
                      Modulus is the ratio of Volume to Surface Area (V/A). It determines cooling rate.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="text-2xl font-mono text-white tracking-tight">{designResults.casting.modulus?.toFixed(2)} <span className="text-sm text-zinc-500 font-sans ml-1">mm</span></div>
              </Card>
              <Card className="p-4 border border-zinc-800 rounded-xl bg-zinc-950 shadow-none">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Riser Modulus</span>
                  <Tooltip>
                    <TooltipTrigger>
                      <span className="text-zinc-600 cursor-help text-[10px]">?</span>
                    </TooltipTrigger>
                    <TooltipContent className="bg-zinc-900 border-zinc-800 text-[10px]">
                      Calculated riser modulus (M<sub>r</sub>). Must exceed M<sub>c</sub> by the safety factor to prevent shrinkage.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className={cn(
                  "text-2xl font-mono tracking-tight",
                  designResults.status === 'fail' ? "text-red-400" : "text-emerald-400"
                )}>
                  {designResults.riser.actualModulus?.toFixed(2)} <span className="text-sm font-sans ml-1 opacity-50">mm</span>
                </div>
              </Card>
              <div className={cn(
                "p-4 border rounded-xl flex flex-col items-center justify-center text-center transition-all duration-500",
                designResults.status === 'safe' ? "bg-emerald-500/10 border-emerald-500/30" :
                designResults.status === 'borderline' ? "bg-yellow-500/10 border-yellow-500/30" :
                "bg-red-500/10 border-red-500/30"
              )}>
                <span className={cn(
                  "text-[10px] uppercase font-black tracking-tighter mb-0.5",
                  designResults.status === 'safe' ? "text-emerald-500" :
                  designResults.status === 'borderline' ? "text-yellow-500" : "text-red-500"
                )}>Status</span>
                <div className={cn(
                  "text-2xl font-black tracking-widest",
                  designResults.status === 'safe' ? "text-emerald-400" :
                  designResults.status === 'borderline' ? "text-yellow-400" : "text-red-400"
                )}>{designResults.status.toUpperCase()}</div>
                <span className={cn(
                  "text-[8px] mt-1 shrink-0 px-2 py-0.5 rounded-full border",
                  designResults.status === 'safe' ? "text-emerald-600 border-emerald-500/20" :
                  designResults.status === 'borderline' ? "text-yellow-600 border-yellow-500/20" :
                  "text-red-600 border-red-500/20"
                )}>M<sub>r</sub><sup>2</sup> {designResults.status === 'safe' ? '>' : '<'} 1.1 × M<sub>c</sub><sup>2</sup></span>

                {designResults.status === 'fail' && (
                  <div className="mt-3 text-[9px] font-medium text-red-400/90 space-y-1 bg-red-950/30 p-2 rounded border border-red-900/30 w-full text-left leading-tight">
                     <p>• Riser solidifies faster than casting → shrinkage cavity likely</p>
                     <p>• Increase riser modulus by ~20%</p>
                  </div>
                )}
              </div>
            </div>

            {/* Main Visualizations */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[300px]">
              <div className="border border-zinc-800 rounded-xl bg-zinc-950 overflow-hidden flex flex-col shadow-inner">
                <div className="p-3 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/30">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-3 h-3" /> Solidification Curve
                  </span>
                  <span className="text-[10px] text-emerald-500 font-mono tracking-tighter">t<sub>s</sub> ∝ M<sup>2</sup></span>
                </div>
                <div className="flex-1 p-4 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#18181b" />
                      <XAxis dataKey="time" hide />
                      <YAxis domain={[1420, 1580]} hide />
                      <Area type="monotone" dataKey="castingTemp" stroke="#10b981" fill="#10b981" fillOpacity={0.05} strokeWidth={2} name="Casting" />
                      <Area type="monotone" dataKey="riserTemp" stroke="#374151" strokeDasharray="4 2" fill="transparent" strokeWidth={1} name="Riser" />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '10px' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="absolute top-6 left-12 flex flex-col gap-1 pointer-events-none">
                     <span className="text-[8px] text-zinc-500 uppercase bg-zinc-900/80 px-1 py-0.5 border border-zinc-800 rounded">Solidification Trend (Based on Modulus)</span>
                  </div>
                </div>
              </div>
              
              <div className="border border-zinc-800 rounded-xl bg-zinc-950 overflow-hidden flex flex-col">
                <div className="p-3 border-b border-zinc-800 bg-zinc-900/30 w-full z-10 flex justify-between">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                    <Box className="w-3 h-3" /> Riser Schematic
                  </span>
                  <span className="text-[10px] text-zinc-500 flex items-center">Interactive 3D</span>
                </div>
                <div className="flex-1 relative bg-zinc-950 min-h-[300px]">
                   <div className="absolute inset-0 cursor-move">
                     <RiserSchematic3D 
                        shape={params.shape}
                        dims={{ a: params.a, l: params.l, w: params.w, t: params.t, d: params.d, h: params.h }}
                        riserDia={designResults.riser.actualDiameter}
                        riserHeight={designResults.riser.actualHeight}
                        isBlind={designResults.recommendedRiserType === 'Blind Riser'}
                     />
                   </div>
                   
                   <div className="absolute top-4 left-4 bg-zinc-950/80 p-2 rounded border border-zinc-800/50 pointer-events-none backdrop-blur-sm z-10">
                    <div className="text-[10px] space-y-1 font-mono text-zinc-400">
                      <div className="flex gap-2"><span>Riser D:</span> <span className="text-zinc-200">{designResults.riser.actualDiameter?.toFixed(1)}mm</span></div>
                      <div className="flex gap-2"><span>Riser H:</span> <span className="text-zinc-200">{designResults.riser.actualHeight?.toFixed(1)}mm</span></div>
                    </div>
                   </div>

                   <div className="absolute bottom-4 right-4 text-right pointer-events-none bg-zinc-950/80 p-2.5 rounded border border-zinc-800/50 backdrop-blur-sm z-10 max-w-[200px]">
                     <p className="text-[10px] text-zinc-500 uppercase tracking-widest border-b border-zinc-800/50 pb-1 mb-1.5">Recommended Type</p>
                     <div className="text-xs font-bold text-emerald-400 uppercase tracking-tight flex items-center justify-end gap-1.5 mb-1.5">
                       {designResults.recommendedRiserType === 'Blind Riser' ? (
                          <span className="w-1.5 h-1.5 bg-emerald-500 shrink-0 inline-block" />
                       ) : (
                          <span className="w-1.5 h-1.5 border border-red-500 shrink-0 rounded-full inline-block" />
                       )}
                       {designResults.recommendedRiserType}
                     </div>
                     <p className="text-[9px] text-zinc-400 leading-tight">
                       {designResults.recommendedRiserType === 'Blind Riser' 
                         ? "Suggested for thicker geometries (≥30mm). Highly efficient heat retention leads to slower internal cooling."
                         : "Suggested for thin sections (<30mm). Exposing to atmospheric pressure provides stronger feed gradients."}
                     </p>
                   </div>
                </div>
              </div>
            </div>

            {/* Detailed Results Table */}
            <div className="border border-zinc-800 rounded-xl bg-zinc-950 p-4 shadow-sm">
              <div className="grid grid-cols-4 text-center gap-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-1">
                    <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Casting Vol</p>
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="text-zinc-600 cursor-help text-[9px] mb-[1px]">?</span>
                      </TooltipTrigger>
                      <TooltipContent className="bg-zinc-900 border-zinc-800 text-[10px]">
                        The calculated volume of the cast part.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="font-mono text-sm text-zinc-200">{(designResults.casting.volume / 1000).toLocaleString()} <span className="text-[10px] opacity-50">cm³</span></p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-1">
                    <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Riser Vol</p>
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="text-zinc-600 cursor-help text-[9px] mb-[1px]">?</span>
                      </TooltipTrigger>
                      <TooltipContent className="bg-zinc-900 border-zinc-800 text-[10px]">
                        The volume of the feeder riser.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="font-mono text-sm text-zinc-200">{(designResults.riser.actualVolume / 1000).toLocaleString()} <span className="text-[10px] opacity-50">cm³</span></p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-1">
                    <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Pour Weight</p>
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="text-zinc-600 cursor-help text-[9px] mb-[1px]">?</span>
                      </TooltipTrigger>
                      <TooltipContent className="bg-zinc-900 border-zinc-800 text-[10px] text-balance text-left max-w-[200px]">
                        Total weight of molten metal required, calculated using density.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="font-mono text-sm text-zinc-200">{((designResults.casting.volume + designResults.riser.actualVolume) * params.density / 1000)?.toFixed(2)} <span className="text-[10px] opacity-50">kg</span></p>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] text-emerald-500 uppercase tracking-widest font-bold mt-[2px]">Projected Yield</p>
                  <p className="font-mono text-sm font-bold text-emerald-400">{designResults.yieldPercentage?.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          </section>

          {/* Right Column: Predictions & Alerts */}
          <aside className="border-l border-zinc-800 p-4 flex flex-col bg-zinc-950/50 overflow-y-auto print:hidden">
            
            <div className="space-y-3 mb-8">
              {designResults.failures.length > 0 && designResults.failures.map(fail => (
                <div key={fail.id} className={cn(
                  "p-3 rounded-lg flex gap-3 items-start border shadow-sm transition-all animate-in fade-in slide-in-from-right-4",
                  fail.type === 'critical' ? "bg-red-500/10 border-red-500/20" : "bg-amber-500/10 border-amber-500/20"
                )}>
                  <div className={cn(
                    "w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 shadow-sm",
                    fail.type === 'critical' ? "bg-red-600" : "bg-amber-600"
                  )}>
                    <span className="text-[10px] font-bold text-white">!</span>
                  </div>
                  <div>
                    <p className={cn(
                      "text-xs font-bold leading-none",
                      fail.type === 'critical' ? "text-red-200" : "text-amber-200"
                    )}>{fail.title}</p>
                    <p className={cn(
                      "text-[10px] leading-tight mt-1 opacity-80",
                      fail.type === 'critical' ? "text-red-400" : "text-amber-400"
                    )}>{fail.desc}</p>
                    {fail.suggestion && (
                      <p className={cn(
                        "text-[10px] leading-tight mt-1.5 font-medium italic",
                        fail.type === 'critical' ? "text-red-300" : "text-amber-300"
                      )}>Suggestion: {fail.suggestion}</p>
                    )}
                  </div>
                </div>
              ))}
              
            </div>

            <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-4 border-b border-zinc-800 pb-2 flex items-center gap-2">
               <Brain className="w-3 h-3 text-purple-500" /> AI Design Insights
            </h3>
            <div className="space-y-3 mb-6">
              {isAILoading ? (
                <div className="p-6 flex flex-col items-center justify-center gap-2 bg-zinc-900/50 border border-zinc-800 rounded-lg">
                  <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
                  <span className="text-[10px] text-zinc-500 font-medium animate-pulse">Gemini Analysis...</span>
                </div>
              ) : aiInsights ? (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2.5"
                >
                  <div className="bg-purple-500/5 border border-purple-500/20 p-2.5 rounded-lg">
                    <p className="text-[9px] font-bold text-purple-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                      <AlertTriangle className="w-2.5 h-2.5" /> Risk Profile
                    </p>
                    <p className="text-[11px] text-zinc-300 leading-tight">{aiInsights.failureAnalysis}</p>
                  </div>
                  <div className="bg-blue-500/5 border border-blue-500/20 p-2.5 rounded-lg">
                    <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                      <Sparkles className="w-2.5 h-2.5" /> Strategic Advice
                    </p>
                    <p className="text-[11px] text-zinc-300 leading-tight">{aiInsights.designAdvice}</p>
                  </div>
                  <div className="bg-emerald-500/5 border border-emerald-500/20 p-2.5 rounded-lg">
                    <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Riser Guidance
                    </p>
                    <p className="text-[11px] text-zinc-300 leading-tight">{aiInsights.recommendation}</p>
                  </div>
                </motion.div>
              ) : (
                <div className="p-4 text-center text-[10px] text-zinc-600 border border-dashed border-zinc-800 rounded-lg">
                  Adjust parameters to trigger AI insights
                </div>
              )}
            </div>

            <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-4 border-b border-zinc-800 pb-2 flex items-center gap-2">
              <TrendingUp className="w-3 h-3 text-blue-500" /> Yield Comparison
            </h3>
            <div className="flex-1 bg-zinc-900/80 rounded-xl border border-zinc-800 p-4 space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest text-zinc-500">
                  <span>Metric</span>
                  <span>Curr</span>
                  <span className="text-emerald-500">Optimum</span>
                </div>
                <div className="h-px bg-zinc-800/50"></div>
                
                {/* Visual Path indicator */}
                <div className="flex justify-between items-center text-[10px] font-mono whitespace-nowrap overflow-hidden">
                   <div className="text-zinc-500 flex flex-col">
                     <span>Initial:</span>
                     <span>{designResults.baseline.yield.toFixed(1)}%</span>
                   </div>
                   <div className="h-px bg-zinc-800 flex-1 mx-2 relative">
                     <ChevronRight className="absolute -top-1.5 left-1/2 -ml-1 text-zinc-700 w-3 h-3" />
                   </div>
                   <div className="flex flex-col text-right">
                     <span className="text-zinc-400">Current (<span className="text-emerald-400 font-bold">+{Math.max(0, designResults.yieldPercentage - designResults.baseline.yield).toFixed(1)}%</span>)</span>
                     <span className="text-zinc-200">{designResults.yieldPercentage?.toFixed(1)}%</span>
                   </div>
                </div>

                <div className="flex justify-between text-xs font-mono group pt-2 border-t border-zinc-800/50">
                  <span className="text-zinc-500 border-r border-zinc-800/50 pr-2 w-12">Yield</span>
                  <span className="text-zinc-300">{designResults.yieldPercentage?.toFixed(1)}%</span>
                  <span className="text-emerald-400 font-bold group-hover:scale-110 transition-transform">{designResults.optimized.yield?.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-zinc-500 border-r border-zinc-800/50 pr-2 w-12">D (mm)</span>
                  <span className="text-zinc-300">{designResults.riser.actualDiameter?.toFixed(1)}</span>
                  <span className="text-emerald-400">{designResults.optimized.riser.actualDiameter?.toFixed(1)}</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-zinc-500 border-r border-zinc-800/50 pr-2 w-12">Safety</span>
                  <span className={cn(
                    designResults.status === 'fail' ? "text-red-400" : "text-emerald-400"
                  )}>{designResults.status === 'safe' ? 'PASS' : 'FAIL'}</span>
                  <span className={cn(
                    "font-bold",
                    designResults.optimized.status === 'safe' ? "text-emerald-400" : "text-yellow-500"
                  )}>{designResults.optimized.status === 'safe' ? '1.1x+' : '1.0x'}</span>
                </div>
              </div>
              
              <div className="pt-2 border-t border-zinc-800/50 space-y-2">
                <p className="text-[9px] text-zinc-500 italic leading-relaxed text-center">
                  Optimized by reducing riser size until solidification condition is just satisfied
                </p>

                {designResults.status === 'safe' && designResults.analysis.currentRatioSq <= 1.15 && (
                   <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-[10px] p-2 rounded text-center leading-tight">
                     <strong>Design is at minimum safe limit.</strong> Further reduction will cause failure.
                   </div>
                )}

                {designResults.status === 'safe' && designResults.analysis.currentRatioSq > 1.1 && (
                  <Button 
                     onClick={() => handleInputChange('riserOverrideFactor', designResults.optimized.smartStepFactor)}
                     className="w-full h-8 bg-zinc-800 border-zinc-700 text-zinc-300 text-[10px] hover:bg-emerald-600 hover:text-white border-none font-bold uppercase tracking-widest transition-all"
                  >
                    Smart Optimize (-{designResults.analysis.currentRatioSq > 1.3 ? '10' : '3'}%)
                  </Button>
                )}

                {designResults.status === 'safe' && designResults.analysis.currentRatioSq <= 1.1 && (
                  <Button 
                     disabled
                     className="w-full h-8 bg-emerald-950 border border-emerald-900 text-emerald-500 text-[10px] opacity-100 font-bold uppercase tracking-widest transition-all"
                  >
                    <CheckCircle2 className="w-3 h-3 mr-2" /> Optimal Riser Size Found
                  </Button>
                )}

                {designResults.status === 'fail' && lastSafeFactor !== params.riserOverrideFactor && (
                  <Button 
                     onClick={() => handleInputChange('riserOverrideFactor', lastSafeFactor)}
                     className="w-full mt-2 h-8 bg-red-950/40 text-red-500 border border-red-900/50 hover:bg-red-900 hover:text-white text-[10px] font-bold uppercase tracking-widest transition-all"
                  >
                    <Undo className="w-3 h-3 mr-2 mb-[1px]" /> Revert to Safe State
                  </Button>
                )}

                {designResults.status === 'safe' && designResults.yieldPercentage < designResults.optimized.yield && (
                  <div className="mt-4 p-3 bg-emerald-950/20 border border-emerald-900/50 rounded-lg text-[10px] text-emerald-400 leading-relaxed shadow-inner">
                    <p className="font-bold flex items-center gap-1.5 mb-2 text-emerald-300 uppercase tracking-widest"><LightbulbIcon className="w-3 h-3" /> Design Insight</p>
                    <div className="space-y-1 mb-2">
                       <p className="text-emerald-500/90">• Current design is safe but overdesigned → excess material used.</p>
                       <p className="font-medium">• Optimized design improves yield by <span className="font-bold text-white bg-emerald-600/30 px-1 py-0.5 rounded mx-0.5">{(designResults.optimized.yield - designResults.yieldPercentage).toFixed(1)}%</span></p>
                    </div>
                    <div className="border-t border-emerald-900/40 pt-2 flex flex-col gap-0.5 font-mono">
                      <div className="flex justify-between items-center text-emerald-500/80">
                         <span>Material wasted (excess):</span>
                         <span>{designResults.analysis.materialWastedKg.toFixed(2)} kg</span>
                      </div>
                      <div className="flex justify-between items-center text-emerald-400">
                         <span>Estimated extra cost:</span>
                         <span className="bg-emerald-950/50 px-1 py-0.5 rounded border border-emerald-900/50">₹{designResults.analysis.estimatedExtraCost.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 p-3 bg-zinc-950/80 border border-zinc-800 rounded-lg flex justify-between items-center group">
               <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Unit System</span>
               <span className="text-[10px] text-zinc-200 font-mono flex items-center gap-1.5">
                 <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> METRIC (ISO)
               </span>
            </div>
          </aside>
        </main>

        {/* Sticky Disclaimer Footer */}
        <footer className="h-12 bg-zinc-950 border-t border-zinc-800 flex items-center px-6 justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-[9px] text-zinc-500 font-black bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 uppercase tracking-[2px]">Disclaimer</span>
            <p className="text-[10px] text-zinc-600 font-medium">Preliminary educational tool. Not for industrial production without professional FEA / CFD simulation.</p>
          </div>
        </footer>
      </TooltipProvider>

      {/* Engineering Explanation Modal */}
      {showExplanation && (
        <div className="fixed inset-0 z-[100] bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95">
             <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
                <h2 className="text-sm font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2"><HelpCircle className="w-4 h-4" /> Engineering Explanation</h2>
                <button onClick={() => setShowExplanation(false)} className="text-zinc-500 hover:text-zinc-300">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
             </div>
             <div className="p-6 space-y-6 text-sm text-zinc-300">
                <div>
                  <h3 className="font-bold text-zinc-100 uppercase tracking-widest text-xs mb-2 border-b border-zinc-800 pb-1">1. Modulus Calculation</h3>
                  <p className="mb-2">The cooling rate of a casting is proportional to its <strong>Modulus (M)</strong>, defined by Chvorinov's Rule:</p>
                  <div className="bg-zinc-950 p-3 rounded font-mono text-center text-emerald-400 border border-zinc-800/50 mb-2">M = Volume (V) / Surface Area (A)</div>
                  <p className="text-xs text-zinc-400">A higher modulus implies a slower cooling rate. The geometric shape entirely dictates this ratio.</p>
                </div>

                <div>
                  <h3 className="font-bold text-zinc-100 uppercase tracking-widest text-xs mb-2 border-b border-zinc-800 pb-1">2. Required Riser Modulus</h3>
                  <p className="mb-2">To prevent shrinkage cavities inside the casting, the riser must act as a liquid reservoir that feeds the casting as it solidifies and shrinks. Therefore, the riser must freeze <strong>after</strong> the casting.</p>
                  <div className="bg-zinc-950 p-3 rounded font-mono text-center text-cyan-400 border border-zinc-800/50 mb-2">M<sub>riser</sub> = M<sub>casting</sub> × Safety Factor (1.2)</div>
                  <p className="text-xs text-zinc-400">The 1.2 safety factor ensures the riser remains molten roughly 20% longer than the main casting body.</p>
                </div>

                <div>
                  <h3 className="font-bold text-zinc-100 uppercase tracking-widest text-xs mb-2 border-b border-zinc-800 pb-1">3. Decision Logic</h3>
                  <ul className="list-disc pl-5 space-y-1.5 text-xs text-zinc-400">
                    <li><strong className="text-emerald-400">PASS (Safe):</strong> M<sub>r</sub>² &gt; 1.1 × M<sub>c</sub>². The thermal mass strongly favors the riser.</li>
                    <li><strong className="text-yellow-400">BORDERLINE:</strong> M<sub>c</sub>² ≤ M<sub>r</sub>² ≤ 1.1 × M<sub>c</sub>². Theoretical sufficiency, but risky under real-world fluctuations.</li>
                    <li><strong className="text-red-400">FAIL:</strong> M<sub>r</sub>² &lt; M<sub>c</sub>². The riser solidifies before the casting center, guaranteeing a massive shrinkage defect in the casting.</li>
                  </ul>
                </div>
             </div>
             <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex justify-end">
                <Button onClick={() => setShowExplanation(false)} className="bg-zinc-800 hover:bg-zinc-700 text-white">Understood</Button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
