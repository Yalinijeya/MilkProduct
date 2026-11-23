using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OrderingApi.Data;
using OrderingApi.Dtos;
using OrderingApi.Infrastructure;
using OrderingApi.Models;
using OrderingApi.Services;

namespace OrderingApi.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(JsonDataStore store, TokenService tokens) : ControllerBase
{
    // A valid hash to compare against when the user doesn't exist (keeps response time constant).
    private static readonly string DummyHash = BCrypt.Net.BCrypt.HashPassword("dummy-password", workFactor: 12);

    /// <summary>POST /api/auth/login — { username, password } → { token, expiresAt, admin }</summary>
    [HttpPost("login")]
    [EnableRateLimiting("login")]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request, CancellationToken ct)
    {
        var username = request.Username?.Trim() ?? "";
        var password = request.Password ?? "";
        if (username.Length == 0 || password.Length == 0)
            throw new ApiException(400, "Username and password are required");

        var admin = await store.ReadAsync(d =>
            d.Admins.Find(a => string.Equals(a.Username, username, StringComparison.OrdinalIgnoreCase)) is { } a
                ? new Admin { Id = a.Id, Username = a.Username, PasswordHash = a.PasswordHash }
                : null, ct);
        var valid = BCrypt.Net.BCrypt.Verify(password, admin?.PasswordHash ?? DummyHash);
        if (admin is null || !valid) throw new ApiException(401, "Invalid username or password");

        var (token, expiresAt) = tokens.CreateToken(admin);
        return new LoginResponse(token, expiresAt, new AdminDto(admin.Id, admin.Username));
    }
}
