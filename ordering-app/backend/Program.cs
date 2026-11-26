using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using DotNetEnv;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using OrderingApi.Data;
using OrderingApi.Hubs;
using OrderingApi.Infrastructure;
using OrderingApi.Services;

// Load secrets from .env (real environment variables win). Keys use "__" for nesting, e.g. Jwt__Secret.
Env.NoClobber().TraversePath().Load();

// Parse numbers like "55.50" the same way on every machine.
CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture;
CultureInfo.DefaultThreadCurrentUICulture = CultureInfo.InvariantCulture;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = args, WebRootPath = "wwwroot" });
var config = builder.Configuration;

// ---------- Options ----------
builder.Services.Configure<JwtOptions>(config.GetSection("Jwt"));
builder.Services.Configure<AdminOptions>(config.GetSection("Admin"));
builder.Services.Configure<ShopOptions>(config.GetSection("Shop"));
builder.Services.Configure<WhatsAppOptions>(config.GetSection("WhatsApp"));
builder.Services.Configure<EmailOptions>(config.GetSection("Email"));
builder.Services.Configure<UploadOptions>(config.GetSection("Uploads"));
builder.Services.Configure<StorageOptions>(config.GetSection("Storage"));

var jwt = config.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();
if (string.IsNullOrWhiteSpace(jwt.Secret) || Encoding.UTF8.GetByteCount(jwt.Secret) < 32)
    throw new InvalidOperationException("Jwt__Secret must be set and at least 32 characters long (see .env.example).");

var corsOrigins = (config["Cors:Origins"] ?? "http://localhost:4200")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

// ---------- Services ----------
// All data is stored as JSON files in App_Data (see Data/JsonDataStore.cs).
builder.Services.AddSingleton<JsonDataStore>();

var enumConverter = new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower, allowIntegerValues: false);

builder.Services.AddControllers(o => o.SuppressImplicitRequiredAttributeForNonNullableReferenceTypes = true)
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(enumConverter))
    .ConfigureApiBehaviorOptions(o =>
    {
        // Same { message, details } shape as every other error; hide .NET type names from clients.
        o.InvalidModelStateResponseFactory = ctx =>
        {
            var details = ctx.ModelState
                .Where(kv => kv.Value?.Errors.Count > 0)
                .ToDictionary(
                    kv => kv.Key.TrimStart('$', '.') is { Length: > 0 } key ? key : "body",
                    kv => kv.Value!.Errors[0] is { Exception: null, ErrorMessage: { Length: > 0 } m }
                          && !m.Contains("could not be converted") && !m.Contains("Path: $")
                        ? m
                        : "Invalid value");
            return new BadRequestObjectResult(new ApiError("Validation failed", details));
        };
    });

builder.Services.AddSignalR()
    .AddJsonProtocol(o => o.PayloadSerializerOptions.Converters.Add(enumConverter));

builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt.Issuer,
            ValidateAudience = true,
            ValidAudience = jwt.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Secret)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1),
            NameClaimType = "name",
            RoleClaimType = "role",
        };
        o.Events = new JwtBearerEvents
        {
            // Browsers can't set headers on WebSockets, so SignalR sends the token in the query string.
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) && ctx.HttpContext.Request.Path.StartsWithSegments(OrdersHub.Path))
                    ctx.Token = token;
                return Task.CompletedTask;
            },
            OnChallenge = async ctx =>
            {
                ctx.HandleResponse();
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await ctx.Response.WriteAsJsonAsync(new ApiError("Authentication required"));
            },
            OnForbidden = async ctx =>
            {
                ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                await ctx.Response.WriteAsJsonAsync(new ApiError("Forbidden"));
            },
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddCors(o => o.AddPolicy("frontend", p => p
    .WithOrigins(corsOrigins)
    .AllowAnyHeader()
    .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE")
    .AllowCredentials()));

builder.Services.AddRateLimiter(o =>
{
    static string ClientIp(HttpContext ctx) => ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    // 10 login attempts per IP per 15 minutes
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(ClientIp(ctx),
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(15) }));
    // 10 orders per IP per minute (spam protection)
    o.AddPolicy("orders", ctx => RateLimitPartition.GetFixedWindowLimiter(ClientIp(ctx),
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));

    o.OnRejected = async (ctx, ct) =>
    {
        ctx.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await ctx.HttpContext.Response.WriteAsJsonAsync(new ApiError("Too many requests, please try again later"), ct);
    };
});

builder.Services.AddHttpClient("whatsapp", c => c.Timeout = TimeSpan.FromSeconds(20));
builder.Services.AddSingleton<TokenService>();
builder.Services.AddSingleton<FileStorageService>();
// New-order notifications (WhatsApp + email) are sent in the background
builder.Services.AddSingleton<WhatsAppSender>();
builder.Services.AddSingleton<EmailSender>();
builder.Services.AddSingleton<OrderNotifier>();
builder.Services.AddSingleton<NotificationQueue>();
builder.Services.AddHostedService<NotificationWorker>();
builder.Services.AddScoped<OrderService>();
builder.Services.AddOpenApi();

var app = builder.Build();

// ---------- Pipeline ----------
app.UseExceptionHandler();

if (config.GetValue<bool>("TrustProxy"))
{
    // Behind nginx / IIS / a load balancer: use X-Forwarded-For so rate limiting sees real client IPs.
    var fwd = new ForwardedHeadersOptions { ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto };
    fwd.KnownIPNetworks.Clear();
    fwd.KnownProxies.Clear();
    app.UseForwardedHeaders(fwd);
}

app.UseDefaultFiles(); // / → wwwroot/index.html (the built Angular app)
app.UseStaticFiles(); // Angular files + wwwroot/uploads → /uploads/...
app.UseRouting();
app.UseCors("frontend");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment()) app.MapOpenApi(); // /openapi/v1.json

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapControllers();
app.MapHub<OrdersHub>(OrdersHub.Path);
// Unknown /api URLs stay a JSON 404; other non-file paths (/cart, /admin/...) are Angular routes → index.html.
app.Map("/api/{**rest}", () => Results.NotFound(new ApiError("Not found")));
app.MapFallbackToFile("index.html");

// Create admin/settings/sample items in App_Data if missing
await DataSeeder.SeedAsync(app.Services, resetAdminPassword: args.Contains("--reset-admin"));

app.Run();
