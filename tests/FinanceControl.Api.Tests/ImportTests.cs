using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

/// <summary>
/// Importação de fatura e extrato (v1.4). O arquivo de exemplo é uma fatura real: compras de setembro que vêm na
/// fatura de outubro e parcelas que repetem a data da compra original.
/// </summary>
public sealed class ImportTests(FinanceApiFactory factory) : IClassFixture<FinanceApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    /// <summary>Fatura com vencimento em 10/10/2026 (BOM, CRLF, ";" e valores em "R$ 1.234,56").</summary>
    private const string InvoiceCsv = "﻿Data;Estabelecimento;Portador;Valor;Parcela\r\n"
        + "04/07/2026;CEA BHB 617 ECPC;LUCAS MOL;R$ 159,99;3 de 3\r\n"
        + "04/09/2026;Pagamento de fatura;LUCAS MOL;R$ -5.195,80; de 1\r\n"
        + "04/09/2026;IFD*IFOOD CLUB;LUCAS MOL;R$ 7,95;-\r\n"
        + "06/09/2026;ARAUJO  LOJA;LUCAS MOL;R$ 18,88;-\r\n"
        + "09/07/2026;BHMOTORS PECAS E SERVI;LUCAS MOL;R$ 740,00;3 de 10\r\n"
        + "12/09/2026;ESTORNO COMPRA;LUCAS MOL;R$ -30,99;-\r\n";

    private static string Base64(string text, Encoding? encoding = null) =>
        Convert.ToBase64String((encoding ?? Encoding.UTF8).GetBytes(text));

    /// <summary>Cartão com o mesmo ciclo da fatura de exemplo: fecha dia 3 e vence dia 10.</summary>
    private Task<long> CardAsync(string name, string? lastDigits = null) =>
        _client.CreateAsync("/api/cards", new { name, closing_day = 3, due_day = 10, last_digits = lastDigits });

    private async Task<JsonElement> PreviewAsync(object body) =>
        await (await _client.PostAsJsonAsync("/api/imports/preview", body)).Content.ReadFromJsonAsync<JsonElement>();

    private static JsonElement Line(JsonElement preview, string description) =>
        preview.GetProperty("lines").EnumerateArray().First(line => line.GetProperty("description").GetString()!.StartsWith(description, StringComparison.Ordinal));

    [Fact]
    public async Task Invoice_lines_keep_the_purchase_month_and_land_on_the_invoice_month()
    {
        var card = await CardAsync("Fatura outubro");
        var preview = await PreviewAsync(new { card_id = card, file_name = "Fatura2026-10-10.csv", content_base64 = Base64(InvoiceCsv) });

        Assert.Equal("csv", preview.GetProperty("format").GetString());
        Assert.Equal("card", preview.GetProperty("target_kind").GetString());
        Assert.True(preview.GetProperty("positive_is_expense").GetBoolean());

        // Compra de setembro: gasto em setembro, fatura de outubro.
        var ifood = Line(preview, "IFD*IFOOD CLUB");
        Assert.Equal("2026-09-04", ifood.GetProperty("date").GetString());
        Assert.Equal("2026-10", ifood.GetProperty("invoice_month").GetString());
        Assert.Equal("expense", ifood.GetProperty("kind").GetString());
        Assert.Equal(7_95, ifood.GetProperty("amount_cents").GetInt64());
        Assert.Equal("novo", ifood.GetProperty("status").GetString());

        // Descrição com espaços repetidos vira uma linha só.
        Assert.Equal("ARAUJO LOJA", Line(preview, "ARAUJO").GetProperty("description").GetString());

        // Estorno: crédito que não é pagamento de fatura entra como receita.
        var refund = Line(preview, "ESTORNO");
        Assert.Equal("income", refund.GetProperty("kind").GetString());
        Assert.Equal(30_99, refund.GetProperty("amount_cents").GetInt64());
        Assert.Equal("novo", refund.GetProperty("status").GetString());

        // Pagamento da fatura anterior não vira lançamento (é registrado pela tela de faturas).
        Assert.Equal("pagamento", Line(preview, "Pagamento de fatura").GetProperty("status").GetString());
    }

    [Fact]
    public async Task Installment_lines_move_from_the_purchase_date_to_the_charged_month()
    {
        var card = await CardAsync("Parcelas da fatura");
        var preview = await PreviewAsync(new { card_id = card, file_name = "Fatura2026-10-10.csv", content_base64 = Base64(InvoiceCsv) });

        // Compra de 04/07 na parcela 3/3: o gasto é de setembro, que é quando a parcela é cobrada.
        var cea = Line(preview, "CEA BHB");
        Assert.Equal("2026-09-04", cea.GetProperty("date").GetString());
        Assert.Equal("2026-07-04", cea.GetProperty("purchase_date").GetString());
        Assert.Equal("2026-10", cea.GetProperty("invoice_month").GetString());
        Assert.Equal("CEA BHB 617 ECPC (3/3)", cea.GetProperty("description").GetString());
        Assert.Equal(3, cea.GetProperty("installment_number").GetInt32());
        Assert.Equal(3, cea.GetProperty("installment_count").GetInt32());
        Assert.Contains("Compra em 04/07/2026", cea.GetProperty("notes").GetString());

        // 3 de 10 comprada em 09/07 é cobrada em 09/09.
        Assert.Equal("2026-09-09", Line(preview, "BHMOTORS").GetProperty("date").GetString());
    }

    /// <summary>
    /// Nem todo banco repete a data da compra nas parcelas: alguns já datam cada parcela no dia em que ela é cobrada.
    /// Aí a data não pode ser deslocada de novo — ela já pertence ao ciclo da fatura que está sendo importada.
    /// </summary>
    [Fact]
    public async Task An_installment_already_dated_in_the_invoice_cycle_is_not_moved_again()
    {
        var card = await CardAsync("Parcela já datada");
        const string csv = "Data;Descricao;Valor;Parcela\n"
            + "05/09/2026;MERCADO;R$ 100,00;-\n"
            + "12/09/2026;GELADEIRA;R$ 300,00;3 de 10\n";

        var preview = await PreviewAsync(new { card_id = card, content_base64 = Base64(csv) });
        var line = Line(preview, "GELADEIRA");
        Assert.Equal("2026-09-12", line.GetProperty("date").GetString());
        Assert.Equal(JsonValueKind.Null, line.GetProperty("purchase_date").ValueKind);
        Assert.Equal("2026-10", line.GetProperty("invoice_month").GetString());
        // A parcela continua identificada, mesmo sem deslocamento.
        Assert.Equal(3, line.GetProperty("installment_number").GetInt32());
        Assert.Equal("GELADEIRA (3/10)", line.GetProperty("description").GetString());
    }

    [Fact]
    public async Task Commit_creates_one_transaction_per_line_and_never_repeats_the_same_file()
    {
        var card = await CardAsync("Importação");
        var body = new { card_id = card, file_name = "Fatura2026-10-10.csv", content_base64 = Base64(InvoiceCsv) };

        var created = await (await _client.PostAsJsonAsync("/api/imports/commit", body)).Content.ReadFromJsonAsync<JsonElement>();
        // Quatro despesas + um estorno; o pagamento de fatura fica de fora.
        Assert.Equal(5, created.GetProperty("created").GetInt32());

        var september = (await _client.GetJsonAsync("/api/transactions?month=2026-09")).EnumerateArray()
            .Where(item => item.NullableInt64("card_id") == card).ToList();
        Assert.Equal(5, september.Count);
        Assert.All(september, item => Assert.True(item.GetProperty("imported").GetBoolean()));
        Assert.All(september, item => Assert.Equal("card", item.GetProperty("payment_method").GetString()));
        // Sem categoria: a tela de lançamentos categoriza em lote depois.
        Assert.All(september, item => Assert.Equal(JsonValueKind.Null, item.GetProperty("category_id").ValueKind));

        // A fatura de outubro recebe as cinco linhas, com o total das despesas menos o estorno.
        var invoice = await _client.GetJsonAsync($"/api/cards/{card}/invoices/2026-10");
        Assert.Equal(5, invoice.GetProperty("items_count").GetInt32());
        Assert.Equal(159_99 + 7_95 + 18_88 + 740_00 - 30_99, invoice.GetProperty("total_cents").GetInt64());

        // Reimportar o mesmo arquivo não duplica nada.
        var again = await PreviewAsync(body);
        Assert.Equal(5, again.GetProperty("totals").GetProperty("imported").GetInt32());
        Assert.Equal(0, again.GetProperty("totals").GetProperty("new").GetInt32());
        var repeated = await _client.PostAsJsonAsync("/api/imports/commit", body);
        await repeated.AssertValidationAsync("fingerprints");
        Assert.Equal(5, (await _client.GetJsonAsync("/api/transactions?month=2026-09")).EnumerateArray().Count(item => item.NullableInt64("card_id") == card));
    }

    [Fact]
    public async Task A_transaction_that_already_exists_is_flagged_as_a_possible_duplicate()
    {
        var card = await CardAsync("Repetidos");
        await _client.CreateAsync("/api/transactions", new { date = "2026-09-04", description = "iFood", kind = "expense", amount_cents = 7_95, payment_method = "card", card_id = card });

        var preview = await PreviewAsync(new { card_id = card, content_base64 = Base64(InvoiceCsv) });
        Assert.Equal("duplicado", Line(preview, "IFD*IFOOD CLUB").GetProperty("status").GetString());
        // Uma linha marcada como repetida não entra sem escolha explícita.
        var created = await (await _client.PostAsJsonAsync("/api/imports/commit", new { card_id = card, content_base64 = Base64(InvoiceCsv) })).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(4, created.GetProperty("created").GetInt32());
    }

    /// <summary>
    /// A assinatura cadastrada no cartão já lança a cobrança; a fatura do mesmo cartão traz a mesma linha, com a data
    /// em que a compra foi processada. Sem a folga de alguns dias, importar a fatura duplicaria a assinatura.
    /// </summary>
    [Fact]
    public async Task A_subscription_already_charged_on_the_card_is_not_imported_twice()
    {
        var card = await CardAsync("Assinatura e fatura");
        var subscription = await _client.CreateAsync("/api/subscriptions", new
        {
            name = "Streaming", amount_cents = 18_88, billing_day = 6, frequency = "monthly", card_id = card,
        });
        // Cobrança lançada em 08/09; a fatura traz a mesma compra em 06/09.
        await _client.PostAsJsonAsync($"/api/subscriptions/{subscription}/charge", new { date = "2026-09-08" });

        var preview = await PreviewAsync(new { card_id = card, content_base64 = Base64(InvoiceCsv) });
        var line = Line(preview, "ARAUJO");
        Assert.Equal("duplicado", line.GetProperty("status").GetString());
        Assert.Equal("Streaming", line.GetProperty("duplicate_of").GetString());
        Assert.Equal("2026-09-08", line.GetProperty("duplicate_date").GetString());

        // Confirmando sem escolher nada, a linha repetida fica de fora.
        var created = await (await _client.PostAsJsonAsync("/api/imports/commit", new { card_id = card, content_base64 = Base64(InvoiceCsv) })).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(4, created.GetProperty("created").GetInt32());
        Assert.DoesNotContain(
            (await _client.GetJsonAsync("/api/transactions?month=2026-09")).EnumerateArray().Where(item => item.NullableInt64("card_id") == card),
            item => item.GetProperty("description").GetString() == "ARAUJO LOJA");
    }

    [Fact]
    public async Task Chosen_lines_and_a_category_are_respected_on_commit()
    {
        var card = await CardAsync("Escolha");
        var category = await _client.CreateAsync("/api/categories", new { name = "Mercado importado", kind = "expense" });
        var preview = await PreviewAsync(new { card_id = card, content_base64 = Base64(InvoiceCsv) });
        var chosen = Line(preview, "IFD*IFOOD CLUB").GetProperty("fingerprint").GetString();

        var created = await (await _client.PostAsJsonAsync("/api/imports/commit", new
        {
            card_id = card, content_base64 = Base64(InvoiceCsv), category_id = category, fingerprints = new[] { chosen },
        })).Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(1, created.GetProperty("created").GetInt32());
        var item = (await _client.GetJsonAsync("/api/transactions?month=2026-09")).EnumerateArray().Single(row => row.NullableInt64("card_id") == card);
        Assert.Equal(category, item.GetProperty("category_id").GetInt64());
    }

    [Fact]
    public async Task Bank_statement_in_ofx_uses_the_standard_sign_and_moves_the_account()
    {
        var account = await _client.CreateAccountAsync("Conta OFX", 1_000_00);
        const string ofx = """
            OFXHEADER:100
            <OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
            <STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260910120000[-3:BRT]<TRNAMT>-120.50<FITID>A1<MEMO>SUPERMERCADO</STMTTRN>
            <STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260915120000[-3:BRT]<TRNAMT>2500.00<FITID>A2<MEMO>SALARIO</STMTTRN>
            </BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
            """;
        var body = new { account_id = account, file_name = "extrato.ofx", content_base64 = Base64(ofx) };

        var preview = await PreviewAsync(body);
        Assert.Equal("ofx", preview.GetProperty("format").GetString());
        Assert.False(preview.GetProperty("positive_is_expense").GetBoolean());
        Assert.Equal("expense", Line(preview, "SUPERMERCADO").GetProperty("kind").GetString());
        Assert.Equal(120_50, Line(preview, "SUPERMERCADO").GetProperty("amount_cents").GetInt64());
        Assert.Equal("income", Line(preview, "SALARIO").GetProperty("kind").GetString());
        Assert.Equal(JsonValueKind.Null, Line(preview, "SALARIO").GetProperty("invoice_month").ValueKind);

        await _client.PostAsJsonAsync("/api/imports/commit", body);
        Assert.Equal(1_000_00 - 120_50 + 2_500_00, await _client.AccountBalanceAsync(account));

        // O FITID identifica a transação: reimportar não duplica nem com outro nome de arquivo.
        var again = await PreviewAsync(new { account_id = account, file_name = "outro.ofx", content_base64 = Base64(ofx) });
        Assert.Equal(2, again.GetProperty("totals").GetProperty("imported").GetInt32());
    }

    [Fact]
    public async Task Files_exported_in_latin1_keep_their_accents()
    {
        var account = await _client.CreateAccountAsync("Conta acentos");
        const string csv = "Data;Histórico;Valor\n11/09/2026;Água e saneamento;-89,90\n";
        var preview = await PreviewAsync(new { account_id = account, content_base64 = Base64(csv, Encoding.Latin1) });
        Assert.Equal("Água e saneamento", Line(preview, "Água").GetProperty("description").GetString());
    }

    [Fact]
    public async Task The_card_of_each_line_comes_from_the_last_digits_in_the_invoice()
    {
        var main = await CardAsync("Principal", "1111");
        var extra = await CardAsync("Adicional", "2222");
        const string csv = "Data;Descricao;Final;Valor\n05/09/2026;COMPRA A;**** 2222;R$ 50,00\n05/09/2026;COMPRA B;**** 9999;R$ 60,00\n";

        var preview = await PreviewAsync(new { card_id = main, content_base64 = Base64(csv) });
        // A linha com os dígitos do adicional vai para ele; a desconhecida fica no cartão escolhido.
        Assert.Equal(extra, Line(preview, "COMPRA A").GetProperty("card_id").GetInt64());
        Assert.Equal("Adicional", Line(preview, "COMPRA A").GetProperty("card_name").GetString());
        Assert.Equal(main, Line(preview, "COMPRA B").GetProperty("card_id").GetInt64());
    }

    [Fact]
    public async Task Lines_of_a_closed_month_are_blocked()
    {
        var card = await CardAsync("Mês fechado importação");
        await _client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-09/close");
        try
        {
            var preview = await PreviewAsync(new { card_id = card, content_base64 = Base64(InvoiceCsv) });
            Assert.Equal(6, preview.GetProperty("totals").GetProperty("closed_month").GetInt32());
            var response = await _client.PostAsJsonAsync("/api/imports/commit", new { card_id = card, content_base64 = Base64(InvoiceCsv) });
            await response.AssertValidationAsync("fingerprints");
        }
        finally
        {
            await _client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-09/reopen");
        }
    }

    [Theory]
    // Sem destino, com os dois destinos, sem arquivo e com arquivo ilegível.
    [InlineData(false, false, true, "card_id")]
    [InlineData(true, true, true, "card_id")]
    [InlineData(true, false, false, "content_base64")]
    public async Task Invalid_import_requests_are_refused(bool withCard, bool withAccount, bool withFile, string field)
    {
        var card = withCard ? await CardAsync($"Inválido {withAccount}{withFile}") : (long?)null;
        var account = withAccount ? await _client.CreateAccountAsync($"Conta inválida {withFile}") : (long?)null;
        var response = await _client.PostAsJsonAsync("/api/imports/preview", new
        {
            card_id = card, account_id = account, content_base64 = withFile ? Base64(InvoiceCsv) : null,
        });
        await response.AssertValidationAsync(field);
    }

    [Fact]
    public async Task A_file_without_recognizable_columns_is_refused_with_a_clear_message()
    {
        var card = await CardAsync("Sem colunas");
        var response = await _client.PostAsJsonAsync("/api/imports/preview", new { card_id = card, content_base64 = Base64("coluna a;coluna b\n1;2\n") });
        await response.AssertValidationAsync("file");
    }
}
