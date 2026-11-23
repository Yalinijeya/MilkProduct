using System.Globalization;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;
using OrderingApi.Infrastructure;
using OrderingApi.Models;

namespace OrderingApi.Services;

/// <summary>Sends email through the SMTP server in .env (Email__Host, Email__Username, ...).</summary>
public partial class EmailSender(IOptions<EmailOptions> options)
{
    [GeneratedRegex(@"^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$")]
    private static partial Regex EmailRegex();

    public bool IsConfigured => options.Value.IsConfigured;

    /// <summary>Splits "a@x.com, b@y.com" into addresses; null if any address is invalid.</summary>
    public static List<string>? ParseAddresses(string? input)
    {
        var parts = (input ?? "").Split([',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Any(p => !EmailRegex().IsMatch(p))) return null;
        return parts.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    public async Task<SendResult> SendAsync(
        IReadOnlyCollection<string> to, string subject, string htmlBody, string textBody, CancellationToken ct)
    {
        var opt = options.Value;
        if (!opt.IsConfigured) return SendResult.Fail("Email (SMTP) is not configured (.env)");
        if (to.Count == 0) return SendResult.Fail("Notification email is not set (Admin → Settings)");

        try
        {
            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(opt.FromName, opt.FromAddress));
            foreach (var address in to) message.To.Add(MailboxAddress.Parse(address));
            message.Subject = subject;
            message.Body = new BodyBuilder { HtmlBody = htmlBody, TextBody = textBody }.ToMessageBody();

            using var client = new SmtpClient { Timeout = 20_000 };
            var security = opt.Port switch
            {
                465 => SecureSocketOptions.SslOnConnect,
                587 => SecureSocketOptions.StartTls,
                _ => SecureSocketOptions.StartTlsWhenAvailable,
            };
            await client.ConnectAsync(opt.Host, opt.Port, security, ct);
            if (!string.IsNullOrEmpty(opt.Username)) await client.AuthenticateAsync(opt.Username, opt.Password, ct);
            await client.SendAsync(new MailKit.SendRequest(message), ct);
            await client.DisconnectAsync(true, ct);
            return SendResult.Ok;
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            return SendResult.Fail(ex.Message);
        }
    }
}

/// <summary>Builds the "new order" email.</summary>
public static class OrderEmail
{
    private static string Money(decimal value, string symbol) =>
        symbol + value.ToString("0.00", CultureInfo.InvariantCulture);

    private static string H(string? s) => WebUtility.HtmlEncode(s ?? "");

    public static string Subject(Order o, string currency) =>
        $"New order {o.OrderNumber} – {Money(o.GrandTotal, currency)} – {o.CustomerName}";

    public static string Html(Order o, string shopName, string currency)
    {
        var map = Dtos.OrderDto.BuildMapLink(o.CustomerLat, o.CustomerLng);
        var km = o.DistanceKm.ToString("0.##", CultureInfo.InvariantCulture);
        const string td = "padding:6px 8px;border-bottom:1px solid #e2e8f0;";

        var sb = new StringBuilder();
        sb.Append("<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;max-width:600px\">");
        sb.Append($"<h2 style=\"margin:0 0 4px\">🛒 New order {H(o.OrderNumber)}</h2>");
        sb.Append($"<p style=\"margin:0 0 16px;color:#64748b\">{H(shopName)} · {o.CreatedAt.ToLocalTime():dd MMM yyyy, hh:mm tt}</p>");

        sb.Append("<h3 style=\"margin:0 0 6px\">Customer</h3><p style=\"margin:0 0 16px;line-height:1.6\">");
        sb.Append($"<b>{H(o.CustomerName)}</b><br>");
        sb.Append($"📞 <a href=\"tel:{H(o.CustomerPhone)}\">{H(o.CustomerPhone)}</a><br>");
        sb.Append($"{H(o.CustomerAddress)}<br>");
        sb.Append($"📍 <a href=\"{H(map)}\">Open in Google Maps</a> ({km} km)</p>");

        sb.Append("<table style=\"border-collapse:collapse;width:100%\"><tr style=\"background:#f1f5f9;text-align:left\">");
        sb.Append($"<th style=\"{td}\">Item</th><th style=\"{td}text-align:right\">Qty</th><th style=\"{td}text-align:right\">Price</th><th style=\"{td}text-align:right\">Total</th></tr>");
        foreach (var i in o.Items)
        {
            sb.Append($"<tr><td style=\"{td}\">{H(i.Name)}</td><td style=\"{td}text-align:right\">{i.Quantity}</td>");
            sb.Append($"<td style=\"{td}text-align:right\">{Money(i.Price, currency)}</td><td style=\"{td}text-align:right\">{Money(i.LineTotal, currency)}</td></tr>");
        }
        sb.Append($"<tr><td colspan=\"3\" style=\"{td}text-align:right\">Item total</td><td style=\"{td}text-align:right\">{Money(o.ItemTotal, currency)}</td></tr>");
        var delivery = o.DeliveryCharge == 0 ? "FREE" : Money(o.DeliveryCharge, currency);
        sb.Append($"<tr><td colspan=\"3\" style=\"{td}text-align:right\">Delivery ({km} km)</td><td style=\"{td}text-align:right\">{delivery}</td></tr>");
        sb.Append($"<tr><td colspan=\"3\" style=\"padding:8px;text-align:right\"><b>Grand total</b></td><td style=\"padding:8px;text-align:right\"><b>{Money(o.GrandTotal, currency)}</b></td></tr>");
        sb.Append("</table>");

        if (!string.IsNullOrWhiteSpace(o.Notes))
            sb.Append($"<p style=\"margin:16px 0 0;padding:8px;background:#fffbeb\">📝 <b>Notes:</b> {H(o.Notes)}</p>");
        if (!string.IsNullOrEmpty(o.WhatsAppLink))
            sb.Append($"<p style=\"margin:16px 0 0\"><a href=\"{H(o.WhatsAppLink)}\">Open this order in WhatsApp</a></p>");
        sb.Append("</div>");
        return sb.ToString();
    }

    /// <summary>Plain-text version: the WhatsApp message without *bold* markers.</summary>
    public static string Text(Order o, string shopName, string currency) =>
        WhatsAppMessage.Build(o, shopName, currency).Replace("*", "");
}
