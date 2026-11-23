using Microsoft.Extensions.Options;
using OrderingApi.Infrastructure;

namespace OrderingApi.Services;

/// <summary>Saves item photos to wwwroot/uploads (served at /uploads/...).</summary>
public class FileStorageService
{
    private readonly string _uploadDir;
    private readonly long _maxBytes;
    private readonly ILogger<FileStorageService> _logger;

    public FileStorageService(IWebHostEnvironment env, IOptions<UploadOptions> options, ILogger<FileStorageService> logger)
    {
        _uploadDir = Path.Combine(env.WebRootPath, "uploads");
        Directory.CreateDirectory(_uploadDir);
        _maxBytes = options.Value.MaxMb * 1024L * 1024L;
        _logger = logger;
    }

    public int MaxMb => (int)(_maxBytes / 1024 / 1024);

    /// <summary>Validates and stores an image, returning its public URL (/uploads/xyz.jpg).</summary>
    public async Task<string> SaveImageAsync(IFormFile file, CancellationToken ct = default)
    {
        if (file.Length == 0) throw new ApiException(400, "Photo is empty");
        if (file.Length > _maxBytes) throw new ApiException(400, $"Image must be under {MaxMb} MB");

        // Check the real file signature, not just the client-supplied content type.
        var header = new byte[12];
        await using (var peek = file.OpenReadStream())
        {
            _ = await peek.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false, ct);
        }
        var ext = DetectImageExtension(header)
                  ?? throw new ApiException(400, "Only JPG, PNG, WEBP or GIF images are allowed");

        var fileName = $"{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-{Guid.NewGuid():N}"[..30] + ext;
        var path = Path.Combine(_uploadDir, fileName);
        await using (var stream = File.Create(path))
        {
            await file.CopyToAsync(stream, ct);
        }
        return $"/uploads/{fileName}";
    }

    /// <summary>Deletes a previously uploaded file. Never throws.</summary>
    public void Delete(string? publicUrl)
    {
        if (string.IsNullOrEmpty(publicUrl) || !publicUrl.StartsWith("/uploads/")) return;
        try
        {
            var path = Path.Combine(_uploadDir, Path.GetFileName(publicUrl));
            if (File.Exists(path)) File.Delete(path);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not delete upload {Url}", publicUrl);
        }
    }

    private static string? DetectImageExtension(byte[] h)
    {
        if (h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF) return ".jpg";
        if (h[0] == 0x89 && h[1] == 0x50 && h[2] == 0x4E && h[3] == 0x47) return ".png";
        if (h[0] == 'G' && h[1] == 'I' && h[2] == 'F' && h[3] == '8') return ".gif";
        if (h[0] == 'R' && h[1] == 'I' && h[2] == 'F' && h[3] == 'F' &&
            h[8] == 'W' && h[9] == 'E' && h[10] == 'B' && h[11] == 'P') return ".webp";
        return null;
    }
}
