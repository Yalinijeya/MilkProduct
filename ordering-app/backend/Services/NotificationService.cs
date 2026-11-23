using System.Threading.Channels;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;
using OrderingApi.Data;
using OrderingApi.Dtos;
using OrderingApi.Hubs;
using OrderingApi.Infrastructure;

namespace OrderingApi.Services;

/// <summary>In-memory queue of new order ids, so placing an order never waits on WhatsApp/email.</summary>
public class NotificationQueue
{
    private readonly Channel<int> _channel = Channel.CreateBounded<int>(
        new BoundedChannelOptions(1000) { FullMode = BoundedChannelFullMode.DropOldest });

    public void Enqueue(int orderId) => _channel.Writer.TryWrite(orderId);

    public IAsyncEnumerable<int> ReadAllAsync(CancellationToken ct) => _channel.Reader.ReadAllAsync(ct);
}

public record ChannelStatusDto(bool Configured, string Provider, string Recipient);

public record NotificationStatusDto(ChannelStatusDto Whatsapp, ChannelStatusDto Email);

public record TestNotificationResult(SendResult? Whatsapp, SendResult? Email);

/// <summary>Sends the new-order WhatsApp message and email to the shop and saves the results on the order.</summary>
public class OrderNotifier(
    JsonDataStore store,
    WhatsAppSender whatsApp,
    EmailSender email,
    IHubContext<OrdersHub> hub,
    IOptions<ShopOptions> shopOptions,
    ILogger<OrderNotifier> logger)
{
    private static readonly TimeSpan[] RetryDelays = [TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(30)];

    private bool AnyConfigured => whatsApp.Provider != WhatsAppProvider.None || email.IsConfigured;

    private record Content(string WhatsAppTo, string WhatsAppText, List<string> EmailTo, string Subject, string Html, string Text);

    public async Task NotifyNewOrderAsync(int orderId, CancellationToken ct)
    {
        if (!AnyConfigured) return;
        var currency = shopOptions.Value.CurrencySymbol;

        // Build everything inside the store lock, then send without holding it.
        var content = await store.ReadAsync(d =>
        {
            if (d.Orders.Find(o => o.Id == orderId) is not { } o || d.Settings is not { } s) return null;
            return new Content(
                s.WhatsAppNumber,
                WhatsAppMessage.Build(o, s.ShopName, currency),
                EmailSender.ParseAddresses(s.NotifyEmail) ?? [],
                OrderEmail.Subject(o, currency),
                OrderEmail.Html(o, s.ShopName, currency),
                OrderEmail.Text(o, s.ShopName, currency));
        }, ct);
        if (content is null) return;

        var whatsAppTask = whatsApp.Provider == WhatsAppProvider.None
            ? Task.FromResult<SendResult?>(null)
            : WithRetryAsync("WhatsApp", orderId, () => whatsApp.SendAsync(content.WhatsAppTo, content.WhatsAppText, ct), ct);
        var emailTask = !email.IsConfigured
            ? Task.FromResult<SendResult?>(null)
            : WithRetryAsync("Email", orderId, () => email.SendAsync(content.EmailTo, content.Subject, content.Html, content.Text, ct), ct);
        var (wa, mail) = (await whatsAppTask, await emailTask);

        var dto = await store.WriteAsync(DataFiles.Orders, d =>
        {
            if (d.Orders.Find(o => o.Id == orderId) is not { } order) return null;
            if (wa is not null) (order.WhatsAppSent, order.WhatsAppError) = (wa.Sent, wa.Error);
            if (mail is not null) (order.EmailSent, order.EmailError) = (mail.Sent, mail.Error);
            return OrderDto.From(order);
        }, ct);

        // Let the admin panel show the ✓ sent / ⚠ failed badges.
        if (dto is not null) await hub.Clients.All.SendAsync(OrdersHub.OrderUpdated, dto, ct);
    }

    private async Task<SendResult?> WithRetryAsync(string channel, int orderId, Func<Task<SendResult>> send, CancellationToken ct)
    {
        var result = await send();
        foreach (var delay in RetryDelays)
        {
            if (result.Sent) break;
            logger.LogWarning("{Channel} notification for order {OrderId} failed, retrying in {Delay}s: {Error}",
                channel, orderId, delay.TotalSeconds, result.Error);
            await Task.Delay(delay, ct);
            result = await send();
        }
        if (!result.Sent) logger.LogError("{Channel} notification for order {OrderId} failed: {Error}", channel, orderId, result.Error);
        return result;
    }

    public Task<NotificationStatusDto> GetStatusAsync(CancellationToken ct) =>
        store.ReadAsync(d =>
        {
            var s = d.RequiredSettings;
            return new NotificationStatusDto(
                new ChannelStatusDto(whatsApp.Provider != WhatsAppProvider.None, whatsApp.Provider.ToString(), s.WhatsAppNumber),
                new ChannelStatusDto(email.IsConfigured, email.IsConfigured ? "SMTP" : "None", s.NotifyEmail));
        }, ct);

    /// <summary>Sends a short test message on every configured channel (Admin → Settings → Send test).</summary>
    public async Task<TestNotificationResult> SendTestAsync(CancellationToken ct)
    {
        var (shopName, number, emails) = await store.ReadAsync(d =>
            (d.RequiredSettings.ShopName, d.RequiredSettings.WhatsAppNumber,
             EmailSender.ParseAddresses(d.RequiredSettings.NotifyEmail) ?? []), ct);
        var text = $"✅ Test notification from {shopName}. New orders will be sent here automatically.";
        var html = $"<p style=\"font-family:Arial,sans-serif\">{System.Net.WebUtility.HtmlEncode(text)}</p>";

        async Task<SendResult?> WhatsAppTest() =>
            whatsApp.Provider == WhatsAppProvider.None ? null : await whatsApp.SendAsync(number, text, ct);
        async Task<SendResult?> EmailTest() =>
            !email.IsConfigured ? null : await email.SendAsync(emails, $"Test notification – {shopName}", html, text, ct);

        var (waTask, mailTask) = (WhatsAppTest(), EmailTest());
        return new TestNotificationResult(await waTask, await mailTask);
    }
}

/// <summary>Background worker: sends notifications for queued orders (up to 4 at a time).</summary>
public class NotificationWorker(NotificationQueue queue, OrderNotifier notifier, ILogger<NotificationWorker> logger)
    : BackgroundService
{
    protected override Task ExecuteAsync(CancellationToken stoppingToken) =>
        Parallel.ForEachAsync(
            queue.ReadAllAsync(stoppingToken),
            new ParallelOptions { MaxDegreeOfParallelism = 4, CancellationToken = stoppingToken },
            async (orderId, ct) =>
            {
                try
                {
                    await notifier.NotifyNewOrderAsync(orderId, ct);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogError(ex, "Notifications failed for order {OrderId}", orderId);
                }
            });
}
