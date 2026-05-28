import { useState } from "react";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { CartItem } from "@/contexts/CartContext";

interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
}

const formatRupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

function QuantityInput({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const commit = () => {
    setEditing(false);
    const parsed = parseInt(draft, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      onChange(Math.min(parsed, max));
    } else if (!isNaN(parsed) && parsed <= 0) {
      onChange(0); // remove item
    } else {
      setDraft(String(value)); // revert
    }
  };

  if (editing) {
    return (
      <input
        type="number"
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
        }}
        autoFocus
        className="w-12 h-7 text-center text-sm font-medium rounded-md border border-primary bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    );
  }

  return (
    <button
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      className="w-8 h-7 text-sm font-medium text-center rounded-md hover:bg-muted transition-colors cursor-text"
      title="Klik untuk edit jumlah"
    >
      {value}
    </button>
  );
}

export function CartSheet({ open, onOpenChange, items, onUpdateQuantity }: CartSheetProps) {
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  return (
    <Sheet open={open} onOpenChange={(v) => { setConfirmingId(null); onOpenChange(v); }}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Keranjang Belanja
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <ShoppingBag className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Keranjang masih kosong</p>
            <p className="text-sm text-muted-foreground mt-1">Tambahkan produk ke keranjang</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-4 py-4">
              {items.map((item) => (
                <div key={item.productId} className="flex gap-3 p-3 rounded-lg bg-muted/50 relative group/item">
                  <img src={item.image} alt={item.name} className="h-16 w-16 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm line-clamp-1">{item.name}</p>
                    <p className="text-sm text-primary font-semibold mt-1">{formatRupiah(item.price)}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onUpdateQuantity(item.productId, item.quantity - 1)}
                      >
                        {item.quantity === 1 ? <Trash2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                      </Button>
                      <QuantityInput
                        value={item.quantity}
                        max={item.stock}
                        onChange={(v) => onUpdateQuantity(item.productId, v)}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onUpdateQuantity(item.productId, item.quantity + 1)}
                        disabled={item.quantity >= item.stock}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    {item.quantity >= item.stock && (
                      <p className="text-[10px] text-amber-600 mt-1">Maks. stok: {item.stock}</p>
                    )}
                  </div>

                  {/* Delete button — visible when qty > 1 */}
                  {item.quantity > 1 && (
                    <div className="absolute top-2 right-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover/item:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmingId(confirmingId === item.productId ? null : item.productId)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>

                      {/* Confirmation popover */}
                      {confirmingId === item.productId && (
                        <>
                          {/* Backdrop to close */}
                          <div className="fixed inset-0 z-[60]" onClick={() => setConfirmingId(null)} />

                          <div className="absolute right-0 top-8 z-[61] w-52 animate-fade-in">
                            {/* Arrow pointing up at the delete button */}
                            <div className="flex justify-end pr-2">
                              <div className="w-3 h-3 bg-card rotate-45 border-l border-t border-border -mb-1.5" />
                            </div>
                            <div className="bg-card border border-border rounded-xl shadow-lg p-3 text-center">
                              <p className="text-sm font-medium text-foreground mb-3">
                                Hapus barang dari keranjang?
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 text-xs"
                                  onClick={() => setConfirmingId(null)}
                                >
                                  Batal
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="flex-1 text-xs"
                                  onClick={() => {
                                    onUpdateQuantity(item.productId, 0);
                                    setConfirmingId(null);
                                  }}
                                >
                                  Hapus
                                </Button>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex justify-between font-semibold text-lg">
                <span>Total</span>
                <span className="text-primary">{formatRupiah(total)}</span>
              </div>
              <Button className="w-full" size="lg">
                Checkout ({items.length} item)
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
