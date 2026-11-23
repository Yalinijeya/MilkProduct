using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using OrderingApi.Data;
using OrderingApi.Services;
using OrderingApi.Dtos;
using OrderingApi.Infrastructure;
using OrderingApi.Models;

namespace OrderingApi.Controllers;

[ApiController]
[Route("api/settings")]
public class SettingsController(JsonDataStore store, IOptions<ShopOptions> shopOptions) : ControllerBase
{
    /// <summary>GET /api/settings — public (checkout needs the shop location and delivery rates).</summary>
    [HttpGet]
    public Task<SettingsDto> Get(CancellationToken ct) =>
        store.ReadAsync(d => SettingsDto.From(d.RequiredSettings), ct);

    /// <summary>PUT /api/settings — admin. Any subset of fields.</summary>
    [HttpPut]
    [Authorize(Roles = "Admin")]
    public Task<SettingsDto> Update(UpdateSettingsRequest req, CancellationToken ct) =>
        // If validation fails, the store discards the partly-applied changes.
        store.WriteAsync(DataFiles.Settings, d => Apply(d.RequiredSettings, req), ct);

    private SettingsDto Apply(ShopSettings s, UpdateSettingsRequest req)
    {
        var errors = new Dictionary<string, string>();

        if (req.ShopName is not null)
        {
            if (req.ShopName.Trim().Length > 120) errors["shopName"] = "Max 120 characters";
            else s.ShopName = req.ShopName.Trim();
        }
        if (req.ShopAddress is not null)
        {
            if (req.ShopAddress.Trim().Length > 300) errors["shopAddress"] = "Max 300 characters";
            else s.ShopAddress = req.ShopAddress.Trim();
        }
        if (req.WhatsappNumber is not null)
        {
            // Local numbers (0770798107) get the default country code → 94770798107
            var digits = WhatsAppMessage.ToInternational(req.WhatsappNumber, shopOptions.Value.DefaultCountryCode);
            if (digits.Length is > 0 and (< 8 or > 15))
                errors["whatsappNumber"] = "Enter a valid number, e.g. 0770798107 or 94770798107";
            else s.WhatsAppNumber = digits;
        }
        if (req.NotifyEmail is not null)
        {
            var emails = EmailSender.ParseAddresses(req.NotifyEmail);
            if (emails is null || req.NotifyEmail.Length > 300)
                errors["notifyEmail"] = "Enter valid email address(es), separated by commas";
            else s.NotifyEmail = string.Join(", ", emails);
        }
        if (req.ShopLat is { } lat)
        {
            if (!double.IsFinite(lat) || lat is < -90 or > 90) errors["shopLat"] = "Must be between -90 and 90";
            else s.ShopLat = lat;
        }
        if (req.ShopLng is { } lng)
        {
            if (!double.IsFinite(lng) || lng is < -180 or > 180) errors["shopLng"] = "Must be between -180 and 180";
            else s.ShopLng = lng;
        }
        if (req.FreeKm is { } freeKm)
        {
            if (!double.IsFinite(freeKm) || freeKm is < 0 or > 1000) errors["freeKm"] = "Must be between 0 and 1000";
            else s.FreeKm = freeKm;
        }
        if (req.ChargePerKm is { } rate)
        {
            if (rate is < 0 or > 100_000) errors["chargePerKm"] = "Must be between 0 and 100000";
            else s.ChargePerKm = rate;
        }

        if (errors.Count > 0) throw new ApiException(400, "Validation failed", errors);

        s.Touch();
        return SettingsDto.From(s);
    }
}
