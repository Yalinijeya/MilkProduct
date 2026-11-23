using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using OrderingApi.Infrastructure;
using OrderingApi.Models;

namespace OrderingApi.Data;

/// <summary>Which JSON files a write changes (only those files are rewritten).</summary>
[Flags]
public enum DataFiles
{
    None = 0,
    Admins = 1,
    Items = 2,
    Orders = 4,
    Settings = 8,
    All = Admins | Items | Orders | Settings,
}

/// <summary>Everything the app stores. Only touch it inside <see cref="JsonDataStore"/> Read/Write callbacks.</summary>
public sealed class StoreData
{
    public List<Admin> Admins { get; internal set; } = [];
    public List<Item> Items { get; internal set; } = [];
    public List<Order> Orders { get; internal set; } = [];
    public ShopSettings? Settings { get; set; }

    public ShopSettings RequiredSettings =>
        Settings ?? throw new InvalidOperationException("Shop settings are missing (App_Data/settings.json).");

    public static int NextId<T>(List<T> list, Func<T, int> id) => list.Count == 0 ? 1 : list.Max(id) + 1;
}

/// <summary>
/// Stores all data as JSON files in a folder (default <c>backend/App_Data</c>):
/// admins.json, items.json, orders.json, settings.json.
/// <para>
/// Data is kept in memory and every change is written to disk immediately. One lock serializes all
/// reads/writes, so simultaneous orders can't overwrite each other. Files are written to a temp file
/// first and then swapped in (the previous version is kept as *.json.bak), so a crash mid-write
/// never leaves a half-written file. Run only ONE instance of the API against a data folder.
/// </para>
/// </summary>
public sealed class JsonDataStore : IDisposable
{
    private const string AdminsFile = "admins.json";
    private const string ItemsFile = "items.json";
    private const string OrdersFile = "orders.json";
    private const string SettingsFile = "settings.json";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        // Keep Tamil/Sinhala text readable in the files instead of \uXXXX escapes.
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        Converters = { new JsonStringEnumConverter() },
    };

    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly StoreData _data = new();
    private readonly ILogger<JsonDataStore> _logger;

    public string Folder { get; }

    public JsonDataStore(IHostEnvironment env, IOptions<StorageOptions> options, ILogger<JsonDataStore> logger)
    {
        _logger = logger;
        Folder = Path.GetFullPath(options.Value.DataFolder, env.ContentRootPath);
        Directory.CreateDirectory(Folder);
        Load(DataFiles.All);
        _logger.LogInformation("Data folder: {Folder}", Folder);
    }

    /// <summary>
    /// Runs <paramref name="read"/> under the lock. Return copies or DTOs, never the stored objects
    /// themselves, because those may change after the lock is released.
    /// </summary>
    public async Task<T> ReadAsync<T>(Func<StoreData, T> read, CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            return read(_data);
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// Runs <paramref name="change"/> under the lock, then saves <paramref name="files"/>.
    /// If the callback throws (e.g. a validation error) or saving fails, those files are reloaded
    /// from disk so memory never holds half-applied changes.
    /// </summary>
    public async Task<T> WriteAsync<T>(DataFiles files, Func<StoreData, T> change, CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var result = change(_data);
            await SaveAsync(files); // not cancellable: never stop half way through saving
            return result;
        }
        catch
        {
            Load(files);
            throw;
        }
        finally
        {
            _gate.Release();
        }
    }

    public Task WriteAsync(DataFiles files, Action<StoreData> change, CancellationToken ct = default) =>
        WriteAsync(files, d => { change(d); return true; }, ct);

    // ---------- files ----------

    private void Load(DataFiles files)
    {
        if (files.HasFlag(DataFiles.Admins)) _data.Admins = ReadFile<List<Admin>>(AdminsFile) ?? [];
        if (files.HasFlag(DataFiles.Items)) _data.Items = ReadFile<List<Item>>(ItemsFile) ?? [];
        if (files.HasFlag(DataFiles.Orders)) _data.Orders = ReadFile<List<Order>>(OrdersFile) ?? [];
        if (files.HasFlag(DataFiles.Settings)) _data.Settings = ReadFile<ShopSettings>(SettingsFile);
    }

    private async Task SaveAsync(DataFiles files)
    {
        if (files.HasFlag(DataFiles.Admins)) await WriteFileAsync(AdminsFile, _data.Admins);
        if (files.HasFlag(DataFiles.Items)) await WriteFileAsync(ItemsFile, _data.Items);
        if (files.HasFlag(DataFiles.Orders)) await WriteFileAsync(OrdersFile, _data.Orders);
        if (files.HasFlag(DataFiles.Settings) && _data.Settings is not null)
            await WriteFileAsync(SettingsFile, _data.Settings);
    }

    private T? ReadFile<T>(string name) where T : class
    {
        var path = Path.Combine(Folder, name);
        if (!File.Exists(path)) return null;
        try
        {
            using var stream = File.OpenRead(path);
            return JsonSerializer.Deserialize<T>(stream, JsonOptions);
        }
        catch (JsonException ex)
        {
            // Stop instead of starting empty and overwriting the user's data on the next save.
            throw new InvalidOperationException(
                $"{path} is not valid JSON ({ex.Message}). Fix the file or restore it from {name}.bak.", ex);
        }
    }

    private async Task WriteFileAsync<T>(string name, T value)
    {
        var path = Path.Combine(Folder, name);
        var temp = path + ".tmp";
        await using (var stream = new FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            await JsonSerializer.SerializeAsync(stream, value, JsonOptions);
            await stream.FlushAsync();
            stream.Flush(flushToDisk: true);
        }

        if (File.Exists(path)) File.Replace(temp, path, path + ".bak", ignoreMetadataErrors: true);
        else File.Move(temp, path);
    }

    public void Dispose() => _gate.Dispose();
}
