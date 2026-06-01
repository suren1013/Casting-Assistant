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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import RiserSchematic3D from './RiserSchematic3D';

// --- Alloy Database ---
export type AlloyType = 'castIron' | 'ductileIron' | 'carbonSteel' | 'stainlessSteel' | 'aluminumA356' | 'bronze';

export const ALLOY_DATA: Record<AlloyType, { name: string, shrinkage: number, modulusFactor: number, feedingDistanceFactor: number, freezingRange: 'Wide' | 'Narrow', defaultTemp: number, density: number, costPerKg: number }> = {
  castIron: { name: 'Cast Iron', shrinkage: 1.5, modulusFactor: 1.1, feedingDistanceFactor: 1.1, freezingRange: 'Narrow', defaultTemp: 1350, density: 7.2, costPerKg: 100 },
  ductileIron: { name: 'Ductile Iron', shrinkage: 2.0, modulusFactor: 1.15, feedingDistanceFactor: 1.0, freezingRange: 'Narrow', defaultTemp: 1400, density: 7.1, costPerKg: 120 },
  carbonSteel: { name: 'Carbon Steel', shrinkage: 2.5, modulusFactor: 1.25, feedingDistanceFactor: 1.0, freezingRange: 'Wide', defaultTemp: 1550, density: 7.85, costPerKg: 60 },
  stainlessSteel: { name: 'Stainless Steel', shrinkage: 3.0, modulusFactor: 1.3, feedingDistanceFactor: 0.9, freezingRange: 'Wide', defaultTemp: 1600, density: 8.0, costPerKg: 180 },
  aluminumA356: { name: 'Aluminum A356', shrinkage: 1.3, modulusFactor: 1.15, feedingDistanceFactor: 1.2, freezingRange: 'Narrow', defaultTemp: 700, density: 2.67, costPerKg: 250 },
  bronze: { name: 'Bronze', shrinkage: 1.6, modulusFactor: 1.2, feedingDistanceFactor: 1.1, freezingRange: 'Wide', defaultTemp: 1100, density: 8.8, costPerKg: 600 }
};

export type ShapeType = 'plate' | 'cylinder' | 'block' | 'ribbedPlate' | 'bossedCasting' | 'complexJunction';

export interface DesignParams {
  shape: ShapeType;
  l: number; 
  w: number; 
  t: number; 
  d: number; 
  h: number; 
  thickestSection: number;
  thinnestSection: number;
  alloy: AlloyType;
  pouringTemperature: number;
  moldType: 'greenSand' | 'resinSand' | 'shellMold' | 'investment';
  orientation: 'horizontal' | 'vertical' | 'inclined';
  riserType: 'open' | 'blind' | 'side' | 'top' | 'insulated' | 'exothermic';
  neckDiameter: number; 
  neckLength: number; 
  useChills: boolean;
  chillType: 'external' | 'internal';
  qualityClass: 'general' | 'industrial' | 'automotive' | 'aerospace';
  riserOverrideFactor: number; 
  shrinkageAllowance: number; 
  machiningAllowance: number; 
  draftAllowance: number;
}

// --- Logic Helpers ---

const calculateCasting = (params: DesignParams) => {
  const addAllowances = (dim: number) => {
    const d = Number(dim) || 0;
    const m = Number(params.machiningAllowance) || 0;
    const dr = Number(params.draftAllowance) || 0;
    const s = Number(params.shrinkageAllowance) || 0;
    return (d + m + dr) * (1 + s / 100);
  };

  let volume = 0;
  let area = 0;
  let thickness = params.t;

  const l_p = addAllowances(params.l);
  const w_p = addAllowances(params.w);
  const t_p = addAllowances(params.t);
  const d_p = addAllowances(params.d);
  const h_p = addAllowances(params.h);

  switch (params.shape) {
    case 'block':
      volume = l_p * w_p * t_p;
      area = 2 * (l_p * w_p + w_p * t_p + l_p * t_p);
      thickness = Math.min(l_p, w_p, t_p);
      break;
    case 'plate':
      volume = l_p * w_p * t_p;
      area = 2 * (l_p * w_p + w_p * t_p + l_p * t_p);
      thickness = t_p;
      break;
    case 'cylinder':
      volume = (Math.PI / 4) * Math.pow(d_p, 2) * h_p;
      area = Math.PI * d_p * h_p + (Math.PI / 2) * Math.pow(d_p, 2);
      thickness = Math.min(d_p, h_p);
      break;
    case 'ribbedPlate':
      volume = l_p * w_p * t_p * 0.8;
      area = 2 * (l_p * w_p + w_p * t_p + l_p * t_p) * 1.5;
      thickness = t_p;
      break;
    case 'bossedCasting':
      volume = l_p * w_p * t_p * 1.1;
      area = 2 * (l_p * w_p + w_p * t_p + l_p * t_p) * 1.1;
      thickness = t_p;
      break;
    case 'complexJunction':
      volume = l_p * w_p * t_p * 0.9;
      area = 2 * (l_p * w_p + w_p * t_p + l_p * t_p) * 1.3;
      thickness = t_p;
      break;
  }

  const modulus = area > 0 ? (volume / area) : 0;
  return { volume, area, modulus, thickness, l_p, w_p, t_p, d_p, h_p };
};

const calculateRiser = (cModulus: number, params: DesignParams, baseVolume: number) => {
  const cm = Number(cModulus) || 0.001; 
  
  const qualityFactorDict = {
    general: 1.05,
    industrial: 1.10,
    automotive: 1.20,
    aerospace: 1.30
  };
  const safetyFactor = qualityFactorDict[params.qualityClass] || 1.1;

  const alloy = ALLOY_DATA[params.alloy];
  
  // Pouring temp adjustment
  const tempDiff = params.pouringTemperature - alloy.defaultTemp;
  const tempModulusMultiplier = tempDiff >= 50 ? 1.05 : 1.0;

  let reqModulus = cm * alloy.modulusFactor * safetyFactor * tempModulusMultiplier;
  if(params.useChills) {
      reqModulus *= 0.9; // 10% reduction
  }
  
  const of = Number(params.riserOverrideFactor) || 1.0;

  // Standard Riser Modulus
  const baseDiameter = 6 * reqModulus;
  const actualDiameter = baseDiameter * of;
  const actualHeight = actualDiameter; 
  
  const orientationEff: Record<string, number> = {
    horizontal: 1.0,
    vertical: 1.1,
    inclined: 1.05
  };
  const eff = orientationEff[params.orientation] || 1.0;

  const reqRiserVolRaw = baseVolume / eff;
  const reqRiserVol = params.useChills ? reqRiserVolRaw * 0.9 : reqRiserVolRaw;

  let actualVolume = (Math.PI / 4) * Math.pow(actualDiameter, 2) * actualHeight;

  const actualArea = Math.PI * actualDiameter * actualHeight + (Math.PI / 2) * Math.pow(actualDiameter, 2);
  const actualModulusRaw = actualArea > 0 ? (actualVolume / actualArea) : 0;

  const riserEff: Record<string, number> = {
    open: 1.0,
    blind: 1.15,
    side: 0.95,
    top: 1.1,
    insulated: 1.25,
    exothermic: 1.35
  };
  const rEff = riserEff[params.riserType] || 1.0;

  const effectiveRiserModulus = actualModulusRaw * rEff;

  return { 
    requiredModulus: reqModulus, 
    baseDiameter, 
    actualDiameter, 
    actualHeight, 
    actualVolume, 
    actualModulus: effectiveRiserModulus,
    safetyFactor
  };
};

const getStatus = (reqModulus: number, effectiveRiserModSq: number, reqModulusSq: number) => {
  if (effectiveRiserModSq > 1.1 * reqModulusSq) return 'safe';
  if (effectiveRiserModSq >= reqModulusSq) return 'borderline';
  return 'fail';
};

interface AIInsights {
  feedingAnalysis: string;
  defectPrediction: string;
  costImpact: string;
  recommendations: string[];
}

// --- Main Component ---

export default function CastingDashboard() {
  const [params, setParams] = useState<DesignParams>({
    shape: 'plate',
    l: 300,
    w: 200,
    t: 20,
    d: 100,
    h: 150,
    thickestSection: 20,
    thinnestSection: 20,
    alloy: 'carbonSteel',
    pouringTemperature: 1550,
    moldType: 'greenSand',
    orientation: 'horizontal',
    riserType: 'blind',
    neckDiameter: 0,
    neckLength: 0,
    useChills: false,
    chillType: 'external',
    qualityClass: 'industrial',
    riserOverrideFactor: 1.0,
    shrinkageAllowance: 2.5,
    machiningAllowance: 3.0,
    draftAllowance: 1.0
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
    const alloy = ALLOY_DATA[params.alloy];
    const riser = calculateRiser(casting.modulus, params, casting.volume);
    
    // Total Volume accounting for mould type (mock computation of actual cooling effect)
    const moldCoolFlow = { greenSand: 1.0, resinSand: 0.95, shellMold: 0.85, investment: 0.80 }[params.moldType] || 1.0;
    
    const totalVol = casting.volume + riser.actualVolume;
    const yieldPercentage = totalVol > 0 ? (casting.volume / totalVol) * 100 : 0;
    
    const reqModSq = Math.pow(riser.requiredModulus, 2);
    const effModSq = Math.pow(riser.actualModulus, 2);
    const status = getStatus(reqModSq, effModSq, reqModSq);
    
    // Hotspot Evaluation
    const thicknessVariation = params.thickestSection > 0 ? ((params.thickestSection - params.thinnestSection) / params.thickestSection) * 100 : 0;
    let baseRisk = thicknessVariation;
    if (params.shape === 'bossedCasting') baseRisk += 20;
    if (params.shape === 'complexJunction') baseRisk += 25;
    if (params.orientation === 'horizontal') baseRisk += 10;
    if (alloy.freezingRange === 'Wide') baseRisk += 10;
    const tempDiff = params.pouringTemperature - alloy.defaultTemp;
    if (tempDiff >= 50) baseRisk += 10;
    if (params.useChills) baseRisk -= 20;
    const hotspotScore = Math.min(100, Math.max(0, baseRisk));

    // Feeding Distance
    const feedingDistance = params.thickestSection * alloy.feedingDistanceFactor * 4;
    const longestSection = Math.max(casting.l_p, casting.w_p, casting.d_p || 0);
    const reqRiserCount = Math.ceil(longestSection / (feedingDistance || 1));
    const fdRisk = longestSection > feedingDistance;

    // Optimal point estimation
    let optFactor = params.riserOverrideFactor;
    const ratioSq = reqModSq > 0 ? (effModSq / reqModSq) : 0;
    
    // We only shrink if we're well above safe.
    if (ratioSq > 1.1 && ratioSq !== Infinity) {
      optFactor = params.riserOverrideFactor * Math.sqrt(1.1 / ratioSq);
      optFactor *= 1.01;
    }
    
    const smartStep = ratioSq > 1.3 ? 0.9 : 0.97;
    const stepFactor = params.riserOverrideFactor * smartStep;
    
    const optimizedRiser = calculateRiser(casting.modulus, { ...params, riserOverrideFactor: optFactor }, casting.volume);
    const totalOptVol = casting.volume + optimizedRiser.actualVolume;
    const optimizedYield = totalOptVol > 0 ? (casting.volume / totalOptVol) * 100 : 0;
    const optimizedStatus = getStatus(Math.pow(optimizedRiser.requiredModulus, 2), Math.pow(optimizedRiser.actualModulus, 2), Math.pow(optimizedRiser.requiredModulus, 2));

    const initialRiser = calculateRiser(casting.modulus, { ...params, riserOverrideFactor: 1.0 }, casting.volume);
    const totalInitVol = casting.volume + initialRiser.actualVolume;
    const initialYield = totalInitVol > 0 ? (casting.volume / totalInitVol) * 100 : 0;

    const excessVolume = Math.max(0, riser.actualVolume - optimizedRiser.actualVolume);
    const materialWastedKg = (excessVolume * alloy.density) / 1000;
    const estimatedExtraCost = materialWastedKg * alloy.costPerKg;

    // Riser Neck Logic
    const autoNeckDia = riser.actualDiameter * 0.35;
    const autoNeckLen = riser.actualDiameter * 0.50;
    const actualNeckDia = params.neckDiameter > 0 ? params.neckDiameter : autoNeckDia;
    const actualNeckLen = params.neckLength > 0 ? params.neckLength : autoNeckLen;
    const neckRatio = actualNeckDia / riser.actualDiameter;

    // Design Health (0-100)
    let health = 100;
    health -= (hotspotScore * 0.25);
    if(fdRisk) health -= 25;
    if(ratioSq < 1.0) health -= 20; // Riser fails to feed
    if(yieldPercentage < 50) health -= 15;
    if(neckRatio < 0.25) health -= 10;
    health = Math.max(0, Math.min(100, health));

    const failures = [];
    if (thicknessVariation > 40) {
      failures.push({
        id: 'hotspot_var',
        title: 'High Hotspot Probability',
        desc: `Thickness variation is ${thicknessVariation.toFixed(0)}%.`,
        suggestion: 'Additional feeding analysis recommended.',
        type: 'warning'
      });
    }
    if(fdRisk && params.shape !== 'block') {
      failures.push({
        id: 'feeding_dist',
        title: 'Feeding Distance Exceeded',
        desc: `Longest path (${longestSection.toFixed(0)}mm) > alloy feed distance (${feedingDistance.toFixed(0)}mm).`,
        suggestion: `Single riser insufficient. Recommend ${reqRiserCount} risers.`,
        type: 'warning'
      });
    }
    if (neckRatio < 0.25) {
      failures.push({
        id: 'neck_freeze',
        title: 'Neck Freeze Risk',
        desc: 'Neck diameter < 25% of riser diameter.',
        suggestion: 'Neck may freeze before casting. Increase neck thickness.',
        type: 'warning'
      });
    }
    if (neckRatio > 0.50) {
       failures.push({
        id: 'neck_yield',
        title: 'Yield Loss Risk',
        desc: 'Neck diameter > 50% of riser diameter.',
        suggestion: 'Excess metal yield loss and machining cost.',
        type: 'warning'
      });
    }

    return {
      casting,
      riser,
      yieldPercentage,
      status,
      thicknessVariation,
      hotspotScore,
      feedingDistance,
      longestSection,
      reqRiserCount,
      neck: { dia: actualNeckDia, len: actualNeckLen, ratio: neckRatio },
      health,
      recommendedRiserType: 'Blind Riser', // legacy support
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
        currentRatioSq: ratioSq,
        fdRisk,
        materialWastedKg,
        estimatedExtraCost,
        tempMult: params.pouringTemperature - ALLOY_DATA[params.alloy].defaultTemp >= 50 ? 1.05 : 1.0
      }
    };
  }, [params]);

  // Track the last completely safe override configuration
  useEffect(() => {
    if (designResults.status === 'safe') {
      setLastSafeFactor(params.riserOverrideFactor);
    }
  }, [designResults.status, params.riserOverrideFactor]);

  const [lastAnalyzedParamsHash, setLastAnalyzedParamsHash] = useState<string | null>(null);
  const [aiAnalysisStatus, setAiAnalysisStatus] = useState<'Not Generated' | 'Cached' | 'Fresh Analysis'>('Not Generated');

  // Generate AI Insights on-demand
  const generateAIReview = async (forceRegenerate = false) => {
    if (!ai) return;
    
    const currentHash = JSON.stringify(params);
    
    // Use cache if not forcefully regenerating and params haven't changed
    if (!forceRegenerate && currentHash === lastAnalyzedParamsHash && aiInsights) {
      setAiAnalysisStatus('Cached');
      return;
    }

    setIsAILoading(true);
    setAiAnalysisStatus('Fresh Analysis');
    
    try {
      const prompt = `As a casting foundry expert, analyze this design:
Geometry: ${params.shape} (${params.l}x${params.w}x${params.t} mm)
Thickest: ${params.thickestSection}mm, Thinnest: ${params.thinnestSection}mm
Alloy: ${ALLOY_DATA[params.alloy].name} (Density: ${ALLOY_DATA[params.alloy].density} g/cm3)
Pouring Temp: ${params.pouringTemperature}°C, Orientation: ${params.orientation}
Riser Type: ${params.riserType}, Chills: ${params.useChills ? params.chillType : 'None'}
Yield: ${designResults.yieldPercentage.toFixed(1)}%
Status: ${designResults.status}
Hotspot Score: ${designResults.hotspotScore.toFixed(0)}
Health Score: ${designResults.health.toFixed(0)}

Provide:
1. Feeding Analysis: Explain why this riser strategy works or fails based on the alloy and geometry. (max 20 words)
2. Defect Prediction: Predict Shrinkage Risk, Porosity Risk, Hotspot Risk. (max 20 words)
3. Cost Impact: Estimate Yield % realism and Metal Loss. (max 20 words)
4. Recommendations: 2 specific string recommendations (e.g., "Switching to blind riser would reduce volume by 12%").

Return ONLY JSON with keys: feedingAnalysis, defectPrediction, costImpact, recommendations.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              feedingAnalysis: { type: Type.STRING },
              defectPrediction: { type: Type.STRING },
              costImpact: { type: Type.STRING },
              recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["feedingAnalysis", "defectPrediction", "costImpact", "recommendations"]
          }
        }
      });

      const resultText = response.text;
      if (resultText) {
        const parsed = JSON.parse(resultText);
        setAIInsights(parsed);
        setLastAnalyzedParamsHash(currentHash);
      }
    } catch (error) {
      console.error("AI Insight Error:", error);
    } finally {
      setIsAILoading(false);
    }
  };

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
    let safeValue = Array.isArray(value) ? value[0] : value;
    
    const numericFields: (keyof DesignParams)[] = [
      'l', 'w', 't', 'd', 'h', 'thickestSection', 'thinnestSection',
      'pouringTemperature', 'neckDiameter', 'neckLength',
      'riserOverrideFactor', 'shrinkageAllowance', 'machiningAllowance', 'draftAllowance'
    ];
    
    if (numericFields.includes(key)) {
      const num = parseFloat(safeValue);
      safeValue = isNaN(num) ? 0 : num;
    }

    setParams(prev => {
      if (prev[key] === safeValue) return prev;
      return { ...prev, [key]: safeValue };
    });
  };

  const resetToDefaults = () => {
    setParams({
      shape: 'plate',
      l: 300,
      w: 200,
      t: 20,
      d: 100,
      h: 150,
      thickestSection: 20,
      thinnestSection: 20,
      alloy: 'carbonSteel',
      pouringTemperature: 1550,
      moldType: 'greenSand',
      orientation: 'horizontal',
      riserType: 'blind',
      neckDiameter: 0,
      neckLength: 0,
      useChills: false,
      chillType: 'external',
      qualityClass: 'industrial',
      riserOverrideFactor: 1.0,
      shrinkageAllowance: 2.5,
      machiningAllowance: 3.0,
      draftAllowance: 1.0
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
            
            {/* SECTION 1: CASTING GEOMETRY */}
            <div className="space-y-4">
              <label className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-zinc-800 pb-1">
                 1. Casting Geometry
              </label>
              <Select value={params.shape} onValueChange={(v) => handleInputChange('shape', v)}>
                <SelectTrigger className="h-8 bg-zinc-900 border-zinc-800 text-xs text-white">
                  <SelectValue placeholder="Select Shape" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                  <SelectItem value="plate">Plate</SelectItem>
                  <SelectItem value="cylinder">Cylindrical</SelectItem>
                  <SelectItem value="block">Block</SelectItem>
                  <SelectItem value="ribbedPlate">Ribbed Plate</SelectItem>
                  <SelectItem value="bossedCasting">Bossed Casting</SelectItem>
                  <SelectItem value="complexJunction">Complex Junction</SelectItem>
                </SelectContent>
              </Select>

              <div className="grid grid-cols-2 gap-3 bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/50">
                {params.shape !== 'cylinder' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 uppercase">Length (mm)</label>
                      <Input value={params.l} onChange={(e) => handleInputChange('l', e.target.value)} className="h-7 bg-zinc-950 border-zinc-800 text-xs font-mono" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 uppercase">Width (mm)</label>
                      <Input value={params.w} onChange={(e) => handleInputChange('w', e.target.value)} className="h-7 bg-zinc-950 border-zinc-800 text-xs font-mono" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 uppercase">Avg Thick (mm)</label>
                      <Input value={params.t} onChange={(e) => handleInputChange('t', e.target.value)} className="h-7 bg-zinc-950 border-zinc-800 text-xs font-mono" />
                    </div>
                  </>
                )}
                {params.shape === 'cylinder' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 uppercase">Diameter (mm)</label>
                      <Input value={params.d} onChange={(e) => handleInputChange('d', e.target.value)} className="h-7 bg-zinc-950 border-zinc-800 text-xs font-mono" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 uppercase">Height (mm)</label>
                      <Input value={params.h} onChange={(e) => handleInputChange('h', e.target.value)} className="h-7 bg-zinc-950 border-zinc-800 text-xs font-mono" />
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/50">
                <div className="space-y-1">
                   <label className="text-[10px] text-zinc-500 uppercase leading-tight">Thickest (mm)</label>
                   <Input value={params.thickestSection} onChange={(e) => handleInputChange('thickestSection', e.target.value)} className="h-7 bg-zinc-950 border-zinc-800 text-xs font-mono" />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] text-zinc-500 uppercase leading-tight">Thinnest (mm)</label>
                   <Input value={params.thinnestSection} onChange={(e) => handleInputChange('thinnestSection', e.target.value)} className="h-7 bg-zinc-950 border-zinc-800 text-xs font-mono" />
                </div>
              </div>
            </div>

            {/* SECTION 2: ALLOY DATA */}
            <div className="space-y-4">
              <label className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-zinc-800 pb-1">
                 2. Alloy Data
              </label>
              <Select value={params.alloy} onValueChange={(v) => handleInputChange('alloy', v)}>
                <SelectTrigger className="h-8 bg-zinc-900 border-zinc-800 text-xs text-white">
                  <SelectValue placeholder="Select Alloy" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                  {Object.entries(ALLOY_DATA).map(([key, data]) => (
                    <SelectItem key={key} value={key}>{data.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* SECTION 3 & 4: PROCESS CONDITIONS */}
            <div className="space-y-4">
              <label className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-zinc-800 pb-1">
                 3. Process Conditions
              </label>
              <div className="space-y-2">
                 <div className="flex justify-between items-center text-[10px]">
                    <span className="text-zinc-500 uppercase tracking-tighter">Pouring Temp (°C)</span>
                    <span className="font-mono text-emerald-400">{params.pouringTemperature}°C</span>
                 </div>
                 <Slider 
                    value={[params.pouringTemperature]} min={500} max={1800} step={10} 
                    indicatorClassName="bg-emerald-500"
                    onValueChange={(v) => handleInputChange('pouringTemperature', v)} 
                 />
                 <div className="text-[9px] text-zinc-500 text-right">Default: {ALLOY_DATA[params.alloy].defaultTemp}°C</div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase">Mold Type</label>
                <Select value={params.moldType} onValueChange={(v) => handleInputChange('moldType', v)}>
                  <SelectTrigger className="h-8 bg-zinc-900 border-zinc-800 text-xs text-white">
                    <SelectValue placeholder="Select Mold Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                    <SelectItem value="greenSand">Green Sand</SelectItem>
                    <SelectItem value="resinSand">Resin Sand</SelectItem>
                    <SelectItem value="shellMold">Shell Mold</SelectItem>
                    <SelectItem value="investment">Investment Mold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase">Orientation</label>
                <Select value={params.orientation} onValueChange={(v) => handleInputChange('orientation', v)}>
                  <SelectTrigger className="h-8 bg-zinc-900 border-zinc-800 text-xs text-white">
                    <SelectValue placeholder="Select Orientation" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                    <SelectItem value="horizontal">Horizontal</SelectItem>
                    <SelectItem value="vertical">Vertical</SelectItem>
                    <SelectItem value="inclined">Inclined</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* SECTION 6: RISER SETTINGS */}
            <div className="space-y-4">
              <label className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-zinc-800 pb-1">
                 4. Riser Settings
              </label>
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase">Riser Type</label>
                <Select value={params.riserType} onValueChange={(v) => handleInputChange('riserType', v)}>
                  <SelectTrigger className="h-8 bg-zinc-900 border-zinc-800 text-xs text-white">
                    <SelectValue placeholder="Select Riser Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="blind">Blind</SelectItem>
                    <SelectItem value="side">Side</SelectItem>
                    <SelectItem value="top">Top</SelectItem>
                    <SelectItem value="insulated">Insulated</SelectItem>
                    <SelectItem value="exothermic">Exothermic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3 bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/50">
                <div className="space-y-1">
                   <label className="text-[10px] text-zinc-500 uppercase leading-tight">Neck Dia (mm)</label>
                   <Input placeholder="Auto" value={params.neckDiameter || ''} onChange={(e) => handleInputChange('neckDiameter', e.target.value)} className="h-7 bg-zinc-950 border-zinc-800 text-xs font-mono" />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] text-zinc-500 uppercase leading-tight">Neck Len (mm)</label>
                   <Input placeholder="Auto" value={params.neckLength || ''} onChange={(e) => handleInputChange('neckLength', e.target.value)} className="h-7 bg-zinc-950 border-zinc-800 text-xs font-mono" />
                </div>
              </div>
            </div>

            {/* SECTION 10 & 11: QUALITY & ASSISTANCE */}
            <div className="space-y-4">
              <label className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-zinc-800 pb-1">
                 5. Quality & Feeding
              </label>
              <div className="flex items-center justify-between bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/50">
                 <label className="text-[11px] font-semibold text-zinc-300">Use Chills</label>
                 <Switch checked={params.useChills} onCheckedChange={(v) => handleInputChange('useChills', v)} />
              </div>
              {params.useChills && (
                <div className="space-y-2">
                  <label className="text-[10px] text-zinc-500 uppercase">Chill Type</label>
                  <Select value={params.chillType} onValueChange={(v) => handleInputChange('chillType', v)}>
                    <SelectTrigger className="h-8 bg-zinc-900 border-zinc-800 text-xs text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                      <SelectItem value="external">External Chill</SelectItem>
                      <SelectItem value="internal">Internal Chill</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase">Quality Class</label>
                <Select value={params.qualityClass} onValueChange={(v) => handleInputChange('qualityClass', v)}>
                  <SelectTrigger className="h-8 bg-zinc-900 border-zinc-800 text-xs text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="industrial">Industrial</SelectItem>
                    <SelectItem value="automotive">Automotive</SelectItem>
                    <SelectItem value="aerospace">Aerospace</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-zinc-500 uppercase tracking-tighter">Riser Scale Override</span>
                    <span className="font-mono text-zinc-300">{Math.round(params.riserOverrideFactor * 100)}%</span>
                  </div>
                  <Slider 
                    value={[params.riserOverrideFactor]} min={0.5} max={2.0} step={0.01} 
                    indicatorClassName="bg-zinc-500"
                    onValueChange={(v) => handleInputChange('riserOverrideFactor', v)} 
                  />
              </div>
            </div>

            {/* Pattern Allowances */}
            <div className="pt-2 space-y-4">
              <label className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-zinc-800 pb-1">
                6. Pattern Allowances
              </label>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-zinc-500 uppercase tracking-tighter">Shrinkage (%)</span>
                    <span className="font-mono text-emerald-400">{params.shrinkageAllowance?.toFixed(1)}%</span>
                  </div>
                  <Slider 
                    value={[params.shrinkageAllowance || 0]} min={0} max={5} step={0.1} 
                    indicatorClassName="bg-emerald-500"
                    onValueChange={(v) => handleInputChange('shrinkageAllowance', v)} 
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-zinc-500 uppercase tracking-tighter">Machining (mm)</span>
                    <span className="font-mono text-emerald-400">+{params.machiningAllowance?.toFixed(1)} mm</span>
                  </div>
                  <Slider 
                    value={[params.machiningAllowance || 0]} min={0} max={20} step={0.5} 
                    indicatorClassName="bg-emerald-500"
                    onValueChange={(v) => handleInputChange('machiningAllowance', v)} 
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-zinc-500 uppercase tracking-tighter">Draft Padding (mm)</span>
                    <span className="font-mono text-emerald-400">+{params.draftAllowance?.toFixed(1)} mm</span>
                  </div>
                  <Slider 
                    value={[params.draftAllowance || 0]} min={0} max={10} step={0.5} 
                    indicatorClassName="bg-emerald-500"
                    onValueChange={(v) => handleInputChange('draftAllowance', v)} 
                  />
                </div>
              </div>
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
                        shape={(params.shape === 'block' ? 'cube' : params.shape === 'cylinder' ? 'cylinder' : 'plate') as any}
                        dims={{ a: params.t, l: params.l, w: params.w, t: params.t, d: params.d, h: params.h }}
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
                  <p className="font-mono text-sm text-zinc-200">{((designResults.casting.volume + designResults.riser.actualVolume) * ALLOY_DATA[params.alloy].density / 1000)?.toFixed(2)} <span className="text-[10px] opacity-50">kg</span></p>
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

            <div className="space-y-3 mb-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                 <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center justify-between mb-3 border-b border-zinc-800 pb-2">
                    Engineering Health
                    <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-blue-400">
                      {designResults.health.toFixed(0)}/100
                    </span>
                 </h4>
                 <div className="space-y-3">
                   <div>
                     <div className="flex justify-between text-[10px] text-zinc-500 mb-1 font-semibold">
                       <span>Hotspot Risk Score</span>
                       <span className={designResults.hotspotScore > 40 ? "text-red-400" : "text-emerald-400"}>{designResults.hotspotScore.toFixed(0)}</span>
                     </div>
                     <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden">
                       <div className={cn("h-full", designResults.hotspotScore > 40 ? "bg-red-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, designResults.hotspotScore)}%` }} />
                     </div>
                   </div>
                   
                   <div>
                     <div className="flex justify-between text-[10px] text-zinc-500 mb-1 font-semibold">
                       <span>Riser Modulus Ratio</span>
                       <span className={designResults.analysis.currentRatioSq >= 1.1 ? "text-emerald-400" : "text-amber-400"}>{Math.round(designResults.analysis.currentRatioSq * 100)}%</span>
                     </div>
                     <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden">
                       <div className={cn("h-full", designResults.analysis.currentRatioSq >= 1.1 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${Math.min(100, designResults.analysis.currentRatioSq * 100 / 1.5)}%` }} />
                     </div>
                   </div>
                 </div>
              </div>
            </div>

            <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-2">
              <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                 <Brain className="w-3 h-3 text-purple-500" /> AI Design Insights
              </h3>
              <div className="text-[9px] text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                 <div className={cn("w-1.5 h-1.5 rounded-full", aiAnalysisStatus === 'Not Generated' ? 'bg-zinc-600' : aiAnalysisStatus === 'Cached' ? 'bg-blue-500' : 'bg-emerald-500')} />
                 AI Status: {aiAnalysisStatus}
              </div>
            </div>
            <div className="space-y-3 mb-6">
              {isAILoading ? (
                <div className="p-6 flex flex-col items-center justify-center gap-2 bg-zinc-900/50 border border-zinc-800 rounded-lg">
                  <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
                  <span className="text-[10px] text-zinc-500 font-medium animate-pulse">Analyzing casting design...</span>
                </div>
              ) : aiInsights ? (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2.5"
                >
                  <div className="bg-purple-500/5 border border-purple-500/20 p-2.5 rounded-lg space-y-1">
                    <p className="text-[9px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-1.5">
                      <AlertTriangle className="w-2.5 h-2.5" /> Feeding Analysis
                    </p>
                    <p className="text-[11px] text-zinc-300 leading-tight">{aiInsights.feedingAnalysis}</p>
                  </div>
                  <div className="bg-red-500/5 border border-red-500/20 p-2.5 rounded-lg space-y-1">
                    <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Flame className="w-2.5 h-2.5" /> Defect Prediction
                    </p>
                    <p className="text-[11px] text-zinc-300 leading-tight">{aiInsights.defectPrediction}</p>
                  </div>
                  <div className="bg-blue-500/5 border border-blue-500/20 p-2.5 rounded-lg space-y-1">
                    <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Activity className="w-2.5 h-2.5" /> Cost Impact
                    </p>
                    <p className="text-[11px] text-zinc-300 leading-tight">{aiInsights.costImpact}</p>
                  </div>
                  <div className="bg-emerald-500/5 border border-emerald-500/20 p-2.5 rounded-lg space-y-1">
                    <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Recommendations
                    </p>
                    <ul className="list-disc pl-3 mt-1 space-y-1">
                       {aiInsights.recommendations?.map((r, i) => (
                           <li key={i} className="text-[11px] text-zinc-300 leading-tight">{r}</li>
                       ))}
                    </ul>
                  </div>
                  
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full text-xs mt-2 border-zinc-800 bg-zinc-950 hover:bg-zinc-900"
                    onClick={() => generateAIReview(true)}
                  >
                     <Brain className="w-3 h-3 mr-2 text-purple-500" />
                     Regenerate AI Review
                  </Button>
                </motion.div>
              ) : (
                <div className="p-4 flex flex-col items-center justify-center gap-3 text-center text-[10px] text-zinc-500 border border-dashed border-zinc-800 rounded-lg bg-zinc-900/30">
                  <p>AI Engineering Review not generated.</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs border-zinc-800 bg-zinc-950 hover:bg-zinc-900"
                    onClick={() => generateAIReview(false)}
                  >
                     <Brain className="w-3 h-3 mr-2 text-purple-500" />
                     Generate AI Engineering Review
                  </Button>
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
                  <h3 className="font-bold text-zinc-100 uppercase tracking-widest text-xs mb-2 border-b border-zinc-800 pb-1">3. Pattern Allowances</h3>
                  <p className="mb-2 text-xs">Geometric dimensions are adjusted to create the <strong>Pattern</strong>, ensuring the final casting meets desired specs after cooling and cleanup:</p>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-zinc-400">
                    <li><strong>Shrinkage:</strong> Compensates for liquid-to-solid contraction. Carbon steel typically requires ~2%.</li>
                    <li><strong>Machining:</strong> Extra material provided on surfaces that require high-precision finishing.</li>
                    <li><strong>Draft:</strong> Taper added to vertical surfaces to allow the pattern to be removed from the sand mold without damage.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-bold text-zinc-100 uppercase tracking-widest text-xs mb-2 border-b border-zinc-800 pb-1">4. Decision Logic</h3>
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
