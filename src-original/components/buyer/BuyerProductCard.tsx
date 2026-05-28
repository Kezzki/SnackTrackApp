import { Star, ShoppingCart, Store, Plus, Minus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface BuyerProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  image: string;
  description: string;
  rating: number;
  storeName: string;
}

interface BuyerProductCardProps {
  product: BuyerProduct;
  index: number;
  cartQuantity: number;
  onAddToCart: () => void;
  onUpdateQuantity: (quantity: number) => void;
}

export function BuyerProductCard({ product, index, cartQuantity, onAddToCart, onUpdateQuantity }: BuyerProductCardProps) {
  const formatRupiah = (n: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

  const inCart = cartQuantity > 0;
  const atStockLimit = cartQuantity >= product.stock;

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
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Add / Quantity controls on hover */}
        {inCart ? (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 flex items-center gap-1 bg-primary rounded-full px-1 py-1 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full text-primary-foreground hover:bg-primary-foreground/20"
              onClick={() => onUpdateQuantity(cartQuantity - 1)}
            >
              {cartQuantity === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
            </Button>
            <span className="text-sm font-bold text-primary-foreground min-w-[24px] text-center">
              {cartQuantity}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full text-primary-foreground hover:bg-primary-foreground/20 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => onUpdateQuantity(cartQuantity + 1)}
              disabled={atStockLimit}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300"
            onClick={(e) => { e.stopPropagation(); onAddToCart(); }}
          >
            <ShoppingCart className="h-4 w-4 mr-1" />
            Tambah
          </Button>
        )}

        <Badge className="absolute top-3 left-3 bg-background/90 text-foreground hover:bg-background/90">
          {product.category}
        </Badge>

        {/* Cart quantity badge */}
        {inCart && (
          <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground hover:bg-primary">
            {cartQuantity}
          </Badge>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
          {product.name}
        </h3>
        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{product.description}</p>

        <div className="flex items-center gap-2 mt-2">
          <Store className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{product.storeName}</span>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <Star className="h-4 w-4 fill-warning text-warning" />
          <span className="text-sm font-medium">{product.rating}</span>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <span className="text-lg font-bold text-primary">{formatRupiah(product.price)}</span>
          <span className="text-xs text-muted-foreground">Stok: {product.stock}</span>
        </div>
      </div>
    </div>
  );
}
