import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const generateData = (period: string) => {
  const baseData = {
    day: [
      { name: "9AM", sales: 420, orders: 12 },
      { name: "10AM", sales: 580, orders: 18 },
      { name: "11AM", sales: 720, orders: 24 },
      { name: "12PM", sales: 1200, orders: 42 },
      { name: "1PM", sales: 980, orders: 35 },
      { name: "2PM", sales: 650, orders: 22 },
      { name: "3PM", sales: 890, orders: 28 },
      { name: "4PM", sales: 1100, orders: 38 },
      { name: "5PM", sales: 1400, orders: 48 },
    ],
    week: [
      { name: "Mon", sales: 4200, orders: 145 },
      { name: "Tue", sales: 3800, orders: 128 },
      { name: "Wed", sales: 5100, orders: 172 },
      { name: "Thu", sales: 4600, orders: 156 },
      { name: "Fri", sales: 6200, orders: 210 },
      { name: "Sat", sales: 7800, orders: 265 },
      { name: "Sun", sales: 5400, orders: 182 },
    ],
    month: [
      { name: "Week 1", sales: 28000, orders: 945 },
      { name: "Week 2", sales: 32000, orders: 1080 },
      { name: "Week 3", sales: 35000, orders: 1182 },
      { name: "Week 4", sales: 41000, orders: 1385 },
    ],
    year: [
      { name: "Jan", sales: 95000, orders: 3200 },
      { name: "Feb", sales: 88000, orders: 2970 },
      { name: "Mar", sales: 102000, orders: 3440 },
      { name: "Apr", sales: 115000, orders: 3880 },
      { name: "May", sales: 128000, orders: 4320 },
      { name: "Jun", sales: 142000, orders: 4790 },
    ],
  };
  return baseData[period as keyof typeof baseData] || baseData.week;
};

const periods = ["day", "week", "month", "year"];

export function SalesChart() {
  const [activePeriod, setActivePeriod] = useState("week");
  const data = generateData(activePeriod);

  return (
    <Card className="shadow-warm">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-lg font-semibold">Sales Overview</CardTitle>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {periods.map((period) => (
            <button
              key={period}
              onClick={() => setActivePeriod(period)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 capitalize",
                activePeriod === period
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background"
              )}
            >
              {period}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="name"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  boxShadow: "0 4px 20px -4px hsl(var(--primary) / 0.15)",
                }}
                labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                formatter={(value: number) => [`$${value.toLocaleString()}`, "Sales"]}
              />
              <Area
                type="monotone"
                dataKey="sales"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                fill="url(#salesGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
