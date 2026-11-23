/**
 * Delivery charge rules — the backend is the source of truth.
 * The same logic is mirrored in frontend/src/app/core/utils/delivery.ts for live preview.
 */

const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance between two lat/lng points in kilometres (Haversine). */
function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * Within `freeKm`: free.
 * Beyond: `chargePerKm` for every extra km, rounded UP (5.2 km with 5 free → 1 extra km).
 */
function calculateDeliveryCharge(distanceKm, freeKm, chargePerKm) {
  if (distanceKm <= freeKm) return 0;
  // Round to 3 decimals first so floating-point noise (e.g. 1.0000000001) doesn't add a km.
  const extraKm = Math.ceil(Number((distanceKm - freeKm).toFixed(3)));
  return extraKm * chargePerKm;
}

function quoteDelivery(settings, customerLat, customerLng) {
  const distanceKm = haversineKm(settings.shopLat, settings.shopLng, customerLat, customerLng);
  const deliveryCharge = calculateDeliveryCharge(distanceKm, settings.freeKm, settings.chargePerKm);
  return { distanceKm: Math.round(distanceKm * 100) / 100, deliveryCharge };
}

module.exports = { haversineKm, calculateDeliveryCharge, quoteDelivery };
