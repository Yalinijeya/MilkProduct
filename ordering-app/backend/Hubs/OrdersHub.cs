using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace OrderingApi.Hubs;

/// <summary>
/// Real-time channel for the admin panel (SignalR — the ASP.NET Core equivalent of Socket.IO).
/// Only admins can connect; the JWT is passed as ?access_token=... by the Angular client.
/// Server → client events: "orderNew", "orderUpdated" (payload: OrderDto).
/// </summary>
[Authorize(Roles = "Admin")]
public class OrdersHub : Hub
{
    public const string Path = "/hubs/orders";
    public const string OrderNew = "orderNew";
    public const string OrderUpdated = "orderUpdated";
}
