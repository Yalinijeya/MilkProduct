using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderingApi.Data;
using OrderingApi.Dtos;
using OrderingApi.Infrastructure;
using OrderingApi.Models;
using OrderingApi.Services;

namespace OrderingApi.Controllers;

[ApiController]
[Route("api/items")]
public class ItemsController(JsonDataStore store, FileStorageService files) : ControllerBase
{
    private const long MaxRequestBytes = 20 * 1024 * 1024;

    /// <summary>GET /api/items — public, available items only.</summary>
    [HttpGet]
    public Task<List<Item>> GetAvailable(CancellationToken ct) =>
        store.ReadAsync(d => d.Items
            .Where(i => i.Available)
            .OrderBy(i => i.Name, StringComparer.OrdinalIgnoreCase)
            .Select(i => i.Copy())
            .ToList(), ct);

    /// <summary>POST /api/items — admin, multipart/form-data with optional "photo".</summary>
    [HttpPost]
    [Authorize(Roles = "Admin")]
    [RequestSizeLimit(MaxRequestBytes)]
    public async Task<ActionResult<Item>> Create([FromForm] ItemForm form, CancellationToken ct)
    {
        var item = new Item();
        Apply(item, form, isCreate: true);
        if (form.Photo is not null) item.ImageUrl = await files.SaveImageAsync(form.Photo, ct);

        try
        {
            var created = await store.WriteAsync(DataFiles.Items, d =>
            {
                item.Id = StoreData.NextId(d.Items, i => i.Id);
                item.Touch(created: true);
                d.Items.Add(item);
                return item.Copy();
            }, ct);
            return StatusCode(StatusCodes.Status201Created, created);
        }
        catch
        {
            files.Delete(item.ImageUrl);
            throw;
        }
    }

    /// <summary>PUT /api/items/{id} — admin, multipart/form-data; only provided fields change.</summary>
    [HttpPut("{id:int}")]
    [Authorize(Roles = "Admin")]
    [RequestSizeLimit(MaxRequestBytes)]
    public async Task<ActionResult<Item>> Update(int id, [FromForm] ItemForm form, CancellationToken ct)
    {
        Apply(new Item(), form, isCreate: false); // validate before saving any photo

        string? newImage = null;
        if (form.Photo is not null) newImage = await files.SaveImageAsync(form.Photo, ct);

        try
        {
            var (updated, oldImage) = await store.WriteAsync(DataFiles.Items, d =>
            {
                var item = d.Items.Find(i => i.Id == id) ?? throw new ApiException(404, "Item not found");
                var previousImage = item.ImageUrl;
                Apply(item, form, isCreate: false);
                if (newImage is not null) item.ImageUrl = newImage;
                else if (form.RemovePhoto) item.ImageUrl = "";
                item.Touch();
                return (item.Copy(), previousImage);
            }, ct);

            if (oldImage != updated.ImageUrl) files.Delete(oldImage);
            return updated;
        }
        catch
        {
            files.Delete(newImage);
            throw;
        }
    }

    /// <summary>DELETE /api/items/{id} — admin; also deletes the photo file.</summary>
    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var item = await store.WriteAsync(DataFiles.Items, d =>
        {
            var found = d.Items.Find(i => i.Id == id) ?? throw new ApiException(404, "Item not found");
            d.Items.Remove(found);
            return found;
        }, ct);
        files.Delete(item.ImageUrl);
        return Ok(new { message = "Item deleted", id });
    }

    private static void Apply(Item item, ItemForm form, bool isCreate)
    {
        var errors = new Dictionary<string, string>();

        if (form.Name is not null || isCreate)
        {
            var name = form.Name?.Trim() ?? "";
            if (name.Length == 0) errors["name"] = "Name is required";
            else if (name.Length > 120) errors["name"] = "Name must be at most 120 characters";
            else item.Name = name;
        }
        if (form.Price is { } price)
        {
            if (price < 0 || price > 10_000_000) errors["price"] = "Price must be a non-negative number";
            else item.Price = Math.Round(price, 2);
        }
        else if (isCreate)
        {
            errors["price"] = "Price is required";
        }
        if (form.Unit is not null)
        {
            var unit = form.Unit.Trim();
            if (unit.Length > 30) errors["unit"] = "Unit must be at most 30 characters";
            else item.Unit = unit;
        }
        if (form.Description is not null)
        {
            var desc = form.Description.Trim();
            if (desc.Length > 500) errors["description"] = "Description must be at most 500 characters";
            else item.Description = desc;
        }
        if (form.Available is { } available) item.Available = available;

        if (errors.Count > 0) throw new ApiException(400, "Validation failed", errors);
    }
}

[ApiController]
[Route("api/admin/items")]
[Authorize(Roles = "Admin")]
public class AdminItemsController(JsonDataStore store) : ControllerBase
{
    /// <summary>GET /api/admin/items — admin, all items (including hidden).</summary>
    [HttpGet]
    public Task<List<Item>> GetAll(CancellationToken ct) =>
        store.ReadAsync(d => d.Items.OrderByDescending(i => i.Id).Select(i => i.Copy()).ToList(), ct);
}
