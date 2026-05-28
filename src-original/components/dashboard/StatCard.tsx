import { ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: number | string;
  prefix?: string;
  suffix?: string;
  icon: ReactNode;
  trend?: number;
  trendLabel?: string;
  className?: string;
  delay?: number;
}

export function StatCard({
  title,
  value,
  prefix = "",
  suffix = "",
  icon,
  trend,
  trendLabel,
  className,
  delay = 0,
}: StatCardProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const numericValue = typeof value === "number" ? value : parseFloat(value) || 0;

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  useEffect(() => {
    if (!isVisible || typeof value !== "number") return;

    const duration = 1000;
    const steps = 30;
    const increment = numericValue / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = Math.min(current + increment, numericValue);
      setDisplayValue(Math.round(current));

      if (step >= steps) {
        setDisplayValue(numericValue);
        clearInterval(timer);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [isVisible, numericValue, value]);

  const isPositiveTrend = trend && trend > 0;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-warm transition-all duration-300 hover:shadow-warm-lg hover:-translate-y-0.5",
        !isVisible && "opacity-0 translate-y-4",
        isVisible && "opacity-100 translate-y-0",
        className
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Gradient overlay */}
      <div className="absolute inset-0 gradient-warm-subtle opacity-50" />

      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            {icon}
          </div>
        </div>

        <div className="mt-3">
          <p className="text-3xl font-bold text-foreground">
            {prefix}
            {typeof value === "number" ? displayValue.toLocaleString() : value}
            {suffix}
          </p>

          {trend !== undefined && (
            <div className="mt-2 flex items-center gap-1">
              {isPositiveTrend ? (
                <TrendingUp className="h-4 w-4 text-success" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
              <span
                className={cn(
                  "text-sm font-medium",
                  isPositiveTrend ? "text-success" : "text-destructive"
                )}
              >
                {isPositiveTrend ? "+" : ""}
                {trend}%
              </span>
              {trendLabel && (
                <span className="text-sm text-muted-foreground">
                  {trendLabel}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
