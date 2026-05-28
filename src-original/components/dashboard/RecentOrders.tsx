import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingBag, Eye, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const recentOrders = [
  {
    id: "ORD-001",
    customer: "Sarah Johnson",
    items: 5,
    total: 42.5,
    status: "completed",
    time: "2 min ago",
  },
  {
    id: "ORD-002",
    customer: "Mike Chen",
    items: 3,
    total: 28.0,
    status: "processing",
    time: "8 min ago",
  },
  {
    id: "ORD-003",
    customer: "Emily Davis",
    items: 8,
    total: 67.25,
    status: "pending",
    time: "15 min ago",
  },
  {
    id: "ORD-004",
    customer: "Alex Turner",
    items: 2,
    total: 15.0,
    status: "completed",
    time: "24 min ago",
  },
  {
    id: "ORD-005",
    customer: "Lisa Park",
    items: 6,
    total: 52.75,
    status: "processing",
    time: "32 min ago",
  },
];

const statusStyles = {
  completed: "bg-success/10 text-success border-success/20",
  processing: "bg-warning/10 text-warning border-warning/20",
  pending: "bg-muted text-muted-foreground border-muted",
};

export function RecentOrders() {
  return (
    <Card className="shadow-warm">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-primary" />
          Recent Orders
        </CardTitle>
        <Button variant="ghost" size="sm" className="text-primary hover:text-primary">
          View All
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {recentOrders.map((order) => (
            <div
              key={order.id}
              className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{order.customer}</p>
                  <span className="text-xs text-muted-foreground">#{order.id}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-muted-foreground">
                    {order.items} items
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-sm font-medium text-foreground">
                    ${order.total.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {order.time}
                </div>
                <Badge
                  variant="outline"
                  className={cn("capitalize text-xs", statusStyles[order.status as keyof typeof statusStyles])}
                >
                  {order.status}
                </Badge>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
