using System.Text.RegularExpressions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;
using OrderingApi.Data;
using OrderingApi.Dtos;
using OrderingApi.Hubs;
using OrderingApi.Infrastructure;
using OrderingApi.Models;

namespace OrderingApi.Services;

public partial class OrderService(
    JsonDataStore store,
    IHubContext<OrdersHub> hub,
    NotificationQueue notifications,
    IOptions<ShopOptions> shopOptions,
    ILogger<OrderService> logger)
{
    private const int MaxQuantity = 100;

    [GeneratedRegex(@"^\+?[0-9][0-9\s-]{6,18}$")]
    private static partial Regex PhoneRegex();

    private static decimal Round2(decimal v) => Math.Round(v, 2, MidpointRounding.AwayFromZero);

    public async Task<PlaceOrderResponse> PlaceAsync(PlaceOrderRequest request, CancellationToken ct)
    {
        var (customer, notes, quantities) = Validate(request);

        var dto = await store.WriteAsync(DataFiles.Orders, d =>
        {
            // Prices always come from the saved items, never from the client.
            var available = d.Items.Where(i => i.Available).ToDictionary(i => i.Id);
            var missing = quantities.Keys.Where(id => !available.ContainsKey(id)).ToList();
            if (missing.Count > 0)
            {
                throw new ApiException(409, "Some items are no longer available. Please refresh your cart.",
                    new Dictionary<string, string> { ["missing"] = string.Join(",", missing) });
            }

            var orderId = StoreData.NextId(d.Orders, o => o.Id);
            var lines = quantities.Select((kv, index) =>
            {
                var item = available[kv.Key];
                return new OrderItem
                {
                    Id = index + 1,
                    OrderId = orderId,
                    ItemId = item.Id,
                    Name = item.Name,
                    Price = item.Price,
                    Quantity = kv.Value,
                    LineTotal = Round2(item.Price * kv.Value),
                };
            }).ToList();
            var itemTotal = Round2(lines.Sum(l => l.LineTotal));

            // Delivery charge is always recalculated here so the customer can't change it.
            var settings = d.RequiredSettings;
            var (distanceKm, deliveryCharge) = DeliveryCalculator.Quote(
                settings.ShopLat, settings.ShopLng, settings.FreeKm, settings.ChargePerKm, customer.Lat, customer.Lng);

            var order = new Order
            {
                Id = orderId,
                OrderNumber = $"ORD-{1000 + orderId}",
                CustomerName = customer.Name,
                CustomerPhone = customer.Phone,
                CustomerAddress = customer.Address,
                CustomerLat = customer.Lat,
                CustomerLng = customer.Lng,
                Notes = notes,
                Items = lines,
                ItemTotal = itemTotal,
                DistanceKm = distanceKm,
                DeliveryCharge = deliveryCharge,
                GrandTotal = Round2(itemTotal + deliveryCharge),
                Status = OrderStatus.New,
            };
            order.Touch(created: true);

            var text = WhatsAppMessage.Build(order, settings.ShopName, shopOptions.Value.CurrencySymbol);
            order.WhatsAppLink = WhatsAppMessage.ClickToChatLink(
                settings.WhatsAppNumber, text, shopOptions.Value.DefaultCountryCode);

            d.Orders.Add(order);
            return OrderDto.From(order);
        }, ct);

        // 1) Real-time alert to the admin panel
        try
        {
            await hub.Clients.All.SendAsync(OrdersHub.OrderNew, dto, ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "SignalR broadcast failed for {OrderNumber}", dto.OrderNumber);
        }

        // 2) WhatsApp + email to the shop, sent in the background (see NotificationService)
        notifications.Enqueue(dto.Id);

        return new PlaceOrderResponse(dto, dto.Whatsapp.Link);
    }

    public Task<PagedResult<OrderDto>> ListAsync(string? status, int page, int limit, CancellationToken ct)
    {
        page = Math.Max(1, page);
        limit = Math.Clamp(limit, 1, 100);
        var statuses = ParseStatuses(status);

        return store.ReadAsync(d =>
        {
            var query = d.Orders.AsEnumerable();
            if (statuses.Count > 0) query = query.Where(o => statuses.Contains(o.Status));

            var matching = query.ToList();
            var total = matching.Count;
            var pageItems = matching
                .OrderByDescending(o => o.Id)
                .Skip((page - 1) * limit)
                .Take(limit)
                .Select(OrderDto.From)
                .ToList();

            return new PagedResult<OrderDto>(pageItems, total, page, limit, (int)Math.Ceiling(total / (double)limit));
        }, ct);
    }

    public async Task<OrderDto> UpdateStatusAsync(int id, OrderStatus status, CancellationToken ct)
    {
        var dto = await store.WriteAsync(DataFiles.Orders, d =>
        {
            var order = d.Orders.Find(o => o.Id == id) ?? throw new ApiException(404, "Order not found");
            order.Status = status;
            order.Touch();
            return OrderDto.From(order);
        }, ct);

        await hub.Clients.All.SendAsync(OrdersHub.OrderUpdated, dto, ct);
        return dto;
    }

    // ---------- helpers ----------

    private record ValidCustomer(string Name, string Phone, string Address, double Lat, double Lng);

    private static (ValidCustomer, string, Dictionary<int, int>) Validate(PlaceOrderRequest request)
    {
        var errors = new Dictionary<string, string>();
        var c = request.Customer;
        var name = c?.Name?.Trim() ?? "";
        var phone = c?.Phone?.Trim() ?? "";
        var address = c?.Address?.Trim() ?? "";
        var notes = (request.Notes ?? "").Trim();

        if (name.Length == 0 || name.Length > 100) errors["name"] = "Name is required (max 100 characters)";
        if (!PhoneRegex().IsMatch(phone)) errors["phone"] = "Valid phone number is required";
        if (address.Length == 0 || address.Length > 500) errors["address"] = "Address is required (max 500 characters)";
        if (c?.Lat is not { } lat || !double.IsFinite(lat) || lat is < -90 or > 90) errors["lat"] = "Valid latitude is required";
        if (c?.Lng is not { } lng || !double.IsFinite(lng) || lng is < -180 or > 180) errors["lng"] = "Valid longitude is required";
        if (notes.Length > 500) notes = notes[..500];

        // Merge duplicate lines and validate quantities
        var quantities = new Dictionary<int, int>();
        foreach (var line in request.Items ?? [])
        {
            if (line is null || line.ItemId <= 0 || line.Quantity is < 1 or > MaxQuantity)
            {
                errors["items"] = $"Each item needs a valid itemId and a quantity between 1 and {MaxQuantity}";
                break;
            }
            quantities[line.ItemId] = quantities.GetValueOrDefault(line.ItemId) + line.Quantity;
        }
        if (quantities.Count == 0 && !errors.ContainsKey("items")) errors["items"] = "Cart is empty";
        else if (quantities.Values.Any(q => q > MaxQuantity)) errors["items"] = $"Maximum {MaxQuantity} of each item per order";

        if (errors.Count > 0) throw new ApiException(400, "Invalid order", errors);

        var customer = new ValidCustomer(name, phone, address,
            Math.Round(c!.Lat!.Value, 6), Math.Round(c.Lng!.Value, 6));
        return (customer, notes, quantities);
    }

    /// <summary>Parses "new,out_for_delivery" into enum values (unknown values are ignored).</summary>
    public static List<OrderStatus> ParseStatuses(string? csv) =>
        (csv ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(s => s.Length > 0 && char.IsLetter(s[0]))
            .Select(s => Enum.TryParse<OrderStatus>(s.Replace("_", ""), ignoreCase: true, out var st) ? st : (OrderStatus?)null)
            .Where(s => s.HasValue)
            .Select(s => s!.Value)
            .Distinct()
            .ToList();
}
