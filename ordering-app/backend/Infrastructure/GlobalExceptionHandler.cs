using Microsoft.AspNetCore.Diagnostics;

namespace OrderingApi.Infrastructure;

/// <summary>Turns exceptions into JSON <c>{ message, details }</c> responses.</summary>
public class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger, IHostEnvironment env) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken ct)
    {
        var (status, error) = exception switch
        {
            ApiException api => (api.StatusCode, new ApiError(api.Message, api.Details)),
            BadHttpRequestException bad => (bad.StatusCode, new ApiError(
                bad.StatusCode == StatusCodes.Status413PayloadTooLarge ? "Request is too large" : "Bad request")),
            _ => (StatusCodes.Status500InternalServerError, new ApiError(
                env.IsDevelopment() ? exception.Message : "Server error")),
        };

        if (status >= 500) logger.LogError(exception, "Unhandled exception");

        context.Response.StatusCode = status;
        await context.Response.WriteAsJsonAsync(error, ct);
        return true;
    }
}
