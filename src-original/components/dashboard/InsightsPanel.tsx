import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertTriangle, TrendingUp, Package } from "lucide-react";
import { cn } from "@/lib/utils";

const insights = [
  {
    type: "prediction",
    icon: Sparkles,
    title: "Peak Hours Coming",
    description: "Sales expected to surge 40% between 5-7 PM based on historical data",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    type: "alert",
    icon: AlertTriangle,
    title: "Low Stock Alert",
    description: "Crispy Chips Original running low - only 23 units left",
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
  {
    type: "trend",
    icon: TrendingUp,
    title: "Trending Item",
    description: "Spicy Nacho Tortillas up 45% this week - consider increasing stock",
    color: "text-success",
    bgColor: "bg-success/10",
  },
  {
    type: "inventory",
    icon: Package,
    title: "Restock Suggestion",
    description: "ML predicts you'll need 150+ units of cookies by Friday",
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
];

export function InsightsPanel() {
  return (
    <Card className="shadow-warm">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Smart Insights
          <Badge className="ml-2 bg-primary/10 text-primary hover:bg-primary/20">
            AI Powered
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {insights.map((insight, index) => (
            <div
              key={index}
              className="flex gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0", insight.bgColor)}>
                <insight.icon className={cn("h-5 w-5", insight.color)} />
              </div>
              <div>
                <p className="font-medium text-foreground">{insight.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{insight.description}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
