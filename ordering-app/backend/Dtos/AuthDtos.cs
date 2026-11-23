namespace OrderingApi.Dtos;

public record LoginRequest(string? Username, string? Password);

public record AdminDto(int Id, string Username);

public record LoginResponse(string Token, DateTimeOffset ExpiresAt, AdminDto Admin);
