using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OrderingApi.Infrastructure;
using OrderingApi.Models;

namespace OrderingApi.Data;

/// <summary>
/// Runs on startup: applies migrations, creates the admin account from config,
/// creates default shop settings and a few sample items (only if the tables are empty).
/// Start with <c>dotnet run -- --reset-admin</c> to reset the admin password to the configured one.
/// </summary>
public static class DbSeeder
{
    public static async Task SeedAsync(IServiceProvider services, bool resetAdminPassword)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DbSeeder");
        var adminOpt = scope.ServiceProvider.GetRequiredService<IOptions<AdminOptions>>().Value;
        var shop = scope.ServiceProvider.GetRequiredService<IOptions<ShopOptions>>().Value;

        await db.Database.MigrateAsync();

        // ---- Admin ----
        if (string.IsNullOrWhiteSpace(adminOpt.Username) || string.IsNullOrWhiteSpace(adminOpt.Password))
        {
            if (!await db.Admins.AnyAsync())
                logger.LogWarning("No admin exists. Set Admin__Username and Admin__Password in .env and restart.");
        }
        else
        {
            var admin = await db.Admins.FirstOrDefaultAsync(a => a.Username == adminOpt.Username);
            if (admin is null)
            {
                db.Admins.Add(new Admin
                {
                    Username = adminOpt.Username,
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword(adminOpt.Password, workFactor: 12),
                });
                logger.LogInformation("Created admin user {Username}", adminOpt.Username);
            }
            else if (resetAdminPassword)
            {
                admin.PasswordHash = BCrypt.Net.BCrypt.HashPassword(adminOpt.Password, workFactor: 12);
                logger.LogInformation("Reset password for admin {Username}", adminOpt.Username);
            }
        }

        // ---- Shop settings ----
        if (!await db.ShopSettings.AnyAsync())
        {
            db.ShopSettings.Add(new ShopSettings
            {
                ShopName = shop.Name,
                WhatsAppNumber = Services.WhatsAppMessage.ToInternational(shop.WhatsApp, shop.DefaultCountryCode),
                ShopAddress = shop.Address,
                ShopLat = shop.Lat,
                ShopLng = shop.Lng,
                FreeKm = shop.FreeKm,
                ChargePerKm = shop.ChargePerKm,
            });
            logger.LogInformation("Created default shop settings");
        }

        // ---- Sample items ----
        if (!await db.Items.AnyAsync())
        {
            db.Items.AddRange(
                new Item { Name = "Full Cream Milk", Unit = "1 L", Price = 68, Description = "Fresh farm full cream milk" },
                new Item { Name = "Toned Milk", Unit = "500 ml", Price = 28, Description = "Everyday toned milk" },
                new Item { Name = "Curd", Unit = "500 g", Price = 45, Description = "Thick homemade-style curd" },
                new Item { Name = "Paneer", Unit = "200 g", Price = 95, Description = "Soft fresh paneer" },
                new Item { Name = "Ghee", Unit = "500 ml", Price = 340, Description = "Pure cow ghee" });
            logger.LogInformation("Inserted sample items");
        }

        await db.SaveChangesAsync();
    }
}
