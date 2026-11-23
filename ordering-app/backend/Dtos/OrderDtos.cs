using OrderingApi.Models;

namespace OrderingApi.Dtos;

// ---------- Requests ----------

public record CustomerInput(string? Name, string? Phone, string? Address, double? Lat, double? Lng);

public record OrderLineInput(int ItemId, int Quantity);

/// <summary>Body of POST /api/orders. Prices/charges are never accepted from the client.</summary>
public record PlaceOrderRequest(CustomerInput? Customer, string? Notes, List<OrderLineInput>? Items);

public record UpdateStatusRequest(OrderStatus? Status);

// ---------- Responses ----------

public record CustomerDto(string Name, string Phone, string Address, double Lat, double Lng);

public record OrderLineDto(int ItemId, string Name, decimal Price, int Quantity, decimal LineTotal);

public record WhatsAppDto(string Link, bool Sent, string Error);

public record EmailStatusDto(bool Sent, string Error);

public record OrderDto(
    int Id,
    string OrderNumber,
    CustomerDto Customer,
    string Notes,
    List<OrderLineDto> Items,
    decimal ItemTotal,
    double DistanceKm,
    decimal DeliveryCharge,
    decimal GrandTotal,
    OrderStatus Status,
    string MapLink,
    WhatsAppDto Whatsapp,
    EmailStatusDto Email,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt)
{
    public static string BuildMapLink(double lat, double lng) =>
        FormattableString.Invariant($"https://www.google.com/maps?q={lat},{lng}");

    public static OrderDto From(Order o) => new(
        o.Id,
        o.OrderNumber,
        new CustomerDto(o.CustomerName, o.CustomerPhone, o.CustomerAddress, o.CustomerLat, o.CustomerLng),
        o.Notes,
        o.Items.OrderBy(i => i.Id).Select(i => new OrderLineDto(i.ItemId, i.Name, i.Price, i.Quantity, i.LineTotal)).ToList(),
        o.ItemTotal,
        o.DistanceKm,
        o.DeliveryCharge,
        o.GrandTotal,
        o.Status,
        BuildMapLink(o.CustomerLat, o.CustomerLng),
        new WhatsAppDto(o.WhatsAppLink, o.WhatsAppSent, o.WhatsAppError),
        new EmailStatusDto(o.EmailSent, o.EmailError),
        o.CreatedAt,
        o.UpdatedAt);
}

public record PlaceOrderResponse(OrderDto Order, string WhatsappLink);

public record PagedResult<T>(List<T> Data, int Total, int Page, int Limit, int Pages);
