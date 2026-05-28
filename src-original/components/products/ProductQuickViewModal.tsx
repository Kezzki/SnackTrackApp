import { useState, useRef, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Upload, X, ImageIcon } from "lucide-react";
import type { Product } from "@/pages/Products";

interface ProductQuickViewModalProps {
    product: Product | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (updated: Product) => void;
    categories: string[];
}

export function ProductQuickViewModal({
    product,
    open,
    onOpenChange,
    onSave,
    categories,
}: ProductQuickViewModalProps) {
    const [name, setName] = useState("");
    const [category, setCategory] = useState("");
    const [price, setPrice] = useState("");
    const [stock, setStock] = useState("");
    const [description, setDescription] = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const [customImage, setCustomImage] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sync form state when product changes
    useEffect(() => {
        if (product) {
            setName(product.name);
            setCategory(product.category);
            setPrice(product.price.toString());
            setStock(product.stock.toString());
            setDescription(product.description);
            setImageUrl(product.image);
            setCustomImage(null);
        }
    }, [product]);

    const displayImage = customImage || imageUrl;

    const handleFileSelect = (file: File) => {
        if (!file.type.startsWith("image/")) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            setCustomImage(e.target?.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => setIsDragging(false);

    const handleRemoveImage = () => {
        setCustomImage(null);
        setImageUrl("");
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSave = () => {
        if (!product) return;
        onSave({
            ...product,
            name,
            category,
            price: parseFloat(price) || 0,
            stock: parseInt(stock, 10) || 0,
            description,
            image: customImage || imageUrl,
        });
        onOpenChange(false);
    };

    const handleCancel = () => {
        onOpenChange(false);
    };

    if (!product) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
                <DialogHeader className="px-6 pt-6 pb-0">
                    <DialogTitle className="text-xl font-bold">
                        Edit Produk
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        Lihat dan edit detail produk Anda
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-6 py-4">
                    {/* Left Side — Large Image & Upload */}
                    <div className="flex flex-col gap-4">
                        {/* Large preview */}
                        <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted">
                            {displayImage ? (
                                <>
                                    <img
                                        src={displayImage}
                                        alt={name}
                                        className="h-full w-full object-cover"
                                    />
                                    <button
                                        onClick={handleRemoveImage}
                                        className="absolute top-3 right-3 h-8 w-8 rounded-full bg-red-500/90 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-md"
                                        aria-label="Hapus gambar"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </>
                            ) : (
                                <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground">
                                    <ImageIcon className="h-16 w-16 mb-2 opacity-40" />
                                    <p className="text-sm">Belum ada gambar</p>
                                </div>
                            )}
                        </div>

                        {/* Upload zone */}
                        <div
                            className={`relative rounded-xl border-2 border-dashed p-6 transition-colors cursor-pointer ${isDragging
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:border-primary/50"
                                }`}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className="flex flex-col items-center gap-2 text-center">
                                <Upload className="h-8 w-8 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">
                                    Unggah gambar atau seret dan lepas di dalam kotak tersebut
                                </p>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileSelect(file);
                                }}
                            />
                        </div>
                    </div>

                    {/* Right Side — Form Fields */}
                    <div className="flex flex-col gap-4">
                        {/* Nama Produk */}
                        <div className="space-y-2">
                            <Label htmlFor="qv-name" className="text-sm font-medium">
                                Nama Produk
                            </Label>
                            <Input
                                id="qv-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Masukkan nama produk"
                            />
                        </div>

                        {/* Kategori */}
                        <div className="space-y-2">
                            <Label htmlFor="qv-category" className="text-sm font-medium">
                                Kategori
                            </Label>
                            <Select value={category} onValueChange={setCategory}>
                                <SelectTrigger id="qv-category">
                                    <SelectValue placeholder="Pilih kategori" />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories
                                        .filter((c) => c !== "All")
                                        .map((cat) => (
                                            <SelectItem key={cat} value={cat}>
                                                {cat}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Harga */}
                        <div className="space-y-2">
                            <Label htmlFor="qv-price" className="text-sm font-medium">
                                Harga (Rp)
                            </Label>
                            <Input
                                id="qv-price"
                                type="number"
                                min="0"
                                step="0.01"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                placeholder="0"
                            />
                        </div>

                        {/* Stok */}
                        <div className="space-y-2">
                            <Label htmlFor="qv-stock" className="text-sm font-medium">
                                Stok
                            </Label>
                            <Input
                                id="qv-stock"
                                type="number"
                                min="0"
                                value={stock}
                                onChange={(e) => setStock(e.target.value)}
                                placeholder="0"
                            />
                        </div>

                        {/* Deskripsi */}
                        <div className="space-y-2">
                            <Label htmlFor="qv-desc" className="text-sm font-medium">
                                Deskripsi
                            </Label>
                            <Textarea
                                id="qv-desc"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Masukkan deskripsi produk"
                                rows={4}
                            />
                        </div>
                    </div>
                </div>

                {/* Footer buttons */}
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-6 pb-6 pt-2 border-t border-border">
                    <Button variant="outline" onClick={handleCancel}>
                        Batal
                    </Button>
                    <Button onClick={handleSave} className="bg-primary hover:bg-primary/90">
                        Simpan Perubahan
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
