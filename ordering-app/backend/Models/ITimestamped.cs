namespace OrderingApi.Models;

/// <summary>Records with CreatedAt/UpdatedAt; call <see cref="TimestampExtensions.Touch"/> when saving.</summary>
public interface ITimestamped
{
    DateTimeOffset CreatedAt { get; set; }
    DateTimeOffset UpdatedAt { get; set; }
}

public static class TimestampExtensions
{
    /// <summary>Sets UpdatedAt (and CreatedAt for new records) to now.</summary>
    public static void Touch(this ITimestamped entity, bool created = false)
    {
        var now = DateTimeOffset.UtcNow;
        if (created) entity.CreatedAt = now;
        entity.UpdatedAt = now;
    }
}
