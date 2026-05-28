import { Star, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Product } from "@/pages/Products";

interface ProductCardProps {
  product: Product;
  index: number;
  onQuickView?: (product: Product) => void;
}

export function ProductCard({ product, index, onQuickView }: ProductCardProps) {
  const isLowStock = product.stock < 30;

  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:shadow-warm-lg hover:-translate-y-1 animate-fade-in"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        <img
          src={product.image}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          loading="lazy"
        />

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Quick view button */}
        <Button
          size="sm"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 bg-primary hover:bg-primary/90"
          onClick={(e) => {
            e.stopPropagation();
            onQuickView?.(product);
          }}
        >
          Quick View
        </Button>

        {/* Category Badge */}
        <Badge className="absolute top-3 left-3 bg-background/90 text-foreground hover:bg-background/90">
          {product.category}
        </Badge>

        {/* Stock Warning */}
        {isLowStock && (
          <Badge className="absolute top-3 right-3 bg-warning/90 text-warning-foreground hover:bg-warning/90">
            Low Stock
          </Badge>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
          {product.name}
        </h3>
        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
          {product.description}
        </p>

        {/* Rating and Sales */}
        <div className="flex items-center gap-3 mt-3">
          <div className="flex items-center gap-1">
            <Star className="h-4 w-4 fill-warning text-warning" />
            <span className="text-sm font-medium">{product.rating}</span>
          </div>
          <span className="text-muted-foreground text-sm">•</span>
          <span className="text-sm text-muted-foreground">
            {product.soldCount.toLocaleString()} sold
          </span>
        </div>

        {/* Price and Stock */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <span className="text-xl font-bold text-primary">${product.price.toFixed(2)}</span>
          <div className={cn(
            "flex items-center gap-1 text-sm",
            isLowStock ? "text-warning" : "text-muted-foreground"
          )}>
            <Package className="h-4 w-4" />
            <span>{product.stock} in stock</span>
          </div>
        </div>
      </div>
    </div>
  );
}
