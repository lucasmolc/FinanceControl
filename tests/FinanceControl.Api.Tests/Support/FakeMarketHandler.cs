using System.Collections.Concurrent;
using System.Net;
using System.Text;

namespace FinanceControl.Api.Tests.Support;

/// <summary>Handler HTTP falso: responde por prefixo de URL; sem resposta cadastrada devolve 503. Registra as URLs pedidas.</summary>
public sealed class FakeMarketHandler : HttpMessageHandler
{
    private readonly ConcurrentDictionary<string, (HttpStatusCode Status, string Body)> _responses = new(StringComparer.Ordinal);

    public ConcurrentQueue<string> Requests { get; } = new();

    /// <summary>Resposta para URLs que começam com <paramref name="urlPrefix"/> (o prefixo mais longo vence).</summary>
    public void Respond(string urlPrefix, string body, HttpStatusCode status = HttpStatusCode.OK) => _responses[urlPrefix] = (status, body);

    public void Reset()
    {
        _responses.Clear();
        Requests.Clear();
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var url = request.RequestUri!.ToString();
        Requests.Enqueue(url);
        var match = _responses.Where(item => url.StartsWith(item.Key, StringComparison.Ordinal)).OrderByDescending(item => item.Key.Length).FirstOrDefault();
        var (status, body) = match.Key is null ? (HttpStatusCode.ServiceUnavailable, "{}") : match.Value;
        return Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") });
    }

    /// <summary>A factory reutiliza o handler entre clientes; não descartar.</summary>
    protected override void Dispose(bool disposing) { }
}
