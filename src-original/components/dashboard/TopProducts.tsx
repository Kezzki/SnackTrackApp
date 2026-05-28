import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "lucide-react";

const topProducts = [
  { name: "Crispy Chips Original", sales: 1245, growth: 12, category: "Chips" },
  { name: "Chocolate Cookie Delight", sales: 1089, growth: 8, category: "Cookies" },
  { name: "Spicy Nacho Tortillas", sales: 956, growth: 15, category: "Chips" },
  { name: "Caramel Popcorn", sales: 823, growth: 5, category: "Popcorn" },
  { name: "Mixed Nuts Premium", sales: 712, growth: -2, category: "Nuts" },
];

export function TopProducts() {
  return (
    <Card className="shadow-warm">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Top Performing Snacks
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {topProducts.map((product, index) => (
            <div
              key={product.name}
              className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{product.name}</p>
                <p className="text-sm text-muted-foreground">{product.sales.toLocaleString()} sold</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {product.category}
                </Badge>
                <span
                  className={`text-sm font-medium ${
                    product.growth >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {product.growth >= 0 ? "+" : ""}
                  {product.growth}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
