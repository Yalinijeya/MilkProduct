/**
 * Mirrors backend/src/utils/delivery.js so customers see the delivery charge live.
 * The backend always recalculates it when the order is placed — this is only a preview.
 */

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two points in kilometres (Haversine formula). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** Free within `freeKm`; beyond that `chargePerKm` for every extra km, rounded up. */
export function calculateDeliveryCharge(distanceKm: number, freeKm: number, chargePerKm: number): number {
  if (distanceKm <= freeKm) return 0;
  const extraKm = Math.ceil(Number((distanceKm - freeKm).toFixed(3)));
  return extraKm * chargePerKm;
}

export function quoteDelivery(
  shop: { shopLat: number; shopLng: number; freeKm: number; chargePerKm: number },
  lat: number,
  lng: number,
): { distanceKm: number; deliveryCharge: number } {
  const distanceKm = haversineKm(shop.shopLat, shop.shopLng, lat, lng);
  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    deliveryCharge: calculateDeliveryCharge(distanceKm, shop.freeKm, shop.chargePerKm),
  };
}
