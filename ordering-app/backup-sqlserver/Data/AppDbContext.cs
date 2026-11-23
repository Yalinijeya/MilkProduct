using Microsoft.EntityFrameworkCore;
using OrderingApi.Models;

namespace OrderingApi.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Admin> Admins => Set<Admin>();
    public DbSet<Item> Items => Set<Item>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<ShopSettings> ShopSettings => Set<ShopSettings>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Admin>(e =>
        {
            e.HasIndex(a => a.Username).IsUnique();
            e.Property(a => a.Username).HasMaxLength(50);
            e.Property(a => a.PasswordHash).HasMaxLength(100);
        });

        b.Entity<Item>(e =>
        {
            e.Property(i => i.Name).HasMaxLength(120);
            e.Property(i => i.Description).HasMaxLength(500);
            e.Property(i => i.Unit).HasMaxLength(30);
            e.Property(i => i.ImageUrl).HasMaxLength(300);
            e.Property(i => i.Price).HasPrecision(18, 2);
            e.HasIndex(i => i.Available);
        });

        // Human-friendly order numbers: ORD-1001, ORD-1002, ...
        b.HasSequence<int>("OrderNumberSeq").StartsAt(1001).IncrementsBy(1);

        b.Entity<Order>(e =>
        {
            e.Property(o => o.OrderNumber)
                .HasMaxLength(20)
                .HasDefaultValueSql("CONCAT('ORD-', NEXT VALUE FOR OrderNumberSeq)");
            e.HasIndex(o => o.OrderNumber).IsUnique();
            e.Property(o => o.CustomerName).HasMaxLength(100);
            e.Property(o => o.CustomerPhone).HasMaxLength(20);
            e.Property(o => o.CustomerAddress).HasMaxLength(500);
            e.Property(o => o.Notes).HasMaxLength(500);
            e.Property(o => o.ItemTotal).HasPrecision(18, 2);
            e.Property(o => o.DeliveryCharge).HasPrecision(18, 2);
            e.Property(o => o.GrandTotal).HasPrecision(18, 2);
            e.Property(o => o.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(o => o.WhatsAppLink).HasMaxLength(4000);
            e.Property(o => o.WhatsAppError).HasMaxLength(500);
            e.HasIndex(o => o.Status);
            e.HasMany(o => o.Items).WithOne().HasForeignKey(i => i.OrderId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<OrderItem>(e =>
        {
            e.Property(i => i.Name).HasMaxLength(120);
            e.Property(i => i.Price).HasPrecision(18, 2);
            e.Property(i => i.LineTotal).HasPrecision(18, 2);
        });

        b.Entity<ShopSettings>(e =>
        {
            e.Property(s => s.Id).ValueGeneratedNever();
            e.Property(s => s.ShopName).HasMaxLength(120);
            e.Property(s => s.WhatsAppNumber).HasMaxLength(20);
            e.Property(s => s.ShopAddress).HasMaxLength(300);
            e.Property(s => s.ChargePerKm).HasPrecision(18, 2);
        });
    }

    public override Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var entry in ChangeTracker.Entries<ITimestamped>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAt = now;
                entry.Entity.UpdatedAt = now;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAt = now;
            }
        }
        return base.SaveChangesAsync(ct);
    }
}
