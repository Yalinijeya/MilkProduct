using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using Microsoft.Extensions.Options;
using OrderingApi.Infrastructure;
using OrderingApi.Models;

namespace OrderingApi.Services;

/// <summary>Builds the order message and the wa.me Click-to-Chat link.</summary>
public static class WhatsAppMessage
{
    private static string Money(decimal value, string symbol) =>
        symbol + value.ToString("0.00", CultureInfo.InvariantCulture);

    public static string Build(Order o, string shopName, string currency)
    {
        var sb = new StringBuilder();
        sb.AppendLine(string.IsNullOrWhiteSpace(shopName) ? "🛒 *New Order*" : $"🛒 *New Order - {shopName}*");
        sb.AppendLine($"*Order ID:* {o.OrderNumber}");
        sb.AppendLine();
        sb.AppendLine($"*Customer:* {o.CustomerName}");
        sb.AppendLine($"*Phone:* {o.CustomerPhone}");
        sb.AppendLine($"*Address:* {o.CustomerAddress}");
        sb.AppendLine($"*Map:* {Dtos.OrderDto.BuildMapLink(o.CustomerLat, o.CustomerLng)}");
        sb.AppendLine();
        sb.AppendLine("*Items:*");
        foreach (var i in o.Items)
            sb.AppendLine($"• {i.Name} x {i.Quantity} = {Money(i.LineTotal, currency)}");
        sb.AppendLine();
        sb.AppendLine($"*Item total:* {Money(o.ItemTotal, currency)}");
        var km = o.DistanceKm.ToString("0.##", CultureInfo.InvariantCulture);
        sb.AppendLine($"*Delivery ({km} km):* {(o.DeliveryCharge == 0 ? "FREE" : Money(o.DeliveryCharge, currency))}");
        sb.Append($"*Grand total:* {Money(o.GrandTotal, currency)}");
        if (!string.IsNullOrWhiteSpace(o.Notes))
        {
            sb.AppendLine().AppendLine();
            sb.Append($"*Notes:* {o.Notes}");
        }
        return sb.ToString();
    }

    public static string DigitsOnly(string? phone) => new((phone ?? "").Where(char.IsAsciiDigit).ToArray());

    /// <summary>
    /// Converts a phone number to the international digits WhatsApp needs:
    /// "077 079 8107" → "94770798107", "+94 77..." → "9477...", "0094 77..." → "9477...".
    /// </summary>
    public static string ToInternational(string? phone, string countryCode)
    {
        var digits = DigitsOnly(phone);
        if (digits.StartsWith("00")) return digits[2..];
        if (digits.StartsWith('0') && digits.Length > 1) return DigitsOnly(countryCode) + digits[1..];
        return digits;
    }

    public static string ClickToChatLink(string whatsappNumber, string message, string countryCode)
    {
        var number = ToInternational(whatsappNumber, countryCode);
        return number.Length == 0 ? "" : $"https://wa.me/{number}?text={Uri.EscapeDataString(message)}";
    }
}

/// <summary>Result of one notification attempt.</summary>
public record SendResult(bool Sent, string Error)
{
    public static readonly SendResult Ok = new(true, "");
    public static SendResult Fail(string error) => new(false, error.Length > 500 ? error[..500] : error);
}

/// <summary>Sends a WhatsApp text through CallMeBot or the Meta Cloud API (whichever is configured).</summary>
public class WhatsAppSender(
    IHttpClientFactory httpFactory,
    IOptions<WhatsAppOptions> options,
    IOptions<ShopOptions> shopOptions)
{
    public WhatsAppProvider Provider => options.Value.Provider;

    public async Task<SendResult> SendAsync(string toNumber, string message, CancellationToken ct)
    {
        var to = WhatsAppMessage.ToInternational(toNumber, shopOptions.Value.DefaultCountryCode);
        if (to.Length == 0) return SendResult.Fail("Shop WhatsApp number is not set (Admin → Settings)");

        try
        {
            return Provider switch
            {
                WhatsAppProvider.CallMeBot => await SendCallMeBotAsync(to, message, ct),
                WhatsAppProvider.MetaCloudApi => await SendMetaAsync(to, message, ct),
                _ => SendResult.Fail("WhatsApp sending is not configured (.env)"),
            };
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            return SendResult.Fail(ex.Message);
        }
    }

    /// <summary>
    /// CallMeBot (free): https://www.callmebot.com/blog/free-api-whatsapp-messages/
    /// The API key only works for the phone number that registered it (the shop's number).
    /// </summary>
    private async Task<SendResult> SendCallMeBotAsync(string to, string message, CancellationToken ct)
    {
        var url = "https://api.callmebot.com/whatsapp.php" +
                  $"?phone={Uri.EscapeDataString("+" + to)}" +
                  $"&text={Uri.EscapeDataString(message)}" +
                  $"&apikey={Uri.EscapeDataString(options.Value.CallMeBotApiKey.Trim())}";

        using var response = await httpFactory.CreateClient("whatsapp").GetAsync(url, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        // CallMeBot answers with an HTML page; failures mention "error" or an invalid API key.
        if (response.IsSuccessStatusCode &&
            !body.Contains("error", StringComparison.OrdinalIgnoreCase) &&
            !body.Contains("invalid", StringComparison.OrdinalIgnoreCase))
        {
            return SendResult.Ok;
        }
        return SendResult.Fail($"CallMeBot {(int)response.StatusCode}: {StripHtml(body)}");
    }

    /// <summary>
    /// Meta WhatsApp Cloud API. NOTE: Meta only delivers free-form text within 24 hours after the
    /// recipient last messaged your business number; otherwise an approved template is required.
    /// </summary>
    private async Task<SendResult> SendMetaAsync(string to, string message, CancellationToken ct)
    {
        var opt = options.Value;
        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"https://graph.facebook.com/{opt.ApiVersion}/{opt.PhoneNumberId}/messages");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", opt.Token);
        request.Content = JsonContent.Create(new
        {
            messaging_product = "whatsapp",
            to,
            type = "text",
            text = new { preview_url = true, body = message },
        });

        using var response = await httpFactory.CreateClient("whatsapp").SendAsync(request, ct);
        if (response.IsSuccessStatusCode) return SendResult.Ok;
        var body = await response.Content.ReadAsStringAsync(ct);
        return SendResult.Fail($"WhatsApp API {(int)response.StatusCode}: {(body.Length > 300 ? body[..300] : body)}");
    }

    private static string StripHtml(string html)
    {
        var text = System.Text.RegularExpressions.Regex.Replace(html, "<[^>]+>", " ");
        text = System.Text.RegularExpressions.Regex.Replace(System.Net.WebUtility.HtmlDecode(text), @"\s+", " ").Trim();
        return text.Length > 300 ? text[..300] : text;
    }
}
