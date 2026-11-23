using OrderingApi.Models;

namespace OrderingApi.Dtos;

public record SettingsDto(
    string ShopName,
    string WhatsappNumber,
    string NotifyEmail,
    string ShopAddress,
    double ShopLat,
    double ShopLng,
    double FreeKm,
    decimal ChargePerKm)
{
    public static SettingsDto From(ShopSettings s) =>
        new(s.ShopName, s.WhatsAppNumber, s.NotifyEmail, s.ShopAddress, s.ShopLat, s.ShopLng, s.FreeKm, s.ChargePerKm);
}

/// <summary>Body of PUT /api/settings — every field optional.</summary>
public record UpdateSettingsRequest(
    string? ShopName,
    string? WhatsappNumber,
    string? NotifyEmail,
    string? ShopAddress,
    double? ShopLat,
    double? ShopLng,
    double? FreeKm,
    decimal? ChargePerKm);
