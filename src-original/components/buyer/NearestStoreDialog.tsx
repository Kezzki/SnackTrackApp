import { useState, useEffect } from "react";
import { MapPin, Navigation, Store } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface NearestStoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Mock stores with coordinates (Indonesian locations)
const mockStores = [
  { id: "1", name: "Toko Camilan Enak", lat: -6.2088, lng: 106.8456, address: "Jl. Sudirman No. 10, Jakarta" },
  { id: "2", name: "Dapur Manis", lat: -6.2215, lng: 106.8513, address: "Jl. Thamrin No. 5, Jakarta" },
  { id: "3", name: "Snack Corner", lat: -6.1954, lng: 106.8232, address: "Jl. Mangga Besar No. 22, Jakarta" },
  { id: "4", name: "Manis Sejati", lat: -6.2382, lng: 106.8516, address: "Jl. Gatot Subroto No. 15, Jakarta" },
];

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function NearestStoreDialog({ open, onOpenChange }: NearestStoreDialogProps) {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setLocationError(null);
      if (!navigator.geolocation) {
        setLocationError("Browser Anda tidak mendukung geolokasi");
        setLoading(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLoading(false);
        },
        () => {
          setLocationError("Izin lokasi ditolak. Menggunakan lokasi default (Jakarta).");
          setUserLocation({ lat: -6.2088, lng: 106.8456 });
          setLoading(false);
        }
      );
    }
  }, [open]);

  const storesWithDistance = userLocation
    ? mockStores
        .map((s) => ({ ...s, distance: getDistance(userLocation.lat, userLocation.lng, s.lat, s.lng) }))
        .sort((a, b) => a.distance - b.distance)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Toko Terdekat
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Navigation className="h-8 w-8 text-primary animate-pulse" />
            <p className="text-muted-foreground mt-3">Mencari lokasi Anda...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {locationError && (
              <p className="text-sm text-warning bg-warning/10 rounded-lg p-3">{locationError}</p>
            )}

            {userLocation && (
              <p className="text-xs text-muted-foreground">
                📍 Lokasi Anda: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
              </p>
            )}

            {storesWithDistance.map((store, i) => (
              <div
                key={store.id}
                className="flex items-start gap-4 p-4 rounded-xl border border-border bg-card hover:shadow-warm transition-shadow"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                  <Store className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm">{store.name}</h4>
                    {i === 0 && (
                      <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                        Terdekat
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{store.address}</p>
                  <p className="text-sm font-medium text-primary mt-1">
                    {store.distance < 1
                      ? `${(store.distance * 1000).toFixed(0)} meter`
                      : `${store.distance.toFixed(1)} km`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    window.open(
                      `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`,
                      "_blank"
                    );
                  }}
                >
                  <Navigation className="h-3 w-3 mr-1" />
                  Rute
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
