using Microsoft.Extensions.Options;
using OrderingApi.Infrastructure;
using OrderingApi.Models;
using OrderingApi.Services;

namespace OrderingApi.Data;

/// <summary>
/// Runs on startup: creates the admin account from config, default shop settings and a few
/// sample items (only if they don't exist yet in App_Data).
/// Start with <c>dotnet run -- --reset-admin</c> to reset the admin password to the configured one.
/// </summary>
public static class DataSeeder
{
    public static async Task SeedAsync(IServiceProvider services, bool resetAdminPassword)
    {
        var store = services.GetRequiredService<JsonDataStore>();
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("DataSeeder");
        var adminOpt = services.GetRequiredService<IOptions<AdminOptions>>().Value;
        var shop = services.GetRequiredService<IOptions<ShopOptions>>().Value;

        await store.WriteAsync(DataFiles.All, d =>
        {
            // ---- Admin ----
            if (string.IsNullOrWhiteSpace(adminOpt.Username) || string.IsNullOrWhiteSpace(adminOpt.Password))
            {
                if (d.Admins.Count == 0)
                    logger.LogWarning("No admin exists. Set Admin__Username and Admin__Password in .env and restart.");
            }
            else
            {
                var admin = d.Admins.Find(a => string.Equals(a.Username, adminOpt.Username, StringComparison.OrdinalIgnoreCase));
                if (admin is null)
                {
                    admin = new Admin
                    {
                        Id = StoreData.NextId(d.Admins, a => a.Id),
                        Username = adminOpt.Username,
                        PasswordHash = BCrypt.Net.BCrypt.HashPassword(adminOpt.Password, workFactor: 12),
                    };
                    admin.Touch(created: true);
                    d.Admins.Add(admin);
                    logger.LogInformation("Created admin user {Username}", adminOpt.Username);
                }
                else if (resetAdminPassword)
                {
                    admin.PasswordHash = BCrypt.Net.BCrypt.HashPassword(adminOpt.Password, workFactor: 12);
                    admin.Touch();
                    logger.LogInformation("Reset password for admin {Username}", adminOpt.Username);
                }
            }

            // ---- Shop settings ----
            if (d.Settings is null)
            {
                d.Settings = new ShopSettings
                {
                    ShopName = shop.Name,
                    WhatsAppNumber = Services.WhatsAppMessage.ToInternational(shop.WhatsApp, shop.DefaultCountryCode),
                    NotifyEmail = string.Join(", ", EmailSender.ParseAddresses(shop.NotifyEmail) ?? []),
                    ShopAddress = shop.Address,
                    ShopLat = shop.Lat,
                    ShopLng = shop.Lng,
                    FreeKm = shop.FreeKm,
                    ChargePerKm = shop.ChargePerKm,
                };
                d.Settings.Touch(created: true);
                logger.LogInformation("Created default shop settings");
            }

            // ---- Sample items ----
            if (d.Items.Count == 0)
            {
                Item[] samples =
                [
                    new() { Name = "Full Cream Milk", Unit = "1 L", Price = 68, Description = "Fresh farm full cream milk" },
                    new() { Name = "Toned Milk", Unit = "500 ml", Price = 28, Description = "Everyday toned milk" },
                    new() { Name = "Curd", Unit = "500 g", Price = 45, Description = "Thick homemade-style curd" },
                    new() { Name = "Paneer", Unit = "200 g", Price = 95, Description = "Soft fresh paneer" },
                    new() { Name = "Ghee", Unit = "500 ml", Price = 340, Description = "Pure cow ghee" },
                ];
                foreach (var item in samples)
                {
                    item.Id = StoreData.NextId(d.Items, i => i.Id);
                    item.Touch(created: true);
                    d.Items.Add(item);
                }
                logger.LogInformation("Inserted sample items");
            }
        });
    }
}
