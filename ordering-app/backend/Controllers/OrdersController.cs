using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OrderingApi.Dtos;
using OrderingApi.Infrastructure;
using OrderingApi.Services;

namespace OrderingApi.Controllers;

[ApiController]
[Route("api/orders")]
public class OrdersController(OrderService orders) : ControllerBase
{
    /// <summary>POST /api/orders — public. Places an order; totals are recalculated on the server.</summary>
    [HttpPost]
    [EnableRateLimiting("orders")]
    public async Task<ActionResult<PlaceOrderResponse>> Place(PlaceOrderRequest request, CancellationToken ct)
    {
        var result = await orders.PlaceAsync(request, ct);
        return StatusCode(StatusCodes.Status201Created, result);
    }

    /// <summary>GET /api/orders?status=new,confirmed&amp;page=1&amp;limit=20 — admin.</summary>
    [HttpGet]
    [Authorize(Roles = "Admin")]
    public Task<PagedResult<OrderDto>> List(
        [FromQuery] string? status, [FromQuery] int page = 1, [FromQuery] int limit = 20, CancellationToken ct = default) =>
        orders.ListAsync(status, page, limit, ct);

    /// <summary>PATCH /api/orders/{id}/status — admin. Body: { "status": "confirmed" }</summary>
    [HttpPatch("{id:int}/status")]
    [Authorize(Roles = "Admin")]
    public async Task<OrderDto> UpdateStatus(int id, UpdateStatusRequest request, CancellationToken ct)
    {
        if (request.Status is not { } status)
            throw new ApiException(400, "Status must be one of: new, confirmed, out_for_delivery, delivered, cancelled");
        return await orders.UpdateStatusAsync(id, status, ct);
    }
}
