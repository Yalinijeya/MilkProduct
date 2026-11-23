namespace OrderingApi.Infrastructure;

/// <summary>Strongly-typed settings bound from appsettings.json / .env (e.g. Jwt__Secret).</summary>
public class JwtOptions
{
    public string Secret { get; set; } = "";
    public string Issuer { get; set; } = "OrderingApi";
    public string Audience { get; set; } = "OrderingApp";
    public int ExpiresHours { get; set; } = 12;
}

public class AdminOptions
{
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
}

/// <summary>Default shop settings, used only when the settings row doesn't exist yet.</summary>
public class ShopOptions
{
    public string Name { get; set; } = "My Shop";
    public string WhatsApp { get; set; } = "";
    /// <summary>Where new-order emails go (comma-separated). Editable later in Admin → Settings.</summary>
    public string NotifyEmail { get; set; } = "";
    public string Address { get; set; } = "";
    public double Lat { get; set; }
    public double Lng { get; set; }
    public double FreeKm { get; set; } = 5;
    public decimal ChargePerKm { get; set; } = 50;
    public string CurrencySymbol { get; set; } = "Rs. ";
    /// <summary>Added to local numbers like 0770798107 → 94770798107 (Sri Lanka = 94).</summary>
    public string DefaultCountryCode { get; set; } = "94";
}

public enum WhatsAppProvider { None, CallMeBot, MetaCloudApi }

/// <summary>
/// Automatic WhatsApp messages. Set ONE of:
/// <list type="bullet">
/// <item>CallMeBotApiKey — free, sends to the shop's own WhatsApp number (personal use).</item>
/// <item>Token + PhoneNumberId — official Meta WhatsApp Cloud API.</item>
/// </list>
/// </summary>
public class WhatsAppOptions
{
    public string CallMeBotApiKey { get; set; } = "";
    public string Token { get; set; } = "";
    public string PhoneNumberId { get; set; } = "";
    public string ApiVersion { get; set; } = "v21.0";

    public WhatsAppProvider Provider =>
        !string.IsNullOrWhiteSpace(CallMeBotApiKey) ? WhatsAppProvider.CallMeBot
        : !string.IsNullOrWhiteSpace(Token) && !string.IsNullOrWhiteSpace(PhoneNumberId) ? WhatsAppProvider.MetaCloudApi
        : WhatsAppProvider.None;

    public bool IsConfigured => Provider != WhatsAppProvider.None;
}

/// <summary>SMTP server used to email new orders to the shop (recipient is set in Admin → Settings).</summary>
public class EmailOptions
{
    public string Host { get; set; } = "";
    /// <summary>587 = STARTTLS (Gmail, Outlook), 465 = SSL.</summary>
    public int Port { get; set; } = 587;
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    /// <summary>Sender address; defaults to Username.</summary>
    public string From { get; set; } = "";
    public string FromName { get; set; } = "";

    public string FromAddress => string.IsNullOrWhiteSpace(From) ? Username : From;
    public bool IsConfigured => !string.IsNullOrWhiteSpace(Host) && !string.IsNullOrWhiteSpace(FromAddress);
}

public class StorageOptions
{
    /// <summary>Folder for the JSON data files; relative paths are under the backend folder.</summary>
    public string DataFolder { get; set; } = "App_Data";
}

public class UploadOptions
{
    public int MaxMb { get; set; } = 5;
}
