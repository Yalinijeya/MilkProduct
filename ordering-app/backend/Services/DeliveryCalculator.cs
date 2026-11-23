namespace OrderingApi.Services;

/// <summary>
/// Delivery charge rules — the backend is the source of truth.
/// Mirrored in frontend/src/app/core/utils/delivery.ts for the live preview at checkout.
/// </summary>
public static class DeliveryCalculator
{
    private const double EarthRadiusKm = 6371;

    private static double ToRad(double deg) => deg * Math.PI / 180;

    /// <summary>Great-circle distance between two points in km (Haversine formula).</summary>
    public static double HaversineKm(double lat1, double lng1, double lat2, double lng2)
    {
        var dLat = ToRad(lat2 - lat1);
        var dLng = ToRad(lng2 - lng1);
        var a = Math.Pow(Math.Sin(dLat / 2), 2) +
                Math.Cos(ToRad(lat1)) * Math.Cos(ToRad(lat2)) * Math.Pow(Math.Sin(dLng / 2), 2);
        return 2 * EarthRadiusKm * Math.Asin(Math.Sqrt(a));
    }

    /// <summary>
    /// Free within <paramref name="freeKm"/>; beyond that <paramref name="chargePerKm"/> for every
    /// extra km, rounded UP (e.g. 7.34 km with 5 free → 3 extra km).
    /// </summary>
    public static decimal Charge(double distanceKm, double freeKm, decimal chargePerKm)
    {
        if (distanceKm <= freeKm) return 0m;
        // Round to 3 decimals first so floating-point noise (1.0000000001) doesn't add a whole km.
        var extraKm = (int)Math.Ceiling(Math.Round(distanceKm - freeKm, 3));
        return extraKm * chargePerKm;
    }

    public static (double DistanceKm, decimal DeliveryCharge) Quote(
        double shopLat, double shopLng, double freeKm, decimal chargePerKm, double lat, double lng)
    {
        var distance = HaversineKm(shopLat, shopLng, lat, lng);
        return (Math.Round(distance, 2), Charge(distance, freeKm, chargePerKm));
    }
}
