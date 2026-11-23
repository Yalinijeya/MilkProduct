namespace OrderingApi.Infrastructure;

/// <summary>Throw from anywhere to return <c>{ message, details }</c> with the given HTTP status.</summary>
public class ApiException(int statusCode, string message, IDictionary<string, string>? details = null)
    : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public IDictionary<string, string>? Details { get; } = details;
}

/// <summary>Error body shape used by every endpoint.</summary>
public record ApiError(string Message, IDictionary<string, string>? Details = null);
