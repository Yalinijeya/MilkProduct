using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderingApi.Services;

namespace OrderingApi.Controllers;

[ApiController]
[Route("api/admin/notifications")]
[Authorize(Roles = "Admin")]
public class NotificationsController(OrderNotifier notifier) : ControllerBase
{
    /// <summary>GET /api/admin/notifications — which channels are set up and where they send to.</summary>
    [HttpGet]
    public Task<NotificationStatusDto> Status(CancellationToken ct) => notifier.GetStatusAsync(ct);

    /// <summary>POST /api/admin/notifications/test — sends a test WhatsApp message and email now.</summary>
    [HttpPost("test")]
    public Task<TestNotificationResult> Test(CancellationToken ct) => notifier.SendTestAsync(ct);
}
