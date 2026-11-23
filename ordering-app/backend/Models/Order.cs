namespace OrderingApi.Models;

/// <summary>Serialized to JSON as snake_case: new, confirmed, out_for_delivery, delivered, cancelled.</summary>
public enum OrderStatus
{
    New,
    Confirmed,
    OutForDelivery,
    Delivered,
    Cancelled,
}

public class Order : ITimestamped
{
    public int Id { get; set; }

    /// <summary>ORD-1001, ORD-1002, … (1000 + Id)</summary>
    public string OrderNumber { get; set; } = null!;

    public string CustomerName { get; set; } = "";
    public string CustomerPhone { get; set; } = "";
    public string CustomerAddress { get; set; } = "";
    public double CustomerLat { get; set; }
    public double CustomerLng { get; set; }
    public string Notes { get; set; } = "";

    public List<OrderItem> Items { get; set; } = [];

    public decimal ItemTotal { get; set; }
    public double DistanceKm { get; set; }
    public decimal DeliveryCharge { get; set; }
    public decimal GrandTotal { get; set; }

    public OrderStatus Status { get; set; } = OrderStatus.New;

    public string WhatsAppLink { get; set; } = "";
    public bool WhatsAppSent { get; set; }
    public string WhatsAppError { get; set; } = "";

    public bool EmailSent { get; set; }
    public string EmailError { get; set; } = "";

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>Snapshot of an item at order time (name/price are copied so later edits don't change old orders).</summary>
public class OrderItem
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public int ItemId { get; set; }
    public string Name { get; set; } = "";
    public decimal Price { get; set; }
    public int Quantity { get; set; }
    public decimal LineTotal { get; set; }
}
