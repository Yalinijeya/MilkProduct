namespace OrderingApi.Models;

/// <summary>The shop's settings (stored in App_Data/settings.json).</summary>
public class ShopSettings : ITimestamped
{
    public const int SingletonId = 1;

    public int Id { get; set; } = SingletonId;
    public string ShopName { get; set; } = "";
    /// <summary>Digits only, with country code, e.g. 919876543210</summary>
    public string WhatsAppNumber { get; set; } = "";
    /// <summary>Email address(es) that receive new orders, comma-separated.</summary>
    public string NotifyEmail { get; set; } = "";
    public string ShopAddress { get; set; } = "";
    public double ShopLat { get; set; }
    public double ShopLng { get; set; }
    public double FreeKm { get; set; } = 5;
    public decimal ChargePerKm { get; set; } = 50;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
