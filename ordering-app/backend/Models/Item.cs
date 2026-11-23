namespace OrderingApi.Models;

public class Item : ITimestamped
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public decimal Price { get; set; }
    /// <summary>e.g. "1 L", "500 g"</summary>
    public string Unit { get; set; } = "";
    /// <summary>Public path such as /uploads/1700000000-abc.jpg</summary>
    public string ImageUrl { get; set; } = "";
    public bool Available { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>Copy that is safe to hand out of the data store.</summary>
    public Item Copy() => (Item)MemberwiseClone();
}
