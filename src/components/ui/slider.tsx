import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

interface SliderProps extends Omit<SliderPrimitive.Root.Props, 'value' | 'defaultValue' | 'onValueChange'> {
  value?: number | number[];
  defaultValue?: number | number[];
  onValueChange?: (value: number | number[]) => void;
  indicatorClassName?: string;
  thumbClassName?: string;
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  indicatorClassName,
  thumbClassName,
  onValueChange,
  ...props
}: SliderProps) {
  
  // Base UI strictly expects arrays for reliable controlled behavior
  const ensureArray = (v: any) => {
    if (v === undefined || v === null) return undefined;
    if (Number.isNaN(v)) return [0];
    return Array.isArray(v) ? v : [v];
  };

  const initialArray = React.useMemo(() => ensureArray(value) || ensureArray(defaultValue) || [min], []);
  const [internalValue, setInternalValue] = React.useState<number[]>(initialArray);

  // Sync prop changes (e.g. reset buttons) without causing loops by doing strict equality checks
  React.useEffect(() => {
    if (value !== undefined) {
      const arr = ensureArray(value)!;
      // Only update if the values are functionally different to avoid loops
      if (arr.some((v, i) => v !== internalValue[i]) || arr.length !== internalValue.length) {
        setInternalValue(arr);
      }
    }
  }, [value, internalValue]);

  const handleValueChange = React.useCallback((arg1: any, arg2?: any) => {
    // Robustly extract the value array depending on whether Base UI passed (value, event) or (event, value)
    let newValues = Array.isArray(arg1) ? arg1 : (Array.isArray(arg2) ? arg2 : null);
    if (!newValues && typeof arg1 === 'number') newValues = [arg1];
    if (!newValues && typeof arg2 === 'number') newValues = [arg2];
    if (!newValues) return;

    const arr = Array.from(newValues as number[]);
    if (arr.some(Number.isNaN)) return;
    
    setInternalValue(arr);
    
    if (onValueChange) {
      // return scalar if original value was passed as scalar, else array
      if (typeof value === 'number' || typeof defaultValue === 'number') {
        onValueChange(arr[0]);
      } else {
         // if no value/default was passed, default to scalar for single thumb
        onValueChange(arr.length === 1 ? arr[0] : arr);
      }
    }
  }, [onValueChange, value, defaultValue]);

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      value={internalValue}
      onValueChange={handleValueChange}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-muted select-none data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className={cn("bg-primary select-none data-horizontal:h-full data-vertical:w-full transition-colors", indicatorClassName)}
          />
        </SliderPrimitive.Track>
        {internalValue.map((_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className={cn(
              "relative block size-3 shrink-0 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow,background-color] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50",
              thumbClassName
            )}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
