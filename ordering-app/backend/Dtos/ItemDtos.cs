namespace OrderingApi.Dtos;

/// <summary>
/// multipart/form-data body for POST /api/items and PUT /api/items/{id}.
/// On PUT every field is optional (only provided fields change).
/// </summary>
public class ItemForm
{
    public string? Name { get; set; }
    public decimal? Price { get; set; }
    public string? Unit { get; set; }
    public string? Description { get; set; }
    public bool? Available { get; set; }
    public IFormFile? Photo { get; set; }
    /// <summary>PUT only: true clears the current photo.</summary>
    public bool RemovePhoto { get; set; }
}
