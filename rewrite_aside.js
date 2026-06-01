const fs = require('fs');

const leftColumnUI = `
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
`;

let content = fs.readFileSync('src/components/CastingDashboard.tsx', 'utf8');
const asideRegex = /{\/\* Left Column: Input Controls \*\/}[\s\S]*?<\/aside>/;
content = content.replace(asideRegex, leftColumnUI.trim());
fs.writeFileSync('src/components/CastingDashboard.tsx', content);
